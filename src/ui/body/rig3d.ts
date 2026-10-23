// The life-support rig: the one machine the body HUD is built on. An olive
// enamel console (riveted, stencilled, a hazard edge, vent slots) carries the
// IV mast the blood bag hangs from, the breathing pump (lung3d.ts) and the
// digester (jar3d.ts), joined by brass pipes with octagonal handwheel valves;
// a Meridian-issue rucksack leans on its end (click it: the backpack opens).
// Nothing holds it up: it hangs in the still air of the corner, drifting,
// bobbing and turning a little, cables dangling under it, and it is sprung:
// hits, bites, gulps, footsteps, coughs and pokes knock it about and it
// settles back with a wobble.
//
// Space (stage units, y down negative): the rig's parts are built in `inner`,
// whose coordinates match the HUD's stage (0..SW, 0..-SH); `pivot` turns it
// about its middle.
import * as THREE from 'three';
import type { BodyStage } from './stage';
import { PrintTex, FONT, inkText } from './stage';
import { Mold, M, STEEL, BRASS, PAINT, CLOTH, PLASTIC, CHROME, RUBBER, R90, solidMesh, fcyl, fbox, fring, jitter } from './models';
import { face as polyFace, clipRect, frod, ftaper } from '../touch/facet';
import { hash, mix } from './pix';
import { CON_H, FRONT } from './lung3d';

/** the HUD stage in units (k = 1) */
export const SW = 132, SH = 96;
/** the console's top face (y), its span and depth */
export const CON_TOP = -74, CON_X0 = 6, CON_X1 = 126, CON_D = 16;
/** where the parts stand (x, y of each root) */
export const BAG_AT: [number, number] = [28, -5.5];
export const PUMP_AT: [number, number] = [64, CON_TOP];
export const JAR_AT: [number, number] = [100, CON_TOP];
export const PACK_AT: [number, number] = [119, CON_TOP];
const MAST_X = 9;
const OLIVE = 0x5c6440, OLIVE_D = 0x3e4430, OLIVE_L = 0x7a8456;

export class Rig3D {
  /** add to the HUD's world; everything else goes into `inner` */
  readonly pivot = new THREE.Group();
  readonly inner = new THREE.Group();
  readonly packHit: THREE.Mesh;
  private pack = new THREE.Group();
  private cables: THREE.Group[] = [];
  private front: PrintTex;
  // float spring state (offset x, y in units, roll z, yaw y)
  private x = 0; private y = 0; private r = 0; private yaw = 0;
  private vx = 0; private vy = 0; private vr = 0; private vyaw = 0;
  private t = Math.random() * 50;
  /** 0..1 how lifted the pack is (hover) */
  packHover = 0; private packLift = 0;
  /** where it floats now (units): for the shadow */
  lift = 0;

