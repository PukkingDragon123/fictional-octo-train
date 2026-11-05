// The BAILIFF fitting station: the machine that stamps the band through the
// debtor's wrist in the intake (src/game/intro.ts, the 'fit' beat). Seen
// mostly from the debtor's own eyes, so it is built for close range: a heavy
// cast pedestal and a steel bed with a rubber forearm channel (old blood in the
// grooves), a painted hand outline on the hand plate, a gantry of two yellow
// columns with a crown carrying the hydraulic rams, the crosshead that comes
// down between them with the band held in its die, two clamp jaws that close
// over the forearm and a strap over the back of the hand, a caged work lamp
// hung off the crown (the shot's key light), a red rotating beacon, amber
// "armed" lamps, a pressure gauge whose needle climbs, steam vents, hoses and
// cables, the power cabinet behind. Faceted low-poly, pixel-art textures at a
// close-up density, the stage's own materials (src/game/introKit/stageMat.ts).
//
// Local frame: +x runs along the arm away from the debtor (he kneels at -x),
// y up, +z is the debtor's right. The wrist joint rests at (0, ARM_Y, 0).
//
//   const s = new StampRig(stageRoot, low)
//   s.place(x, z, yaw)                 put it in the stage (yaw: rotation.y)
//   s.lift / clamp / strap             0..1, set by the script each frame
//   s.puff(where, k)                   steam from the vents / the jaws / the die
//   s.bleed(k)                         the pool under the wrist (grows) and the run down the channel
//   s.update(dt)                       beacon, lamps, gauge, steam, the moving parts
import * as THREE from 'three';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { addTextureModule, atlas, txt, txtC, ph, bayer, type PixelCanvas } from '../../content/furniture/a_lib';
import { cbox, lathe, rod, tube, face, sag, facetize, type V3 } from './poly';
import { stageMat, emitMat, type EmitMat } from './stageMat';

/** the stamp's dimensions (metres, local frame) */
export const ST = {
  /** top of the rubber pad the forearm lies on */
  BED: 0.66,
  /** the forearm's axis lying in the channel */
  ARM_Y: 0.695,
  /** the band's centre along the arm (just behind the wrist joint) */
  DIE_X: -0.012,
  /** the crosshead's die face: parked, and touching the band housing on the wrist */
  UP_Y: 1.3,
  CONTACT_Y: 0.762,
  /** where the debtor's eyes are while he kneels at it */
  EYE: new THREE.Vector3(-0.6, 1.07, 0.1),
  /** the elbow and the wrist joint of the arm in the channel */
  ELBOW: new THREE.Vector3(-0.26, 0.7, 0),
  WRIST: new THREE.Vector3(0, 0.695, 0),
  /** where the officer's glove pins the forearm */
  PIN: new THREE.Vector3(-0.19, 0.738, 0.004),
  /** the work lamp's bulb (the key light) */
  LAMP: new THREE.Vector3(-0.25, 1.52, 0.2),
  /** the beacon on the crown */
  BEACON: new THREE.Vector3(0.0, 2.02, -0.3),
};

const K = 0x0a0908;

