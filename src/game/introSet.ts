// The first-person intake set (src/game/intro.ts): a hand-built stage drawn by
// its own pass (src/game/introKit/stage.ts) in the same low-res pixel grid as
// the world, every prop a faceted low-poly model with pixel-art textures
// (src/game/introKit/*), lit by motivated lamps (src/game/introKit/lights.ts).
// Stage coordinates in metres, the debtor travels toward -z:
//
//   the processing wing   z  3 .. -11   two-tone institutional walls, wet
//                                      concrete, humming twin-tube fixtures (one
//                                      failing), observation glass with still
//                                      figures, your mugshot on the monitors; on
//                                      the right the intake counter's barred
//                                      grille and behind it the clerks' desks
//                                      under amber desk lamps; at the end a
//                                      barred gate swung open and a turnstile
//   the antechamber       z -11 .. -16 white tile, the drain, the old blood, a
//                                      caged lamp and a stuttering tube
//   the press room        z -16 .. -31 a black room too tall for the building:
//                                      the giant Remittance Press slamming down
//                                      on what is left of the last debtor (sparks,
//                                      a red beacon sweeping the walls), a feed
//                                      conveyor bringing junk through a hatch,
//                                      sodium high-bays, the band fitting rig,
//                                      and in the far wall a door-shaped section
//                                      taped off in hazard tape inside a steel
//                                      portal frame (the liquid membrane)
import * as THREE from 'three';
import { ModelBuilder } from '../gfx/modelBuilder';
import { buildObjGeometry } from '../world/objects';
import { WZ, addTextureModule, atlas, makeRamp, ph, plate, screw, txtC } from '../content/furniture/a_lib';
import { CYCLE } from './debt/hopper';
import { Particles, PK } from '../gore/particles';
import type { Zone } from '../world/zone';
import { stageMat, SU, emitMat, type EmitMat } from './introKit/stageMat';
import { LightDirector, type Fixture } from './introKit/lights';
import { tubeFixture, cagedLamp, highBay, beacon, deskLamp, shaftGeo } from './introKit/fixtures';
import { clerkDesk, swivelChair, filingCabinet, intakeCounter, barredGate, turnstile, steelBench, hoseReel, mopBucket, iBeam, pipeRun, cableTray, remains } from './introKit/props';
import { GP, pressBody, ramGeo, pistonGeo, leverGeo, conveyor, junkGeo, bandRigGeo, portalFrame } from './introKit/machines';
import { cbox, lathe, facetize, type V3 } from './introKit/poly';
import './introKit/tex';

export const STAGE = { noVis: true, noFog: true, noGrid: true };
const SOLID = () => stageMat({ rim: 0.35 });
const DECAL = () => stageMat({ transparent: true, depthWrite: false, outline: 0, rim: 0 });
const CUT = () => stageMat({ alphaTest: 0.5, rim: 0.2 });
const GLASS = () => stageMat({ transparent: true, opacity: 0.32, depthWrite: false, outline: 0, rim: 0.6 });

/** where things are on the stage */
export const IX = {
  cor: { x0: -1.6, x1: 1.6, z0: -11, z1: 3.2, h: 2.8 },
  proc: { x0: 1.6, x1: 5.6, z0: -8.8, z1: 0.9, h: 2.8 },
  ante: { x0: -2.4, x1: 2.4, z0: -16, z1: -11, h: 2.9 },
  room: { x0: -5.6, x1: 5.6, z0: -31, z1: -16, h: 9.5 },
  door: { x0: -1.05, x1: 1.05, h: 2.45 },
  gate: { z: -9.7, x0: -1.6, x1: 0.78 },
  drain: [0.15, -13.4] as [number, number],
  press: { x: -3.0, z: -19.3, s: 1 },
  conv: { x: -3.0, z0: -31, z1: -21.55 },
  fit: [0.9, -23.9] as [number, number],
  tape: { x: 1.4, z: -31, w: 1.3, h: 2.3 },
  /** the drags (x, z): the wing to the drain, the drain into the press room */
  drag1: [[0, 1.8], [0, -10.6], [0.1, -12.9]] as [number, number][],
  drag2: [[0.25, -12.1], [0.3, -14.6], [0.55, -19.0], [0.9, -22.4]] as [number, number][],
};
/** observation windows in the wing's left wall (centres, z) */
const WINDOWS = [-4.6, -7.4];
/** corridor tube fixtures (z) */
const TUBES_Z = [2.2, -0.2, -2.6, -5.0, -7.4, -9.9];

// the sign over the holding-cell door: the title of the piece, as the Institute painted it
addTextureModule(() => {
  const A = atlas();
  A.add('ix_title', 128, 32, (pc, rng) => {
    pc.wrap = false;
    plate(pc, 0, 0, 128, 32, 0x2c3c34, 4401, { noise: 0.12 });
    pc.strokeRect(0, 0, 128, 32, 0x0a0c0a);
    pc.hline(2, 125, 2, 0x4a5c52); pc.vline(2, 2, 29, 0x4a5c52);
    for (const [x, y] of [[4, 4], [122, 4], [4, 26], [122, 26]] as const) screw(pc, x, y, 0x8a9a90, 0x141a16, true);
    const cream = 0xe8e0c4, amber = 0xd8a830;
    txtC(pc, 'MERIDIAN INSTITUTE', 64, 4, cream);
    txtC(pc, 'PROCESSING WING', 64, 11, amber, 1, 2);
    txtC(pc, 'REMITTANCE PROGRAMME - INTAKE', 64, 23, scale(cream, 0.8));
    for (let i = 0; i < 110; i++) { const x = rng.int(0, 127), y = rng.int(0, 31); if (pc.get(x, y) === cream || pc.get(x, y) === amber) { if (rng.chance(0.2)) pc.set(x, y, 0x6a7268); } else if (rng.chance(0.08)) pc.blend(x, y, 0x8a8a7a, 0.4); }
    for (const x0 of [4, 122]) for (let k = 0; k < 4 + rng.int(0, 3); k++) pc.blend(x0, 28 + k, 0x7a4a2a, 0.5 - k * 0.08);
    for (let k = 0; k < 6; k++) pc.blend(108 + (k % 3), 25 + Math.floor(k / 3), 0x7a1410, 0.55);
    void makeRamp; void ph;
  }, 2.0, 0.5);
});
const scale = (c: number, f: number) => (Math.round(((c >> 16) & 255) * f) << 16) | (Math.round(((c >> 8) & 255) * f) << 8) | Math.round((c & 255) * f);

/** a stage with no tiles, for the particles (everything is floor at y = 0) */
const FLAT = { inb: () => true, idx: () => 0, floor: [1], solid: [0], heightAt: () => 0, edgeBlocks: () => false } as unknown as Zone;

