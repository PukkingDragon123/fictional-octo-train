// The first-person intake set (src/game/intro.ts): a hand-built stage in the
// renderer's overlay scene (src/fp/fp.ts), drawn through a perspective camera
// at eye height into the same low-res pixel target as everything else. Stage
// coordinates in metres, the debtor travels toward -z:
//
//   the processing wing   z  3 .. -11   two-tone institutional walls, wet
//                                      concrete, fluorescent tubes, observation
//                                      glass with still figures, your mugshot
//   the antechamber       z -11 .. -16 white tile, the drain, the old blood
//   the press room        z -16 .. -31 a black room too tall for the building:
//                                      a giant Remittance Press slamming down on
//                                      what is left of the last debtor, blood up
//                                      the walls, and in the far wall a door-
//                                      shaped section taped off in hazard tape
//                                      (the liquid membrane lives there)
//
// Geometry is built once per intro from shared atlas textures; materials skip
// the zone's light grid, visibility mask and fog; a handful of point lights
// follow the camera from fixture to fixture.
import * as THREE from 'three';
import { ModelBuilder } from '../gfx/modelBuilder';
import { worldMaterial } from '../gfx/materials';
import { buildObjGeometry } from '../world/objects';
import { WZ, addTextureModule, atlas, makeRamp, ph, plate, screw, txtC } from '../content/furniture/a_lib';
import { hopperModel, PRESS, roundBox } from '../content/furniture/zd_contract';
import { pressPartGeo, ramAt, CYCLE } from './debt/hopper';
import { Particles, PK } from '../gore/particles';
import type { Zone } from '../world/zone';

export const STAGE = { noVis: true, noFog: true, noGrid: true };
const SOLID = () => worldMaterial(STAGE);
const DECAL = () => worldMaterial({ ...STAGE, transparent: true, depthWrite: false, outline: 0 });
const CUT = () => worldMaterial({ ...STAGE, alphaTest: 0.5 });
const GLASS = () => worldMaterial({ ...STAGE, transparent: true, opacity: 0.32, depthWrite: false, outline: 0 });

/** where things are on the stage */
export const IX = {
  cor: { x0: -1.3, x1: 1.3, z0: -11, z1: 3.2, h: 2.7 },
  ante: { x0: -2.4, x1: 2.4, z0: -16, z1: -11, h: 2.9 },
  room: { x0: -5.6, x1: 5.6, z0: -31, z1: -16, h: 7.5 },
  door: { x0: -1.05, x1: 1.05, h: 2.45 },
  drain: [0.15, -13.4] as [number, number],
  press: { x: -3.1, z: -19.3, s: 1.85 },
  fit: [0.9, -23.9] as [number, number],
  tape: { x: 1.4, z: -31, w: 1.3, h: 2.3 },
  /** the drags (x, z): the wing to the drain, the drain into the press room */
  drag1: [[0, 1.8], [0, -10.6], [0.1, -12.9]] as [number, number][],
  drag2: [[0.25, -12.1], [0.3, -14.6], [0.55, -19.0], [0.9, -22.4]] as [number, number][],
};
const NEAR: [number, number, number][] = [];
/** observation windows in the wing's left wall (centres, z) */
const WINDOWS = [-4.6, -7.4];
/** corridor fixtures (ceiling tubes), the antechamber bulb, the press-room lamps */
const TUBES: [number, number, number][] = [];
for (let z = 2.2; z > -10.5; z -= 2.4) TUBES.push([0, IX.cor.h - 0.03, z]);

// the sign over the holding-cell door: the title of the piece, as the Institute painted it
addTextureModule(() => {
  const A = atlas();
  A.add('ix_title', 128, 32, (pc, rng) => {
    pc.wrap = false;
    plate(pc, 0, 0, 128, 32, 0x2c3c34, 4401, { noise: 0.12 });
    pc.strokeRect(1, 1, 126, 30, 0x1a241e);
    pc.hline(2, 125, 2, 0x4a5c52); pc.vline(2, 2, 29, 0x4a5c52);
    for (const [x, y] of [[4, 4], [122, 4], [4, 26], [122, 26]] as const) screw(pc, x, y, 0x8a9a90, 0x141a16, true);
    const cream = 0xe8e0c4, amber = 0xd8a830;
    txtC(pc, 'MERIDIAN INSTITUTE', 64, 4, cream);
    txtC(pc, 'PROCESSING WING', 64, 11, amber, 1, 2);
    txtC(pc, 'REMITTANCE PROGRAMME - INTAKE', 64, 23, scale(cream, 0.8));
    // overspray, chips back to grey primer, a rust run from each lower bolt, somebody's thumbprint in red
    for (let i = 0; i < 110; i++) { const x = rng.int(0, 127), y = rng.int(0, 31); if (pc.get(x, y) === cream || pc.get(x, y) === amber) { if (rng.chance(0.2)) pc.set(x, y, 0x6a7268); } else if (rng.chance(0.08)) pc.blend(x, y, 0x8a8a7a, 0.4); }
    for (const x0 of [4, 122]) for (let k = 0; k < 4 + rng.int(0, 3); k++) pc.blend(x0, 28 + k, 0x7a4a2a, 0.5 - k * 0.08);
    for (let k = 0; k < 6; k++) pc.blend(108 + (k % 3), 25 + Math.floor(k / 3), 0x7a1410, 0.55);
    void makeRamp; void ph;
  }, 2.0, 0.5);
});
const scale = (c: number, f: number) => (Math.round(((c >> 16) & 255) * f) << 16) | (Math.round(((c >> 8) & 255) * f) << 8) | Math.round((c & 255) * f);

