// THE TITLE'S HALL (round 26): the first thing on screen. A long corridor of the Meridian Institute's closed
// wing at night: tall windows down one side with rain running on them, the moon throwing their mullions across
// a wet floor in shafts of dust, a drop ceiling coming apart, one fluorescent trough still stuttering, a gurney
// on its side, papers, a puddle under each sill, and at the far end the double doors under the Institute's
// crest. The camera dollies down it very slowly and breathes with the pointer; now and then the sky flashes and
// the thunder comes a moment later. Drawn on the menu stage (monitor/stage.ts) like every menu room.
import * as THREE from 'three';
import type { StageRoom, Hot, Grade } from '../monitor/stage';
import type { FMats } from '../scene/pixtex';
import { FacetBuilder, at, cbox, prism, lathe, jitter, tube } from '../scene/facet';
import { Dust, shaftMesh } from '../scene/fx';
import { Dresser, puddle } from '../rooms/dress';
import { paper } from '../monitor/props';
import { rainGlass, beam, crestTexture, easeIO, damp, type RainGlass } from './kit';
import { sample } from '../sfx';

const W = 2.2, H = 3.4, Z0 = -2, Z1 = 24;
const WIN = [2.5, 6.5, 10.5, 14.5, 18.5];
const SILL = 0.9, HEAD = 3.0, WW = 1.7;
const MOON = new THREE.Vector3(-0.78, -0.52, -0.34).normalize();

export class TitleHall implements StageRoom {
  id = 'hall';
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(42, 16 / 9, 0.05, 60);
  hots: Hot[] = [];
  grade: Grade = {
    exposure: 2.2, lift: [0.92, 0.98, 1.06], gain: [1.0, 1.02, 1.06], vig: 0.5, sat: 0.92, contrast: 1.12, side: [1, 0, 0.06, 0.38],
    haze: 0.42, hazeColor: 0x4a5a7a, ao: 0.9, aoRad: 0.5, scatter: 0.55, bounce: 0.26,
    shafts: [new THREE.Vector3(W + 0.2, 2.4, 10.5), new THREE.Vector3(W + 0.2, 2.4, 14.5), new THREE.Vector3(0, H - 0.2, 9)], shaftK: 0.55, shaftColor: 0xb8ccff,
  };
  /** 0..1 the shot's progress (the front end eases the logo against it) */
  k = 0;
  private glass: RainGlass[] = [];
  private beams: { u: { uInt: { value: number } }; base: number }[] = [];
  private moon = new THREE.DirectionalLight(0xa8bcff, 4.2);
  private hemi = new THREE.HemisphereLight(0x8a9cc0, 0x4a3c28, 1.25);
  private nearLight = new THREE.PointLight(0xc8d8ff, 2.2, 8, 2);
  private doorLight = new THREE.PointLight(0xffb070, 2.5, 4.5, 2);
  private endLight = new THREE.PointLight(0xffe8c8, 6, 10, 1.8);
  private flick = new THREE.PointLight(0xdce8ff, 0, 10, 2);
  private flickTube = new THREE.MeshBasicMaterial({ color: 0x111111, toneMapped: false });
  private flickCone = shaftMesh(10);
  private exitLight = new THREE.PointLight(0x5aff8a, 0.6, 4, 2);
  private crestLight = new THREE.SpotLight(0xffd8a0, 9, 6, 0.42, 0.6, 1.6);
  private dust = new Dust(380, new THREE.Box3(new THREE.Vector3(-W + 0.2, 0.1, Z0 + 0.5), new THREE.Vector3(W - 0.1, H - 0.2, 21)));
  private dress: Dresser;
  private hanging: THREE.Object3D | null = null;
  private flash = 0; private nextFlash = 9; private thunderAt = -1;
  private ptr = new THREE.Vector2(); private ptrS = new THREE.Vector2();
  private flickV = 0; private flickT = 0;
  private t0 = -1;
  private v = new THREE.Vector3();