export interface PressRig { g: THREE.Group; ram: THREE.Mesh; rods: THREE.Mesh[]; lever: THREE.Mesh; t: number; period: number; on: boolean; hits: number }
export interface BandRig { g: THREE.Group; jawL: THREE.Mesh; jawR: THREE.Mesh; head: THREE.Mesh; die: THREE.Mesh; lamp: Fixture | null; close: number; drive: number; cradle: THREE.Vector3 }

export class IntroSet {
  readonly root: THREE.Group;
  /** the giant press: group, ram, rods, lever */
  press!: PressRig;
  bundle!: THREE.Mesh;
  liquid!: THREE.Mesh;
  liqU!: { uTime: { value: number }; uLiq: { value: number }; uHit: { value: THREE.Vector2 }; uHitT: { value: number }; uPush: { value: THREE.Vector3 }; uDark: { value: number }; uGlow: { value: number } };
  blood: Particles;
  sparks: Particles;
  lights: LightDirector;
  rig!: BandRig;
  /** fixtures the script talks to */
  fx: Record<string, Fixture> = {};
  /** called on every press slam (sound, shake from the script) */
  onSlam: ((d: number) => void) | null = null;
  private splats: THREE.Mesh[] = []; private splatI = 0;
  private belt!: { mesh: THREE.Mesh; uv: Float32Array; base: Float32Array; off: number };
  private junk: { m: THREE.Mesh; z: number; y: number; vy: number; on: boolean; spin: number }[] = [];
  private coils: EmitMat | null = null;
  private t = 0;
  private shadowMeshes: THREE.Mesh[] = [];

  /** low: the phone path (fewer lights, no shadows, fewer drops) */
  constructor(root: THREE.Group, private low = false) {
    this.root = root;
    this.blood = new Particles(low ? 90 : 220, false);
    this.blood.mesh.material = stageMat({ outline: 0, rim: 0 });
    root.add(this.blood.mesh);
    this.sparks = new Particles(low ? 80 : 180, 3.2);
    this.sparks.mesh.material = stageMat({ outline: 0, rim: 0, noHaze: true });
    this.sparks.mesh.renderOrder = 9;
    root.add(this.sparks.mesh);
    this.lights = new LightDirector(root, low);
    this.build();
  }

  private add(g: THREE.BufferGeometry, mat: THREE.Material = SOLID(), ro = 0, shadow = true) {
    const m = new THREE.Mesh(g, mat);
    m.renderOrder = ro; m.frustumCulled = false;
    m.castShadow = shadow && !this.low; m.receiveShadow = !this.low;
    this.root.add(m);
    if (shadow) this.shadowMeshes.push(m);
    return m;
  }