/** a stage with no tiles, for the blood particles (everything is floor at y = 0) */
const FLAT = { inb: () => true, idx: () => 0, floor: [1], solid: [0], heightAt: () => 0, edgeBlocks: () => false } as unknown as Zone;

export class IntroSet {
  readonly root: THREE.Group;
  /** the giant press: group, ram, rods, the bundle under it */
  press!: { g: THREE.Group; ram: THREE.Mesh; rods: THREE.Mesh[]; lever: THREE.Mesh; t: number; period: number; on: boolean; hits: number };
  bundle!: THREE.Mesh;
  liquid!: THREE.Mesh;
  liqU!: { uTime: { value: number }; uLiq: { value: number }; uHit: { value: THREE.Vector2 }; uHitT: { value: number }; uPush: { value: THREE.Vector3 }; uDark: { value: number } };
  blood: Particles;
  /** called on every press slam (sound, shake from the script) */
  onSlam: ((d: number) => void) | null = null;
  private pool: THREE.PointLight[] = [];
  private bulb!: THREE.PointLight; private red!: THREE.PointLight; private work!: THREE.PointLight; private cold!: THREE.PointLight;
  private amb!: THREE.AmbientLight;
  private tubes: THREE.Mesh[] = [];
  private splats: THREE.Mesh[] = []; private splatI = 0;
  private flick = 0;
  private t = 0;

  /** low: the phone path (one roaming light instead of three, fewer drops) */
  constructor(root: THREE.Group, private low = false) {
    this.root = root;
    this.blood = new Particles(low ? 90 : 220, false);
    this.blood.mesh.material = worldMaterial({ outline: 0, ...STAGE });
    root.add(this.blood.mesh);
    this.build();
  }