  constructor(private st: BodyStage) {
    const cx = (CON_X0 + CON_X1) / 2, cy = -SH / 2;
    this.pivot.position.set(cx, cy, 0);
    this.inner.position.set(-cx, -cy, 0);
    this.pivot.add(this.inner);
    const g = this.inner;
    const W = CON_X1 - CON_X0, ccx = (CON_X0 + CON_X1) / 2, ccy = CON_TOP - CON_H / 2;
    // ---- the console: an enamel steel box, a darker plinth band, a hazard-striped kick edge (front print)
    const con = new Mold()
      .add(fbox(W, CON_H, CON_D, 0.1), M(ccx, ccy, 0), (_x, y, _z, _nx, ny) => (ny > 0.5 ? OLIVE_L : y < ccy - CON_H / 2 + 2 ? OLIVE_D : OLIVE), PAINT)
      .add(fbox(W + 1.2, 1.2, CON_D + 1.2, 0.3), M(ccx, CON_TOP - 0.2, 0), 0x2e3224, STEEL)
      .add(fbox(W - 6, 2, CON_D - 3, 0.3), M(ccx, CON_TOP - CON_H - 1, 0), 0x2a2c22, STEEL);
    // corner guards and rivets down the ends
    for (const sx of [-1, 1]) {
      const ex = sx < 0 ? CON_X0 : CON_X1;
      con.add(fbox(2.2, CON_H + 1.6, 3, 0.3), M(ex, ccy, FRONT - 0.6), 0x8a9098, STEEL);
      con.add(fbox(2.2, CON_H + 1.6, 3, 0.3), M(ex, ccy, -FRONT + 0.6), 0x6a7076, STEEL);
      for (const yy of [CON_TOP - 3, CON_TOP - CON_H + 3]) con.add(fcyl(0.5, 0.5, 6, 0.55, 0.3), M(ex, yy, FRONT + 1, R90), 0xd8dee4, CHROME);
    }
    // ---- the IV mast: a hex pole on a bolted foot, a collar clamp, the crossarm to the bag's hook
    con.add(fbox(6, 1.6, 6, 0.3), M(MAST_X, CON_TOP + 0.8, 0), 0x4a4e52, STEEL)
      .add(fcyl(1, -3.2 - CON_TOP, 6, 1, 0), M(MAST_X, (CON_TOP - 3.2) / 2, 0), (_x, _y, _z, nx) => (nx < -0.3 ? 0xf0f4f6 : nx > 0.5 ? 0x6a7076 : 0xb8c0c6), CHROME)
      .add(fcyl(1.6, 2.4, 6, 1.6, 0.3), M(MAST_X, -30, 0), 0xc0902e, BRASS)
      .add(fbox(3.2, 1, 1, 0.3), M(MAST_X + 1.8, -30, 0), 0xc0902e, BRASS)
      .add(fcyl(0.8, BAG_AT[0] - MAST_X + 2, 6, 0.8, 0), M((BAG_AT[0] + MAST_X) / 2 + 1, -2.6, 0, 0, 0, R90), 0xc8d0d6, CHROME)
      .add(fcyl(1.4, 1.6, 6, 1.4, 0.3), M(MAST_X, -2.6, 0), 0x8a9098, STEEL)
      .add(fcyl(1, 1, 6, 1, 0.3), M(BAG_AT[0] + 2, -2.6, 0, 0, 0, R90), 0x8a9098, STEEL);
    // the bag's line goes into a brass inlet on the console
    con.add(fcyl(1.6, 1.6, 6, 1.9, 0.3), M(BAG_AT[0], CON_TOP + 0.8, 0), 0xc0902e, BRASS);
    // ---- pipes along the console top with octagonal handwheel valves: bag -> pump -> digester
    const pz = 2.5, py = CON_TOP + 1.3;
    con.add(frod([BAG_AT[0], py, 0], [BAG_AT[0], py, pz], 0.75, 6), null, 0xb08a3a, BRASS)
      .add(frod([BAG_AT[0], py, pz], [PUMP_AT[0] - 14, py, pz], 0.75, 6), null, 0xb08a3a, BRASS)
      .add(frod([PUMP_AT[0] + 10.5, py, pz], [JAR_AT[0] - 16, py, pz], 0.75, 6), null, 0xb08a3a, BRASS);
    for (const vx of [40, 81]) {
      con.add(fcyl(1.4, 3.2, 8, 1.4, 0.25), M(vx, py, pz, 0, 0, R90), 0x9a7428, BRASS)
        .add(fcyl(0.45, 3, 6, 0.45, 0), M(vx, py + 1.6, pz), 0x8a9098, STEEL)
        .add(fring(2, 0.45, 8, 4), M(vx, py + 3.2, pz, R90, 0, Math.PI / 8), 0xa8281a, PLASTIC);
      for (let i = 0; i < 4; i++) con.add(fbox(3.6, 0.4, 0.4, 0.2), M(vx, py + 3.2, pz, 0, i * Math.PI / 4, 0), 0x8a1a10, PLASTIC);
    }
    for (const fx of [BAG_AT[0] + 6, PUMP_AT[0] - 14.5, PUMP_AT[0] + 11, JAR_AT[0] - 16.5]) con.add(fcyl(1.2, 0.8, 8, 1.2, 0.3), M(fx, py, pz, 0, 0, R90), 0xc89a3a, BRASS);
    g.add(solidMesh(st, con, { wear: 0.7 }));
    // ---- the console's front: enamel, seams, rivets, vent slots, stencils, the hazard edge
    this.front = new PrintTex(W * 2, CON_H * 2, 1);
    this.paintFront();
    const fm = new THREE.Mesh(new Mold().add(polyFace(clipRect(W - 0.4, CON_H - 0.4, 0.6)), null, 0xffffff, PAINT).build(), st.solid({ map: this.front.tex, wear: 0.5 }));
    fm.position.set(ccx, ccy, CON_D / 2 + 0.05); g.add(fm);
    // ---- hangers and cables under it (it floats: nothing reaches the floor)
    const hang = new Mold();
    for (const hx of [24, 108]) hang.add(fbox(5, 2.6, 6, 0.3), M(hx, CON_TOP - CON_H - 2.2, 0), 0x3a3e30, STEEL).add(fcyl(0.9, 1, 6, 0.9, 0.3), M(hx, CON_TOP - CON_H - 3.6, 0), 0x8a9098, STEEL);
    g.add(solidMesh(st, hang));
    const cabX = [[44, 0x1a1a18, 6], [52, 0x8a1a12, 4], [86, 0x1a1a18, 7], [90, 0xc8a020, 4.5]] as const;
    for (const [x0, col, len] of cabX) {
      const cg = new THREE.Group(); cg.position.set(x0, CON_TOP - CON_H - 1.5, 1);
      const cm = new Mold().add(frod([0, 0, 0], [0.4, -len * 0.5, 0.3], 0.38, 4), null, col, RUBBER).add(frod([0.4, -len * 0.5, 0.3], [-0.2, -len, 0.5], 0.38, 4), null, col, RUBBER)
        .add(fcyl(0.6, 1.2, 6, 0.6, 0.2), M(-0.2, -len - 0.5, 0.5), 0xc0902e, BRASS);
      cg.add(solidMesh(st, cm));
      g.add(cg); this.cables.push(cg);
    }
    // ---- the Meridian-issue rucksack leaning on the console's end
    this.buildPack();
    this.pack.position.set(PACK_AT[0], PACK_AT[1], -1);
    g.add(this.pack);
    this.packHit = new THREE.Mesh(new THREE.BoxGeometry(14, 17, 10), new THREE.MeshBasicMaterial());
    this.packHit.position.set(0, 7.5, 0); this.packHit.visible = false;
    this.pack.add(this.packHit);
  }