  // ================================================================ building
  private build() {
    const shell = new ModelBuilder();
    shell.setFacets?.(false);
    const props = new ModelBuilder();
    const { cor, proc, ante, room, door } = IX;
    // ---- the processing wing: window holes on the left, the counter opening on the right
    this.box(shell, cor.x0, cor.x1, cor.z0, cor.z1, cor.h, 'zp_wall_inst', 'concrete_wet', 'concrete', {
      n: [[door.x0 - 0.2, door.x1 + 0.2, cor.h]],
      w: WINDOWS.map((zc) => [zc - 1.05, zc + 1.05, 0.62, 1.82] as [number, number, number, number]),
      e: [[proc.z0, proc.z1, 0, cor.h]],
    });
    // ---- the processing room behind the counter
    this.box(shell, proc.x0 + 0.1, proc.x1, proc.z0, proc.z1, proc.h, 'zp_wall_inst', 'ix_laminate', 'concrete', { skipW: true }, 0xc8c0b0, 0x8a8478);
    // the holding-cell door you came out of, its frame, a wired glass slit
    cbox(props, 0, 0, cor.z1 - 0.05, 1.06, 2.24, 0.08, 0.015, 'metal_painted_green', { color: 0x7a8478 });
    cbox(props, 0, 1.45, cor.z1 - 0.1, 0.32, 0.22, 0.02, 0.006, 'glass_dark');
    for (const s of [-1, 1]) cbox(props, s * 0.6, 0, cor.z1 - 0.06, 0.12, 2.3, 0.14, 0.02, 'ix_steel');
    cbox(props, 0, 2.28, cor.z1 - 0.06, 1.32, 0.14, 0.14, 0.02, 'ix_steel');
    lathe(props, 0.38, 1.0, cor.z1 - 0.12, [[0.03, 0], [0.03, 0.05]], 6, 'chrome');
    // the enamel sign on two chains in front of the holding door
    cbox(props, 0, 1.98, 0.6, 2.0, 0.5, 0.035, 0.01, { north: 'ix_title', south: 'metal_painted_green', all: 'metal_dark' }, { fit: true });
    for (const x of [-0.85, 0.85]) for (let i = 0; i < 4; i++) cbox(props, x, 2.48 + i * 0.08, 0.6, 0.014, 0.06, 0.03, 0.005, 'chrome');
    // pilasters, a skirting rail, ceiling beams, a pipe and a cable tray along the wing
    for (let z = 1.5; z > cor.z0; z -= 2.4) {
      for (const s of [-1, 1]) if (s < 0 || z > proc.z1 + 0.2 || z < proc.z0 - 0.2) cbox(props, s * (cor.x1 - 0.06), 0, z, 0.14, cor.h, 0.24, 0.02, 'ix_steel', { color: 0x8a948a });
      cbox(props, 0, cor.h - 0.16, z, cor.x1 - cor.x0, 0.16, 0.2, 0.02, 'ix_steel', { color: 0x7a827a });
    }
    for (const s of [-1, 1]) cbox(props, s * (cor.x1 - 0.02), 0, (cor.z0 + cor.z1) / 2, 0.04, 0.12, cor.z1 - cor.z0, 0.01, 'ix_steel', { color: 0x3a403c });
    pipeRun(props, [[cor.x0 + 0.12, cor.h - 0.3, cor.z1 - 0.2], [cor.x0 + 0.12, cor.h - 0.3, cor.z0 + 0.4], [cor.x0 + 0.12, cor.h - 0.3, ante.z0 + 1]], 0.05, 'ix_steel', { color: 0x9aa098 });
    pipeRun(props, [[cor.x0 + 0.24, cor.h - 0.24, cor.z1 - 0.2], [cor.x0 + 0.24, cor.h - 0.24, cor.z0 + 0.6]], 0.035, 'ix_rust');
    cableTray(props, cor.x1 - 0.35, cor.h - 0.42, cor.z1 - 0.3, cor.z0 + 0.3, 5);
    // ---- the counter, the clerks' room behind it
    intakeCounter(props, cor.x1 + 0.25, proc.z1 - 0.1, proc.z0 + 0.1, cor.h);
    const deskGlow = new ModelBuilder();
    clerkDesk(props, deskGlow, 3.3, -0.9, Math.PI / 2 + 0.05, 3);
    clerkDesk(props, deskGlow, 3.4, -4.1, Math.PI / 2 - 0.04, 5);
    clerkDesk(props, deskGlow, 3.25, -7.2, Math.PI / 2 + 0.08, 9);
    swivelChair(props, 4.2, -1.0, -Math.PI / 2 + 0.4);
    swivelChair(props, 4.35, -4.3, -Math.PI / 2 - 0.3);
    swivelChair(props, 4.15, -7.1, -Math.PI / 2 + 0.1);
    for (let i = 0; i < 4; i++) filingCabinet(props, proc.x1 - 0.36, 0.2 - i * 0.5, -Math.PI / 2, i % 2 ? 0x6a7468 : 0x7a8478);
    filingCabinet(props, proc.x1 - 0.36, -8.2, -Math.PI / 2, 0x7a8478);
    // ---- the gate line: a barred gate swung open, a turnstile, the header with its sign
    const { gate } = IX;
    barredGate(props, gate.x0 + 0.06, gate.x1, gate.z, 2.35, 1.42, true);
    cbox(props, (gate.x1 + cor.x1) / 2, 2.35, gate.z, cor.x1 - gate.x1, 0.18, 0.18, 0.025, 'ix_plate');
    turnstile(props, 1.42, gate.z, -1, 3);
    cbox(props, -0.4, 2.53, gate.z + 0.1, 1.6, 0.4, 0.04, 0.01, { south: 'ix_sign_gate', all: 'metal_dark' }, { fit: true });
    for (const x of [-1.0, 0.2]) cbox(props, x, 2.93, gate.z + 0.1, 0.02, 0.2, 0.02, 0.004, 'chrome');
    props.box(0, 0.002, gate.z + 0.25, cor.x1 - cor.x0, 0.004, 0.14, 'ix_haz', { ao: false });
    // ---- the antechamber (tile), open to the wing and to the press room
    this.box(shell, ante.x0, ante.x1, ante.z0, ante.z1, ante.h, 'tile_white', 'concrete_wet', 'concrete', { n: [[door.x0, door.x1, door.h]], s: [[cor.x0, cor.x1, cor.h]] }, 0xb8b0a4);
    steelBench(props, ante.x0 + 0.32, -13.6, Math.PI / 2, 1.8);
    hoseReel(props, ante.x1 - 0.05, 1.5, -12.4, -Math.PI / 2);
    mopBucket(props, ante.x0 + 0.5, -15.3, 0.4);
    cbox(props, IX.drain[0], 0, IX.drain[1], 0.5, 0.012, 0.5, 0.004, 'ix_grate');
    for (const [x, z] of [[ante.x0 + 0.05, -12.2], [ante.x0 + 0.05, -14.9]] as [number, number][]) { cbox(props, x, 0.4, z, 0.06, 0.12, 0.12, 0.02, 'ix_steel'); lathe(props.push().translate(x + 0.06, 0.46, z).rotateZ(Math.PI / 2), 0, -0.02, 0, [[0.05, 0], [0.05, 0.02]], 7, 'chrome', { caps: false }); props.pop(); }
    pipeRun(props, [[ante.x1 - 0.15, ante.h - 0.25, ante.z1 - 0.1], [ante.x1 - 0.15, ante.h - 0.25, ante.z0 + 0.1]], 0.06, 'ix_steel');
    // ---- the press room
    this.box(shell, room.x0, room.x1, room.z0, room.z1, room.h, 'concrete', 'concrete_wet', 'zp_void', { s: [[door.x0, door.x1, door.h]] }, 0x4a4644, 0x6a625e);
    // the steel frame and the heavy door between the antechamber and the press room
    for (const s of [-1, 1]) cbox(props, s * (door.x1 + 0.06), 0, ante.z0, 0.14, door.h, 0.34, 0.02, 'ix_steel');
    cbox(props, 0, door.h, ante.z0, door.x1 - door.x0 + 0.26, 0.16, 0.34, 0.02, 'ix_plate');
    props.push().translate(door.x1 + 0.05, 0, ante.z0 - 0.04).rotateY(-Math.PI * 0.62);
    cbox(props, 0.5, 0.02, 0, 1.0, 2.36, 0.07, 0.015, 'ix_plate', { color: 0x8a9488 });
    cbox(props, 0.85, 1.0, 0.05, 0.12, 0.3, 0.05, 0.01, 'ix_steel');
    props.pop();
    // columns (I-beams) up the walls, trusses across the dark
    for (let z = room.z1 - 1.2; z > room.z0; z -= 3.6) for (const s of [-1, 1]) iBeam(props, [s * (room.x1 - 0.12), 0, z], [s * (room.x1 - 0.12), room.h, z], 0.32, 0.22, 'ix_steel', [1, 0, 0]);
    for (let z = room.z1 - 1.2; z > room.z0; z -= 3.6) iBeam(props, [room.x0, room.h - 1.0, z], [room.x1, room.h - 1.0, z], 0.4, 0.2, 'ix_rust');
    iBeam(props, [room.x0 + 1, room.h - 0.6, room.z1], [room.x0 + 1, room.h - 0.6, room.z0], 0.36, 0.2, 'ix_rust');
    iBeam(props, [room.x1 - 1, room.h - 0.6, room.z1], [room.x1 - 1, room.h - 0.6, room.z0], 0.36, 0.2, 'ix_rust');
    pipeRun(props, [[room.x1 - 0.3, 4.2, room.z1 - 0.2], [room.x1 - 0.3, 4.2, room.z0 + 0.3]], 0.11, 'ix_rust');
    pipeRun(props, [[room.x1 - 0.55, 4.5, room.z1 - 0.2], [room.x1 - 0.55, 4.5, -26], [room.x1 - 0.55, 0.3, -26]], 0.07, 'ix_steel');
    cableTray(props, room.x0 + 0.4, 3.6, room.z1 - 0.3, room.z0 + 0.3, 9);
    // tread plate round the press and hazard lines on the floor
    props.box(IX.press.x + 0.4, 0.004, IX.press.z, 5.2, 0.01, 5.6, 'ix_tread', { ao: false });
    for (const [x, z, w, d] of [[IX.press.x + 3.1, IX.press.z, 0.14, 5.6], [IX.press.x + 0.4, IX.press.z + 2.86, 5.4, 0.14], [IX.press.x + 0.4, IX.press.z - 2.86, 5.4, 0.14]]) props.box(x, 0.012, z, w, 0.004, d, 'ix_haz', { ao: false });
    // a drain and a grate run toward it
    cbox(props, 1.8, 0, -20.5, 0.6, 0.012, 3.2, 0.004, 'ix_grate');
    // the rest of the dressing: the processing wing's own furniture where it fits
    this.dress();
    this.add(shell.build(), SOLID());
    this.add(facetize(props.build(), 0.006, 3), SOLID());
    // the desks' screens (one lit material for all of them)
    if (!deskGlow.isEmpty) { const m = new THREE.Mesh(deskGlow.build(), emitMat(0xb8ffb0, 1.1)); m.frustumCulled = false; this.root.add(m); }
    this.buildLamps();
    this.buildPress();
    this.buildConveyor();
    this.buildRig();
    this.buildTape();
    this.buildBlood();
  }

