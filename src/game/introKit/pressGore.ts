// What the Remittance Press does to the last debtor (round 20). The intake's
// press room (src/game/introSet.ts) brings the giant die down on the body face
// down on the plate; this is everything that comes out of it, with weight:
//   - the ribcage gives first: a run of cracks, ribs snapping out of the sides
//     of the chest (curved bars with the meat still on them), slabs of the cage
//     left splayed under the flattened body once the die lifts
//   - bones splinter: long shards with marrow in the broken ends thrown off the
//     plate, the joints' knuckles of bone
//   - the organs are squeezed out from under the die: coils of gut, a liver,
//     the lungs, the heart, meat; they skid over the steel, slither off the front
//     lip and slap down on the tiles (bouncing, tumbling, rolling onto their
//     flattest side, smearing a trail)
//   - blood: a burst out of every side of the die, arterial jets that pulse for a
//     few seconds after, a pool spreading over the plate, a curtain of drips off
//     the lip and a second pool growing on the floor under it
// Later slams squeeze out less (the body is already flat). The script's camera
// and timing are untouched: this only adds what is in frame. Gore off: nothing
// of this; gore 1: blood and bone but fewer pieces; reduce-flash: no blood on
// the lens. Sounds are the game's recorded gore samples.
import * as THREE from 'three';
import { G } from '../G';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { addTextureModule, atlas, makeRamp, mixHex, bayer, ph, tileFbm } from '../../content/furniture/a_lib';
import { PK, type Particles } from '../../gore/particles';
import type { HumanRig } from '../../entities/humanRig';
import { stageMat } from './stageMat';
import { GP } from './machines';

addTextureModule(() => {
  const A = atlas();
  // liver: glossy dark red-brown, a paler capsule sheen
  A.add('pg_liver', 16, 16, (pc) => {
    const R = makeRamp(0x5a1a14, 5, { spread: 0.45 });
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let v = 0.5 + (tileFbm(x, y, 16, 16, 4, 3, 9301) - 0.5) * 0.7; v = Math.max(0, Math.min(1, v));
      const f = v * 4; let i = Math.floor(f); if (f - i > bayer(x, y)) i++;
      pc.set(x, y, R[Math.min(4, i)]);
    }
    for (let i = 0; i < 6; i++) pc.set((i * 5) % 16, (i * 7) % 16, 0xb86a5a);
  });
  // lung: pink and spongy, grey-blue mottling, a few dark blotches
  A.add('pg_lung', 16, 16, (pc) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const n = tileFbm(x, y, 16, 16, 8, 2, 9302);
      let c = mixHex(0xe08a8a, 0xb86a78, n);
      if (ph(x, y, 9303) < 0.12) c = 0xf4b4ac;
      if (n > 0.72) c = 0x7a5a6a;
      pc.set(x, y, c);
    }
  });
  // heart: dark muscle, yellow fat along the grooves, blue-grey vessels
  A.add('pg_heart', 16, 16, (pc) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const n = tileFbm(x, y, 16, 16, 4, 3, 9304);
      let c = mixHex(0x6a1418, 0x9a2a26, n);
      if (Math.abs(x - 6 - Math.sin(y * 0.5) * 2) < 1) c = 0xd8b45a;
      if (Math.abs(y - 4) < 1 && x > 3) c = 0xc8a050;
      if (Math.abs(x - 11 + y * 0.2) < 0.7) c = 0x4a4a6a;
      pc.set(x, y, c);
    }
  });
});

interface Piece { o: THREE.Mesh; v: THREE.Vector3; w: THREE.Vector3; half: THREE.Vector3; settled: boolean; landed: boolean; trail: number; born: number; big: boolean }
interface Pool { m: THREE.Mesh; at: number; max: number; tau: number; delay: number }
interface Jet { x: number; y: number; z: number; dx: number; dy: number; dz: number; t: number; life: number; beat: number; phase: number; k: number }

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _u = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
const r = Math.random;
const goreLevel = () => (G.sandbox?.gore ?? 2) as number;