  /** a small corporate rucksack: charcoal ballistic nylon, olive panels, a top flap with two cam buckles,
   *  a zipped front pocket with a reflective bar and a stamped brass Meridian tab, side compression straps */
  private buildPack() {
    const nylon = (x: number, y: number, z: number) => (hash(Math.round(x * 3), Math.round(y * 3), Math.round(z * 3)) > 0.86 ? 0x4a4e3e : 0x5a5f48);
    const m = new Mold()
      .add(jitter(ftaper(11, 6.4, 10, 5.4, 13, 0.18), 0.18, 4), M(0, 6.5, 0), nylon, CLOTH)
      // side panels and the base
      .add(jitter(fbox(1.2, 11, 5.4, 0.3), 0.1, 2), M(-5.6, 6, 0), 0x2c2e2a, CLOTH)
      .add(jitter(fbox(1.2, 11, 5.4, 0.3), 0.1, 3), M(5.6, 6, 0), 0x2c2e2a, CLOTH)
      .add(fbox(11.4, 1.4, 6.6, 0.4), M(0, 0.7, 0), 0x1e201e, RUBBER)
      // the front pocket, its zip, the reflective bar and the brass tab
      .add(jitter(fbox(8.4, 6.4, 1.8, 0.4), 0.12, 5), M(0, 4.4, 3.4), 0x6a7052, CLOTH)
      .add(fbox(7.8, 0.35, 0.3, 0.2), M(0, 7.3, 4.35), 0x9aa2aa, STEEL)
      .add(fbox(1, 1.4, 0.4, 0.3), M(2.6, 6.8, 4.5), 0xb8c0c6, CHROME)
      .add(fbox(6.4, 0.9, 0.3, 0.2), M(0, 3.2, 4.4), 0xc8d0b8, PAINT)
      .add(fbox(2.4, 1.6, 0.4, 0.3), M(0, 5.2, 4.45), 0xc0902e, BRASS)
      // the top flap, two straps down the front with cam buckles
      .add(jitter(ftaper(11.6, 7, 10.6, 6.2, 2.4, 0.25), 0.15, 6), M(0, 12.6, 0.3, 0.12, 0, 0), 0x464a38, CLOTH)
      .add(fbox(1.2, 6, 0.4, 0.2), M(-3, 10.6, 3.6, 0.2, 0, 0), 0x1a1c1a, CLOTH)
      .add(fbox(1.2, 6, 0.4, 0.2), M(3, 10.6, 3.6, 0.2, 0, 0), 0x1a1c1a, CLOTH)
      .add(fbox(1.8, 1.2, 0.6, 0.3), M(-3, 8.6, 4), 0x8a9098, STEEL)
      .add(fbox(1.8, 1.2, 0.6, 0.3), M(3, 8.6, 4), 0x8a9098, STEEL)
      // side compression straps and the grab loop
      .add(fbox(0.4, 0.9, 6, 0.2), M(-6.3, 5, 0), 0x1a1c1a, CLOTH)
      .add(fbox(0.4, 0.9, 6, 0.2), M(6.3, 5, 0), 0x1a1c1a, CLOTH)
      .add(fring(1.8, 0.4, 6, 4, Math.PI), M(0, 13.6, -1.4), 0x1a1c1a, CLOTH);
    const mesh = solidMesh(this.st, m, { wear: 0.8 });
    this.pack.add(mesh);
    this.pack.rotation.set(0, -0.35, 0.12);
    this.pack.scale.setScalar(1.12);
  }