// ------------------------------------------------------------------ textures (close-up density)
addTextureModule(() => {
  const A = atlas();
  // the rubber pad of the channel: ribbed, cracked, years of blood in the grooves
  A.add('st_pad', 32, 32, (pc, rng) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const n = ph(x, y, 71) * 0.6 + ph(x >> 2, y >> 2, 72) * 0.4;
      const rib = y % 4 === 0 ? -1 : y % 4 === 1 ? 1 : 0;
      let c = n < 0.3 ? 0x141210 : n < 0.6 ? 0x1c1916 : n < 0.85 ? 0x24201c : 0x2c2722;
      if (rib < 0) c = 0x0c0a09; else if (rib > 0 && n > 0.4) c = 0x34302a;
      pc.set(x, y, c);
    }
    // old blood: brown-black in the grooves, a darker red where it pooled
    for (let i = 0; i < 9; i++) {
      const cx = rng.int(0, 31), cy = rng.int(0, 31), r = 2 + rng.int(0, 5);
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        const d = Math.hypot(x, y * 1.4) / r + (ph(cx + x, cy + y, 73) - 0.5) * 0.6;
        if (d > 1) continue;
        const px = (cx + x + 32) % 32, py = (cy + y + 32) % 32;
        const groove = py % 4 === 0;
        pc.set(px, py, groove ? (d < 0.5 ? 0x3a0a08 : 0x2a0c0a) : d < 0.4 ? 0x4a120e : 0x2e1410);
      }
    }
    for (let i = 0; i < 14; i++) { const x = rng.int(0, 31), y = rng.int(0, 31); pc.set(x, y, 0x5a1612); }
    // cracks
    for (let k = 0; k < 4; k++) { let x = rng.int(0, 31), y = rng.int(0, 31); for (let s = 0; s < 6; s++) { pc.set(x & 31, y & 31, 0x050404); x += rng.int(-1, 1); y += 1; } }
  }, 0.16, 0.16);
  // the steel of the bed: blued and worn bright where arms have dragged, scratches, rust, dried smears
  A.add('st_bed', 48, 48, (pc, rng) => {
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
      const v = ph(x, y, 81) * 0.35 + ph(x >> 2, y >> 1, 82) * 0.4 + ph(x >> 3, y >> 3, 83) * 0.25;
      const ramp = [0x22282a, 0x2c3436, 0x384244, 0x46504f, 0x56605e];
      let i = Math.floor(v * 4.6); if (v * 4.6 - i > bayer(x, y)) i++;
      pc.set(x, y, ramp[Math.max(0, Math.min(4, i))]);
    }
    // scratches (bright, along the arm)
    for (let k = 0; k < 26; k++) { const y = rng.int(0, 47), x0 = rng.int(0, 47), l = 4 + rng.int(0, 14); for (let x = x0; x < x0 + l; x++) if (rng.chance(0.85)) pc.set(x % 48, y, rng.chance(0.3) ? 0x8a9494 : 0x6a7474); }
    // rust blooms
    for (let k = 0; k < 6; k++) pc.ditherBlob(rng.int(0, 47), rng.int(0, 47), 2 + rng.int(0, 3), 2 + rng.int(0, 2), rng.chance(0.5) ? 0x6a3a1a : 0x4a2a14, 0.7);
    // dried smears: dragged fingers
    for (let k = 0; k < 4; k++) {
      const y0 = rng.int(4, 43), x0 = rng.int(0, 30);
      for (let f = 0; f < 3; f++) for (let x = x0; x < x0 + 10 + rng.int(0, 8); x++) if (rng.chance(0.8)) pc.set(x % 48, (y0 + f * 2) % 48, rng.chance(0.4) ? 0x3a0c0a : 0x2a100c);
    }
  }, 0.3, 0.3);
  // the hand plate: a painted left hand to put yours on, worn through to steel, stained between the fingers
  A.add('st_hand', 48, 48, (pc, rng) => {
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
      const v = ph(x, y, 91) * 0.5 + ph(x >> 2, y >> 2, 92) * 0.5;
      pc.set(x, y, v < 0.3 ? 0x262c2e : v < 0.6 ? 0x30383a : v < 0.85 ? 0x3a4244 : 0x485052);
    }
    // the outline: a left hand palm down seen from above, fingers up the canvas (away from the debtor), thumb to the right
    const Y = 0xd8a828, D = 0x8a6a18;
    const inHand = (x: number, y: number) => {
      if (((x - 23) / 9.5) ** 2 + ((y - 31) / 10) ** 2 < 1) return true;
      const fing: [number, number][] = [[15.5, 16], [20.5, 20], [25.5, 19], [30, 15]];
      for (const [fx, l] of fing) { const y1 = 24, y0 = 24 - l; if (y <= y1 && y >= y0 && Math.abs(x - fx) <= 2.2 - (y1 - y) / l * 0.6) return true; }
      if (y >= 27 && y <= 38 && Math.abs(x - (33 + (38 - y) * 0.45)) < 2.4) return true;
      return false;
    };
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
      if (!inHand(x, y)) continue;
      const edge = !inHand(x - 1, y) || !inHand(x + 1, y) || !inHand(x, y - 1) || !inHand(x, y + 1);
      if (edge) pc.set(x, y, rng.chance(0.15) ? D : Y);
    }
    txt(pc, 'LEFT', 3, 2, Y);
    txt(pc, 'PALM DOWN', 3, 42, D);
    // wear: chips in the paint, smears of old blood in the fingers
    for (let k = 0; k < 40; k++) { const x = rng.int(0, 47), y = rng.int(0, 47); if (pc.get(x, y) === Y) pc.set(x, y, 0x5a5a4a); }
    for (let k = 0; k < 5; k++) pc.ditherBlob(26 + rng.int(0, 16), 14 + rng.int(0, 20), 2 + rng.int(0, 3), 1 + rng.int(0, 1), 0x3a0c0a, 0.8);
  }, 0.3, 0.3);
  // the crown's front plate: BAILIFF stencilled on safety yellow, hazard ends, rivets
  A.add('st_crown', 96, 24, (pc, rng) => {
    for (let y = 0; y < 24; y++) for (let x = 0; x < 96; x++) {
      const v = ph(x, y, 101) * 0.6 + ph(x >> 2, y >> 2, 102) * 0.4;
      pc.set(x, y, v < 0.25 ? 0x9a7412 : v < 0.6 ? 0xb8901c : v < 0.9 ? 0xc89e24 : 0xd8ae30);
    }
    for (let y = 0; y < 24; y++) for (let x = 0; x < 10; x++) { const s = ((x + y) >> 2) % 2 ? 0x141210 : 0xd0a020; pc.set(x, y, s); pc.set(95 - x, y, s); }
    txtC(pc, 'BAILIFF', 48, 4, 0x141210, 1, 2);
    txtC(pc, 'FITTING STATION 3', 48, 16, 0x2a2010);
    for (const [x, y] of [[12, 2], [83, 2], [12, 21], [83, 21]] as const) { pc.set(x, y, 0xf0d070); pc.set(x + 1, y, 0x5a4410); }
    for (let k = 0; k < 60; k++) { const x = rng.int(10, 85), y = rng.int(0, 23); pc.set(x, y, rng.chance(0.5) ? 0x5a4a30 : 0x3a3a34); }
    pc.hline(0, 95, 0, 0xe8c050); pc.hline(0, 95, 23, 0x4a3808);
  }, 0.74, 0.185);
  // the gauge face: cream, ticks, a red sector
  A.add('st_gauge', 16, 16, (pc) => {
    pc.fill(0x0c0c0a);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d < 7) pc.set(x, y, d > 6 ? 0x2a2a26 : 0xd8d0b4); }
    for (let i = 0; i <= 8; i++) { const a = Math.PI * 0.75 + i / 8 * Math.PI * 1.5; pc.set(Math.round(7.5 + Math.cos(a) * 5), Math.round(7.5 + Math.sin(a) * 5), i >= 6 ? 0xc01810 : 0x141210); }
    pc.set(7, 7, 0x141210); pc.set(8, 8, 0x141210);
  }, 0.08, 0.08);
  // the warning plate on the bed's front edge
  A.add('st_warn', 48, 12, (pc) => {
    pc.fill(0xc89a20);
    for (let y = 0; y < 12; y++) for (let x = 0; x < 6; x++) { const s = ((x + y) >> 1) % 2 ? K : 0xc89a20; pc.set(x, y, s); pc.set(47 - x, y, s); }
    txtC(pc, 'KEEP STILL', 24, 3, K);
    pc.hline(0, 47, 0, 0xe8c050); pc.hline(0, 47, 11, 0x5a4410);
  }, 0.3, 0.075);
  // fresh blood: glossy, near black at the deep middle, a few bright highlights
  A.add('st_blood', 16, 16, (pc, rng) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const v = ph(x, y, 111) * 0.5 + ph(x >> 1, y >> 1, 112) * 0.5;
      pc.set(x, y, v < 0.3 ? 0x2a0303 : v < 0.6 ? 0x480606 : v < 0.85 ? 0x640a08 : 0x7c100c);
    }
    for (let k = 0; k < 6; k++) pc.set(rng.int(0, 15), rng.int(0, 15), 0xc04838);
  }, 0.12, 0.12);
});