  constructor(private mats: FMats) {
    const S = this.scene;
    S.background = new THREE.Color(0x05070a);
    this.dress = new Dresser(mats);
    this.shell();
    this.windows();
    this.ceiling();
    this.farEnd();
    this.litter();
    S.add(this.dress.done());
    // light: the moon through the windows (the only shadow caster: the mullions on the floor), a cold sky fill
    this.moon.position.copy(MOON).multiplyScalar(-20).add(new THREE.Vector3(0, 0, 11));
    this.moon.target.position.set(0, 0, 11);
    this.moon.castShadow = true;
    const sc = this.moon.shadow.camera as THREE.OrthographicCamera;
    sc.left = -18; sc.right = 18; sc.top = 12; sc.bottom = -12; sc.near = 2; sc.far = 50;
    this.moon.shadow.mapSize.set(2048, 2048); this.moon.shadow.bias = -0.0006; this.moon.shadow.normalBias = 0.02;
    S.add(this.moon, this.moon.target, this.hemi);
    this.flick.position.set(0, H - 0.6, 9);
    this.endLight.position.set(0, H - 0.55, 1);
    this.nearLight.position.set(0, H - 0.6, 17);
    this.doorLight.position.set(-W - 0.6, 1.6, 12.5);
    S.add(this.endLight, this.nearLight, this.doorLight);
    this.flickCone.mesh.position.set(0, H - 0.28, 9); this.flickCone.mesh.scale.set(1.5, 3.1, 1.5);
    this.flickCone.u.uColor.value.set(0xc8dcff);
    S.add(this.flick, this.flickCone.mesh, this.exitLight, this.crestLight, this.crestLight.target, this.dust.points);
    this.exitLight.position.set(0, 2.55, Z0 + 0.4);
    this.crestLight.position.set(0, H - 0.1, Z0 + 1.6); this.crestLight.target.position.set(0, 2.75, Z0);
    this.cam.position.set(0.3, 1.55, 19);
  }