  private paintFront() {
    const T = this.front, P = T.pix, W = (CON_X1 - CON_X0) * 2, H = CON_H * 2;
    const X = (x: number) => Math.round((x - CON_X0) * 2);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const n = hash(x, y, 21);
      let c = n > 0.93 ? mix(OLIVE, 0xffffff, 0.08) : n < 0.05 ? OLIVE_D : OLIVE;
      if (y < 2) c = y === 0 ? 0x8a9466 : 0x6c7450; // the lit top lip
      if (y >= H - 5) c = ((x + y) >> 2) % 2 ? 0x1a1610 : 0xd0a028; // hazard kick edge
      if (y === H - 6) c = 0x23261a;
      // chipped enamel showing grey primer and rust at the edges
      if (hash(x >> 1, y >> 1, 4) > 0.965) c = 0x8a8a7a;
      if ((x < 3 || x > W - 4) && hash(x, y, 8) > 0.6) c = 0x6a3a1e;
      P.set(x, y, c);
    }
    // panel seams with rivets
    for (const sx of [X(16), X(48), X(86), X(112)]) { P.vline(sx, 2, H - 7, 0x2a2e1e); P.vline(sx + 1, 2, H - 7, 0x7a8456); for (let y = 4; y < H - 7; y += 6) { P.set(sx - 2, y, 0xc8ccb8); P.set(sx - 2, y + 1, 0x2a2e1e); } }
    // vent slots
    for (let i = 0; i < 5; i++) { const vx = X(112) + 6 + i * 4; P.rect(vx, 5, 2, 9, 0x101208); P.vline(vx + 2, 5, 13, 0x7a8456); }
    // a water stain run under the bag
    for (let y = 2; y < H - 6; y++) if (hash(1, y, 3) > 0.3) P.blend(X(BAG_AT[0]) + Math.round(Math.sin(y * 0.6) * 1.5), y, 0x2a2410, 0.4);
    T.commit((c) => {
      inkText(c, 'BLOOD', X(BAG_AT[0]), H - 9, 11, FONT.sign, '#e8e2c4', 'center', '700');
      inkText(c, 'AIR', X(41), H - 9, 11, FONT.sign, '#e8e2c4', 'center', '700');
      inkText(c, 'FOOD', X(JAR_AT[0]), H - 9, 11, FONT.sign, '#e8e2c4', 'center', '700');
    });
  }
  /** web fonts arrived */
  repaintType() { this.paintFront(); }

  /** knock the rig: dx, dy units/s, dr rad/s */
  kick(dx: number, dy: number, dr: number) { this.vx += dx; this.vy += dy; this.vr += dr; this.vyaw += dr * 0.6; }
  /** a poke at a stage point: it swings away from where you touched */
  poke(x: number, y: number, k = 1) {
    const cx = this.pivot.position.x;
    this.kick((Math.random() - 0.5) * 4 * k, -6 * k, -((x - cx) / 60) * 1.2 * k + (y < -48 ? 0.2 : -0.2) * k);
  }

  update(dt: number, dead: boolean) {
    this.t += dt;
    const t = this.t;
    // the idle drift: slow, incommensurate waves (it never quite repeats)
    const dx = Math.sin(t * 0.31) * 1.1 + Math.sin(t * 0.13 + 1) * 0.6;
    const dy = Math.sin(t * 0.47) * 1.3 + Math.sin(t * 0.21 + 2) * 0.5 - (dead ? 3 : 0);
    const dr = Math.sin(t * 0.27) * 0.018 + Math.sin(t * 0.11 + 4) * 0.01 + (dead ? 0.06 : 0);
    const dyaw = Math.sin(t * 0.19) * 0.12 + Math.sin(t * 0.07 + 3) * 0.06;
    // springs toward the drift (soft: it bounces)
    const k = 60, c = 5.5;
    this.vx += ((dx - this.x) * k - this.vx * c) * dt; this.x += this.vx * dt;
    this.vy += ((dy - this.y) * k - this.vy * c) * dt; this.y += this.vy * dt;
    this.vr += ((dr - this.r) * 50 - this.vr * 5) * dt; this.r += this.vr * dt;
    this.vyaw += ((dyaw - this.yaw) * 30 - this.vyaw * 4) * dt; this.yaw += this.vyaw * dt;
    this.x = Math.max(-4, Math.min(4, this.x)); this.y = Math.max(-4, Math.min(4, this.y));
    this.r = Math.max(-0.12, Math.min(0.12, this.r)); this.yaw = Math.max(-0.35, Math.min(0.35, this.yaw));
    this.pivot.position.x = (CON_X0 + CON_X1) / 2 + this.x;
    this.pivot.position.y = -SH / 2 + this.y;
    this.pivot.rotation.set(Math.sin(t * 0.23) * 0.04, this.yaw, this.r);
    this.lift = this.y;
    // cables trail after the motion
    for (let i = 0; i < this.cables.length; i++) this.cables[i].rotation.z = -this.vx * 0.06 + this.vr * 0.8 + Math.sin(t * 1.1 + i * 1.7) * 0.08;
    // the pack lifts a little under the pointer
    this.packLift += (this.packHover - this.packLift) * Math.min(1, dt * 10);
    this.pack.position.y = PACK_AT[1] + this.packLift * 1.6;
    this.pack.rotation.z = 0.12 - this.packLift * 0.1 + Math.sin(t * 2.3) * 0.01 * this.packLift;
  }
  /** the pack's middle in stage space */
  packWorld(out: THREE.Vector3) { out.set(0, 7, 0); return this.pack.localToWorld(out); }
}