// ------------------------------------------------------------------ geometry helpers
/** a thick arc in the z-y plane (centre cz, cy; radii r0 < r1; angles from +z toward +y) swept from x0 to x1 */
function arcShell(mb: ModelBuilder, cz: number, cy: number, r0: number, r1: number, a0: number, a1: number, segs: number, x0: number, x1: number, tex: string, o: { color?: number; uvScale?: number } = {}) {
  const P = (r: number, a: number, x: number): V3 => [x, cy + Math.sin(a) * r, cz + Math.cos(a) * r];
  for (let i = 0; i < segs; i++) {
    const a = a0 + (a1 - a0) * i / segs, b = a0 + (a1 - a0) * (i + 1) / segs, m = (a + b) / 2;
    face(mb, [P(r1, a, x0), P(r1, b, x0), P(r1, b, x1), P(r1, a, x1)], tex, o, [0, Math.sin(m), Math.cos(m)], true);
    face(mb, [P(r0, a, x0), P(r0, b, x0), P(r0, b, x1), P(r0, a, x1)], tex, o, [0, -Math.sin(m), -Math.cos(m)], true);
    face(mb, [P(r0, a, x0), P(r1, a, x0), P(r1, b, x0), P(r0, b, x0)], tex, o, [-1, 0, 0], true);
    face(mb, [P(r0, a, x1), P(r1, a, x1), P(r1, b, x1), P(r0, b, x1)], tex, o, [1, 0, 0], true);
  }
  const s = Math.sign(a1 - a0) || 1;
  face(mb, [P(r0, a0, x0), P(r1, a0, x0), P(r1, a0, x1), P(r0, a0, x1)], tex, o, [0, -Math.cos(a0) * s, Math.sin(a0) * s], true);
  face(mb, [P(r0, a1, x0), P(r1, a1, x0), P(r1, a1, x1), P(r0, a1, x1)], tex, o, [0, Math.cos(a1) * s, -Math.sin(a1) * s], true);
}

/** a star-shaped flat polygon (a pool) at height y round (0, 0): irregular radius */
function poolGeo(r: number, n: number, seed: number, sx = 1, sz = 1): THREE.BufferGeometry {
  const mb = new ModelBuilder();
  const pts: V3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.7 + 0.45 * ph(i, seed, 7) + (i % 3 === 0 ? 0.25 : 0));
    pts.push([Math.cos(a) * rr * sx, 0, Math.sin(a) * rr * sz]);
  }
  for (let i = 0; i < n; i++) face(mb, [[0, 0, 0], pts[i], pts[(i + 1) % n]], 'st_blood', { color: 0xffffff }, [0, 1, 0], true);
  return mb.build();
}