  /** a rectangular room from boxes (each wall a single inner face), with openings per side: [x0, x1, h] on n (-z) / s (+z), [za, zb, y0, y1] on w / e */
  private box(mb: ModelBuilder, x0: number, x1: number, z0: number, z1: number, h: number, wall: string, floor: string, ceil: string,
    holes: { n?: [number, number, number][]; s?: [number, number, number][]; w?: [number, number, number, number][]; e?: [number, number, number, number][]; skipW?: boolean } = {}, wallCol = 0xffffff, floorCol = 0xd0ccc4) {
    const T = 0.1;
    mb.box((x0 + x1) / 2, -T, (z0 + z1) / 2, x1 - x0, T, z1 - z0, { top: floor, all: 'metal_dark' }, { color: floorCol, skip: ['bottom', 'north', 'south', 'east', 'west'] });
    mb.box((x0 + x1) / 2, h, (z0 + z1) / 2, x1 - x0, T, z1 - z0, ceil, { color: 0x8a8a88, skip: ['top', 'north', 'south', 'east', 'west'] });
    const sideX = (x: number, face: 'west' | 'east', hs: [number, number, number, number][] = []) => {
      const sk = (['west', 'east', 'north', 'south', 'top', 'bottom'] as const).filter((f) => f !== (face === 'west' ? 'east' : 'west'));
      const xx = face === 'west' ? x - T / 2 : x + T / 2;
      let z = z1;
      for (const [za, zb, ya, yb] of [...hs].sort((p, q) => q[1] - p[1])) {
        if (zb < z) mb.box(xx, 0, (z + zb) / 2, T, h, z - zb, wall, { color: wallCol, skip: [...sk] });
        if (ya > 0) mb.box(xx, 0, (za + zb) / 2, T, ya, zb - za, wall, { color: wallCol, skip: [...sk] });
        if (yb < h) mb.box(xx, yb, (za + zb) / 2, T, h - yb, zb - za, wall, { color: wallCol, skip: [...sk] });
        z = za;
      }
      if (z > z0) mb.box(xx, 0, (z + z0) / 2, T, h, z - z0, wall, { color: wallCol, skip: [...sk] });
    };
    if (!holes.skipW) sideX(x0, 'west', holes.w);
    sideX(x1, 'east', holes.e);
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

  /** props from the processing wing's own object models (the monitors with your mugshot, notices, observers) */
  private dress() {
    const S = SOLID();
    const put = (key: string, x: number, z: number, rotY = 0, state: Record<string, unknown> = {}, mat: THREE.Material = S, y = 0) => {
      const g = buildObjGeometry(key, state); if (!g) return null;
      const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.rotation.y = rotY; m.frustumCulled = false;
      m.castShadow = !this.low; m.receiveShadow = !this.low;
      this.root.add(m); return m;
    };
    const { cor } = IX;
    const left = (key: string, z: number, st: Record<string, unknown> = {}, mat?: THREE.Material) => put(key, cor.x0 - WZ, z, Math.PI / 2, st, mat);
    const right = (key: string, z: number, st: Record<string, unknown> = {}, mat?: THREE.Material) => put(key, cor.x1 + WZ, z, -Math.PI / 2, st, mat);
    right('zp_crt_wall', 2.0); left('zp_crt_wall', -2.6); right('zp_crt_wall', -10.2);
    left('zp_notice', -0.8, { v: 0 }, CUT()); left('zp_notice', -9.0, { v: 2 }, CUT());
    put('zp_sign_remit', IX.proc.x1 + WZ, -3.0, -Math.PI / 2);
    put('gurney', IX.room.x1 - 0.8, -18.6, Math.PI / 2 + 0.2);
    put('zp_jumpsuit_rack', IX.room.x1 - 0.7, -28.0, -Math.PI / 2);
    // observation glass along the left wall of the wing: a dark window, the figures behind it
    const glass = new ModelBuilder();
    for (const zc of WINDOWS) {
      cbox(glass, cor.x0 + 0.01, 0.52, zc, 0.1, 0.1, 2.3, 0.02, 'ix_steel');
      cbox(glass, cor.x0 + 0.01, 1.8, zc, 0.1, 0.1, 2.3, 0.02, 'ix_steel');
      for (const e of [-1, 1]) cbox(glass, cor.x0 + 0.01, 0.6, zc + e * 1.1, 0.1, 1.24, 0.1, 0.02, 'ix_steel');
      glass.box(cor.x0 - 1.6, 0, zc, 0.1, 2.5, 2.6, 'zp_wall_dark', { skip: ['west', 'north', 'south', 'top', 'bottom'] });
      glass.box(cor.x0 - 0.8, 0, zc - 1.25, 1.6, 2.5, 0.1, 'zp_wall_dark', { skip: ['north', 'west', 'east', 'top', 'bottom'] });
      glass.box(cor.x0 - 0.8, 0, zc + 1.25, 1.6, 2.5, 0.1, 'zp_wall_dark', { skip: ['south', 'west', 'east', 'top', 'bottom'] });
      glass.box(cor.x0 - 0.8, -0.02, zc, 1.6, 0.02, 2.6, 'concrete', { color: 0x6a6a6a, skip: ['bottom', 'north', 'south', 'east', 'west'] });
      glass.box(cor.x0 - 0.8, 2.5, zc, 1.6, 0.02, 2.6, 'zp_void', { skip: ['top', 'north', 'south', 'east', 'west'] });
    }
    this.add(glass.build(), S);
    const pane = new ModelBuilder();
    for (const zc of WINDOWS) pane.box(cor.x0 + 0.005, 0.62, zc, 0.01, 1.2, 2.1, 'glass_dark', { color: 0x8a9aa8 });
    const pm = new THREE.Mesh(pane.build(), GLASS()); pm.renderOrder = 3; pm.frustumCulled = false; this.root.add(pm);
    put('zp_observer', cor.x0 - 0.75, -4.2, Math.PI / 2, { v: 0 });
    put('zp_observer', cor.x0 - 0.9, -5.1, Math.PI / 2 - 0.2, { v: 1 });
    put('zp_observer', cor.x0 - 0.7, -7.7, Math.PI / 2 + 0.1, { v: 2 });
    // paint on the floor: hazard lines, the drag smear handled with the blood
    const paint = new ModelBuilder();
    paint.box(0, 0.002, IX.ante.z0 + 0.25, 2.0, 0.004, 0.12, 'ix_haz', { ao: false });
    this.add(paint.build(), S, 0, false);
  }

  /** every lamp on the stage, registered with the light director */
  private buildLamps() {
    const L = this.lights, { cor, proc, ante, room } = IX;
    const body = new ModelBuilder();
    const COLD = 0xc8ecff, WARM = 0xffb460, SODIUM = 0xff9a38;
    // the wing: twin tubes down the middle (the fourth one failing), shafts under each
    TUBES_Z.forEach((z, i) => {
      const lamp = tubeFixture(body, 0, cor.h, z, { drop: 0.14 });
      const sh = new ModelBuilder();
      shaftGeo(sh, 0, cor.h - 0.26, z, 0.26, 1.15, 0.0, 1.5, 1.9);
      this.fx['tube' + i] = L.add({ name: 'tube' + i, at: lamp.at, col: COLD, power: 5.5, range: 6.5, glowK: 2.0, circuit: 'wing', temper: i === 3 ? 'failing' : 'steady', shaftK: 0.07, haloS: 0.5 }, lamp.glow, sh);
    });
    // the clerks' room: one tube dead, one working; amber desk lamps
    {
      const a = tubeFixture(body, 3.6, proc.h, -2.4, { drop: 0.12, rotY: Math.PI / 2 });
      this.fx.proc0 = L.add({ name: 'proc0', at: a.at, col: 0xd8f0e8, power: 2.2, range: 5, glowK: 1.4, circuit: 'proc', temper: 'failing', haloS: 0.35 }, a.glow);
      const b = tubeFixture(body, 3.6, proc.h, -6.6, { drop: 0.12, rotY: Math.PI / 2 });
      this.fx.proc1 = L.add({ name: 'proc1', at: b.at, col: 0xd8f0e8, power: 0, range: 4, glowK: 0.0, circuit: 'proc', temper: 'dead', haloS: 0 }, b.glow);
      [[3.3, -0.9, Math.PI / 2 + 0.05], [3.4, -4.1, Math.PI / 2 - 0.04], [3.25, -7.2, Math.PI / 2 + 0.08]].forEach(([x, z, yaw], i) => {
        const c = Math.cos(yaw), s = Math.sin(yaw);
        const lx = x + c * 0.5 + s * 0.15, lz = z - s * 0.5 + c * 0.15;
        const d = deskLamp(body, lx, 0.76, lz, Math.PI + yaw - Math.PI / 2 + 0.5);
        this.fx['desk' + i] = L.add({ name: 'desk' + i, at: d.at, col: WARM, power: 2.6, range: 3.6, glowK: 2.2, circuit: 'proc', haloS: 0.32 }, d.glow);
      });
    }
    // the antechamber: a caged lamp over the drain, a stuttering tube by the door
    {
      const c = cagedLamp(body, IX.drain[0], ante.h, IX.drain[1], 0.45);
      const sh = new ModelBuilder();
      shaftGeo(sh, IX.drain[0], ante.h - 0.62, IX.drain[1], 0.3, 0.3, 0.0, 2.2, 2.2);
      this.fx.cage = L.add({ name: 'cage', at: c.at, col: 0xffd090, power: 7, range: 6, glowK: 2.4, circuit: 'ante', shaftK: 0.09, haloS: 0.45 }, c.glow, sh);
      const t = tubeFixture(body, 1.2, ante.h, -14.9, { drop: 0.1, rotY: Math.PI / 2 });
      this.fx.anteTube = L.add({ name: 'anteTube', at: t.at, col: 0xd0f4e8, power: 3, range: 5, glowK: 1.8, circuit: 'ante', temper: 'failing', haloS: 0.4 }, t.glow);
    }
    // the press room: sodium high-bays in the dark, a work lamp over the press, the fitting lamp, the beacon
    {
      for (const [x, z] of [[1.6, -20.5], [1.2, -27.2], [-3.4, -26.4]] as [number, number][]) {
        const h = highBay(body, x, room.h, z, 1.6);
        const sh = new ModelBuilder();
        shaftGeo(sh, x, room.h - 2.1, z, 0.6, 0.6, 0.0, 3.6, 3.6, 0.4);
        this.fx['bay' + x] = L.add({ name: 'bay' + x, at: h.at, col: SODIUM, power: 70, range: 17, glowK: 2.2, circuit: 'press', shaftK: 0.05, haloS: 1.0 }, h.glow, sh);
      }
      const w = cagedLamp(body, IX.press.x + 2.2, 6.1, IX.press.z + 0.4, 1.2, 0x5a5a40);
      this.fx.work = L.add({ name: 'work', at: w.at, col: 0xffe4b0, power: 9, range: 8, glowK: 2.4, circuit: 'press', haloS: 0.5 }, w.glow);
      for (let i = 0; i < 8; i++) cbox(body, IX.press.x + 2.2, 6.1 + i * 0.4, IX.press.z + 0.4, 0.02, 0.3, 0.02, 0.004, 'metal_dark');
      const f = cagedLamp(body, IX.fit[0] - 0.55, 2.7, IX.fit[1] - 0.35, 0.35, 0x40503e);
      const sh = new ModelBuilder();
      shaftGeo(sh, IX.fit[0] - 0.55, 2.05, IX.fit[1] - 0.35, 0.3, 0.3, 0.0, 1.9, 1.9);
      for (let i = 0; i < 16; i++) cbox(body, IX.fit[0] - 0.55, 2.7 + i * 0.4, IX.fit[1] - 0.35, 0.02, 0.3, 0.02, 0.004, 'metal_dark');
      this.fx.fitLamp = L.add({ name: 'fitLamp', at: f.at, col: 0xffd8a0, power: 2.4, range: 5, glowK: 2.4, circuit: 'fit', shaftK: 0.08, haloS: 0.4 }, f.glow, sh);
      // the beacon on the press crown's front corner (model -1.9, 6.6, 1.75 turned to face +x)
      const [bx, by, bz] = GP.beacon;
      const wx = IX.press.x + bz, wz = IX.press.z - bx;
      const bc = beacon(body, wx, by, wz);
      const bm = emitMat(0xffffff, 0.3);
      const bmesh = new THREE.Mesh(bc.glow.build(), bm); bmesh.frustumCulled = false; this.root.add(bmesh);
      L.setBeacon(new THREE.Vector3(...bc.at), bm);
    }
    this.add(facetize(body.build(), 0.0), SOLID());
    L.addMotes([this.fx.tube0, this.fx.tube1, this.fx.tube2, this.fx.tube4, this.fx.cage, this.fx['bay1.6'], this.fx.fitLamp].filter(Boolean), this.low ? 8 : 18);
    L.setKey([0, cor.h - 0.3, 0], [0, 0, 0], COLD, 0, 1.2, true);
  }

  private buildPress() {
    const S = SOLID();
    const { x, z } = IX.press;
    const g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = Math.PI / 2;
    const mb = new ModelBuilder(), glow = new ModelBuilder();
    pressBody(mb, glow);
    const body = new THREE.Mesh(facetize(mb.build(), 0.012, 5), S);
    const gm = new THREE.Mesh(glow.build(), emitMat(0xffe8c0, 1.2));
    const ram = new THREE.Mesh(ramGeo(), S); ram.position.y = GP.ramUp;
    const pg = pistonGeo();
    const rods = [-0.95, 0.95].map((rx) => { const r = new THREE.Mesh(pg, S); r.position.set(rx, 0, 0); return r; });
    const lever = new THREE.Mesh(leverGeo(), S); lever.position.set(...GP.lever); lever.rotation.x = -0.4;
    for (const m of [body, ram, ...rods, lever, gm]) { m.frustumCulled = false; m.castShadow = !this.low && m !== gm; m.receiveShadow = !this.low; }
    g.add(body, gm, ram, ...rods, lever);
    this.root.add(g);
    this.press = { g, ram, rods, lever, t: 99, period: 6.5, on: false, hits: 0 };
    // what is under it
    const b = new ModelBuilder();
    remains(b, 0, 0, 0, 11);
    this.bundle = new THREE.Mesh(b.build(), S);
    this.bundle.position.set(x, GP.bedH + 0.05, z);
    this.bundle.rotation.y = 0.3;
    this.bundle.frustumCulled = false; this.bundle.castShadow = !this.low;
    this.root.add(this.bundle);
  }

  private buildConveyor() {
    const { conv } = IX;
    const mb = new ModelBuilder(), belt = new ModelBuilder();
    conveyor(mb, belt, conv.x, conv.z0, conv.z1, 0.78, conv.z0);
    this.add(facetize(mb.build(), 0.004, 7), SOLID());
    const bg = belt.build();
    const bmesh = this.add(bg, SOLID(), 0, false);
    const uv = bg.getAttribute('uv') as THREE.BufferAttribute;
    this.belt = { mesh: bmesh, uv: uv.array as Float32Array, base: Float32Array.from(uv.array as Float32Array), off: 0 };
    const geos = [0, 1, 2, 3].map((k) => junkGeo(k));
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(geos[i % 4], SOLID());
      m.frustumCulled = false; m.castShadow = !this.low; m.receiveShadow = !this.low;
      this.root.add(m);
      this.junk.push({ m, z: conv.z0 + 0.4 + i * 1.6, y: 0.78, vy: 0, on: true, spin: Math.random() * 6 });
    }
  }