// ---------------------------------------------------------------- the pieces (built once, shared)
let GEO: Record<string, THREE.BufferGeometry[]> | null = null;
/** a tube along an arc / a wandering path: segments of cylinder joined end to end */
function tube(mb: ModelBuilder, pts: [number, number, number][], rad: number, tex: string, seg = 5) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0, z0] = pts[i], [x1, y1, z1] = pts[i + 1];
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L = Math.hypot(dx, dy, dz);
    mb.push().translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2).rotateY(-Math.atan2(dz, dx)).rotateZ(Math.PI / 2 - Math.atan2(dy, Math.hypot(dx, dz)));
    mb.cylinder(0, -L / 2 - rad * 0.4, 0, rad, L + rad * 0.8, seg, tex, { bevel: false });
    mb.pop();
  }
}
function geos(): Record<string, THREE.BufferGeometry[]> {
  if (GEO) return GEO;
  const out: Record<string, THREE.BufferGeometry[]> = { rib: [], cage: [], shard: [], gut: [], liver: [], lung: [], heart: [], meat: [], knuckle: [] };
  // ribs: a curved bar of bone, one end snapped (jagged), the other still in its meat
  for (let v = 0; v < 3; v++) {
    const mb = new ModelBuilder(), R = 0.15 + v * 0.03, a0 = -0.2, a1 = 1.7 + v * 0.25, pts: [number, number, number][] = [];
    for (let i = 0; i <= 7; i++) { const a = a0 + (a1 - a0) * (i / 7); pts.push([Math.cos(a) * R, Math.sin(i * 0.9) * 0.006, Math.sin(a) * R]); }
    tube(mb, pts, 0.011, 'gore_bone');
    const [ex, , ez] = pts[pts.length - 1];
    mb.push().translate(ex, 0, ez).rotateY(-(a1 + 0.6)); mb.box(0.012, -0.006, 0, 0.03, 0.012, 0.008, 'gore_bone', { bevel: false }); mb.box(0.005, -0.004, 0.006, 0.018, 0.009, 0.006, 'gore_stump', { bevel: false }); mb.pop();
    mb.push().translate(pts[0][0], 0, pts[0][2]); mb.box(0, -0.016, 0, 0.05, 0.03, 0.04, 'gore_flesh', { fit: true }); mb.pop();
    out.rib.push(mb.build());
  }
  // a slab of the cage: four ribs side by side in their strip of muscle, broken off at one end
  for (let v = 0; v < 2; v++) {
    const mb = new ModelBuilder();
    for (let k = 0; k < 4; k++) {
      const z = -0.07 + k * 0.045, pts: [number, number, number][] = [];
      for (let i = 0; i <= 5; i++) { const t = i / 5; pts.push([t * (0.24 - k * 0.012 * v), Math.sin(t * Math.PI) * 0.035, z + t * 0.02]); }
      tube(mb, pts, 0.01, 'gore_bone', 4);
      if (k < 3) mb.box(0.11, -0.004, z + 0.023, 0.2, 0.012, 0.03, 'gore_flesh', { fit: true, bevel: false });
    }
    mb.box(-0.02, -0.01, 0, 0.05, 0.03, 0.2, 'gore_ribs', { fit: true });
    out.cage.push(mb.build());
  }
  // splinters: a long bone shard, a point at one end, marrow in the other
  for (let v = 0; v < 3; v++) {
    const mb = new ModelBuilder(), L = 0.16 + v * 0.05, w = 0.024 + v * 0.004;
    mb.box(0, -w / 2, 0, L, w, w * 0.85, 'gore_bone', { fit: true });
    mb.push().translate(L / 2, 0, 0).rotateY(0.5); mb.box(0.018, -w * 0.35, 0, 0.045, w * 0.7, w * 0.4, 'gore_bone', { fit: true, bevel: false }); mb.pop();
    mb.box(-L / 2 - 0.004, -w * 0.45, 0, 0.012, w * 0.9, w * 0.8, 'gore_stump', { fit: true, bevel: false });
    if (v === 2) mb.sphere(-L / 2 - 0.02, 0, 0, 0.03, 6, 4, 'gore_bone');
    out.shard.push(mb.build());
  }
  // the ball end of a long bone, torn out of its socket
  { const mb = new ModelBuilder(); mb.sphere(0, 0, 0, 0.032, 7, 5, 'gore_bone'); mb.box(0.05, -0.012, 0, 0.07, 0.024, 0.022, 'gore_bone', { fit: true }); mb.box(0.088, -0.014, 0, 0.012, 0.028, 0.026, 'gore_stump', { bevel: false }); out.knuckle.push(mb.build()); }
  // guts: a long wandering coil
  for (let v = 0; v < 3; v++) {
    const mb = new ModelBuilder(), pts: [number, number, number][] = [];
    let x = 0, z = 0, a = v * 1.7;
    for (let i = 0; i < 13; i++) { pts.push([x, 0.018 + (i % 3) * 0.006, z]); x += Math.cos(a) * 0.045; z += Math.sin(a) * 0.045; a += 0.62 + Math.sin(i * 1.3 + v) * 0.35; }
    tube(mb, pts, 0.02, 'gore_guts', 6);
    out.gut.push(mb.build());
  }
  // a liver (two lobes), the lungs, the heart with its vessels, meat
  { const mb = new ModelBuilder(); mb.sphere(0, 0.02, 0, 0.1, 9, 6, 'pg_liver', { sy: 0.38 }); mb.sphere(0.09, 0.016, 0.03, 0.06, 7, 5, 'pg_liver', { sy: 0.4 }); out.liver.push(mb.build()); }
  for (let v = 0; v < 2; v++) { const mb = new ModelBuilder(); mb.sphere(0, 0.03, 0, 0.075 + v * 0.01, 8, 6, 'pg_lung', { sy: 0.55 }); mb.sphere(0.04, 0.03, -0.03, 0.05, 6, 4, 'pg_lung', { sy: 0.6 }); tube(mb, [[-0.06, 0.03, 0], [-0.1, 0.035, 0.01]], 0.012, 'gore_guts', 5); out.lung.push(mb.build()); }
  { const mb = new ModelBuilder(); mb.sphere(0, 0.045, 0, 0.055, 8, 6, 'pg_heart', { sy: 0.85 }); tube(mb, [[0.01, 0.09, 0], [0.03, 0.12, 0.01], [0.06, 0.12, 0.02]], 0.016, 'pg_heart', 6); tube(mb, [[-0.02, 0.09, 0.01], [-0.03, 0.125, 0]], 0.012, 'gore_guts', 5); out.heart.push(mb.build()); }
  for (let v = 0; v < 3; v++) { const mb = new ModelBuilder(), s = 0.05 + v * 0.02; mb.box(0, -s / 2, 0, s * 1.3, s * 0.7, s, 'gore_flesh', { fit: true }); mb.box(s * 0.3, -s * 0.2, s * 0.2, s * 0.6, s * 0.5, s * 0.5, 'gore_flesh', { fit: true }); if (v) mb.box(-s * 0.4, -s * 0.1, 0, s * 0.8, s * 0.18, s * 0.18, 'gore_bone', { fit: true }); out.meat.push(mb.build()); }
  return (GEO = out);
}