  // ================================================================ building
  private build() {
    const S = SOLID();
    const add = (mb: ModelBuilder, mat: THREE.Material = S, ro = 0) => { const m = new THREE.Mesh(mb.build(), mat); m.renderOrder = ro; m.frustumCulled = false; this.root.add(m); return m; };
    const shell = new ModelBuilder();
    const { cor, ante, room, door } = IX;
    // ---- the processing wing
    this.box(shell, cor.x0, cor.x1, cor.z0, cor.z1, cor.h, 'zp_wall_inst', 'concrete_wet', 'concrete', { n: [[cor.x0, cor.x1, cor.h]], w: WINDOWS.map((zc) => [zc - 1.05, zc + 1.05, 0.62, 1.82] as [number, number, number, number]) });
    // the holding-cell door you came out of
    shell.box(0, 0, cor.z1 - 0.03, 1.0, 2.2, 0.06, 'metal_painted_green', { color: 0x7a8478 });
    shell.box(0, 1.5, cor.z1 - 0.07, 0.3, 0.2, 0.02, 'glass_dark');
    // the enamel sign hung from the ceiling on two chains, just in front of the holding door
    shell.box(0, 1.98, 0.6, 2.0, 0.5, 0.03, { north: 'ix_title', south: 'metal_painted_green', all: 'metal_dark' }, { fit: { north: true } });
    for (const x of [-0.85, 0.85]) shell.box(x, 2.48, 0.6, 0.012, cor.h - 2.48, 0.012, 'chrome');
    // ---- the antechamber (tile), open to the wing and to the press room
    this.box(shell, ante.x0, ante.x1, ante.z0, ante.z1, ante.h, 'tile_white', 'concrete_wet', 'concrete', { n: [[door.x0, door.x1, door.h]], s: [[cor.x0, cor.x1, cor.h]] }, 0xb8b0a4);
    // ---- the press room: black, much too tall
    this.box(shell, room.x0, room.x1, room.z0, room.z1, room.h, 'concrete', 'concrete_wet', 'zp_void', { s: [[door.x0, door.x1, door.h]] }, 0x4a4644, 0x6a625e);
    // the steel frame between the antechamber and the press room
    shell.box(door.x0 - 0.06, 0, ante.z0, 0.12, door.h, 0.3, 'metal_dark');
    shell.box(door.x1 + 0.06, 0, ante.z0, 0.12, door.h, 0.3, 'metal_dark');
    shell.box(0, door.h, ante.z0, door.x1 - door.x0 + 0.24, 0.14, 0.3, 'metal_dark');
    // the open steel door into the press room, swung back against the wall
    shell.push().translate(door.x1 + 0.05, 0, IX.ante.z0 - 0.02).rotateY(-Math.PI * 0.62);
    shell.box(0.5, 0.02, 0, 1.0, 2.36, 0.06, 'metal_painted_green', { color: 0x8a9488 });
    shell.pop();
    // ceiling tubes in the wing (emissive) and a caged bulb in the antechamber
    const tube = new ModelBuilder();
    for (const [x, y, z] of TUBES) {
      roundBox(tube, x, y - 0.06, z, 0.3, 0.06, 1.24, 0.03, 'metal_dark');
      for (const dx of [-0.055, 0.055]) tube.cylinderZ(x + dx, y - 0.085, z, 0.018, 1.16, 8, 'white', { color: 0xe8f4ff, emissive: 1 });
    }
    const tubes = add(tube); this.tubes.push(tubes);
    shell.cylinder(IX.drain[0], ante.h - 0.25, IX.drain[1], 0.09, 0.2, 7, 'metal_dark');
    shell.sphere(IX.drain[0], ante.h - 0.33, IX.drain[1], 0.07, 6, 4, 'white', { color: 0xffd890, emissive: 1 });
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; shell.box(IX.drain[0] + Math.cos(a) * 0.08, ante.h - 0.42, IX.drain[1] + Math.sin(a) * 0.08, 0.008, 0.18, 0.008, 'metal_dark'); }
    // press room: a sodium lamp high in the dark, a work lamp on a chain over the press, a cold tube over the tape
    shell.box(0, room.h - 0.6, -23.5, 0.5, 0.12, 0.3, 'metal_dark');
    shell.box(0, room.h - 0.66, -23.5, 0.4, 0.04, 0.22, 'white', { color: 0xffb060, emissive: 1 });
    shell.box(IX.press.x + 0.4, 5.6, IX.press.z, 0.02, room.h - 5.6, 0.02, 'metal_dark');
    shell.cylinder(IX.press.x + 0.4, 5.35, IX.press.z, 0.24, 0.25, 8, 'metal_dark', { rTop: 0.06 });
    shell.cylinder(IX.press.x + 0.4, 5.34, IX.press.z, 0.15, 0.02, 8, 'white', { color: 0xfff0c8, emissive: 1 });
    shell.box(IX.fit[0] - 0.4, 2.85, IX.fit[1] - 0.6, 0.012, room.h - 2.85, 0.012, 'metal_dark');
    shell.cylinder(IX.fit[0] - 0.4, 2.62, IX.fit[1] - 0.6, 0.16, 0.24, 8, 'metal_dark', { rTop: 0.05 });
    shell.cylinder(IX.fit[0] - 0.4, 2.61, IX.fit[1] - 0.6, 0.1, 0.02, 8, 'white', { color: 0xffe0b0, emissive: 1 });
    shell.box(IX.tape.x, 3.1, IX.tape.z + 0.08, 1.1, 0.06, 0.16, 'metal_dark');
    shell.box(IX.tape.x, 3.08, IX.tape.z + 0.08, 1.0, 0.02, 0.1, 'white', { color: 0xd8f0ff, emissive: 1 });
    add(shell);
    this.dress();
    this.buildPress();
    this.buildTape();
    this.buildBlood();
    // lights
    this.amb = new THREE.AmbientLight(0x9aa4b0, 0.22);
    this.root.add(this.amb);
    for (let i = 0; i < (this.low ? 1 : 3); i++) { const l = new THREE.PointLight(0xdfeaff, 0, 6.5, 1.6); this.pool.push(l); this.root.add(l); }
    this.bulb = new THREE.PointLight(0xffc880, 3.2, 7, 1.5); this.bulb.position.set(IX.drain[0], ante.h - 0.45, IX.drain[1]);
    this.red = new THREE.PointLight(0xff2a18, 0, 12, 1.4);
    this.work = new THREE.PointLight(0xffe0b0, 9, 9, 1.4); this.work.position.set(IX.press.x + 0.4, 5.0, IX.press.z);
    this.cold = new THREE.PointLight(0xc8e4ff, 4.5, 6, 1.5); this.cold.position.set(IX.tape.x, 2.9, IX.tape.z + 0.8);
    const sod = new THREE.PointLight(0xff9a40, 7, 16, 1.2); sod.position.set(0, room.h - 0.9, -23.5);
    // a caged lamp on a chain over the spot where the band goes on
    const cage = new THREE.PointLight(0xffd8a0, 5.5, 5.5, 1.3); cage.position.set(IX.fit[0] - 0.4, 2.6, IX.fit[1] - 0.6);
    this.root.add(this.bulb, this.red, this.work, this.cold, sod, cage);
  }

  /** a rectangular room from boxes (each wall a single inner face), with openings per side: [x0, x1, h] (n = -z wall, s = +z wall) */
  private box(mb: ModelBuilder, x0: number, x1: number, z0: number, z1: number, h: number, wall: string, floor: string, ceil: string,
    holes: { n?: [number, number, number][]; s?: [number, number, number][]; w?: [number, number, number, number][] } = {}, wallCol = 0xffffff, floorCol = 0xd0ccc4) {
    const T = 0.1;
    mb.box((x0 + x1) / 2, -T, (z0 + z1) / 2, x1 - x0, T, z1 - z0, { top: floor, all: 'metal_dark' }, { color: floorCol, skip: ['bottom', 'north', 'south', 'east', 'west'] });
    mb.box((x0 + x1) / 2, h, (z0 + z1) / 2, x1 - x0, T, z1 - z0, ceil, { color: 0x8a8a88, skip: ['top', 'north', 'south', 'east', 'west'] });
    // west wall, with window holes [za, zb, y0, y1] cut out of it
    {
      const sk: ('west' | 'north' | 'south' | 'top' | 'bottom')[] = ['west', 'north', 'south', 'top', 'bottom'];
      let z = z1;
      for (const [za, zb, ya, yb] of [...(holes.w || [])].sort((p, q) => q[1] - p[1])) {
        if (zb < z) mb.box(x0 - T / 2, 0, (z + zb) / 2, T, h, z - zb, wall, { color: wallCol, skip: sk, uvOffset: [0, 0] });
        mb.box(x0 - T / 2, 0, (za + zb) / 2, T, ya, zb - za, wall, { color: wallCol, skip: sk });
        mb.box(x0 - T / 2, yb, (za + zb) / 2, T, h - yb, zb - za, wall, { color: wallCol, skip: sk });
        z = za;
      }
      if (z > z0) mb.box(x0 - T / 2, 0, (z + z0) / 2, T, h, z - z0, wall, { color: wallCol, skip: sk });
    }
    mb.box(x1 + T / 2, 0, (z0 + z1) / 2, T, h, z1 - z0, wall, { color: wallCol, skip: ['east', 'north', 'south', 'top', 'bottom'] });
    const side = (z: number, face: 'south' | 'north', hs: [number, number, number][] = []) => {
      const skip = (['north', 'south', 'east', 'west', 'top', 'bottom'] as const).filter((f) => f !== face);
      const zz = face === 'south' ? z - T / 2 : z + T / 2;
      let x = x0;
      for (const [a, b, hh] of [...hs].sort((p, q) => p[0] - q[0])) {
        if (a > x) mb.box((x + a) / 2, 0, zz, a - x, h, T, wall, { color: wallCol, skip: [...skip] });
        if (hh < h) mb.box((a + b) / 2, hh, zz, b - a, h - hh, T, wall, { color: wallCol, skip: [...skip] });
        x = b;
      }
      if (x < x1) mb.box((x + x1) / 2, 0, zz, x1 - x, h, T, wall, { color: wallCol, skip: [...skip] });
    };
    side(z0, 'south', holes.n);
    side(z1, 'north', holes.s);
  }

  /** props from the processing wing's own object models (the same ones the old intake zone used) */
  private dress() {
    const S = SOLID();
    const put = (key: string, x: number, z: number, rotY = 0, state: Record<string, unknown> = {}, mat: THREE.Material = S, y = 0) => {
      const g = buildObjGeometry(key, state); if (!g) return null;
      const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.rotation.y = rotY; m.frustumCulled = false; this.root.add(m); return m;
    };
    const { cor } = IX;
    // a wall prop is modelled against local z = WZ facing +z: put it on the left (x0) wall facing +x, or the right wall facing -x
    const left = (key: string, z: number, st: Record<string, unknown> = {}, mat?: THREE.Material) => put(key, cor.x0 - WZ, z, Math.PI / 2, st, mat);
    const right = (key: string, z: number, st: Record<string, unknown> = {}, mat?: THREE.Material) => put(key, cor.x1 + WZ, z, -Math.PI / 2, st, mat);
    right('zp_crt_wall', 0.4); right('zp_crt_wall', -5.6); left('zp_crt_wall', -2.6);
    left('zp_notice', -0.8, { v: 0 }, CUT()); right('zp_notice', -8.4, { v: 2 }, CUT());
    right('zp_sign_remit', -2.4);
    put('zp_hose_reel', IX.ante.x1 + WZ, -12.4, -Math.PI / 2);
    put('zp_floor_drain', IX.drain[0], IX.drain[1]);
    put('mop_bucket', IX.ante.x0 + 0.45, -15.3, 0.4);
    put('gurney', IX.room.x1 - 0.8, -18.6, Math.PI / 2 + 0.2);
    put('zp_jumpsuit_rack', IX.room.x1 - 0.7, -27.5, -Math.PI / 2);
    // observation glass along the left wall of the wing: a dark window, the figures behind it
    const glass = new ModelBuilder();
    for (const zc of WINDOWS) {
      // the frame round the hole, and the observation room behind it: dark walls, a floor, a dim ceiling
      glass.box(cor.x0 + 0.01, 0.56, zc, 0.06, 0.06, 2.22, 'metal_dark');
      glass.box(cor.x0 + 0.01, 1.82, zc, 0.06, 0.06, 2.22, 'metal_dark');
      for (const e of [-1, 1]) glass.box(cor.x0 + 0.01, 0.6, zc + e * 1.08, 0.06, 1.24, 0.06, 'metal_dark');
      glass.box(cor.x0 - 1.6, 0, zc, 0.1, 2.5, 2.6, 'zp_wall_dark', { skip: ['west', 'north', 'south', 'top', 'bottom'] });
      glass.box(cor.x0 - 0.8, 0, zc - 1.25, 1.6, 2.5, 0.1, 'zp_wall_dark', { skip: ['north', 'west', 'east', 'top', 'bottom'] });
      glass.box(cor.x0 - 0.8, 0, zc + 1.25, 1.6, 2.5, 0.1, 'zp_wall_dark', { skip: ['south', 'west', 'east', 'top', 'bottom'] });
      glass.box(cor.x0 - 0.8, -0.02, zc, 1.6, 0.02, 2.6, 'concrete', { color: 0x6a6a6a, skip: ['bottom', 'north', 'south', 'east', 'west'] });
      glass.box(cor.x0 - 0.8, 2.5, zc, 1.6, 0.02, 2.6, 'zp_void', { skip: ['top', 'north', 'south', 'east', 'west'] });
    }
    const gm = new THREE.Mesh(glass.build(), S); gm.frustumCulled = false; this.root.add(gm);
    // the window holes: the left wall is solid, so the window face sits proud of it with the room drawn "through" it
    const pane = new ModelBuilder();
    for (const zc of WINDOWS) pane.box(cor.x0 + 0.005, 0.62, zc, 0.01, 1.2, 2.1, 'glass_dark', { color: 0x8a9aa8 });
    const pm = new THREE.Mesh(pane.build(), GLASS()); pm.renderOrder = 3; pm.frustumCulled = false; this.root.add(pm);
    put('zp_observer', cor.x0 - 0.75, -4.2, Math.PI / 2, { v: 0 });
    put('zp_observer', cor.x0 - 0.9, -5.1, Math.PI / 2 - 0.2, { v: 1 });
    put('zp_observer', cor.x0 - 0.7, -7.7, Math.PI / 2 + 0.1, { v: 2 });
    // benches and a trolley in the wing, a hazard line painted on the floor
    put('bench', cor.x1 - 0.35, -1.2, -Math.PI / 2);
    const paint = new ModelBuilder();
    paint.box(0, 0.002, -10.2, 2.4, 0.004, 0.12, 'zd_hazard', { ao: false });
    paint.box(0, 0.002, IX.ante.z0 + 0.25, 2.0, 0.004, 0.12, 'zd_hazard', { ao: false });
    const p2 = new THREE.Mesh(paint.build(), S); p2.frustumCulled = false; this.root.add(p2);
  }

  private buildPress() {
    const S = SOLID();
    const { x, z, s } = IX.press;
    const g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = Math.PI / 2; g.scale.setScalar(s);
    const mb = new ModelBuilder();
    hopperModel(mb);
    const body = new THREE.Mesh(mb.build(), S);
    const ram = new THREE.Mesh(pressPartGeo('ram'), S); ram.position.y = PRESS.ramUp;
    const rods = PRESS.rods.map(([rx, rz]) => { const r = new THREE.Mesh(pressPartGeo('rod'), S); r.position.set(rx, 0, rz); return r; });
    const lever = new THREE.Mesh(pressPartGeo('lever'), S); lever.position.set(...PRESS.lever); lever.rotation.x = PRESS.leverRest;
    for (const m of [body, ram, ...rods, lever]) m.frustumCulled = false;
    for (const k of ['ram', 'rod', 'lever'] as const) GEO_SHARED.add(pressPartGeo(k));
    g.add(body, ram, ...rods, lever);
    this.root.add(g);
    this.press = { g, ram, rods, lever, t: 99, period: 6.5, on: false, hits: 0 };
    // what is under it: a yellow bundle, a sleeve hanging out
    const b = new ModelBuilder();
    // a lumpy yellow bundle (what is left of the last one), a sleeve hanging out, a hand
    for (const [x, y, z, r, sy] of [[0, 0.22, 0, 0.42, 0.6], [0.35, 0.2, 0.08, 0.33, 0.62], [-0.38, 0.18, -0.06, 0.32, 0.55], [0.1, 0.42, 0.04, 0.3, 0.55], [-0.1, 0.16, 0.22, 0.28, 0.5]] as [number, number, number, number, number][]) b.sphere(x, y, z, r, 12, 8, 'fabric_grey', { color: 0xd9a826, sy });
    b.push().translate(0.6, 0.14, 0.3).rotateZ(-1.2).rotateX(0.3); b.cylinder(0, 0, 0, 0.07, 0.42, 10, 'fabric_grey', { color: 0xc89820, rTop: 0.06 }); b.pop();
    b.sphere(0.98, 0.04, 0.42, 0.055, 10, 6, 'white', { color: 0xc89070, sy: 0.55 });
    b.sphere(-0.3, 0.12, -0.18, 0.2, 10, 6, 'gore_flesh', { sy: 0.6 });
    this.bundle = new THREE.Mesh(b.build(), S);
    this.bundle.position.set(x, 0.12 * s, z);
    this.bundle.rotation.y = 0.3;
    this.bundle.frustumCulled = false;
    this.root.add(this.bundle);
  }

  /** the door-shaped section of the far wall, taped off, and the membrane that turns to liquid */
  private buildTape() {
    const { x, z, w, h } = IX.tape;
    const tape = new ModelBuilder();
    const tz = z + 0.012, tw = 0.075;
    tape.box(x - w / 2, 0, tz, tw, h, 0.006, 'zd_hazard', { ao: false });
    tape.box(x + w / 2, 0, tz, tw, h, 0.006, 'zd_hazard', { ao: false });
    tape.box(x, h - tw / 2, tz, w + tw, tw, 0.006, 'zd_hazard', { ao: false });
    tape.box(x, 0.0, tz, w + tw, tw * 0.7, 0.006, 'zd_hazard', { ao: false });
    // two sagging strips across it, a loose end
    for (const [a, b] of [[0.62, -0.62], [-0.62, 0.62]] as [number, number][]) {
      tape.push().translate(x, h * 0.55, tz + 0.004).rotateZ(Math.atan2(h * 0.5 * Math.sign(a), w) * 0.9);
      tape.box(0, -tw / 2, 0, Math.hypot(w, h * 0.5) * 0.98, tw, 0.004, 'zd_hazard', { ao: false });
      tape.pop(); void b;
    }
    tape.push().translate(x + w / 2 + 0.05, 1.1, tz + 0.02).rotateZ(0.3); tape.box(0, -0.4, 0, tw, 0.4, 0.004, 'zd_hazard', { ao: false }); tape.pop();
    // stencil above: ROOM 0
    tape.box(x, h + 0.25, tz, 2.4, 0.22, 0.004, { south: 'zp_notice_3', all: 'zp_void' }, { fit: { south: true }, ao: false });
    const tm = new THREE.Mesh(tape.build(), CUT()); tm.renderOrder = 2; tm.frustumCulled = false; this.root.add(tm);
    // the membrane: a dense plane in the taped rectangle; invisible until it starts to turn
    const geo = new THREE.PlaneGeometry(w - 0.06, h - 0.06, 40, 72);
    const u = this.liqU = { uTime: { value: 0 }, uLiq: { value: 0 }, uHit: { value: new THREE.Vector2(0, 0.2) }, uHitT: { value: 0 }, uPush: { value: new THREE.Vector3(0, 0, 0) }, uDark: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: LIQ_VERT, fragmentShader: LIQ_FRAG,
      side: THREE.DoubleSide,
    });
    const m = this.liquid = new THREE.Mesh(geo, mat);
    m.position.set(x, h / 2, z + 0.02);
    m.renderOrder = 4; m.frustumCulled = false;
    this.root.add(m);
  }

  /** the blood that was here before you */
  private buildBlood() {
    const D = new ModelBuilder();
    const r = mulberry(91);
    const flat = (x: number, z: number, w: number, d: number, tex: string, rot = r() * 6.28, y = 0.004) => D.flat(x, y, z, w, d, tex, { rot });
    // the drag smear down the wing, thicker toward the drain
    for (let z = -6; z > -13; z -= 0.9) flat(0.05 + (r() - 0.5) * 0.3, z, 0.6 + r() * 0.3, 1.0, 'gore_red_smear', Math.PI / 2 + (r() - 0.5) * 0.2);
    flat(IX.drain[0], IX.drain[1], 2.2, 2.2, 'gore_red_pool', 0, 0.003);
    for (let i = 0; i < 6; i++) flat(IX.drain[0] + (r() - 0.5) * 3, IX.drain[1] + (r() - 0.5) * 3.4, 0.7, 0.7, r() < 0.5 ? 'gore_red_splat_a' : 'gore_red_splat_b');
    // the press room: the floor round the press is a lake, sprays radiating from the plate
    const { x, z } = IX.press;
    flat(x, z, 6.4, 6.4, 'gore_red_pool', 0.4, 0.003);
    for (let i = 0; i < 14; i++) { const a = r() * 6.28, d = 2.5 + r() * 3.2; flat(x + Math.cos(a) * d, z + Math.sin(a) * d, 1.1, 0.55, 'gore_red_spray', a); }
    for (let i = 0; i < 10; i++) flat(-1 + r() * 6, -17 - r() * 13, 0.8, 0.8, r() < 0.5 ? 'gore_red_splat_a' : 'gore_red_splat_b');
    // handprints and a drag line toward the taped wall
    for (let i = 0; i < 6; i++) flat(IX.tape.x + (r() - 0.5) * 0.6, IX.tape.z + 0.4 + i * 0.9, 0.2, 0.36, 'gore_print_a', r() * 0.6);
    for (let zz = -24; zz > -30.5; zz -= 0.9) flat(IX.tape.x - 0.2 + (zz + 24) * 0.04, zz, 0.5, 1.0, 'gore_red_smear', Math.PI / 2);
    // walls: spray up the press room's back wall, runs under the tape, the antechamber tiles
    const W = (x0: number, y: number, z0: number, w: number, h: number, tex: string, face: 'n' | 's' | 'e' | 'w') => {
      const t = 0.002;
      if (face === 'n') D.box(x0, y, z0 + t, w, h, 0.002, { south: tex, all: 'zp_void' }, { fit: { south: true }, ao: false, skip: ['north', 'east', 'west', 'top', 'bottom'] });
      if (face === 'e') { D.push().translate(x0 + t, y, z0).rotateY(Math.PI / 2); D.box(0, 0, 0, w, h, 0.002, { south: tex, all: 'zp_void' }, { fit: { south: true }, ao: false, skip: ['north', 'east', 'west', 'top', 'bottom'] }); D.pop(); }
      if (face === 'w') { D.push().translate(x0 - t, y, z0).rotateY(-Math.PI / 2); D.box(0, 0, 0, w, h, 0.002, { south: tex, all: 'zp_void' }, { fit: { south: true }, ao: false, skip: ['north', 'east', 'west', 'top', 'bottom'] }); D.pop(); }
    };
    for (let i = 0; i < 5; i++) W(IX.room.x0, 0.4 + r() * 2.2, z - 2 + r() * 4, 1.6, 1.4, r() < 0.5 ? 'gore_red_wallspray' : 'gore_red_wall', 'e');
    for (let i = 0; i < 4; i++) W(-3 + r() * 5, 0.3 + r() * 1.6, IX.room.z0, 1.4, 1.6, 'gore_red_wallspray', 'n');
    W(IX.tape.x, 0.0, IX.tape.z + 0.02, 1.0, 1.7, 'gore_red_runline', 'n');
    for (let i = 0; i < 4; i++) W(IX.ante.x0, 0.2 + r() * 1.4, -12 - r() * 3.6, 0.9, 1.0, 'gore_red_wallspray', 'e');
    for (let i = 0; i < 3; i++) W(IX.ante.x1, 0.2 + r() * 1.2, -12 - r() * 3.6, 0.9, 1.0, 'gore_red_wall', 'w');
    const m = new THREE.Mesh(D.build(), DECAL()); m.renderOrder = 1; m.frustumCulled = false; this.root.add(m);
    // a pool of fresh splats the script lays down (your blood)
    const sg = new ModelBuilder(); sg.flat(0, 0, 0, 1, 1, 'gore_red_splat_a', {});
    const sgeo = sg.build();
    for (let i = 0; i < 10; i++) { const s = new THREE.Mesh(sgeo, DECAL()); s.visible = false; s.renderOrder = 1; s.frustumCulled = false; this.root.add(s); this.splats.push(s); }
  }

  // ================================================================ live
  /** fresh blood: drops flying from a point, a splat where they land */
  bleed(x: number, y: number, z: number, dx: number, dy: number, dz: number, n = 14, speed = 2.2, splat = 0.5) {
    const r = Math.random;
    const cols = [0x4a0a0c, 0x6a1012, 0x841719, 0x9e2224];
    for (let i = 0; i < n; i++) {
      const s = speed * (0.4 + r() * 0.9);
      this.blood.add(PK.Drop, x, y, z, (dx + (r() - 0.5) * 0.9) * s, (dy + r() * 0.6) * s, (dz + (r() - 0.5) * 0.9) * s, 0.005 + r() * 0.009, 1.2 + r(), cols[(r() * 4) | 0], 0.05);
    }
    for (let i = 0; i < 4; i++) this.blood.add(PK.Mist, x, y, z, dx * 0.6 + (r() - 0.5) * 0.4, 0.2, dz * 0.6 + (r() - 0.5) * 0.4, 0.025, 0.5, 0x8a2a2c, 0);
    if (splat > 0) this.splat(x + dx * 0.5, z + dz * 0.5, splat);
  }
  splat(x: number, z: number, size: number) {
    const s = this.splats[this.splatI++ % this.splats.length];
    s.position.set(x, 0.006 + this.splatI * 0.0003, z);
    s.rotation.y = Math.random() * 6.28;
    s.scale.set(size, 1, size);
    s.visible = true;
  }

  /** run the giant press: one slam every `period` seconds once started */
  startPress(firstIn = 0.2) { this.press.on = true; this.press.t = -firstIn; }

  /** per frame: the light pool follows the camera, tubes flicker, the press cycles, drops fall */
  update(dt: number, cam: THREE.Vector3) {
    this.t += dt;
    // nearest tubes get the three pooled lights
    const near = NEAR; for (let i = 0; i < TUBES.length; i++) near[i] = TUBES[i];
    near.sort((a, b) => Math.abs(a[2] - cam.z) - Math.abs(b[2] - cam.z));
    this.flick -= dt;
    const bad = TUBES[3];
    for (let i = 0; i < this.pool.length; i++) {
      const f = near[i], l = this.pool[i];
      if (!f || cam.z < IX.cor.z0 - 3) { l.intensity = 0; continue; }
      l.position.set(f[0], f[1] - 0.2, f[2]);
      let k = 4.2;
      if (f === bad) k *= (Math.sin(this.t * 31) > 0.3 && Math.sin(this.t * 3.1) > -0.2) ? 1 : 0.08;
      l.intensity = k;
    }
    // the antechamber bulb swings a little and stutters
    this.bulb.intensity = 3.2 * (0.85 + 0.15 * Math.sin(this.t * 2.3)) * (Math.sin(this.t * 17) > 0.97 ? 0.2 : 1);
    // the press
    const P = this.press;
    if (P.on) {
      const prevT = P.t;
      P.t += dt;
      if (P.t >= P.period) P.t -= P.period;
      const t = P.t;
      const ry = t < 0 ? PRESS.ramUp : ramAt(t);
      P.ram.position.y = ry;
      const top = ry + PRESS.ramH + 0.06;
      for (const r of P.rods) { r.position.y = top; r.scale.y = Math.max(0.01, PRESS.crownY - top); }
      P.lever.rotation.x = t >= 0 && t < CYCLE.done ? (t < 0.28 ? PRESS.leverRest + (PRESS.leverPulled - PRESS.leverRest) * (t / 0.28) : t < CYCLE.rise ? PRESS.leverPulled : PRESS.leverRest) : PRESS.leverRest;
      // the bundle flattens under it
      const s = IX.press.s;
      const under = (ry - PRESS.ramDown) * s;
      const bh = 0.95 * Math.pow(0.4, P.hits);
      this.bundle.scale.y = Math.max(0.12, Math.min(bh, under / 0.8));
      this.red.intensity = t >= 0 && t < CYCLE.done ? (Math.sin(this.t * 12) > 0 ? 6 : 1.5) : 0;
      this.red.position.set(IX.press.x + 1.3, PRESS.crownY * s + 0.3, IX.press.z + 1.3);
      if (prevT < CYCLE.impact && t >= CYCLE.impact) {
        P.hits++;
        const { x, z } = IX.press;
        for (const [ddx, ddz] of [[1, 0], [0, 1], [0, -1], [0.7, 0.7], [0.7, -0.7]]) this.bleed(x + ddx * 0.9, 0.25, z + ddz * 0.6, ddx, 0.6, ddz, 10, 3.6, 0);
        this.onSlam?.(Math.hypot(cam.x - x, cam.z - z));
      }
    }
    this.blood.update(dt, FLAT);
    this.liqU.uTime.value = this.t;
  }

  dispose() {
    this.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry && m !== this.blood.mesh && !GEO_SHARED.has(m.geometry)) m.geometry.dispose(); });
    (this.liquid.material as THREE.Material).dispose();
    this.root.clear();
  }
}
/** geometries owned by other modules (cached): never disposed here */
const GEO_SHARED = new Set<THREE.BufferGeometry>();

