// The brain on the life-support rig (sanity), a 3D machine like the heart: two
// hemispheres of faceted pink cortex with real folds (gyri and sulci), clamped
// into a riveted steel cage (a strap over the midline, a brass band across),
// six brass electrodes driven into the lobes with their cables running down to
// a junction box of lamps by the plinth and to a copper spark coil on the right,
// three vacuum tubes standing in a rack on the crown, a brass porthole cut into
// the temporal lobe where two gears turn, and the stem socketed into a ribbed
// chrome coupling on the plinth. Everything faces the viewer (the HUD is seen
// from the front).
//
// It runs on the shared heartbeat (vitals.ts / heartEngine.ts): every beat it
// throbs. Sanity (vitals.sanityShown) drives the rest: the cortex bruises
// toward grey-violet, the tubes dim and flicker and finally burn sick green
// (the simulation leaking through), the junction lights go green, amber, red,
// cracks open across the lobes and steel staples bite in to hold them, the
// gears grind and stall, and the coil spits sparks on every scare (twitch).
//
// Space: the root sits on the plinth's brass cup (y = 0 is the console top), centred at x = 0.
import * as THREE from 'three';
import type { Player } from '../../entities/player';
import type { BodyStage, Cubes } from './stage';
import { Mold, M, STEEL, BRASS, CHROME, RUBBER, GLASS, R90, solidMesh, fcyl, fbox, fring, ball } from './models';
import { frod } from '../touch/facet';
import { hash, mix } from './pix';
import type { Vitals } from './vitals';

/** the cortex's centre above the console top */
const BY = 15.5;
/** half-sizes of the brain (x across, y up, z front to back) */
const RX = 12.4, RY = 9.4, RZ = 11.6;
/** the brain turns its right side to the viewer (frontal lobe to the left): the classic silhouette */
const TURN = -1.15;
const UP = new THREE.Vector3(0, 1, 0);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const mulM = (a: THREE.Matrix4, b: THREE.Matrix4) => new THREE.Matrix4().multiplyMatrices(a, b);

/** fold field: ~1 on the sulci (thin grooves), ~0 on the broad gyri */
function groove(x: number, y: number, z: number): number {
  const a = Math.sin(x * 6.6 + Math.sin(y * 4.9 + z * 2.3) * 1.9)
    + Math.sin(y * 6.1 + Math.sin(z * 4.3 + x * 1.7) * 1.9)
    + Math.sin(z * 6.4 + Math.sin(x * 5.3 + y * 1.9) * 1.9);
  return Math.pow(clamp(1 - Math.abs(a) / 1.1, 0, 1), 2.4);
}

/** a unit-sphere point to the brain surface (one hemisphere), without folds */
function shape(x: number, y: number, z: number, side: number): THREE.Vector3 {
  // the hemisphere: the sphere squeezed onto its own side of the midline fissure
  const hx = side * (0.07 + (x * side + 1) * 0.5 * 0.93);
  // flat underside, rounder frontal lobe, a narrower occipital pole, the temporal lobe hanging low at the front sides
  let yy = y < -0.25 ? -0.25 + (y + 0.25) * 0.45 : y;
  const front = Math.max(0, z), back = Math.max(0, -z);
  const temporal = Math.max(0, 1 - Math.hypot(Math.abs(hx) - 0.72, y + 0.35, z - 0.25) / 0.55);
  yy -= temporal * 0.22;
  const w = 1 + front * 0.06 - back * 0.16;
  return new THREE.Vector3(hx * RX * w, yy * RY * (1 - back * 0.08), z * RZ);
}