  // ------------------------------------------------------------------ the corridor's shell
  private shell() {
    const b = new FacetBuilder();
    // floor: worn sheet linoleum, a darker band along each wall
    b.add('floor', cbox(W * 2, 0.1, Z1 - Z0, 0.01), 0x9a9482, at(0, -0.05, (Z0 + Z1) / 2), { rep: 1.4 });
    for (const s of [-1, 1]) b.add('floor', cbox(0.3, 0.012, Z1 - Z0, 0.004), 0x5a5648, at(s * (W - 0.15), 0.006, (Z0 + Z1) / 2));
    // the left wall: glazed tile to 1.5 m, a dado rail, stained paint over it
    b.add('tile', cbox(0.12, 1.5, Z1 - Z0, 0.01), 0x9ab0a0, at(-W - 0.06, 0.75, (Z0 + Z1) / 2), { rep: 1.2 });
    b.add('paint', cbox(0.12, H - 1.5, Z1 - Z0, 0.01), 0xc8c0a4, at(-W - 0.06, 1.5 + (H - 1.5) / 2, (Z0 + Z1) / 2), { rep: 0.9, ao: 2.2 });
    b.add('wood', cbox(0.05, 0.07, Z1 - Z0, 0.01), 0x6a5038, at(-W + 0.02, 1.52, (Z0 + Z1) / 2));
    // the window wall: sill course, piers between the windows, the head over them (holes for the glass)
    b.add('tile', cbox(0.24, SILL, Z1 - Z0, 0.01), 0x9ab0a0, at(W + 0.12, SILL / 2, (Z0 + Z1) / 2), { rep: 1.2 });
    b.add('paint', cbox(0.24, H - HEAD, Z1 - Z0, 0.01), 0xc8c0a4, at(W + 0.12, HEAD + (H - HEAD) / 2, (Z0 + Z1) / 2));
    let z = Z0;
    for (const wz of [...WIN, Z1 + WW / 2]) {
      const a = wz - WW / 2;
      if (a > z) b.add('paint', cbox(0.24, HEAD - SILL, a - z, 0.01), 0xc0b89c, at(W + 0.12, SILL + (HEAD - SILL) / 2, (z + a) / 2), { ao: 2 });
      z = wz + WW / 2;
    }
    // skirting, a radiator under each window, a pipe run along the window wall
    for (const s of [-1, 1]) b.add('paint', cbox(0.03, 0.12, Z1 - Z0, 0.005), 0x3e463a, at(s * (W - 0.015), 0.06, (Z0 + Z1) / 2));
    for (const wz of WIN) {
      for (let i = 0; i < 9; i++) b.add('paint', cbox(0.08, 0.55, 0.05, 0.012), 0x8a9088, at(W - 0.1, 0.42, wz - 0.4 + i * 0.1));
      b.add('metal', prism(0.016, 1.0, 6), 0x5a5e5a, at(W - 0.1, 0.12, wz, Math.PI / 2, 0, 0));
    }
    b.add('rust', tube([[W - 0.06, 3.15, Z0], [W - 0.06, 3.15, Z1]], 0.05, 2, 6, false), 0x8a7060);
    b.add('paint', tube([[-W + 0.07, 3.2, Z0], [-W + 0.07, 3.2, Z1]], 0.035, 2, 6, false), 0x6a7a5a);
    // the ceiling slab over the drop grid
    b.add('concrete', cbox(W * 2 + 0.5, 0.2, Z1 - Z0, 0.01), 0x6a6a64, at(0, H + 0.1, (Z0 + Z1) / 2), { rep: 1.6 });
    // doors down the left: recessed frames, panelled leaves with wired lights (one ajar onto the dark)
    for (const [dz, open] of [[4.5, 0], [12.5, 1], [20.5, 0]] as [number, number][]) {
      b.add('paint', cbox(0.2, 2.3, 0.1, 0.01), 0x4a5240, at(-W + 0.02, 1.15, dz - 0.6));
      b.add('paint', cbox(0.2, 2.3, 0.1, 0.01), 0x4a5240, at(-W + 0.02, 1.15, dz + 0.6));
      b.add('paint', cbox(0.2, 0.12, 1.3, 0.01), 0x4a5240, at(-W + 0.02, 2.32, dz));
      const m = open ? at(-W - 0.02 + 0.38, 1.08, dz - 0.52 + 0.42, 0, -1.0, 0) : at(-W - 0.02, 1.08, dz);
      const leaf = new THREE.Matrix4().copy(m);
      b.add('wood', cbox(0.05, 2.14, 1.05, 0.01), 0x7a6040, leaf, { grain: 'y' });
      b.add('metal', cbox(0.07, 0.04, 0.16, 0.01), 0x9a9a90, new THREE.Matrix4().multiplyMatrices(leaf, at(0.04, 0, 0.36)));
      b.add('metal', cbox(0.06, 0.48, 0.34, 0.01), 0x2a2e2c, new THREE.Matrix4().multiplyMatrices(leaf, at(0.01, 0.48, 0)));
      if (open) b.add('concrete', cbox(0.02, 2.2, 1.1, 0.01), 0x0a0a0c, at(-W - 0.12, 1.1, dz));
    }
    this.scene.add(b.build(this.mats));
    // water damage: streaks under the window heads and down the tiles
    for (const wz of WIN) for (const s of [-1, 1]) this.dress.streaks(at(W - 0.005, HEAD - 0.4, wz + s * (WW / 2 + 0.25), 0, -Math.PI / 2, 0), 0.4, 1.6, 0.55);
    for (const z0 of [2, 8.5, 16]) this.dress.streaks(at(-W + 0.005, 2.6, z0, 0, Math.PI / 2, 0), 1.2, 2.2, 0.4);
  }