  private buildRig() {
    const R = bandRigGeo(0.62);
    const g = new THREE.Group();
    const S = stageMat({ rim: 0.6 });
    const body = new THREE.Mesh(facetize(R.body, 0.003, 9), S);
    const jawL = new THREE.Mesh(R.jawL, S), jawR = new THREE.Mesh(R.jawR, S), head = new THREE.Mesh(R.head, S), die = new THREE.Mesh(R.die, S);
    jawL.position.set(0, R.jawY, 0.1); jawR.position.set(0, R.jawY, -0.1);
    head.position.set(0, R.headY, 0);
    const gl = new THREE.Mesh(R.glow, emitMat(0xffb040, 0.4));
    for (const m of [body, jawL, jawR, head, die, gl]) { m.frustumCulled = false; m.castShadow = !this.low && m !== gl; m.receiveShadow = !this.low; g.add(m); }
    g.position.set(IX.fit[0] - 0.45, 0, IX.fit[1] + 0.1);
    g.rotation.y = 0;
    this.root.add(g);
    this.rig = { g, jawL, jawR, head, die, lamp: null, close: 0, drive: 0, cradle: new THREE.Vector3() };
    (this.rig as unknown as { glow: EmitMat }).glow = gl.material as EmitMat;
    this.placeRig(g.position.x, g.position.z);
  }
  /** move the rig so its cradle sits at (x, z) */
  placeRig(x: number, z: number) {
    this.rig.g.position.set(x, 0, z);
    this.rig.cradle.set(x, 0.62 + 0.06, z);
  }
  /** jaws 0 open .. 1 closed, the driver 0 up .. 1 down on the wrist */
  setRig(close: number, drive: number) {
    const r = this.rig;
    r.close = close; r.drive = drive;
    r.jawL.rotation.x = -1.2 * (1 - close);
    r.jawR.rotation.x = 1.2 * (1 - close);
    // the rod hangs from the cylinder (y 1.46): retracted it shows 0.12 m, driven it reaches the wrist
    const reach = 0.12 + drive * (1.46 - 0.62 - 0.12 - 0.16);
    r.head.position.y = 1.46; r.head.scale.y = reach;
    r.die.position.y = 1.46 - reach;
  }