function hemisphere(side: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 3);
  const P = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const v = shape(x, y, z, side);
    // sink the sulci (not on the flat inner wall or the underside)
    const gr = groove(x, y, z) * (y > -0.3 ? 1 : 0.4) * clamp((x * side + 0.6) * 1.5, 0, 1);
    const k = 1 - gr * 0.1;
    P.setXYZ(i, v.x * k, v.y * k, v.z * k);
  }
  g.computeVertexNormals();
  return g;
}
/** cortex colour from the fold field: crowns light, grooves deep */
function cortexCol(x: number, y: number, z: number): number {
  const gr = groove(x / RX, y / RY, z / RZ);
  const n = hash(Math.round(x * 2), Math.round(y * 2), Math.round(z * 2));
  let c = gr > 0.4 ? 0x86284a : gr > 0.14 ? 0xc0607a : n > 0.75 ? 0xf8bcc6 : 0xee9eae;
  if (y < -RY * 0.2) c = mix(c, 0xb86478, 0.35);
  return c;
}

/** a gear in the xy plane (axle along z), centred */
export function gearMold(r: number, teeth: number, th: number, col: number): Mold {
  const m = new Mold();
  m.add(fcyl(r, th, Math.max(8, teeth), r, 0.2), M(0, 0, 0, R90, 0, 0), col, BRASS);
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    m.add(fbox(r * 0.26, r * 0.34, th * 0.9, 0.1), M(Math.cos(a) * r * 1.08, Math.sin(a) * r * 1.08, 0, 0, 0, a - R90), col, BRASS);
  }
  for (let i = 0; i < 4; i++) { const a = i * R90 + 0.4; m.add(fbox(r * 0.24, r * 0.24, th * 1.05, 0.1), M(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, 0), 0x3a2a14, STEEL); }
  m.add(fcyl(r * 0.28, th * 1.6, 6, r * 0.28, 0.2), M(0, 0, 0, R90, 0, 0), 0xd8dee4, CHROME);
  return m;
}

interface Spark { x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number; on: boolean; c: number }

export class Brain3D {
  readonly root = new THREE.Group();
  /** what throbs (the cortex, its cage, electrodes, the porthole) */
  private beatG = new THREE.Group();
  /** the brain itself, turned side-on (cortex, cage, electrodes, porthole, cracks) */
  private C = new THREE.Group();
  readonly hit: THREE.Mesh;
  private cortexMat: THREE.ShaderMaterial;
  private gears: { g: THREE.Group; dir: number; ratio: number }[] = [];
  private gearAng = 0; private gearV = 1;
  private tubes: THREE.MeshBasicMaterial[] = [];
  private leds: THREE.MeshBasicMaterial[] = [];
  private cracks: { mesh: THREE.Mesh; th: number }[] = [];
  private sparks: Spark[] = [];
  private coilTop = new THREE.Vector3(15, 16, 1);
  private t = 0; private lastEnv = 0; private flick = 1;
  private jx = 0; private jy = 0;
  private v = new THREE.Vector3();