  // ------------------------------------------------------------------ the windows: steel frames, rain glass, the moon's shafts
  private windows() {
    const b = new FacetBuilder();
    for (let i = 0; i < WIN.length; i++) {
      const wz = WIN[i];
      const g = rainGlass(WW, HEAD - SILL, { seed: 1.7 + i * 2.31, bright: 0.95 });
      g.mesh.position.set(W + 0.16, (SILL + HEAD) / 2, wz); g.mesh.rotation.y = -Math.PI / 2;
      this.scene.add(g.mesh); this.glass.push(g);
      // the steel frame: a mullion, a transom, glazing bars, a deep sill
      b.add('paint', cbox(0.08, HEAD - SILL, 0.06, 0.01), 0x3a4440, at(W + 0.08, (SILL + HEAD) / 2, wz));
      b.add('paint', cbox(0.08, 0.06, WW, 0.01), 0x3a4440, at(W + 0.08, 2.3, wz));
      for (const y of [1.45, 2.65]) b.add('paint', cbox(0.04, 0.025, WW, 0.006), 0x3a4440, at(W + 0.1, y, wz));
      for (const s of [-1, 1]) b.add('paint', cbox(0.1, HEAD - SILL + 0.1, 0.07, 0.01), 0x343c38, at(W + 0.06, (SILL + HEAD) / 2, wz + s * WW / 2));
      b.add('paint', cbox(0.1, 0.07, WW + 0.1, 0.01), 0x343c38, at(W + 0.06, HEAD, wz));
      b.add('paint', cbox(0.3, 0.05, WW + 0.12, 0.01), 0xb8b09a, at(W - 0.02, SILL, wz));
      // a pane gone: boarded over on one window, cardboard on another
      if (i === 1) for (let k = 0; k < 3; k++) b.add('wood', cbox(0.03, 0.16, WW * 0.55, 0.01), 0x8a6a44, at(W + 0.03, 1.7 + k * 0.22, wz + 0.4, 0.06 * (k - 1), 0, 0), { grain: 'z' });
      // the shafts: one per light of the window (the mullion splits it), thrown down onto the floor
      for (const s of [-1, 1]) {
        const z0 = wz + (s < 0 ? -WW / 2 + 0.05 : 0.05), z1 = wz + (s < 0 ? -0.05 : WW / 2 - 0.05);
        const r = [new THREE.Vector3(W + 0.1, SILL + 0.05, z0), new THREE.Vector3(W + 0.1, SILL + 0.05, z1), new THREE.Vector3(W + 0.1, HEAD - 0.05, z1), new THREE.Vector3(W + 0.1, HEAD - 0.05, z0)];
        const bm = beam(r, MOON, 5.2, 0x9ab2ff);
        const base = i === 1 && s > 0 ? 0.004 : 0.016;
        this.scene.add(bm.mesh); this.beams.push({ u: bm.u, base });
      }
      this.scene.add(puddle(W - 0.7 - (i % 2) * 0.3, wz + (i % 3 - 1) * 0.4, 1.1 + (i % 2) * 0.5, 0.8 + (i % 3) * 0.2));
    }
    this.scene.add(b.build(this.mats));
  }