  /** the door-shaped section of the far wall, taped off, the portal frame round it, and the membrane that turns to liquid */
  private buildTape() {
    const { x, z, w, h } = IX.tape;
    const tape = new ModelBuilder();
    const tz = z + 0.012, tw = 0.075;
    tape.box(x - w / 2, 0, tz, tw, h, 0.006, 'zd_hazard', { ao: false });
    tape.box(x + w / 2, 0, tz, tw, h, 0.006, 'zd_hazard', { ao: false });
    tape.box(x, h - tw / 2, tz, w + tw, tw, 0.006, 'zd_hazard', { ao: false });
    tape.box(x, 0.0, tz, w + tw, tw * 0.7, 0.006, 'zd_hazard', { ao: false });
    for (const a of [0.62, -0.62]) {
      tape.push().translate(x, h * 0.55, tz + 0.004).rotateZ(Math.atan2(h * 0.5 * Math.sign(a), w) * 0.9);
      tape.box(0, -tw / 2, 0, Math.hypot(w, h * 0.5) * 0.98, tw, 0.004, 'zd_hazard', { ao: false });
      tape.pop();
    }
    tape.push().translate(x + w / 2 + 0.05, 1.1, tz + 0.02).rotateZ(0.3); tape.box(0, -0.4, 0, tw, 0.4, 0.004, 'zd_hazard', { ao: false }); tape.pop();
    const tm = new THREE.Mesh(tape.build(), CUT()); tm.renderOrder = 2; tm.frustumCulled = false; this.root.add(tm);
    // the frame
    const fr = new ModelBuilder(), fg = new ModelBuilder();
    portalFrame(fr, fg, x, z, w, h);
    this.add(facetize(fr.build(), 0.004, 13), stageMat({ rim: 0.5 }));
    this.coils = emitMat(0xffa860, 0.25);
    const cm = new THREE.Mesh(fg.build(), this.coils); cm.frustumCulled = false; this.root.add(cm);
    // the membrane
    const geo = new THREE.PlaneGeometry(w - 0.06, h - 0.06, 40, 72);
    const u = this.liqU = { uTime: { value: 0 }, uLiq: { value: 0 }, uHit: { value: new THREE.Vector2(0, 0.2) }, uHitT: { value: 0 }, uPush: { value: new THREE.Vector3(0, 0, 0) }, uDark: { value: 0 }, uGlow: { value: 0 } };
    const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: LIQ_VERT, fragmentShader: LIQ_FRAG, side: THREE.DoubleSide });
    const m = this.liquid = new THREE.Mesh(geo, mat);
    m.position.set(x, h / 2, z + 0.02);
    m.renderOrder = 4; m.frustumCulled = false;
    this.root.add(m);
    SU.uPortPos.value.set(x, h * 0.5, z + 0.05);
    SU.uPortN.value.set(0, 0, 1);
    SU.uPortStr.value = 0;
  }

  /** the blood that was here before you */
  private buildBlood() {
    const D = new ModelBuilder();
    const r = mulberry(91);
    const flat = (x: number, z: number, w: number, d: number, tex: string, rot = r() * 6.28, y = 0.004) => D.flat(x, y, z, w, d, tex, { rot });
    for (let z = -6; z > -13; z -= 0.9) flat(0.05 + (r() - 0.5) * 0.3, z, 0.6 + r() * 0.3, 1.0, 'gore_red_smear', Math.PI / 2 + (r() - 0.5) * 0.2);
    flat(IX.drain[0], IX.drain[1], 2.2, 2.2, 'gore_red_pool', 0, 0.003);
    for (let i = 0; i < 6; i++) flat(IX.drain[0] + (r() - 0.5) * 3, IX.drain[1] + (r() - 0.5) * 3.4, 0.7, 0.7, r() < 0.5 ? 'gore_red_splat_a' : 'gore_red_splat_b');
    const { x, z } = IX.press;
    flat(x + 2.2, z, 3.0, 4.6, 'gore_red_pool', 0.4, 0.018);
    for (let i = 0; i < 14; i++) { const a = r() * 6.28, d = 2.6 + r() * 3.0; flat(x + Math.cos(a) * d, z + Math.sin(a) * d, 1.1, 0.55, 'gore_red_spray', a, 0.02); }
    for (let i = 0; i < 10; i++) flat(-1 + r() * 6, -17 - r() * 13, 0.8, 0.8, r() < 0.5 ? 'gore_red_splat_a' : 'gore_red_splat_b');
    for (let i = 0; i < 6; i++) flat(IX.tape.x + (r() - 0.5) * 0.6, IX.tape.z + 0.9 + i * 0.9, 0.2, 0.36, 'gore_print_a', r() * 0.6);
    for (let zz = -24; zz > -30.2; zz -= 0.9) flat(IX.tape.x - 0.2 + (zz + 24) * 0.04, zz, 0.5, 1.0, 'gore_red_smear', Math.PI / 2);
    const W = (x0: number, y: number, z0: number, w: number, h: number, tex: string, face: 'n' | 'e' | 'w') => {
      const t = 0.002;
      if (face === 'n') D.box(x0, y, z0 + t, w, h, 0.002, { south: tex, all: 'zp_void' }, { fit: { south: true }, ao: false, skip: ['north', 'east', 'west', 'top', 'bottom'] });
      if (face === 'e') { D.push().translate(x0 + t, y, z0).rotateY(Math.PI / 2); D.box(0, 0, 0, w, h, 0.002, { south: tex, all: 'zp_void' }, { fit: { south: true }, ao: false, skip: ['north', 'east', 'west', 'top', 'bottom'] }); D.pop(); }
      if (face === 'w') { D.push().translate(x0 - t, y, z0).rotateY(-Math.PI / 2); D.box(0, 0, 0, w, h, 0.002, { south: tex, all: 'zp_void' }, { fit: { south: true }, ao: false, skip: ['north', 'east', 'west', 'top', 'bottom'] }); D.pop(); }
    };
    for (let i = 0; i < 5; i++) W(IX.room.x0, 0.4 + r() * 2.2, z - 2 + r() * 4, 1.6, 1.4, r() < 0.5 ? 'gore_red_wallspray' : 'gore_red_wall', 'e');
    for (let i = 0; i < 4; i++) W(-1 + r() * 4, 0.3 + r() * 1.6, IX.room.z0, 1.4, 1.6, 'gore_red_wallspray', 'n');
    for (let i = 0; i < 4; i++) W(IX.ante.x0, 0.2 + r() * 1.4, -12 - r() * 3.6, 0.9, 1.0, 'gore_red_wallspray', 'e');
    for (let i = 0; i < 3; i++) W(IX.ante.x1, 0.2 + r() * 1.2, -12 - r() * 3.6, 0.9, 1.0, 'gore_red_wall', 'w');
    const m = new THREE.Mesh(D.build(), DECAL()); m.renderOrder = 1; m.frustumCulled = false; m.receiveShadow = !this.low; this.root.add(m);
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
  /** a shower of sparks from a point (press impacts, the band's bolt) */
  spark(x: number, y: number, z: number, n = 20, speed = 3, dir: [number, number, number] = [0, 0.6, 0]) {
    const r = Math.random;
    const cols = [0xffffff, 0xfff2c0, 0xffd070, 0xffa040, 0xff7020];
    for (let i = 0; i < n; i++) {
      const s = speed * (0.35 + r());
      this.sparks.add(PK.Spark, x, y, z, (dir[0] + (r() - 0.5) * 1.6) * s, (dir[1] + r() * 0.9) * s, (dir[2] + (r() - 0.5) * 1.6) * s, 0.008 + r() * 0.008, 0.35 + r() * 0.6, cols[(r() * cols.length) | 0], 0.35);
    }
  }

  /** run the giant press: one slam every `period` seconds once started */
  startPress(firstIn = 0.2) { this.press.on = true; this.press.t = -firstIn; this.lights.beaconOn = true; }

  /** per frame: lamps, the press, the belt, drops and sparks */
  update(dt: number, cam: THREE.Vector3, camera?: THREE.Camera) {
    this.t += dt;
    const P = this.press;
    if (P.on) {
      const prevT = P.t;
      P.t += dt;
      if (P.t >= P.period) P.t -= P.period;
      const t = P.t;
      const ry = t < 0 ? GP.ramUp : ramAtGiant(t);
      P.ram.position.y = ry;
      const top = ry + GP.ramH + 0.2;
      for (const r of P.rods) { r.position.y = top; r.scale.y = Math.max(0.01, GP.crownY - top); }
      P.lever.rotation.x = t >= 0 && t < CYCLE.done ? (t < 0.28 ? -0.4 + 2.0 * (t / 0.28) : t < CYCLE.rise ? 1.6 : -0.4) : -0.4;
      // the bundle flattens under it
      const under = ry - GP.bedH;
      const bh = 1.0 * Math.pow(0.45, P.hits);
      this.bundle.scale.y = Math.max(0.12, Math.min(bh, under / 0.45));
      if (prevT < CYCLE.impact && t >= CYCLE.impact) {
        P.hits++;
        const { x, z } = IX.press;
        // gore out from under the die, sparks off the column sleeves and the die's edge
        for (const [ddx, ddz] of [[1, 0], [0, 1], [0, -1], [0.7, 0.7], [0.7, -0.7]]) this.bleed(x + ddx * 1.2, GP.bedH + 0.1, z + ddz * 0.9, ddx, 0.6, ddz, 8, 3.4, 0);
        for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) this.spark(x + sz * GP.colZ, GP.bedH + GP.ramDown * 0.2 + 0.15, z - sx * GP.colX, this.low ? 6 : 14, 3.4, [sz * 0.5, 0.7, -sx * 0.5]);
        this.spark(x + 1.4, GP.bedH + 0.1, z, this.low ? 8 : 22, 4.5, [1, 0.5, 0]);
        this.lights.sparks(new THREE.Vector3(x + 1.6, GP.bedH + 0.4, z), 1);
        this.lights.brownout(0.25, 0.12, ['press', 'fit', 'ante']);
        // the belt's load drops off under the ram
        for (const j of this.junk) if (!j.on) { j.on = true; j.z = IX.conv.z0 + 0.2 - Math.random() * 0.4; j.y = 0.78; j.vy = 0; }
        this.onSlam?.(Math.hypot(cam.x - x, cam.z - z));
      }
    }
    // the belt and what rides it
    if (this.belt) {
      const sp = 0.42;
      this.belt.off += dt * sp;
      const a = this.belt.uv, b = this.belt.base;
      for (let i = 1; i < a.length; i += 2) a[i] = b[i] - this.belt.off;
      (this.belt.mesh.geometry.getAttribute('uv') as THREE.BufferAttribute).needsUpdate = true;
      const { conv } = IX;
      for (const j of this.junk) {
        if (!j.on) continue;
        if (j.z < conv.z1 - 0.1) { j.z += sp * dt; j.y = 0.78; }
        else if (j.z < IX.press.z - 0.8) { j.z += sp * 1.2 * dt; j.vy -= 9.8 * dt; j.y = Math.max(GP.bedH, j.y + j.vy * dt); if (j.y <= GP.bedH) j.vy = 0; }
        else j.on = false;
        j.m.position.set(conv.x + Math.sin(j.spin) * 0.12, j.y, j.z);
        j.m.rotation.y = j.spin;
        j.m.visible = j.on || j.z > IX.press.z - 1.2;
      }
    }
    // the coils on the portal breathe with the liquid
    if (this.coils) this.coils.uniforms.uK.value = 0.2 + this.liqU.uGlow.value * (1.6 + 0.6 * Math.sin(this.t * 9));
    if (camera) this.lights.update(dt, camera);
    this.blood.update(dt, FLAT);
    this.sparks.update(dt, FLAT);
    this.liqU.uTime.value = this.t;
  }

  dispose() {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh || (o as THREE.Points).isPoints) {
        if (m.geometry && m !== this.blood.mesh && m !== this.sparks.mesh && !GEO_SHARED.has(m.geometry)) m.geometry.dispose();
        const mat = m.material as THREE.Material;
        if (mat && (mat as THREE.ShaderMaterial).isShaderMaterial) mat.dispose();
      }
    });
    this.root.clear();
  }
}
/** geometries owned by other modules (cached): never disposed here */
const GEO_SHARED = new Set<THREE.BufferGeometry>();