export interface PressGoreHost {
  root: THREE.Group;
  blood: Particles;
  spray(x: number, y: number, z: number, dx: number, dy: number, dz: number, n?: number, speed?: number): void;
  bleed(x: number, y: number, z: number, dx: number, dy: number, dz: number, n?: number, speed?: number, splat?: number): void;
}

export class PressGore {
  private group = new THREE.Group();
  private pieces: Piece[] = [];
  private pools: Pool[] = [];
  private jets: Jet[] = [];
  private trails: THREE.Mesh[] = []; private trailI = 0;
  private drip = 0;
  private t = 0;
  private mat = stageMat({ rim: 0.9 });
  private decal = stageMat({ transparent: true, depthWrite: false, outline: 0, rim: 0 });
  private poolGeo: THREE.BufferGeometry; private smearGeo: THREE.BufferGeometry; private splatGeo: THREE.BufferGeometry;
  /** the press's centre (x, z) */
  private cx = 0; private cz = 0;
  /** where the camera should look for the mess (the crushed trunk), once there is one */
  focus(out: THREE.Vector3): THREE.Vector3 | null { return this.mass ? out.copy(this.mass.position) : null; }
  /** the die peeling off what it crushed (a wet tear and a crack as it lifts) */
  private lifted = true;
  /** the crushed trunk (it swells up out of the plate as the die lifts off it) */
  private mass: THREE.Mesh | null = null; private massT = 0;
  /** where the camera is (sound fall-off) */
  private cam = new THREE.Vector3();

  constructor(private host: PressGoreHost, private low = false) {
    host.root.add(this.group);
    const flat = (tex: string) => { const mb = new ModelBuilder(); mb.flat(0, 0, 0, 1, 1, tex, {}); return mb.build(); };
    this.poolGeo = flat('gore_red_pool'); this.splatGeo = flat('gore_red_splat_b');
    { const mb = new ModelBuilder(); mb.flat(0, 0, 0, 1, 0.45, 'gore_red_smear', {}); this.smearGeo = mb.build(); }
    for (let i = 0; i < (low ? 16 : 40); i++) { const m = new THREE.Mesh(this.smearGeo, this.decal); m.visible = false; m.renderOrder = 1; m.frustumCulled = false; this.group.add(m); this.trails.push(m); }
  }