// ------------------------------------------------------------------ steam: faceted puffs
class Steam {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private P: Float32Array; private V: Float32Array; private S: Float32Array; private L: Float32Array; private M: Float32Array; private R: Float32Array;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private s = new THREE.Vector3(); private p = new THREE.Vector3();
  constructor(private cap: number) {
    const mb = new ModelBuilder();
    mb.sphere(0, 0, 0, 1, 6, 4, 'white', { color: 0xdfe4e6 });
    const g = facetize(mb.build(), 0.14, 5);
    this.mesh = new THREE.InstancedMesh(g, stageMat({ rim: 0.9 }), cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.castShadow = false;
    this.P = new Float32Array(cap * 3); this.V = new Float32Array(cap * 3);
    this.S = new Float32Array(cap); this.L = new Float32Array(cap); this.M = new Float32Array(cap); this.R = new Float32Array(cap * 2);
  }
  emit(x: number, y: number, z: number, dx: number, dy: number, dz: number, n: number, speed: number, size: number) {
    for (let k = 0; k < n; k++) {
      let i = this.n;
      if (i >= this.cap) { let best = 0, bl = 1e9; for (let j = 0; j < this.n; j++) if (this.L[j] < bl) { bl = this.L[j]; best = j; } i = best; } else this.n++;
      const sp = speed * (0.6 + Math.random() * 0.7);
      this.P[i * 3] = x + (Math.random() - 0.5) * 0.02; this.P[i * 3 + 1] = y + (Math.random() - 0.5) * 0.02; this.P[i * 3 + 2] = z + (Math.random() - 0.5) * 0.02;
      this.V[i * 3] = (dx + (Math.random() - 0.5) * 0.5) * sp; this.V[i * 3 + 1] = (dy + (Math.random() - 0.3) * 0.4) * sp; this.V[i * 3 + 2] = (dz + (Math.random() - 0.5) * 0.5) * sp;
      this.S[i] = size * (0.6 + Math.random() * 0.6);
      this.L[i] = this.M[i] = 0.7 + Math.random() * 0.8;
      this.R[i * 2] = Math.random() * 6; this.R[i * 2 + 1] = Math.random() * 6;
    }
  }
  update(dt: number) {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      this.L[i] -= dt;
      if (this.L[i] <= 0) continue;
      // copy down (compact)
      if (w !== i) {
        for (let c = 0; c < 3; c++) { this.P[w * 3 + c] = this.P[i * 3 + c]; this.V[w * 3 + c] = this.V[i * 3 + c]; }
        this.S[w] = this.S[i]; this.L[w] = this.L[i]; this.M[w] = this.M[i]; this.R[w * 2] = this.R[i * 2]; this.R[w * 2 + 1] = this.R[i * 2 + 1];
      }
      const drag = Math.exp(-dt * 3.2);
      this.V[w * 3] *= drag; this.V[w * 3 + 1] = this.V[w * 3 + 1] * drag + dt * 0.55; this.V[w * 3 + 2] *= drag;
      for (let c = 0; c < 3; c++) this.P[w * 3 + c] += this.V[w * 3 + c] * dt;
      const u = 1 - this.L[w] / this.M[w];
      const env = u < 0.12 ? u / 0.12 : u > 0.6 ? Math.max(0, 1 - (u - 0.6) / 0.4) : 1;
      const sc = this.S[w] * (0.5 + u * 1.6) * env;
      this.e.set(this.R[w * 2] + u * 1.5, this.R[w * 2 + 1], 0);
      this.m.compose(this.p.set(this.P[w * 3], this.P[w * 3 + 1], this.P[w * 3 + 2]), this.q.setFromEuler(this.e), this.s.set(sc, sc * 0.85, sc));
      this.mesh.setMatrixAt(w, this.m);
      w++;
    }
    this.n = w;
    this.mesh.count = w;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ the machine
export class StampRig {
  readonly g = new THREE.Group();
  /** the crosshead with the die (its origin: the die face's centre) */
  readonly cross = new THREE.Group();
  /** where the band rides in the die until it is driven on */
  readonly bandSeat = new THREE.Group();
  readonly jawL = new THREE.Group(); readonly jawR = new THREE.Group(); readonly strapG = new THREE.Group();
  readonly steam: Steam;
  /** 0 parked .. 1 on the wrist */
  lift = 0;
  /** jaws 0 open .. 1 shut; the hand strap the same */
  clamp = 0; strap = 0;
  /** the beacon turns and the lamps blink (armed) */
  armed = false;
  /** the work lamp: 0 off .. 1 on */
  lamp = 1;
  /** pressure: the gauge needle (0..1) */
  pressure = 0.1;
  private rods: THREE.Mesh[] = [];
  private needle: THREE.Mesh;
  private beaconRot = new THREE.Group();
  readonly beaconLight: THREE.SpotLight | null;
  private beaconMat: EmitMat; private ambers: EmitMat; private lampMat: EmitMat; private dieMat: EmitMat;
  private pool: THREE.Mesh; private run: THREE.Mesh;
  private poolK = 0; private poolGoal = 0;
  private t = 0;
  private spin = 0;

  constructor(parent: THREE.Object3D, private low = false) {
    this.g.name = 'ix:stamp';
    parent.add(this.g);
    const S = stageMat({ rim: 0.75 });
    const b = new ModelBuilder();
    this.buildBase(b);
    this.buildGantry(b);
    this.buildCabinet(b);
    const body = new THREE.Mesh(facetize(b.build(), 0.0025, 31), S);
    body.castShadow = !low; body.receiveShadow = !low; body.frustumCulled = false;
    this.g.add(body);
    // the work lamp's bulb, the beacon dome, the amber lamps, the die's lit strip: self-lit
    const lb = new ModelBuilder();
    lathe(lb, ST.LAMP.x, ST.LAMP.y - 0.03, ST.LAMP.z, [[0, 0], [0.022, 0.01], [0.028, 0.035], [0.016, 0.06]], 6, 'ix_sodium', { color: 0xfff2d8 });
    this.lampMat = emitMat(0xffe0b0, 3);
    this.g.add(this.mk(lb, this.lampMat));
    const bb = new ModelBuilder();
    lathe(bb, ST.BEACON.x, ST.BEACON.y, ST.BEACON.z, [[0.07, 0], [0.072, 0.09], [0.055, 0.14], [0.025, 0.165], [0, 0.17]], 8, 'ix_beacon', { color: 0xffffff });
    this.beaconMat = emitMat(0xff2a12, 0.3);
    this.g.add(this.mk(bb, this.beaconMat));
    const ab = new ModelBuilder();
    for (const z of [-0.2, -0.13]) { ab.push().translate(-0.135, 1.86, z).rotateZ(Math.PI / 2); lathe(ab, 0, 0, 0, [[0.018, 0], [0.02, 0.01], [0.012, 0.02], [0, 0.022]], 6, 'ix_sodium', { color: 0xffffff }); ab.pop(); }
    this.ambers = emitMat(0xffa030, 0.2);
    this.g.add(this.mk(ab, this.ambers));
    // the beacon's reflector turns inside the dome and throws a red beam round the room
    this.beaconRot.position.copy(ST.BEACON).add(new THREE.Vector3(0, 0.08, 0));
    const rb = new ModelBuilder();
    cbox(rb, 0.02, -0.03, 0, 0.012, 0.07, 0.07, 0.003, 'chrome');
    this.beaconRot.add(this.mk(rb, S));
    if (!low) {
      const sl = new THREE.SpotLight(0xff1a08, 0, 7, 0.42, 0.5, 1.2);
      sl.position.set(0, 0, 0); sl.target.position.set(1, -0.25, 0);
      this.beaconRot.add(sl, sl.target);
      this.beaconLight = sl;
    } else this.beaconLight = null;
    this.g.add(this.beaconRot);
    // the moving parts
    this.buildCross(S);
    this.buildJaws(S);
    // the gauge needle
    const nb = new ModelBuilder(); cbox(nb, 0, 0, 0, 0.003, 0.03, 0.002, 0, 'white', { color: 0xc01810 });
    this.needle = this.mk(nb, stageMat({ rim: 0 }));
    this.needle.position.set(-0.142, 1.78, 0.25); this.needle.rotation.set(0, Math.PI / 2, 0);
    this.g.add(this.needle);
    // blood: the pool under the wrist, the run down the channel toward the elbow
    const BM = stageMat({ rim: 1.4 });
    this.pool = new THREE.Mesh(poolGeo(0.07, 14, 3, 1.2, 0.8), BM);
    this.pool.position.set(ST.DIE_X, ST.BED + 0.002, 0); this.pool.scale.setScalar(0.001);
    this.run = new THREE.Mesh(poolGeo(0.05, 10, 9, 2.6, 0.32), BM);
    this.run.position.set(ST.DIE_X - 0.12, ST.BED + 0.0015, 0); this.run.scale.setScalar(0.001);
    this.g.add(this.pool, this.run);
    this.steam = new Steam(low ? 40 : 90);
    this.g.add(this.steam.mesh);
    this.set();
  }

  private mk(b: ModelBuilder, m: THREE.Material) { const o = new THREE.Mesh(b.build(), m); o.frustumCulled = false; o.castShadow = !this.low && !(m as THREE.ShaderMaterial).isShaderMaterial; o.receiveShadow = !this.low; return o; }

  private buildBase(b: ModelBuilder) {
    const { BED } = ST;
    // floor plate and its bolts
    cbox(b, 0.08, 0, 0, 1.25, 0.04, 0.92, 0.012, 'ix_tread', { uvScale: 2 });
    for (const [x, z] of [[-0.48, -0.4], [-0.48, 0.4], [0.64, -0.4], [0.64, 0.4], [0.08, -0.4], [0.08, 0.4]]) lathe(b, x, 0.04, z, [[0.022, 0], [0.02, 0.012], [0.012, 0.018]], 6, 'chrome');
    // the cast pedestal: tapered, ribbed
    lathe(b, -0.06, 0.04, 0, [[0.27, 0], [0.25, 0.06], [0.19, 0.14], [0.17, BED - 0.24], [0.21, BED - 0.16], [0.24, BED - 0.12]], 8, 'ix_yellow', { uvScale: 2.5, sz: 1.25 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.26;
      const cx = -0.06 + Math.cos(a) * 0.18, cz = Math.sin(a) * 0.22;
      b.push().translate(cx, 0.04, cz).rotateY(-a);
      cbox(b, 0.02, 0, 0, 0.06, 0.32, 0.018, 0.005, 'ix_yellow', { uvScale: 2.5 });
      b.pop();
    }
    // the bed slab
    cbox(b, -0.02, BED - 0.12, 0, 0.92, 0.07, 0.56, 0.014, { top: 'st_bed', all: 'ix_steel' }, { uvScale: 1 });
    // hazard edge along the front, the plate on it
    cbox(b, -0.475, BED - 0.115, 0, 0.012, 0.06, 0.54, 0.003, 'ix_haz', { uvScale: 2 });
    face(b, [[-0.483, BED - 0.105, -0.15], [-0.483, BED - 0.105, 0.15], [-0.483, BED - 0.07, 0.15], [-0.483, BED - 0.07, -0.15]], 'st_warn', { fit: true }, [-1, 0, 0], true);
    // the channel: two steel rails either side of the rubber pad, chamfered tops
    for (const s of [-1, 1]) {
      cbox(b, -0.2, BED - 0.05, s * 0.088, 0.56, 0.072, 0.05, 0.008, 'st_bed', { uvScale: 1 });
      // rail bolts
      for (const x of [-0.42, -0.26, -0.1]) lathe(b, x, BED + 0.022, s * 0.088, [[0.007, 0], [0.007, 0.004], [0.004, 0.006]], 6, 'chrome');
    }
    cbox(b, -0.2, BED - 0.05, 0, 0.56, 0.05, 0.126, 0.004, 'st_pad', { uvScale: 1 });
    // the saddle under the band: a half ring, worn bright on the inside
    arcShell(b, 0, ST.ARM_Y, 0.054, 0.068, Math.PI * 1.12, Math.PI * 1.88, 6, ST.DIE_X - 0.03, ST.DIE_X + 0.03, 'ix_steel', { uvScale: 3 });
    cbox(b, ST.DIE_X, BED - 0.06, 0, 0.07, 0.04, 0.17, 0.006, 'ix_steel', { uvScale: 3 });
    // the hand plate beyond, with the painted outline
    cbox(b, 0.19, BED - 0.06, 0, 0.32, 0.055, 0.32, 0.006, 'ix_steel', { uvScale: 2 });
    // (built turned a quarter so the outline's fingers point along the arm and its words read from where he kneels)
    b.push().translate(0.19, 0, 0).rotateY(-Math.PI / 2);
    face(b, [[-0.16, BED - 0.004, 0.16], [0.16, BED - 0.004, 0.16], [0.16, BED - 0.004, -0.16], [-0.16, BED - 0.004, -0.16]], 'st_hand', { fit: true }, [0, 1, 0], true);
    b.pop();
    // the clamp jaws' hinge blocks and their little cylinders on the bed
    for (const s of [-1, 1]) {
      cbox(b, -0.075, BED - 0.05, s * 0.135, 0.07, 0.07, 0.05, 0.008, 'ix_yellow', { uvScale: 3 });
      b.push().translate(-0.075, BED + 0.0, s * 0.2).rotateX(Math.PI / 2 * s);
      lathe(b, 0, -0.06, 0, [[0.018, 0], [0.018, 0.08], [0.022, 0.09]], 6, 'ix_steel', { uvScale: 3 });
      b.pop();
      lathe(b, -0.075, BED - 0.06, s * 0.25, [[0.024, 0], [0.024, 0.05]], 6, 'metal_dark');
    }
    // strap hinge (the strap swings over from the debtor's left)
    cbox(b, 0.14, BED - 0.03, -0.155, 0.08, 0.05, 0.04, 0.008, 'ix_yellow', { uvScale: 3 });
  }

  private buildGantry(b: ModelBuilder) {
    const { BED, DIE_X } = ST;
    // two square columns either side of the wrist, hazard collars low down, bushing guides
    for (const s of [-1, 1]) {
      const z = s * 0.3;
      cbox(b, DIE_X, BED - 0.12, z, 0.1, 1.86 - BED + 0.12, 0.1, 0.014, 'ix_yellow', { uvScale: 2.5 });
      cbox(b, DIE_X, BED + 0.02, z, 0.112, 0.08, 0.112, 0.006, 'ix_haz', { uvScale: 3 });
      cbox(b, DIE_X, BED - 0.12, z, 0.16, 0.03, 0.16, 0.008, 'ix_steel', { uvScale: 3 });
      for (const y of [0.92, 1.24, 1.56]) for (const zz of [-0.04, 0.04]) lathe(b.push().translate(DIE_X - 0.051, y, z + zz).rotateZ(Math.PI / 2), 0, 0, 0, [[0.006, 0], [0.006, 0.004], [0.003, 0.006]], 6, 'chrome'), b.pop();
    }
    // the crown
    cbox(b, DIE_X, 1.72, 0, 0.27, 0.21, 0.78, 0.022, 'ix_yellow', { uvScale: 2.5 });
    face(b, [[DIE_X - 0.136, 1.735, -0.37], [DIE_X - 0.136, 1.735, 0.37], [DIE_X - 0.136, 1.915, 0.37], [DIE_X - 0.136, 1.915, -0.37]], 'st_crown', { fit: true }, [-1, 0, 0], true);
    // the main cylinder on top, the two rams under the crown either side of the die
    lathe(b, DIE_X, 1.93, 0, [[0.12, 0], [0.12, 0.05], [0.105, 0.06], [0.105, 0.34], [0.122, 0.36], [0.122, 0.41], [0.07, 0.45]], 8, 'ix_steel', { uvScale: 3 });
    for (const s of [-1, 1]) {
      lathe(b, DIE_X, 1.4, s * 0.17, [[0.05, 0], [0.058, 0.02], [0.05, 0.03], [0.05, 0.3], [0.06, 0.32]], 8, 'ix_steel', { uvScale: 3 });
      // the steam vent: a short pipe out the crown's end, angled down
      tube(b, [[DIE_X, 1.83, s * 0.38], [DIE_X, 1.83, s * 0.46], [DIE_X - 0.02, 1.76, s * 0.52]], 0.022, 6, 'metal_dark');
    }
    // hoses from the rams up over the crown and down the back to the cabinet
    for (const s of [-1, 1]) tube(b, [[DIE_X + 0.05, 1.68, s * 0.17], [DIE_X + 0.13, 1.64, s * 0.15], [DIE_X + 0.24, 1.7, s * 0.12], [0.42, 1.5, s * 0.14], [0.5, 1.3, s * 0.12]], 0.016, 5, 'ix_hose');
    tube(b, [[DIE_X + 0.08, 2.3, 0.0], [0.2, 2.34, 0.03], [0.42, 2.0, 0.05], [0.5, 1.5, 0.05]], 0.02, 5, 'ix_hose');
    // the gauge on the crown's front, the amber lamps' bezels
    b.push().translate(-0.14, 1.78, 0.25).rotateZ(Math.PI / 2);
    lathe(b, 0, -0.012, 0, [[0.04, 0], [0.04, 0.012], [0.034, 0.016]], 8, 'chrome');
    b.pop();
    face(b, [[-0.157, 1.75, 0.22], [-0.157, 1.75, 0.28], [-0.157, 1.81, 0.28], [-0.157, 1.81, 0.22]], 'st_gauge', { fit: true }, [-1, 0, 0], true);
    for (const z of [-0.2, -0.13]) { b.push().translate(-0.134, 1.86, z).rotateZ(Math.PI / 2); lathe(b, 0, -0.004, 0, [[0.026, 0], [0.026, 0.006]], 6, 'metal_dark'); b.pop(); }
    // the beacon's cage and foot
    lathe(b, ST.BEACON.x, ST.BEACON.y - 0.09, ST.BEACON.z, [[0.06, 0], [0.085, 0.03], [0.085, 0.09]], 8, 'metal_dark');
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4; rod(b, [ST.BEACON.x + Math.cos(a) * 0.085, ST.BEACON.y, ST.BEACON.z + Math.sin(a) * 0.085], [ST.BEACON.x + Math.cos(a) * 0.03, ST.BEACON.y + 0.2, ST.BEACON.z + Math.sin(a) * 0.03], 0.005, 4, 'metal_dark'); }
    // the work lamp: an arm off the crown's front corner, a conical shade with a wire cage, hung over the forearm
    const L = ST.LAMP;
    tube(b, [[DIE_X - 0.1, 1.85, 0.36], [DIE_X - 0.18, 1.86, 0.33], [L.x + 0.02, 1.8, L.z + 0.04], [L.x, L.y + 0.12, L.z]], 0.012, 5, 'metal_dark');
    lathe(b, L.x, L.y - 0.04, L.z, [[0.09, 0], [0.085, 0.015], [0.05, 0.08], [0.03, 0.12], [0.018, 0.14]], 9, 'metal_dark', { uvScale: 3 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; rod(b, [L.x + Math.cos(a) * 0.088, L.y - 0.04, L.z + Math.sin(a) * 0.088], [L.x + Math.cos(a) * 0.02, L.y - 0.12, L.z + Math.sin(a) * 0.02], 0.0035, 4, 'chrome'); }
    // cable from the lamp down the column
    tube(b, sag([L.x, L.y + 0.12, L.z], [DIE_X, 1.5, 0.35], 0.08, 6), 0.007, 4, 'ix_cable');
  }

  private buildCabinet(b: ModelBuilder) {
    // the power unit behind the gantry: a tall steel cabinet, louvres, a pressure tank, valves, cables to the floor
    cbox(b, 0.56, 0.04, 0, 0.3, 1.36, 0.62, 0.02, 'ix_plate', { uvScale: 2 });
    for (let i = 0; i < 6; i++) cbox(b, 0.405, 0.9 + i * 0.05, 0.12, 0.012, 0.018, 0.22, 0.003, 'metal_dark');
    lathe(b, 0.46, 0.04, -0.4, [[0.1, 0], [0.11, 0.05], [0.11, 0.85], [0.08, 0.95], [0.03, 0.98]], 8, 'ix_steel', { uvScale: 2 });
    for (const y of [0.5, 0.8]) lathe(b.push().translate(0.40, y, -0.2).rotateZ(Math.PI / 2), 0, 0, 0, [[0.03, 0], [0.03, 0.03], [0.045, 0.035], [0.045, 0.05]], 6, 'metal_brass'), b.pop();
    for (const s of [-1, 1]) tube(b, sag([0.45, 0.3, s * 0.2], [0.05, 0.05, s * 0.4], 0.02, 6), 0.012, 4, 'ix_cable', { caps: false });
  }

  private buildCross(S: THREE.Material) {
    const { DIE_X } = ST;
    const c = new ModelBuilder();
    // the crosshead between the columns, with bushings round them
    cbox(c, 0, 0.07, 0, 0.16, 0.13, 0.52, 0.014, 'ix_steel', { uvScale: 3 });
    for (const s of [-1, 1]) {
      cbox(c, 0, 0.05, s * 0.3, 0.15, 0.18, 0.15, 0.016, 'ix_yellow', { uvScale: 3 });
      for (const y of [0.08, 0.18]) for (const zz of [-0.05, 0.05]) lathe(c.push().translate(-0.076, y, s * 0.3 + zz).rotateZ(Math.PI / 2), 0, 0, 0, [[0.006, 0], [0.006, 0.004], [0.003, 0.006]], 6, 'chrome'), c.pop();
      // ram clevis on top
      cbox(c, 0, 0.2, s * 0.17, 0.06, 0.04, 0.06, 0.008, 'metal_dark');
    }
    // the die: a heavy block under the centre, chamfered, the band's seat cut in its face
    cbox(c, 0, 0.0, 0, 0.12, 0.075, 0.15, 0.012, 'metal_dark', { uvScale: 3 });
    for (const s of [-1, 1]) cbox(c, 0, -0.01, s * 0.07, 0.11, 0.03, 0.03, 0.006, 'ix_steel', { uvScale: 3 });
    // the die's lit strip (amber: the band in the jaws is live)
    const strip = new ModelBuilder();
    cbox(strip, -0.061, 0.02, 0, 0.004, 0.012, 0.11, 0.002, 'ix_sodium', { color: 0xffffff });
    const mesh = this.mk(c, S);
    this.dieMat = emitMat(0xffa040, 0.6);
    this.cross.add(mesh, this.mk(strip, this.dieMat));
    this.cross.position.set(DIE_X, ST.UP_Y, 0);
    this.cross.add(this.bandSeat);
    this.g.add(this.cross);
    // the rams' chrome rods: unit length down from the barrels, stretched to the crosshead each frame
    for (const s of [-1, 1]) {
      const rb = new ModelBuilder();
      lathe(rb, 0, -1, 0, [[0.026, 0], [0.026, 1]], 8, 'chrome', { caps: false });
      const r = this.mk(rb, S);
      r.position.set(DIE_X, 1.4, s * 0.17);
      this.g.add(r); this.rods.push(r);
    }
  }

  private buildJaws(S: THREE.Material) {
    const { BED, ARM_Y } = ST;
    // the jaws: curved shells over the forearm behind the band, hinged on the rails (closed = over the arm)
    for (const [grp, s] of [[this.jawL, -1], [this.jawR, 1]] as [THREE.Group, number][]) {
      const mb = new ModelBuilder();
      const hz = s * 0.1, hy = BED + 0.0;
      // built in place (closed) relative to the hinge
      mb.push().translate(0, -hy, -hz);
      const a0 = s < 0 ? Math.PI * 1.02 : -Math.PI * 0.02, a1 = Math.PI * 0.5 + s * -0.06;
      arcShell(mb, 0, ARM_Y, 0.046, 0.06, a0, a1, 5, -0.03, 0.03, 'ix_steel', { uvScale: 3 });
      // the jaw's arm down to the hinge, a rubber lip inside
      cbox(mb, 0, BED - 0.005, s * 0.085, 0.05, 0.05, 0.028, 0.006, 'ix_yellow', { uvScale: 3 });
      arcShell(mb, 0, ARM_Y, 0.04, 0.046, a0, a1, 5, -0.026, 0.026, 'rubber_black');
      mb.pop();
      const m = this.mk(mb, S);
      grp.position.set(-0.075, hy, hz);
      grp.add(m);
      this.g.add(grp);
    }
    // the strap over the back of the hand: a steel band hinged on the debtor's left of the hand plate
    const sb = new ModelBuilder();
    sb.push().translate(0, -(ST.BED - 0.005), 0.155);
    arcShell(sb, -0.0, ST.BED + 0.005, 0.105, 0.118, Math.PI * 0.98, Math.PI * 0.08, 7, -0.025, 0.025, 'ix_steel', { uvScale: 3 });
    cbox(sb, 0, ST.BED + 0.005 + 0.11, 0, 0.05, 0.012, 0.06, 0.004, 'ix_haz', { uvScale: 3 });
    sb.pop();
    this.strapG.position.set(0.14, ST.BED - 0.005, -0.155);
    this.strapG.add(this.mk(sb, S));
    this.g.add(this.strapG);
  }

  /** put it in the stage: x, z of the wrist saddle; yaw turns local +x */
  place(x: number, z: number, yaw: number) {
    this.g.position.set(x, 0, z);
    this.g.rotation.y = yaw;
    this.g.updateMatrixWorld(true);
  }
  /** a local point in the stage's world */
  world(local: THREE.Vector3, out = new THREE.Vector3()) { this.g.updateMatrixWorld(); return out.copy(local).applyMatrix4(this.g.matrixWorld); }
  /** the die face's centre (world) */
  dieWorld(out = new THREE.Vector3()) { this.cross.updateWorldMatrix(true, false); return out.setFromMatrixPosition(this.cross.matrixWorld); }

  /** steam: 'vents' off the crown, 'jaws' from the clamp cylinders, 'die' round the crosshead, 'rams' from the barrels */
  puff(where: 'vents' | 'jaws' | 'die' | 'rams', k = 1) {
    const n = Math.max(1, Math.round((this.low ? 3 : 6) * k));
    const S = this.steam, D = ST.DIE_X;
    if (where === 'vents') for (const s of [-1, 1]) S.emit(D - 0.02, 1.76, s * 0.52, -0.2, -0.6, s * 0.7, n, 0.9 * k, 0.05);
    else if (where === 'jaws') for (const s of [-1, 1]) S.emit(-0.075, ST.BED + 0.01, s * 0.26, 0, 0.3, s * 0.8, n, 0.6 * k, 0.03);
    else if (where === 'rams') for (const s of [-1, 1]) S.emit(D, 1.42, s * 0.17, (Math.random() - 0.5) * 0.4, -0.3, s * 0.5, n, 0.5 * k, 0.04);
    else { const y = this.cross.position.y; for (const s of [-1, 1]) S.emit(D + (Math.random() - 0.5) * 0.1, y + 0.03, s * 0.12, 0, 0.2, s * 1, n, 0.8 * k, 0.035); }
  }
  /** blood under the wrist: the pool and the run grow toward k (0..1) */
  bleed(k: number) { this.poolGoal = Math.max(this.poolGoal, Math.min(1, k)); }

  /** apply lift / clamp / strap */
  set() {
    const y = ST.UP_Y + (ST.CONTACT_Y - ST.UP_Y) * this.lift;
    this.cross.position.y = y;
    for (const r of this.rods) r.scale.y = Math.max(0.01, 1.4 - (y + 0.22));
    const open = 1 - this.clamp;
    this.jawL.rotation.x = open * 1.25;
    this.jawR.rotation.x = -open * 1.25;
    this.strapG.rotation.x = (1 - this.strap) * 1.9;
  }

  update(dt: number) {
    this.t += dt;
    this.set();
    // the beacon turns while it is armed; the amber lamps blink; the die's strip glows as it comes down
    this.spin += dt * (this.armed ? 6.5 : 0);
    this.beaconRot.rotation.y = this.spin;
    const bOn = this.armed ? 1 : 0;
    const face = Math.max(0, Math.cos(this.spin * 1.0));
    this.beaconMat.uniforms.uK.value = 0.25 + bOn * (1.2 + 1.6 * face);
    if (this.beaconLight) this.beaconLight.intensity = bOn * 9;
    this.ambers.uniforms.uK.value = this.armed ? (Math.sin(this.t * 9) > 0 ? 3.2 : 0.25) : 0.2;
    this.dieMat.uniforms.uK.value = 0.4 + this.lift * 2.2 + (this.armed ? Math.sin(this.t * 23) * 0.2 : 0);
    this.lampMat.uniforms.uK.value = 0.15 + this.lamp * 3.2;
    // the needle climbs with the pressure, shivers at the top
    this.needle.rotation.x = -2.2 + this.pressure * 3.6 + (this.pressure > 0.8 ? Math.sin(this.t * 40) * 0.05 : 0);
    // blood spreads slowly, more and more slowly
    this.poolK += (this.poolGoal - this.poolK) * Math.min(1, dt * 0.9);
    const pk = this.poolK;
    this.pool.scale.set(0.15 + pk * 0.95, 1, 0.15 + pk * 0.85);
    this.pool.visible = pk > 0.01;
    this.run.scale.set(Math.max(0.001, pk * pk * 1.1), 1, 0.4 + pk * 0.6);
    this.run.position.x = ST.DIE_X - 0.05 - pk * pk * 0.1;
    this.run.visible = pk > 0.15;
    this.steam.update(dt);
  }

  dispose() {
    this.g.removeFromParent();
    this.g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry) m.geometry.dispose(); });
  }
}
void K;
export type { PixelCanvas };