/** the giant press's ram height (underside) t seconds into a cycle */
export function ramAtGiant(t: number): number {
  const { ramUp, ramDown } = GP;
  const easeIn = (x: number) => x * x * x, easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
  if (t < CYCLE.horn) return ramUp;
  if (t < CYCLE.drop) return ramUp - 0.15 * easeOut((t - CYCLE.horn) / (CYCLE.drop - CYCLE.horn));
  if (t < CYCLE.impact) return ramUp - 0.15 - (ramUp - 0.15 - ramDown) * easeIn((t - CYCLE.drop) / (CYCLE.impact - CYCLE.drop));
  if (t < CYCLE.rise) return ramDown + Math.max(0, Math.sin((t - CYCLE.impact) * 40) * 0.02 * Math.exp(-(t - CYCLE.impact) * 9));
  if (t < CYCLE.done) return ramDown + (ramUp - ramDown) * Math.pow(easeOut((t - CYCLE.rise) / (CYCLE.done - CYCLE.rise)), 1.4);
  return ramUp;
}

function mulberry(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
void (null as unknown as V3);

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
layout(location = 1) out highp vec4 gNormal;
uniform float uTime, uDark, uGlow;
varying vec3 vW;
varying vec3 vN;
varying float vL;
varying vec2 vP;
float caus(vec2 p, float t) {
  vec2 q = p * 3.0;
  q += vec2(sin(q.y * 1.3 + t * 1.1), cos(q.x * 1.2 - t * 0.9)) * 0.6;
  float v = sin(q.x * 2.1 + t * 0.7) + sin(q.y * 2.3 - t * 0.6) + sin((q.x + q.y) * 1.6 + t * 0.9);
  return pow(max(0.0, 1.0 - abs(v) * 0.7), 4.0);
}
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
  vec3 col = vec3(0.003, 0.006, 0.01);
  col += vec3(0.3, 0.42, 0.5) * fres * 0.8;
  col += vec3(0.9, 1.0, 1.0) * s1 * 1.2 + vec3(0.5, 0.75, 0.85) * s2 * 0.3;
  float edge = smoothstep(0.03, 0.25, vL) * (1.0 - smoothstep(0.25, 0.85, vL));
  col += vec3(0.55, 0.85, 0.95) * edge * 0.7;
  // light from inside it: a cold glow with a moving web, brightest in the middle
  float c = caus(vP + vec2(0.0, uTime * 0.05), uTime);
  float mid = 1.0 - smoothstep(0.2, 0.9, length(vP * vec2(1.4, 0.8)));
  col += vec3(0.2, 0.62, 0.9) * uGlow * (0.08 + 0.32 * mid + c * 0.75) * vL;
  col += vec3(0.1, 0.09, 0.08) * pow(max(0.0, sin(vP.y * 40.0 + uTime * 3.0 + sin(vP.x * 7.0) * 2.0)), 12.0) * 0.6;
  col *= 1.0 - uDark;
  gl_FragColor = vec4(col, 1.0);
  gNormal = vec4(N * 0.5 + 0.5, 1.0);
}
`;