  constructor(private st: BodyStage) {
    const r = this.root, B = this.beatG;
    r.add(B);
    B.position.set(0, BY, 0);
    const C = this.C; C.rotation.y = TURN; B.add(C);
    /** a point given in the beat group's (screen-facing) space, in the turned brain's space */
    const toC = (v: THREE.Vector3) => v.clone().applyAxisAngle(UP, -TURN);

    // ---- the cortex: two folded hemispheres (they throb, they bruise)
    this.cortexMat = st.surf('rubber', { color: 0xffffff });
    const cx = new Mold();
    for (const side of [-1, 1]) cx.add(hemisphere(side), M(side * 0.35, 0, 0), (x, y, z) => cortexCol(x, y, z), RUBBER);
    // the cerebellum tucked under the back, finely ridged
    cx.add(new THREE.IcosahedronGeometry(1, 2), M(0, -RY * 0.55, -RZ * 0.62, 0, 0, 0, RX * 0.62, RY * 0.38, RZ * 0.34), (_x, y) => ((Math.round(y * 3) & 1) ? 0xc87088 : 0xe08ea0), RUBBER);
    C.add(new THREE.Mesh(cx.build(), this.cortexMat));

    const mech = new Mold();
    // ---- the cage: a riveted steel strap along the midline fissure, a brass band across the crown
    const arc = (plane: 'mid' | 'cross', n: number) => {
      const pts: [number, number, number][] = [];
      for (let i = 0; i <= n; i++) {
        const a = -Math.PI * 0.5 + (i / n) * Math.PI * (plane === 'mid' ? 1.12 : 1);
        const s = Math.sin(a), c = Math.cos(a);
        pts.push(plane === 'mid' ? [0, c * RY * 1.06 + 0.6, s * RZ * 1.04] : [s * RX * 1.07, c * RY * 1.08 + 0.6, -1.4]);
      }
      return pts;
    };
    const strap = arc('mid', 12), band = arc('cross', 10);
    for (let i = 0; i < strap.length - 1; i++) mech.add(frod(strap[i], strap[i + 1], 0.85, 4), null, (_x, _y, _z, _nx, ny) => (ny > 0.4 ? 0xc8d0d6 : 0x6a7278), STEEL);
    for (let i = 0; i < band.length - 1; i++) mech.add(frod(band[i], band[i + 1], 0.75, 4), null, (_x, _y, _z, _nx, ny) => (ny > 0.4 ? 0xf0c860 : 0xa87a2a), BRASS);
    for (let i = 1; i < strap.length - 1; i += 2) mech.add(ball(0.55, 0), M(strap[i][0], strap[i][1] + 0.6, strap[i][2]), 0xe8eef2, CHROME);
    for (let i = 1; i < band.length - 1; i += 2) mech.add(ball(0.5, 0), M(band[i][0], band[i][1] + 0.5, band[i][2]), 0xe8eef2, CHROME);
    // clamp feet where the band meets the plinth side
    for (const sx of [-1, 1]) mech.add(fbox(2.6, 3, 3, 0.3), M(sx * RX * 1.07, -RY * 0.1, -1.4), 0x8a9098, STEEL).add(fcyl(0.5, 1, 6, 0.5, 0.3), M(sx * (RX * 1.07 + 1.4), -RY * 0.1, -1.4, 0, 0, R90), 0xd8dee4, CHROME);

    // ---- electrodes: brass sockets driven into the lobes; left ones cable down to the junction box, right ones to the coil
    const boxL = new THREE.Vector3(-13.5, 6.5 - BY, 4), coilB = new THREE.Vector3(15, 4 - BY, 1);
    // (the right hemisphere faces the viewer: x > 0; z runs front (screen left) to back (screen right))
    const ELEC: [number, number, number, number][] = [[0.5, 0.62, 0.6, 0xb02a20], [0.62, 0.7, -0.1, 0xe0b028], [0.7, 0.2, 0.75, 0x1c1c1c], [0.78, 0.36, -0.55, 0x2850a8], [0.3, 0.92, 0.28, 0x1c1c1c], [0.4, 0.86, -0.4, 0xb02a20]];
    for (const [ux, uy, uz, col] of ELEC) {
      const n = new THREE.Vector3(ux, uy, uz).normalize();
      const p = shape(n.x, n.y, n.z, Math.sign(ux)).add(new THREE.Vector3(Math.sign(ux) * 0.35, 0, 0));
      const out = p.clone().add(n.clone().multiplyScalar(2.6));
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      const at = (v: THREE.Vector3, len: number) => new THREE.Matrix4().compose(v, q, new THREE.Vector3(1, len, 1));
      mech.add(fcyl(1.25, 1, 8, 1.4, 0.3), at(p.clone().add(n.clone().multiplyScalar(0.3)), 1), (_x, _y, _z, _nx, ny) => (ny > 0.3 ? 0xf0c860 : 0xa87a2a), BRASS)
        .add(fcyl(0.55, 1, 6, 0.55, 0.2), at(p.clone().add(n.clone().multiplyScalar(1.6)), 2.2), 0xd8dee4, CHROME)
        .add(fcyl(0.85, 1, 6, 0.85, 0.3), at(out, 0.9), col, RUBBER);
      // the cable: off the pin, out past the side of the brain, down to its box (both given screen-facing)
      const scr = out.clone().applyAxisAngle(UP, TURN);
      const left = scr.x < 0, end = left ? boxL : coilB;
      const mid = out.clone().add(n.clone().multiplyScalar(2.4));
      const side = toC(new THREE.Vector3((left ? -1 : 1) * (RZ + 1.5 + uy * 2), Math.min(scr.y, 2) - 2 - uy * 2, 4 + uy * 2));
      const pts = [out, mid, side, toC(end.clone().add(new THREE.Vector3(0, 2.5, 1)))];
      for (let i = 0; i < pts.length - 1; i++) mech.add(frod(pts[i].toArray() as [number, number, number], pts[i + 1].toArray() as [number, number, number], 0.42, 4), null, col, RUBBER);
    }

    // ---- the porthole in the right temporal lobe: a brass ring on a dark backplate, two gears behind glass
    const ph = shape(0.72, -0.18, 0.62, 1).add(new THREE.Vector3(0.35, 0, 0));
    const pq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0.62, -0.08, 0.78).normalize());
    const pm = new THREE.Matrix4().compose(ph, pq, new THREE.Vector3(1, 1, 1));
    mech.add(fcyl(4.2, 1.2, 10, 4.2, 0.2), mulM(pm, M(0, 0, -0.9, R90, 0, 0)), 0x1a1612, STEEL)
      .add(fring(4.4, 0.75, 10, 4), pm, (_x, _y, _z, _nx, ny) => (ny > 0.3 ? 0xf6d070 : 0xb08a3a), BRASS);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; mech.add(ball(0.42, 0), mulM(pm, M(Math.cos(a) * 4.4, Math.sin(a) * 4.4, 0.6)), 0xe8eef2, CHROME); }
    const porth = new THREE.Group(); porth.position.copy(ph); porth.quaternion.copy(pq); C.add(porth);
    for (const [gx, gy, gr, teeth, dir] of [[-1.2, 0.6, 2.2, 10, 1], [1.9, -1.4, 1.5, 7, -1]] as const) {
      const g = new THREE.Group(); g.position.set(gx, gy, -0.2);
      g.add(solidMesh(st, gearMold(gr, teeth, 0.9, dir > 0 ? 0xd8a840 : 0xb88a34), { wear: 0.4 }));
      porth.add(g); this.gears.push({ g, dir, ratio: 10 / teeth });
    }
    const glass = new THREE.Mesh(new Mold().add(new THREE.CircleGeometry(4, 10), null, 0xe8f4f4, GLASS).build(), st.surf('glass', { alpha: 0.12, color: 0xd8ece6 }));
    glass.position.z = 0.7; glass.renderOrder = 3; porth.add(glass);

    // ---- cracks across the crown, and the steel staples that hold them (deeper as sanity goes)
    const CR: [number, [number, number, number][]][] = [
      // (on the right hemisphere, the side that faces the viewer: x across, then up and front-to-back)
      [55, [[7, 0.6, 0.5], [8, 0.52, 0.28], [7.4, 0.62, 0.06], [8.2, 0.5, -0.18]]],
      [34, [[6, 0.7, -0.3], [7.4, 0.5, -0.46], [6.6, 0.42, -0.64], [7.8, 0.22, -0.72]]],
      [16, [[9.6, 0.1, 0.62], [10, 0.28, 0.36], [9.4, 0.06, 0.12], [10.2, 0.2, -0.12]]],
    ];
    for (const [th, raw] of CR) {
      const pts = raw.map(([x, uy, uz]) => { const n = new THREE.Vector3(x / RX, uy, uz).normalize(); return shape(n.x, n.y, n.z, Math.sign(x)).multiplyScalar(1.01); });
      const m = new Mold();
      for (let i = 0; i < pts.length - 1; i++) {
        m.add(frod(pts[i].toArray() as [number, number, number], pts[i + 1].toArray() as [number, number, number], 0.42, 4), null, 0x2a0612, RUBBER);
        const mid = pts[i].clone().lerp(pts[i + 1], 0.5); mid.y += 0.5;
        const dir = pts[i + 1].clone().sub(pts[i]);
        m.add(fbox(0.5, 0.5, 3.2, 0.1), new THREE.Matrix4().compose(mid, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(dir.x, dir.z) + R90, 0)), new THREE.Vector3(1, 1, 1)), 0xc8d0d6, CHROME);
      }
      const mesh = solidMesh(st, m); mesh.visible = false; C.add(mesh);
      this.cracks.push({ mesh, th });
    }

    // ---- the tube rack on the crown: a brass saddle on the strap, three sockets (they ride the throb)
    C.add(solidMesh(st, mech, { wear: 0.5 }));
    const rack = new Mold();
    const crown = RY * 1.06 + 0.6;
    rack.add(fbox(14, 1.2, 4, 0.3), M(0, crown + 0.9, 1), (_x, _y, _z, _nx, ny) => (ny > 0.5 ? 0xf0c860 : 0xa87a2a), BRASS)
      .add(fbox(1.4, 2.4, 3, 0.3), M(-6.2, crown - 0.4, 1), 0x8a9098, STEEL)
      .add(fbox(1.4, 2.4, 3, 0.3), M(6.2, crown - 0.4, 1), 0x8a9098, STEEL);
    const TX = [-4.4, 0, 4.4];
    for (const x of TX) rack.add(fcyl(1.5, 1.4, 8, 1.7, 0.3), M(x, crown + 2.2, 1), 0x2a2420, RUBBER).add(fcyl(1.1, 0.5, 8, 1.1, 0.2), M(x, crown + 9.4, 1), 0x8a9098, STEEL);
    for (const x of TX) {
      const fm = new THREE.MeshBasicMaterial({ color: 0xffa040 });
      const fil = new THREE.Mesh(new Mold().add(fbox(0.9, 4, 0.5, 0.1), null, 0xffffff).add(fbox(1.8, 0.5, 0.5, 0.1), M(0, 2.1, 0), 0xffffff).build(), fm);
      fil.position.set(x, crown + 5.6, 1); B.add(fil); this.tubes.push(fm);
      const gl = new THREE.Mesh(new Mold().add(fcyl(1.3, 6, 8, 1.4, 0.4), null, 0xe8f4f4, GLASS).add(ball(1.3, 1), M(0, 3.1, 0, 0, 0, 0, 1, 0.7, 1), 0xe8f4f4, GLASS).build(), st.surf('glass', { alpha: 0.16, color: 0xffe8c8 }));
      gl.position.set(x, crown + 6, 1); gl.renderOrder = 3; B.add(gl);
    }
    B.add(solidMesh(st, rack, { wear: 0.5 }));

    // ---- fixed to the plinth: the stem coupling, the junction box of lamps, the spark coil
    const fix = new Mold()
      // the stem down into a ribbed chrome coupling seated in the brass cup
      .add(fcyl(2.4, 6, 8, 3, 0.3), M(0, 7, 0), 0xc87088, RUBBER)
      .add(fcyl(3.6, 3.6, 8, 4, 0.3), M(0, 1.8, 0), (_x, _y, _z, nx) => (nx < -0.2 ? 0xe8eef2 : 0x8a9098), CHROME);
    for (const ry of [0.8, 2, 3.2]) fix.add(fring(3.9, 0.35, 8, 4), M(0, ry, 0, R90, 0, 0), 0x6a7278, STEEL);
    // the junction box at the left of the plinth
    const jb = boxL.clone(); jb.y += BY;
    fix.add(fbox(6, 7, 4.4, 0.4), M(jb.x, jb.y - 2.5, jb.z), (_x, y, _z, _nx, ny) => (ny > 0.5 ? 0x8a9098 : y > jb.y ? 0x6a7278 : 0x4a5056), STEEL)
      .add(fbox(6.6, 1, 5, 0.3), M(jb.x, jb.y + 1.2, jb.z), 0x3a3e30, STEEL);
    for (const sy of [-5, 0]) fix.add(fcyl(0.4, 0.6, 6, 0.45, 0.3), M(jb.x - 2.3, jb.y + sy, jb.z + 2.3, R90), 0xd8dee4, CHROME);
    // the spark coil on the right: copper windings on a stalk, a chrome ball on top
    const cb = this.coilTop;
    fix.add(fbox(4, 1.4, 4, 0.3), M(cb.x, 0.7, cb.z), 0x4a5056, STEEL).add(fcyl(0.55, 6, 6, 0.55, 0), M(cb.x, 4, cb.z), 0x4a4e52, STEEL);
    for (let i = 0; i < 7; i++) fix.add(fring(1.5 - i * 0.07, 0.38, 8, 4), M(cb.x, 5.6 + i * 0.95, cb.z, R90, 0, 0), (_x, _y, _z, _nx, ny) => (ny > 0.2 ? 0xe89050 : 0xb05a28), BRASS);
    fix.add(ball(1.7, 1), M(cb.x, 13.6, cb.z), 0xe8eef2, CHROME);
    cb.set(cb.x, 14.6, cb.z + 0.5);
    r.add(solidMesh(st, fix, { wear: 0.55 }));
    // the junction box's lamps (green / amber / red by sanity, the middle one blinking on the beat)
    for (let i = 0; i < 3; i++) {
      const lm = new THREE.MeshBasicMaterial({ color: 0x40ff60 });
      const led = new THREE.Mesh(new Mold().add(fbox(1.4, 1.4, 0.8, 0.2), null, 0xffffff).build(), lm);
      led.position.set(jb.x + 0.8, jb.y - 0.4 - i * 2, jb.z + 2.4); r.add(led); this.leds.push(lm);
    }

    // the pick box
    this.hit = new THREE.Mesh(new THREE.BoxGeometry(30, 34, 26), new THREE.MeshBasicMaterial());
    this.hit.position.set(0, BY + 2, 0); this.hit.visible = false; r.add(this.hit);
    for (let i = 0; i < 24; i++) this.sparks.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, on: false, c: 0 });
  }

  /** once a frame: throb on the shared heartbeat, sanity everywhere else */
  update(dt: number, p: Player, vit: Vitals, hover: boolean) {
    this.t += dt;
    const dead = p.body.dead;
    const san = clamp(vit.sanityShown / 100, 0, 1);
    const env = dead ? 0 : Math.min(1.2, vit.heart.env());
    const tw = vit.twitch;
    // the throb (stronger when sane: a healthy brain pumps), a flinch on a scare
    const th = 1 + 0.06 * env * (0.6 + 0.4 * san) + (hover ? 0.03 : 0);
    const sq = tw > 0.05 ? Math.sin(this.t * 40) * tw * 0.05 : 0;
    this.beatG.scale.set(th * (1 + sq), th * (1 - sq), th);
    this.jx += ((tw > 0.05 ? Math.sin(this.t * 71) * 1.4 * tw : 0) - this.jx) * Math.min(1, dt * 30);
    this.jy += ((tw > 0.05 ? Math.cos(this.t * 53) * 1 * tw : 0) - this.jy) * Math.min(1, dt * 30);
    this.beatG.position.set(this.jx, BY + this.jy, 0);
    this.beatG.rotation.y = Math.sin(this.t * 0.6) * 0.12;
    this.beatG.rotation.x = Math.sin(this.t * 0.43) * 0.04;
    // the cortex bruises toward grey-violet as sanity goes; grey when dead
    const mul = this.cortexMat.uniforms.uMul.value as THREE.Vector3;
    const k = 1 - san;
    if (dead) mul.set(0.62, 0.58, 0.62);
    else mul.set(1 - k * 0.36 + env * 0.05, 1 - k * 0.42, 1 - k * 0.12);
    for (const c of this.cracks) c.mesh.visible = !dead && vit.sanityShown < c.th;
    // the gears: a steady turn that speeds up in fear, grinds and stalls when sanity is low
    const want = dead ? 0 : (1.1 + tw * 4 + k * 1.5) * (san < 0.3 && Math.sin(this.t * 2.3) > 0.4 ? 0.05 : 1);
    this.gearV += (want - this.gearV) * Math.min(1, dt * (san < 0.3 ? 9 : 3));
    this.gearAng += this.gearV * dt + (san < 0.3 ? Math.sin(this.t * 37) * 0.004 : 0);
    for (const g of this.gears) g.g.rotation.z = this.gearAng * g.dir * g.ratio;
    // the tubes: warm and steady when sane, dim and flickering lower down, sick green near the end
    if (!dead && san < 0.55 && Math.random() < dt * (2 + k * 12)) this.flick = Math.random() < 0.5 ? 0.15 : 0.6;
    this.flick += (1 - this.flick) * Math.min(1, dt * 6);
    const glow = dead ? 0.05 : (0.35 + 0.65 * san) * this.flick * (0.85 + env * 0.15);
    const tube = new THREE.Color(san < 0.2 && !dead ? 0x6aff70 : 0xffa040).multiplyScalar(glow);
    for (const m of this.tubes) m.color.copy(tube);
    // the lamps: green, amber, red; they blink on the beat
    const lamp = dead ? 0x1a1a1a : san > 0.6 ? 0x40ff60 : san > 0.3 ? 0xffb020 : 0xff3020;
    for (let i = 0; i < this.leds.length; i++) {
      const on = dead ? 0 : i === 1 ? (env > 0.45 ? 1 : 0.25) : 0.8;
      this.leds[i].color.set(lamp).multiplyScalar(on);
    }
    // sparks off the coil: on scares, and on their own when sanity is low
    const rate = dead ? 0 : tw * 40 + (san < 0.35 ? (0.35 - san) * 30 : 0);
    if (rate > 0 && Math.random() < dt * rate) this.spark(2 + Math.floor(Math.random() * 3), san < 0.2);
    for (const s of this.sparks) if (s.on) {
      s.t -= dt; if (s.t <= 0) { s.on = false; continue; }
      s.vy -= 60 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
    }
    this.lastEnv = env;
  }
  private spark(n: number, sick: boolean) {
    for (const s of this.sparks) {
      if (s.on) continue;
      if (n-- <= 0) break;
      s.on = true; s.t = 0.18 + Math.random() * 0.25;
      s.x = this.coilTop.x; s.y = this.coilTop.y; s.z = this.coilTop.z + 1;
      const a = Math.random() * Math.PI * 2;
      s.vx = Math.cos(a) * (14 + Math.random() * 16); s.vy = 10 + Math.random() * 18; s.vz = Math.sin(a) * 8 + 6;
      s.c = sick ? (Math.random() < 0.5 ? 0x8aff90 : 0xd8ffd8) : (Math.random() < 0.5 ? 0xa8e0ff : 0xffffff);
    }
  }
  /** sparks into the HUD's shared cube batch (in the rig's inner space) */
  cubes(C: Cubes) {
    for (const s of this.sparks) if (s.on) {
      this.v.set(s.x, s.y, s.z); this.root.localToWorld(this.v); this.root.parent?.worldToLocal(this.v);
      C.put(this.v.x, this.v.y, this.v.z, 0.7, 0.7, 0.7, 0, s.c);
    }
  }
}