  // ------------------------------------------------------------------ the drop ceiling, its troughs, the one that stutters
  private ceiling() {
    const b = new FacetBuilder();
    const Y = H - 0.18;
    let n = 0;
    for (let z = Z0 + 0.3; z < Z1; z += 0.6) for (let x = -W + 0.3; x < W; x += 0.6) {
      n++;
      const hsh = Math.sin(n * 12.9898 + 4.1) * 43758.5453, r = hsh - Math.floor(hsh);
      // grid T-bars
      b.add('metal', cbox(0.6, 0.02, 0.02, 0.004), 0x5a5850, at(x, Y - 0.01, z - 0.3));
      if (x < W - 0.6) b.add('metal', cbox(0.02, 0.02, 0.6, 0.004), 0x5a5850, at(x + 0.3, Y - 0.01, z));
      if (Math.abs(z - 9) < 1 || Math.abs(z - 13) < 1.1 || Math.abs(z - 1) < 0.5 || Math.abs(z - 17) < 0.5) continue; // troughs here
      if (r < 0.14) continue; // a missing panel: the slab and the ducts show through
      if (r < 0.2) { b.add('paint', cbox(0.58, 0.02, 0.58, 0.004), 0xb4ac94, at(x, Y - 0.25, z + 0.1, 0.5 + r, 0, 0.2)); continue; } // hanging by a corner
      b.add('paint', cbox(0.58, 0.02, 0.58, 0.004), r < 0.4 ? 0xa89c7e : 0xc8c2ac, at(x, Y, z), { rep: 0.5 });
    }
    // ducting seen through the gaps
    b.add('metal', cbox(0.5, 0.3, Z1 - Z0, 0.02), 0x7a7a74, at(-0.9, H - 0.05, (Z0 + Z1) / 2));
    // troughs: lit ones at the ends, the stutterer in the middle, a dead one hanging from one chain
    const trough = (z: number, lit: boolean) => {
      b.add('enamel', cbox(0.34, 0.1, 1.3, 0.02), 0xb8b4a0, at(0, Y - 0.06, z));
      b.add('metal', cbox(0.3, 0.012, 1.24, 0.003), 0x3a3a38, at(0, Y - 0.11, z));
      if (!lit) for (const x of [-0.06, 0.06]) b.add('glass', prism(0.017, 1.2, 6), 0x40444a, at(x, Y - 0.12, z, Math.PI / 2));
    };
    trough(1, true); trough(17, true);
    for (const x of [-0.06, 0.06]) { b.add('lamp', prism(0.017, 1.2, 6), 0xfff2dc, at(x, Y - 0.12, 1, Math.PI / 2)); b.add('lamp', prism(0.017, 1.2, 6), 0x8a98b0, at(x, Y - 0.12, 17, Math.PI / 2)); }
    trough(9, false);
    const tubes = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 1.2, 6), this.flickTube);
    tubes.rotation.x = Math.PI / 2; tubes.position.set(0, Y - 0.13, 9);
    const t2 = tubes.clone(); tubes.position.x = -0.06; t2.position.x = 0.06;
    this.scene.add(tubes, t2);
    this.scene.add(b.build(this.mats, { cast: false }));
    // the hanging one: its own group so it can sway a little
    const hb = new FacetBuilder();
    hb.add('enamel', cbox(0.34, 0.1, 1.3, 0.02), 0xa8a490, at(0, 0, -0.62));
    hb.add('glass', prism(0.017, 1.2, 6), 0x40444a, at(-0.06, -0.06, -0.62, Math.PI / 2));
    hb.add('metal', prism(0.006, 0.5, 4), 0x2a2a2a, at(0, 0.25, 0));
    const hang = hb.build(this.mats);
    hang.position.set(0.6, Y - 0.5, 13.6); hang.rotation.x = -0.95;
    this.hanging = hang;
    this.scene.add(hang);
    // cables out of the hole over it
    for (let i = 0; i < 3; i++) this.dress.droop([0.3 + i * 0.12, Y, 12.4 + i * 0.2], [0.55 + i * 0.08, Y - 0.9 - i * 0.25, 13.1 + i * 0.15], 0.25, 0.008, [0x1a1a1a, 0x6a2a1a, 0x2a3a6a][i]);
  }

  // ------------------------------------------------------------------ the far end: the double doors under the crest
  private farEnd() {
    const b = new FacetBuilder();
    b.add('tile', cbox(W * 2, 1.5, 0.14, 0.01), 0x9ab0a0, at(0, 0.75, Z0 - 0.07), { rep: 1.2 });
    b.add('paint', cbox(W * 2, H - 1.5, 0.14, 0.01), 0xc8c0a4, at(0, 1.5 + (H - 1.5) / 2, Z0 - 0.07), { ao: 2 });
    // the doorway, the two steel leaves, wired lights, push bars, a chain through the bars and its padlock
    b.add('paint', cbox(2.1, 2.5, 0.12, 0.01), 0x2a302c, at(0, 1.25, Z0 + 0.01));
    for (const s of [-1, 1]) {
      b.add('metal', cbox(0.96, 2.36, 0.06, 0.012), 0x6a7468, at(s * 0.49, 1.19, Z0 + 0.08));
      b.add('metal', cbox(0.34, 0.5, 0.02, 0.006), 0x1a1e20, at(s * 0.49, 1.6, Z0 + 0.115));
      b.add('glass', cbox(0.3, 0.46, 0.01, 0.004), 0x6a8aa0, at(s * 0.49, 1.6, Z0 + 0.125));
      b.add('chrome', cbox(0.7, 0.05, 0.05, 0.012), 0xc8ccd0, at(s * 0.45, 1.02, Z0 + 0.16));
      b.add('metal', cbox(0.06, 0.08, 0.1, 0.01), 0x6a6e70, at(s * 0.12, 1.02, Z0 + 0.13));
    }
    for (let i = 0; i < 7; i++) b.add('chrome', cbox(0.06, 0.03, 0.02, 0.006), 0x9a9890, at(-0.18 + i * 0.06, 1.0 + Math.sin(i * 0.9) * 0.05, Z0 + 0.2, 0, 0, i * 0.7));
    b.add('brass', cbox(0.08, 0.1, 0.035, 0.012), 0xd0a040, at(0.06, 0.88, Z0 + 0.21));
    // an exit lamp over the door (a green box, no words)
    b.add('metal', cbox(0.42, 0.16, 0.08, 0.01), 0x2a2e2c, at(0, 2.62, Z0 + 0.06));
    b.add('lamp', cbox(0.38, 0.12, 0.02, 0.004), 0x3aff7a, at(0, 2.62, Z0 + 0.11));
    // the crest: a brass roundel on the wall high over the door
    b.add('brass', lathe([[0, 0], [0.5, 0], [0.52, 0.03], [0.5, 0.06], [0, 0.06]], 24), 0xc8a050, at(0, 3.0 - 0.0, Z0 + 0.02, Math.PI / 2));
    // benches and a dead plant at the end
    for (const s of [-1, 1]) {
      b.add('wood', cbox(0.45, 0.06, 1.6, 0.01), 0x8a6a48, at(s * (W - 0.32), 0.45, Z0 + 2.2), { grain: 'z' });
      for (const z of [-0.65, 0.65]) b.add('metal', cbox(0.4, 0.42, 0.04, 0.01), 0x3a3a38, at(s * (W - 0.32), 0.21, Z0 + 2.2 + z));
    }
    b.add('rubber', lathe([[0, 0], [0.18, 0], [0.22, 0.4], [0, 0.4]], 8), 0x6a4a34, at(-W + 0.35, 0, Z0 + 0.45));
    for (let i = 0; i < 6; i++) b.add('wood', prism(0.012, 0.6 + i * 0.05, 4), 0x5a4a30, at(-W + 0.35 + Math.sin(i) * 0.08, 0.6, Z0 + 0.45 + Math.cos(i) * 0.08, Math.sin(i * 2) * 0.4, 0, Math.cos(i * 3) * 0.5));
    this.scene.add(b.build(this.mats));
    void crestTexture(64).then((tx) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.45, 32), new THREE.MeshStandardMaterial({ map: tx, transparent: true, alphaTest: 0.5, roughness: 0.45, metalness: 0.35 }));
      m.position.set(0, 3.0, Z0 + 0.09); m.receiveShadow = true;
      this.scene.add(m);
    }).catch(() => undefined);
    this.dress.extinguisher(at(-W + 0.02, 0.9, Z0 + 3.6, 0, Math.PI / 2, 0));
  }

  // ------------------------------------------------------------------ what the wing left on the floor
  private litter() {
    const b = new FacetBuilder();
    let s = 11;
    const R = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
    // a gurney on its side
    const gm = at(-1.15, 0.33, 11.2, 0, 0.35, Math.PI / 2 - 0.08);
    const G = (m: THREE.Matrix4) => new THREE.Matrix4().multiplyMatrices(gm, m);
    b.add('chrome', cbox(0.66, 0.05, 1.9, 0.01), 0xb8bcc0, G(at(0, 0.32, 0)));
    b.add('leather', cbox(0.6, 0.1, 1.8, 0.04), 0x4a6a6a, G(at(0, 0.4, 0)));
    for (const [x, z] of [[-0.3, -0.85], [0.3, -0.85], [-0.3, 0.85], [0.3, 0.85]]) {
      b.add('chrome', prism(0.015, 0.6, 6), 0xb8bcc0, G(at(x, 0.02, z)));
      b.add('rubber', prism(0.06, 0.04, 8), 0x1a1a1a, G(at(x, -0.3, z, Math.PI / 2)));
    }
    // a sheet slid off it
    b.add('sponge', jitter(cbox(1.2, 0.04, 1.4, 0.02), 0.04, 3), 0xd8d4c4, at(-0.55, 0.03, 11.4, 0, 0.6, 0));
    // fallen ceiling panels and rubble under the hole
    for (let i = 0; i < 6; i++) b.add('paint', cbox(0.58, 0.02, 0.58, 0.004), 0xb4ac94, at(0.2 + (R() - 0.5) * 1.6, 0.02 + i * 0.012, 13 + (R() - 0.5) * 1.8, (R() - 0.5) * 0.3, R() * 3, (R() - 0.5) * 0.2));
    for (let i = 0; i < 26; i++) {
      const r = 0.04 + R() * 0.12;
      b.add('concrete', jitter(cbox(r, r * 0.7, r, r * 0.3), r * 0.25, i), 0x8a8478, at(0.5 + (R() - 0.5) * 1.4, r * 0.3, 12.8 + (R() - 0.5) * 1.4, R(), R() * 3, R()), { rep: 0.3 });
    }
    // a stepladder left under it, an office chair on its back, a wet-floor board fallen flat
    b.add('metal', cbox(0.05, 1.8, 0.05, 0.01), 0x9a9a94, at(1.3, 0.85, 12.2, 0.18, 0, 0));
    b.add('metal', cbox(0.05, 1.8, 0.05, 0.01), 0x9a9a94, at(1.75, 0.85, 12.2, 0.18, 0, 0));
    b.add('metal', cbox(0.05, 1.8, 0.05, 0.01), 0x9a9a94, at(1.3, 0.85, 12.75, -0.18, 0, 0));
    b.add('metal', cbox(0.05, 1.8, 0.05, 0.01), 0x9a9a94, at(1.75, 0.85, 12.75, -0.18, 0, 0));
    for (let i = 0; i < 5; i++) b.add('metal', cbox(0.5, 0.03, 0.09, 0.008), 0xb8b8b0, at(1.52, 0.3 + i * 0.32, 12.2 + 0.05 * (5 - i) * 0.4, 0.18, 0, 0));
    b.add('leather', cbox(0.48, 0.1, 0.46, 0.04), 0x2a2a30, at(-1.4, 0.32, 6.2, 1.45, 0.4, 0));
    b.add('leather', cbox(0.46, 0.5, 0.08, 0.04), 0x2a2a30, at(-1.4, 0.06, 6.55, 1.5, 0.4, 0));
    b.add('chrome', prism(0.02, 0.4, 6), 0x9a9ea2, at(-1.4, 0.5, 6.0, 1.45, 0.4, 0));
    b.add('paint', cbox(0.3, 0.02, 0.6, 0.004), 0xe8c428, at(0.9, 0.012, 7.5, 0, 0.7, 0));
    // cardboard boxes against the tile, a filing cabinet with a drawer out
    this.scene.add(b.build(this.mats));
    const bx = new FacetBuilder();
    for (let i = 0; i < 5; i++) { const w = 0.42 + R() * 0.1, hh = 0.3 + R() * 0.06; bx.add('wood', cbox(w, hh, 0.34, 0.01), [0xb89a6a, 0xa88a5a, 0xc8aa7a][i % 3], at(-W + 0.3 + (i % 2) * 0.05, hh / 2 + (i % 3 === 2 ? 0.33 : 0), 15.2 + i * 0.36, 0, (R() - 0.5) * 0.4, 0), { rep: 0.3 }); }
    this.scene.add(bx.build(this.mats));
    this.dress.filing(at(-W + 0.25, 0, 8.6, 0, Math.PI / 2, 0), { open: 1, seed: 3 });
    // papers everywhere, flat on the floor and drifted against the wall
    for (let i = 0; i < 46; i++) {
      const p = paper(['~', '~', '~'], 0.21, 0.29, { seed: 31 + i, ppm: 140 });
      const x = (R() - 0.5) * (W * 2 - 0.4), z = Z0 + 1 + R() * 19;
      p.position.set(x, 0.006 + i * 0.0004, z); p.rotation.set(-Math.PI / 2, 0, R() * 6.28);
      this.scene.add(p);
    }
  }

  // ------------------------------------------------------------------ frame
  frame(aspect: number, portrait: boolean) {
    this.cam.aspect = aspect;
    this.cam.fov = portrait ? 62 : 42;
    this.cam.updateProjectionMatrix();
  }
  pointer(nx: number, ny: number) { this.ptr.set(nx, ny); }
  /** the lightning: called on its own timer, or by the logo's reveal */
  strike(k = 1) { this.flash = Math.max(this.flash, k); this.thunderAt = 0.9 + Math.random() * 1.4; }

  update(dt: number, t: number, full: boolean) {
    if (this.t0 < 0) this.t0 = t;
    const tt = t - this.t0;
    // the shot: down the corridor over a minute and a half, easing in and out, then back as slowly
    const P = 95, ph = (tt % (P * 2)) / P, k = easeIO(ph < 1 ? ph : 2 - ph);
    this.k = Math.min(1, tt / 12);
    this.ptrS.x = damp(this.ptrS.x, this.ptr.x, 1.6, dt); this.ptrS.y = damp(this.ptrS.y, this.ptr.y, 1.6, dt);
    const z = 19.2 - 8.6 * k;
    const bx = Math.sin(tt * 0.31) * 0.05 + Math.sin(tt * 0.71) * 0.02, by = Math.sin(tt * 0.43) * 0.03;
    this.cam.position.set(0.28 - 0.3 * k + bx + this.ptrS.x * 0.14, 1.58 + by - this.ptrS.y * 0.08, z);
    this.v.set(-0.05 + this.ptrS.x * 0.5, 1.48 - this.ptrS.y * 0.3 + by * 0.5, Z0);
    this.cam.lookAt(this.v);
    this.cam.rotateZ(Math.sin(tt * 0.23) * 0.006);
    // lightning
    this.nextFlash -= dt;
    if (this.nextFlash <= 0) { this.strike(0.6 + Math.random() * 0.5); this.nextFlash = 14 + Math.random() * 16; }
    if (this.thunderAt > 0) { this.thunderAt -= dt; if (this.thunderAt <= 0) sample('leviathan_rumble', 0.55, 0.85 + Math.random() * 0.15); }
    const fl = this.flash > 0.02 ? this.flash * (0.55 + 0.45 * Math.max(0, Math.sin(tt * 47))) : 0;
    this.flash = Math.max(0, this.flash - dt * 2.4);
    this.moon.intensity = 4.2 + fl * 4;
    for (const g of this.glass) { g.u.uT.value = tt; g.u.uFlash.value = fl; }
    for (const b of this.beams) b.u.uInt.value = b.base * (1 + fl * 1.2);
    // the stutterer: on most of the time, dropping out in bursts, a tick each time it catches
    this.flickT -= dt;
    if (this.flickT <= 0) { this.flickV = Math.random() < 0.7 ? 1 : 0; this.flickT = this.flickV ? 0.4 + Math.random() * 3 : 0.03 + Math.random() * 0.12; if (this.flickV && full && Math.random() < 0.3) sample('fluoro_tick', 0.25); }
    const on = this.flickV * (0.85 + 0.15 * Math.sin(tt * 120));
    this.flick.intensity = on * 9;
    this.flickTube.color.setScalar(0.08 + on * 1.9);
    this.flickCone.u.uInt.value = on * 0.06;
    this.exitLight.intensity = 0.5 + 0.1 * Math.sin(tt * 3);
    this.nearLight.intensity = 2.2 * (0.9 + 0.1 * Math.sin(tt * 2.1));
    if (this.hanging) this.hanging.rotation.z = Math.sin(tt * 0.9) * 0.03;
    if (full) {
      this.dress.update(t);
      this.dust.update(tt, this.flick.position, this.v.set(0, -1, 0), Math.cos(1.2), Math.cos(0.4), 3.2 * on, new THREE.Color(0xdfe8ff), 0.22 + fl * 0.6);
    }
  }
}