function mulberry(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- the membrane
const LIQ_VERT = /* glsl */`
uniform float uTime, uLiq, uHitT;
uniform vec2 uHit;
uniform vec3 uPush;
varying vec3 vW;
varying vec3 vN;
varying float vL;
varying vec2 vP;
float liqAt(vec2 q) { float d = distance(q, uHit); return 1.0 - smoothstep(uLiq * 2.6 - 0.25, uLiq * 2.6, d); }
float disp(vec2 q) {
  float d = distance(q, uHit);
  // ripples running out from where you hit it, a slow swell, and the dent round your face (surface tension)
  float rip = sin(d * 24.0 - uHitT * 10.0) * exp(-d * 1.6) * exp(-uHitT * 0.7) * 0.06;
  float slow = sin(q.y * 6.0 + uTime * 1.7) * 0.006 + sin(q.x * 9.0 - uTime * 2.3) * 0.004;
  float dc = distance(q, uPush.xy);
  float dent = -uPush.z * exp(-dc * dc / 0.16);
  return (rip + slow + dent) * liqAt(q);
}
void main() {
  vec3 p = position;
  float e = 0.01;
  float h0 = disp(p.xy);
  float hx = disp(p.xy + vec2(e, 0.0)), hy = disp(p.xy + vec2(0.0, e));
  vec3 n = normalize(vec3(-(hx - h0) / e, -(hy - h0) / e, 1.0));
  p.z += h0;
  vL = liqAt(p.xy); vP = p.xy;
  vN = normalize(mat3(modelMatrix) * n);
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const LIQ_FRAG = /* glsl */`
uniform float uTime, uDark;
varying vec3 vW;
varying vec3 vN;
varying float vL;
varying vec2 vP;
void main() {
  if (vL < 0.03) discard;
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  if (dot(N, V) < 0.0) N = -N;
  float ndv = max(dot(N, V), 0.0);
  float fres = pow(1.0 - ndv, 3.0);
  vec3 L1 = normalize(vec3(0.2, 0.9, 0.6)), L2 = normalize(vec3(-0.6, 0.2, 0.8));
  float s1 = pow(max(dot(N, normalize(L1 + V)), 0.0), 70.0);
  float s2 = pow(max(dot(N, normalize(L2 + V)), 0.0), 30.0);
  vec3 col = vec3(0.003, 0.004, 0.006);
  col += vec3(0.34, 0.32, 0.3) * fres * 0.8;
  col += vec3(1.0, 0.96, 0.88) * s1 * 1.2 + vec3(0.7, 0.66, 0.58) * s2 * 0.3;
  // the meniscus where it is still turning
  float edge = smoothstep(0.03, 0.25, vL) * (1.0 - smoothstep(0.25, 0.85, vL));
  col += vec3(0.62, 0.6, 0.55) * edge * 0.55;
  // faint lines of something moving deep inside
  col += vec3(0.1, 0.09, 0.08) * pow(max(0.0, sin(vP.y * 40.0 + uTime * 3.0 + sin(vP.x * 7.0) * 2.0)), 12.0) * 0.6;
  col *= 1.0 - uDark;
  gl_FragColor = vec4(col, 1.0);
}
`;