  /** the bed's top (y) under a point, or the floor */
  private surface(x: number, z: number): number {
    return Math.abs(x - this.cx) < GP.bedD / 2 && Math.abs(z - this.cz) < GP.bedW / 2 ? GP.bedH : 0;
  }
  private sfx(key: string, vol: number, delay = 0) {
    const d = Math.hypot(this.cam.x - this.cx, this.cam.z - this.cz), k = Math.max(0.15, 1 - d / 14);
    const play = () => { try { G.audio?.flat?.(key, 'sfx', vol * k); } catch { /* no audio */ } };
    if (delay > 0) setTimeout(play, delay * 1000); else play();
  }

  /** the die has come down (hits: how many times now); rig: the body on the plate (its chest, to throw the ribs from) */
  slam(hits: number, cx: number, cz: number, rig: HumanRig | null, corpse: THREE.Object3D | null, cam: THREE.Vector3) {
    const lvl = goreLevel();
    if (lvl <= 0) return;
    this.cx = cx; this.cz = cz; this.cam.copy(cam);
    const first = hits === 1, heavy = lvl >= 2, low = this.low;
    const G0 = geos();
    const bedY = GP.bedH;
    // where the chest and the belly are under the die
    const chest = new THREE.Vector3(cx + 0.1, bedY + 0.1, cz + 0.55), belly = chest.clone();
    if (rig) { rig.root.updateMatrixWorld(true); rig.j.chest.getWorldPosition(chest); rig.j.hips.getWorldPosition(belly); belly.lerp(chest, 0.45); }
    chest.y = belly.y = bedY + 0.05;
    // the die's edge round the body: everything squeezes out there
    const edgeX = cx + 1.2;
    const spawn = (kind: string, n: number, at: THREE.Vector3, speed: number, spread: number, spin: number) => {
      const list = G0[kind];
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(list[(Math.random() * list.length) | 0], this.mat);
        m.frustumCulled = false; m.castShadow = !low;
        // squeezed out through the nearest side of the die along the steel: toward the front lip (+x), or out to either side;
        // most of it skids to a stop on the plate, the heavy wet things slide over the lip and drop
        const side = r() < 0.45 ? 0 : r() < 0.5 ? 1 : -1;
        const ox = side === 0 ? edgeX : at.x + (r() - 0.5) * 0.9, oz = side === 0 ? Math.max(cz - 1.3, Math.min(cz + 1.6, at.z + (r() - 0.5) * spread * 1.2)) : cz + side * 1.42;
        m.position.set(ox, bedY + 0.05 + r() * 0.06, oz);
        m.rotation.set(r() * 6, r() * 6, r() * 6);
        m.scale.setScalar(1.25);
        const dir = side === 0 ? new THREE.Vector3(1, 0, (r() - 0.5) * 1.1) : new THREE.Vector3((r() - 0.25) * 0.9, 0, side);
        dir.normalize().multiplyScalar(speed * (side === 0 ? 0.3 : 0.6) * (0.6 + r() * 0.75));
        dir.y = 0.25 + r() * 1.1 * (speed / 3);
        this.group.add(m);
        m.geometry.computeBoundingBox();
        const half = m.geometry.boundingBox!.getSize(new THREE.Vector3()).multiplyScalar(0.56).max(_v.set(0.008, 0.008, 0.008));
        this.pieces.push({ o: m, v: dir, w: new THREE.Vector3((r() - 0.5) * spin, (r() - 0.5) * spin, (r() - 0.5) * spin), half, settled: false, landed: false, trail: 0, born: this.t, big: half.x + half.y + half.z > 0.12 });
      }
    };
    if (first) {
      // the ribs go first: a run of cracks as the cage folds, then the rest
      for (let i = 0; i < 5; i++) this.sfx('gore_bone_crack', 0.55 - i * 0.06, 0.02 + i * 0.045 + r() * 0.02);
      this.sfx('gore_crunch', 0.8, 0.05); this.sfx('gore_burst', 0.75, 0.08); this.sfx('gore_squelch', 0.6, 0.22);
      spawn('rib', low ? 3 : 7, chest, 3.6, 1.0, 16);
      spawn('shard', low ? 2 : 5, chest, 4.2, 1.2, 20);
      spawn('knuckle', low ? 0 : 1, belly, 3, 0.8, 12);
      spawn('gut', heavy ? (low ? 1 : 3) : 1, belly, 2.4, 0.8, 5);
      if (heavy) { spawn('liver', 1, belly, 2.2, 0.6, 6); spawn('lung', low ? 1 : 2, chest, 2.6, 0.8, 7); spawn('heart', 1, chest, 2.8, 0.4, 8); }
      spawn('meat', low ? 3 : heavy ? 9 : 4, belly, 3.2, 1.4, 14);
      // what is left on the plate: the body burst open along its length, the cage splayed out from under the chest
      this.burst(chest, belly);
      if (corpse && rig) this.splayCage(corpse, rig);
      // blood: a sheet of it out from under the die's front edge (big wet drops, arcing at the eye), a burst out of every
      // side, then the jets that keep pulsing
      const B = this.host.blood;
      for (let i = 0; i < (low ? 24 : 70); i++) {
        const z = cz + 0.5 + (r() - 0.5) * 2.2, s = 1.6 + r() * 3.4;
        B.add(PK.Drop, edgeX - 0.05, bedY + 0.04 + r() * 0.05, z, s * (0.25 + r() * 0.45), 1.2 + r() * 2.8, (z - cz - 0.5) * 0.8 + (r() - 0.5) * 1.2, 0.016 + r() * 0.026, 1.8, r() < 0.4 ? 0x9a1a1a : r() < 0.5 ? 0x7a1012 : 0x5a0a0c, 0.1);
      }
      for (let i = 0; i < (low ? 4 : 10); i++) B.add(PK.Mist, edgeX, bedY + 0.1, cz + 0.5 + (r() - 0.5) * 1.6, 0.8 + r(), 0.3 + r() * 0.4, (r() - 0.5) * 0.8, 0.05 + r() * 0.05, 0.6, 0x8a2a2c, 0);
      const n = low ? 10 : 22;
      for (const [dx, dz] of [[1, 0], [1, 0.45], [1, -0.45], [0.55, 1], [0.55, -1], [0, 1], [0, -1], [-0.4, 1]]) this.host.spray(edgeX - (1 - dx) * 1.0, bedY + 0.12, cz + dz * 1.0 + 0.3, dx * 1.6, 0.45 + r() * 0.3, dz * 1.6, n, 5.2);
      for (let i = 0; i < (low ? 2 : 4); i++) this.jets.push({ x: edgeX, y: bedY + 0.08, z: cz + (r() - 0.3) * 1.6, dx: 1, dy: 0.35 + r() * 0.35, dz: (r() - 0.5) * 0.8, t: 0, life: 3.2 + r() * 1.5, beat: 0.62 + r() * 0.12, phase: r(), k: 1 });
      this.jets.push({ x: cx + 0.2, y: bedY + 0.08, z: cz + 1.5, dx: 0.2, dy: 0.5, dz: 1, t: 0, life: 2.8, beat: 0.7, phase: 0.3, k: 0.8 });
      // the pools: over the plate, then under the lip
      this.addPool(chest.x + 0.5, bedY + 0.004, chest.z, 2.8, 2.2, 0);
      this.addPool(edgeX + 0.15, bedY + 0.0045, cz + 0.2, 1.6, 1.6, 0.25);
      this.addPool(cx + GP.bedD / 2 + 0.55, 0.007, cz + 0.3, 2.4, 3.5, 1.1);
      this.addPool(cx + GP.bedD / 2 + 0.4, 0.0075, cz - 0.6, 1.6, 3.0, 1.6);
      this.drip = 7;
      // (the blood on the lens is the insert's: src/game/intro.ts goreInsert)
      this.lifted = false;
    } else {
      // the body is flat already: what is left in it squirts out, a bone or two goes
      this.sfx('gore_crunch', 0.6, 0.04); this.sfx('gore_squelch', 0.55, 0.1);
      spawn('meat', low ? 2 : 4, belly, 2.6, 1.4, 12);
      if (heavy) spawn('shard', 1, chest, 3.4, 1, 16);
      for (const [dx, dz] of [[1, 0.2], [0.6, 1], [0.6, -1]]) this.host.spray(edgeX - (1 - dx) * 1.0, bedY + 0.1, cz + dz * 0.9 + 0.3, dx * 1.4, 0.4, dz * 1.4, low ? 6 : 12, 4.2);
      this.jets.push({ x: edgeX, y: bedY + 0.06, z: cz + 0.3, dx: 1, dy: 0.3, dz: 0.2, t: 0, life: 1.6, beat: 0.6, phase: 0, k: 0.6 });
      this.drip = Math.max(this.drip, 4);
    }
    // keep it bounded
    while (this.pieces.length > (low ? 22 : 60)) { const p = this.pieces.shift()!; this.group.remove(p.o); }
  }

  /** the flattened trunk split open on the plate: an opened-body slab under it, wider than it, and guts spilled at its sides */
  private burst(chest: THREE.Vector3, belly: THREE.Vector3) {
    const a = Math.atan2(chest.z - belly.z, chest.x - belly.x);
    const mid = chest.clone().lerp(belly, 0.5);
    const mk = (tex: string, w: number, d: number) => { const mb = new ModelBuilder(); mb.flat(0, 0, 0, w, d, tex, {}); return mb.build(); };
    const slab = new THREE.Mesh(mk('gore_wound_open', 1.0, 0.62), this.decal);
    slab.position.set(mid.x, GP.bedH + 0.011, mid.z); slab.rotation.y = -a; slab.renderOrder = 2; slab.frustumCulled = false;
    const guts = new THREE.Mesh(mk('gore_guts', 0.5, 0.26), this.decal);
    guts.position.set(belly.x + Math.sin(a) * 0.3, GP.bedH + 0.012, belly.z - Math.cos(a) * 0.3); guts.rotation.y = -a + 0.4; guts.renderOrder = 2; guts.frustumCulled = false;
    const ribs = new THREE.Mesh(mk('gore_ribs', 0.42, 0.34), this.decal);
    ribs.position.set(chest.x - Math.sin(a) * 0.26, GP.bedH + 0.012, chest.z + Math.cos(a) * 0.26); ribs.rotation.y = -a - 0.3; ribs.renderOrder = 2; ribs.frustumCulled = false;
    this.group.add(slab, guts, ribs);
    // the crushed trunk itself: a flattened mound of meat with the gut on it, the spine showing, the ribs snapped and
    // bent up out of it on both sides (some whole arches, some broken short with jagged ends), lungs, heart and liver
    // squashed out at the sides, shards of bone standing out of the mess (spine axis along +x, chest end at +x)
    const mb = new ModelBuilder();
    const rr = mulberry(77);
    for (let i = 0; i < 7; i++) {
      const x = -0.36 + i * 0.12 + (rr() - 0.5) * 0.05, w = 0.16 + rr() * 0.12, h = 0.03 + rr() * 0.045, d = 0.2 + rr() * 0.14;
      mb.push().translate(x, 0, (rr() - 0.5) * 0.08).rotateY((rr() - 0.5) * 0.6); mb.box(0, 0, 0, w, h, d, 'gore_flesh', { fit: true }); mb.pop();
    }
    for (let i = 0; i < 6; i++) mb.box(-0.3 + i * 0.1, 0.035, 0, 0.06, 0.035, 0.05, 'gore_bone', { fit: true });
    const gp: [number, number, number][] = [];
    { let x = -0.38, z = 0.06, ga = 0.3; for (let i = 0; i < 14; i++) { gp.push([x, 0.055 + (i % 2) * 0.008, z]); x += Math.cos(ga) * 0.04; z += Math.sin(ga) * 0.04; ga += 0.9 + Math.sin(i) * 0.5; if (x > -0.02) ga += 1.2; } }
    tube(mb, gp, 0.021, 'gore_guts', 6);
    for (const sd of [-1, 1]) for (let i = 0; i < 6; i++) {
      const x = 0.02 + i * 0.06, len = i % 3 === 1 ? 0.55 : 1, pts: [number, number, number][] = [];
      for (let k = 0; k <= 6; k++) { const t = (k / 6) * len; pts.push([x + t * 0.03, 0.04 + Math.sin(t * Math.PI * 0.85) * (0.12 + rr() * 0.01) + t * 0.02, sd * (0.06 + t * 0.26)]); }
      tube(mb, pts, 0.0095, 'gore_bone', 4);
      const e = pts[pts.length - 1];
      if (len < 1) { mb.push().translate(e[0], e[1], e[2]).rotateX(sd * 0.9); mb.box(0, 0, 0, 0.012, 0.035, 0.008, 'gore_bone', { bevel: false }); mb.box(0, -0.004, 0, 0.014, 0.01, 0.012, 'gore_stump', { bevel: false }); mb.pop(); }
    }
    mb.sphere(0.22, 0.05, 0.3, 0.09, 8, 5, 'pg_lung', { sy: 0.35 });
    mb.sphere(0.18, 0.045, -0.3, 0.08, 8, 5, 'pg_lung', { sy: 0.35 });
    mb.sphere(0.12, 0.06, 0.12, 0.06, 7, 5, 'pg_heart', { sy: 0.5 });
    mb.sphere(-0.16, 0.04, -0.3, 0.11, 8, 5, 'pg_liver', { sy: 0.3 });
    for (const [x, z, ry, rz] of [[0.3, -0.12, 0.6, 0.9], [-0.05, 0.2, -1.1, 0.7], [0.35, 0.16, 2.2, 0.6]]) {
      mb.push().translate(x, 0.06, z).rotateY(ry).rotateZ(rz); mb.box(0, 0, 0, 0.022, 0.2, 0.02, 'gore_bone', { fit: true }); mb.box(0, 0.2, 0, 0.012, 0.03, 0.012, 'gore_bone', { bevel: false }); mb.pop();
    }
    const mass = new THREE.Mesh(mb.build(), this.mat);
    mass.position.set(mid.x, GP.bedH + 0.004, mid.z); mass.rotation.y = -a; mass.frustumCulled = false; mass.castShadow = !this.low;
    mass.scale.set(1.15, 0.01, 1.15);
    this.group.add(mass);
    this.mass = mass; this.massT = 0;
  }

  /** slabs of the ribcage sticking out from under the chest, flattened with the body */
  private splayCage(corpse: THREE.Object3D, rig: HumanRig) {
    const G0 = geos();
    corpse.updateMatrixWorld(true);
    const c = rig.j.chest.getWorldPosition(new THREE.Vector3());
    const local = corpse.worldToLocal(c.clone());
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(G0.cage[side > 0 ? 0 : 1], this.mat);
      m.frustumCulled = false;
      m.position.set(local.x + side * 0.16, local.y + 0.03, local.z);
      m.rotation.set(0, side > 0 ? 0 : Math.PI, side * 0.1);
      m.scale.set(1.15, 1, 1.1);
      corpse.add(m);
    }
  }

  private addPool(x: number, y: number, z: number, max: number, tau: number, delay: number) {
    const lvl = goreLevel(); if (lvl <= 0) return;
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(i ? this.splatGeo : this.poolGeo, this.decal);
      m.position.set(x + (r() - 0.5) * 0.4 * i, y + i * 0.0005 + this.pools.length * 0.0003, z + (r() - 0.5) * 0.4 * i);
      m.rotation.y = r() * 6.28;
      m.scale.setScalar(0.01);
      m.renderOrder = 1; m.frustumCulled = false;
      this.group.add(m);
      this.pools.push({ m, at: this.t, max: max * (i ? 0.7 : 1), tau, delay: delay + i * 0.3 });
    }
  }

  private smear(x: number, y: number, z: number, vx: number, vz: number, size: number) {
    const m = this.trails[this.trailI++ % this.trails.length];
    m.position.set(x, y + 0.005 + (this.trailI % 9) * 0.0004, z);
    m.rotation.set(0, -Math.atan2(vz, vx), 0);
    m.scale.set(size * (1 + r() * 0.5), 1, size * 0.8);
    m.visible = true;
  }

  update(dt: number, ramY: number) {
    this.t += dt;
    if (!this.lifted && ramY - GP.bedH > 0.16) { this.lifted = true; this.sfx('gore_tear', 0.55); this.sfx('gore_squelch', 0.5, 0.12); this.sfx('gore_bone_crack', 0.35, 0.3); this.sfx('gore_drip', 0.4, 0.45); }
    // the crushed trunk springs back a little as the die lifts off it (the ribs that are left stand up out of it)
    if (this.mass) {
      const room = Math.max(0, Math.min(1, (ramY - GP.bedH - 0.08) / 0.4));
      this.massT = Math.max(this.massT, room);
      this.mass.scale.y = 0.15 + 0.85 * this.massT * this.massT * (3 - 2 * this.massT);
    }
    const B = this.host.blood;
    // the jets: a pulse on every beat, weaker as the pressure goes
    for (let i = this.jets.length - 1; i >= 0; i--) {
      const j = this.jets[i];
      j.t += dt;
      if (j.t > j.life) { this.jets.splice(i, 1); continue; }
      const k = j.k * Math.pow(1 - j.t / j.life, 1.4);
      const ph0 = (j.t / j.beat + j.phase) % 1;
      if (ph0 < 0.28 && r() < dt * 40) {
        const s = 2.2 + 3.4 * k;
        for (let n = 0; n < (this.low ? 1 : 3); n++) B.add(PK.Drop, j.x, j.y, j.z, (j.dx + (r() - 0.5) * 0.25) * s, (j.dy + r() * 0.2) * s, (j.dz + (r() - 0.5) * 0.25) * s, 0.01 + r() * 0.012, 1.4, r() < 0.5 ? 0x8a1416 : 0x6a1012, 0.06);
        if (r() < dt * 3) this.sfx('gore_spurt', 0.18 * k + 0.05);
      }
    }
    // the curtain of drips off the front lip
    if (this.drip > 0) {
      this.drip -= dt;
      const rate = (this.low ? 10 : 26) * Math.min(1, this.drip / 4);
      for (let n = 0; n < rate * dt * 4; n++) if (r() < 0.25) {
        const z = this.cz + 0.3 + (r() - 0.5) * 1.8 * (0.4 + Math.min(1, (7 - this.drip) / 2));
        B.add(PK.Drop, this.cx + GP.bedD / 2 + 0.02, GP.bedH - 0.01, z, 0.15 + r() * 0.2, -0.2, (r() - 0.5) * 0.1, 0.005 + r() * 0.004, 1.2, 0x7a1012, 0.12);
      }
      if (r() < dt * 2.5) this.sfx('gore_drip', 0.25);
    }
    // the pools spread
    for (const p of this.pools) {
      const t = this.t - p.at - p.delay;
      if (t <= 0) continue;
      p.m.scale.setScalar(Math.max(0.01, p.max * (1 - Math.exp(-t / p.tau))));
    }
    // the pieces: thrown, bouncing, skidding off the lip, settling flat; anything still under the die is pushed out
    for (const p of this.pieces) {
      if (p.settled) continue;
      const o = p.o;
      p.v.y -= 9.8 * dt;
      o.position.addScaledVector(p.v, dt);
      if (ramY - GP.bedH < 0.35 && Math.abs(o.position.x - this.cx) < 1.15 && Math.abs(o.position.z - this.cz) < 1.4) o.position.x = this.cx + 1.16;
      _e.set(p.w.x * dt, p.w.y * dt, p.w.z * dt); _q.setFromEuler(_e); o.quaternion.premultiply(_q);
      const floor = this.surface(o.position.x, o.position.z);
      const rest = Math.min(p.half.x, p.half.y, p.half.z) * 1.05;
      if (o.position.y - rest <= floor) {
        o.position.y = floor + rest;
        const sp = p.v.length();
        if (!p.landed || Math.abs(p.v.y) > 1.6) {
          p.landed = true;
          if (sp > 1.2) { this.sfx(p.big ? 'gore_gib_land' : 'gore_wet_hit', Math.min(0.5, 0.12 + sp * 0.06)); this.host.bleed(o.position.x, floor + 0.02, o.position.z, p.v.x * 0.2, 0.3, p.v.z * 0.2, this.low ? 3 : 6, 1.2, 0.35 + (p.big ? 0.25 : 0)); }
        }
        if (Math.abs(p.v.y) > 1.1) { p.v.y *= -0.28; p.v.x *= 0.62; p.v.z *= 0.62; p.w.multiplyScalar(0.5); }
        else {
          p.v.y = 0;
          const f = Math.exp(-(floor > 0 ? 5.2 : 4.5) * dt);
          p.v.x *= f; p.v.z *= f; p.w.multiplyScalar(Math.exp(-6 * dt));
          layFlat(p, dt * 5);
          // a wet smear behind whatever skids
          p.trail -= dt;
          if (p.trail <= 0 && Math.hypot(p.v.x, p.v.z) > 0.35) { p.trail = 0.07; this.smear(o.position.x, floor, o.position.z, p.v.x, p.v.z, 0.12 + (p.big ? 0.12 : 0)); }
          if (Math.hypot(p.v.x, p.v.z) < 0.06 && p.w.length() < 0.25) { layFlat(p, 1); p.settled = true; o.position.y = floor + Math.min(p.half.x, p.half.y, p.half.z) * 0.95; }
        }
      }
      if (this.t - p.born > 14) p.settled = true;
    }
  }

  dispose() { this.group.parent?.remove(this.group); this.pieces.length = 0; this.jets.length = 0; this.pools.length = 0; }
}

/** rotate a resting piece toward its flattest side down */
function mulberry(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function layFlat(p: Piece, k: number) {
  const h = p.half, q = p.o.quaternion;
  const thin = h.x <= h.y && h.x <= h.z ? 0 : h.y <= h.z ? 1 : 2;
  _u.set(thin === 0 ? 1 : 0, thin === 1 ? 1 : 0, thin === 2 ? 1 : 0).applyQuaternion(q).normalize();
  _q.setFromUnitVectors(_u, _u.y >= 0 ? UP : DOWN);
  _q2.copy(_q).multiply(q);
  q.slerp(_q2, Math.min(1, k));
}
