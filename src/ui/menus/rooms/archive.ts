// THE CODEX ARCHIVE, A-1: the menu's data archive, where every file the
// Institute keeps is pulled and projected. A long, tall records hall under
// three cold fluorescent troughs (real cones with shadows and dust in them),
// an amber banker's lamp on the reading desk, green index terminals, wet
// patches on the polished floor, and everything a records clerk leaves.
//   back wall     FIVE CABINETS, one per drawer of files: Inhabitants, Items,
//                 Places, Anomaly events, Research files (each with its lamp and
//                 its count). Press one: the drawer rolls out and the file tabs
//                 float over it in Alagard (scroll, pick).
//   centre        THE PROJECTION TABLE: pull a file and the folder drops into
//                 the slot; the lens throws a hologram of what the file is
//                 about (rooms/holo.ts) with its detail floating round it.
//   around        archive stacks (box files, binders, ledgers), a rolling ladder,
//                 the reading desk, the index terminals; and the Institute's
//                 secrets (rooms/vault.ts): a locker wall of sealed vault doors
//                 over the cabinets, containment cell A-07 in the left wall
//                 (padded, wired glass, its own cold lamp, a split-off jelly
//                 residue quivering inside, placard, keypad, palm reader, a
//                 terminal scrolling its redacted log), the sealed door of
//                 Vault B in the right wall (hazard-striped, wheel-locked,
//                 a beacon sweeping red) between the server racks, cases of
//                 anomalous objects on the floor, pipes with valves and gauges,
//                 hazard bands, stencils and a low fog over the floor.
// Its props answer a press (rooms/pokes.ts): the jelly in A-07 quivers at a
// tap on the glass, the vault wheel grinds a quarter turn, valves turn and
// hiss, the troughs stutter, a drawer slides, a dossier opens; each puts up a
// note on an in-scene readout plate.
// In the projection: drag to orbit, wheel / pinch to zoom, ← → flip pages,
// R plays the recording (the thing moves, the text dictates itself, the
// sound plays), Q / E the next file in the drawer, Esc back to the drawer.
import * as THREE from 'three';
import type { FMats } from '../scene/pixtex';
import { Dust, shaftMesh } from '../scene/fx';
import type { Hot, StageRoom, Grade } from '../monitor/stage';
import { bitText } from '../../../gfx/bitfont';
import { FacetBuilder, at, cbox, prism, lathe, hull, tube, bolt, C, LedBank, blink, busy, plate, paper, slab, glowCard, crtSet, uiSound, gameSound } from '../monitor/props';
import { feedTube } from '../monitor/feed';
import { onFile } from '../../../game/meridian';
import { CATS, archiveFiles, catCounts, type CatKey, type ArchiveFile } from './archiveData';
import { holoModel, HOLO_U } from './holo';
import { grime } from './research';
import { Dresser } from './dress';
import { Vault } from './vault';
import { Pokes } from './pokes';
import { U } from '../../../gfx/materials';
import './archive.css';

const W = 3.9, BACK = -3.6, FRONT = 3.4, H = 3.5;
const TABLE = new THREE.Vector3(0, 0.92, 0.55);
const HOLO_C = new THREE.Vector3(TABLE.x, TABLE.y + 0.42, TABLE.z);
const CAB_X = [-2.1, -1.05, 0, 1.05, 2.1];
const CAB_Z = BACK + 0.4;
/** the containment cell in the left wall (opening along z, height) and the vault door in the right wall */
const CELL = { z: -2.2, w: 1.3, h: 2.1, d: 1.0 };
const VDOOR = { z: -2.65, w: 1.2, h: 2.2 };
const CELL_F = 0.13, VDOOR_J = 0.2;
const DRAWER_Y = 1.12;
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c]);
type Pose = { pos: THREE.Vector3; look: THREE.Vector3; fov: number };
const P = (p: [number, number, number], l: [number, number, number], fov = 52): Pose => ({ pos: new THREE.Vector3(...p), look: new THREE.Vector3(...l), fov });
const POSES: Record<string, Pose> = {
  room: P([0.35, 2.05, 3.25], [0, 1.15, -1.9], 58),
  build: P([1.0, 3.0, 3.1], [0, 0.3, -0.4], 56),
};
const cabPose = (i: number) => P([CAB_X[i] * 0.86, 1.72, CAB_Z + 1.55], [CAB_X[i], 1.02, CAB_Z + 0.55], 50);

interface Cabinet { cat: CatKey; drawer: THREE.Group; out: number; want: number; lamp: ReturnType<LedBank['add']>; tabs: THREE.Group; label: THREE.Group }

export class CodexArchive implements StageRoom {
  id = 'archive';
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(56, 16 / 9, 0.03, 40);
  feedCam = new THREE.PerspectiveCamera(72, 4 / 3, 0.05, 40);
  hots: Hot[] = [];
  // dim and secretive: cold pools under the troughs, a blue-grey haze filling the gaps, red from the vault door
  grade: Grade = { exposure: 1.62, lift: [0.8, 0.92, 1.14], gain: [1.1, 1.0, 0.88], vig: 0.6, sat: 1.1, contrast: 1.16, side: [1, 0, 0, 0.3], haze: 0.5, hazeColor: 0x4a5a7a, ao: 0.9, scatter: 0.55, bounce: 0.22, shafts: [new THREE.Vector3(0, H - 0.45, -2.0), new THREE.Vector3(0, H - 0.45, 0.6), new THREE.Vector3(-2.4, H - 0.45, 2.0)], shaftK: 0.6, shaftColor: 0xdce8ff };
  deco = new THREE.Group();
  floor = { minX: -W + 1.0, maxX: W - 1.0, minZ: 1.4, maxZ: 2.6, y: 0 };
  surfaces = [{ minX: -3.05, maxX: -2.15, minZ: 1.35, maxZ: 1.95, y: 0.78 }];
  guideSpot = { pos: new THREE.Vector3(1.55, 0, 1.75), look: new THREE.Vector3(0, 1.4, 0.4) };
  actions: { key: string; label: string; run: () => void }[] = [];
  /** the archive took the screen (a drawer or the projection is up): title.ts hides its HUD */
  onFocus?: (on: boolean) => void;
  /** a world point to a client point (title.ts hands over the stage's) */
  project?: (p: THREE.Vector3) => { x: number; y: number } | null;
  /** the floating words' layer (title.ts hands over its root) */
  layer: HTMLElement = document.createElement('div');
  state: 'room' | 'drawer' | 'holo' = 'room';
  /** the props that answer a press (rooms/pokes.ts): the kit's, and the troughs */
  private pokes = new Pokes(this.hots);
  private mats: FMats;
  private leds = new LedBank(220);
  /** the set dressing (rooms/dress.ts) */
  private dress!: Dresser;
  /** the containment kit (rooms/vault.ts): the cell, the vault door, the cases, the racks */
  private vault!: Vault;
  private hemi = new THREE.HemisphereLight(0xa8bcd8, 0x3a3230, 0.62);
  /** the cell's own cold lamp, and the vault door's beacon spilling red */
  private cellL = new THREE.PointLight(0xa8dcff, 2.6, 2.8, 1.7);
  private redL = new THREE.PointLight(0xff2a14, 0, 3.8, 1.7);
  /** a caged downlight over the vault door, and a washer raking the locker wall */
  private doorL = new THREE.SpotLight(0xd0dcff, 16, 4.4, 0.66, 0.7, 1.5);
  private lockL = new THREE.SpotLight(0xc8d8ff, 7, 4.6, 1.0, 0.8, 1.6);
  private stackFill = [new THREE.PointLight(0x9ab8e8, 1.6, 4.5, 1.6), new THREE.PointLight(0xffc890, 1.3, 4.5, 1.6)];
  private tubes: { light: THREE.SpotLight; mat: THREE.MeshBasicMaterial; base: number; seed: number; flick: number; shaft: ReturnType<typeof shaftMesh> }[] = [];
  private lamp = new THREE.SpotLight(0xffb468, 0, 3.2, 0.75, 0.55, 1.7);
  private lampOn = 1; private lampLvl = 1; private lampMat = new THREE.MeshBasicMaterial({ color: 0xffd8a0, toneMapped: false });
  private lens = new THREE.PointLight(0x6ae8ff, 0.6, 3.4, 1.6);
  private lensMat = new THREE.MeshBasicMaterial({ color: 0x3ac8e8, toneMapped: false });
  private cone: THREE.Mesh;
  private coneU = { uInt: { value: 0.0 }, uColor: { value: new THREE.Color(0x6ae8ff) } };
  private exitGlow = new THREE.PointLight(0xff3a2a, 0.5, 2.2, 2);
  private termGlow = new THREE.PointLight(0x5aff8a, 0.6, 2.2, 1.8);
  private dust: Dust;
  private cabs: Cabinet[] = [];
  private terms: { tb: ReturnType<typeof feedTube>; cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; acc: number }[] = [];
  private folder = new THREE.Group(); private folderT = -1;
  // the projection
  private holo: { group: THREE.Group; tick: (t: number, rec: boolean) => void } | null = null;
  private holoRoot = new THREE.Group();
  private unfold = 0;
  private cat: CatKey = 'inhabitants';
  private files: ArchiveFile[] = [];
  private fi = 0; private page = 0; private scroll = 0; private pick = 0;
  private rec = false; private recT = 0; private voiceT = 0;
  private orbit = { yaw: 0.35, pitch: 0.12, r: 1.75, yawV: 0, drag: false, lx: 0, ly: 0, idle: 0 };
  // the words
  private idx = document.createElement('div');
  private hud = document.createElement('div');
  private anchors: { el: HTMLElement; p: THREE.Vector3; dx: number; dy: number; align: 'l' | 'r' | 'c' }[] = [];
  private typed = 0;
  // camera
  private pose: Pose = POSES.room; private camP = POSES.room.pos.clone(); private camL = POSES.room.look.clone(); private camF = POSES.room.fov;
  private ptr = new THREE.Vector2(); private ptrS = new THREE.Vector2();
  private build = 0; private buildT = 0;
  private t = 0;
  private v = new THREE.Vector3();
  private dirty = true;

  constructor(mats: FMats) {
    this.mats = mats;
    const S = this.scene;
    S.background = new THREE.Color(0x000000);
    this.dust = new Dust(260, new THREE.Box3(new THREE.Vector3(-W + 0.4, 0.2, BACK + 0.6), new THREE.Vector3(W - 0.4, H - 0.3, FRONT - 0.6)));
    const sh = shaftMesh(10);
    this.cone = sh.mesh; this.coneU = sh.u as any;
    S.add(this.pokes.group);
    S.add(this.shell(), this.fixtures(), this.cabinets(), this.stacks(), this.table(), this.desk(), this.terminals(), this.dressing(), this.leds.mesh, this.dust.points, this.deco, this.hemi, this.holoRoot, this.cellL, this.redL, this.doorL, this.doorL.target, this.lockL, this.lockL.target);
    this.deco.name = 'deco';
    this.feedCam.position.set(-W + 0.4, H - 0.35, FRONT - 0.5); this.feedCam.lookAt(0.6, 0.9, -1.2);
    this.cam.position.copy(this.camP); this.cam.lookAt(this.camL);
    this.actions = CATS.map((c, i) => ({ key: c.key, label: c.name, run: () => this.openDrawer(i) }));
    this.layer.className = 'ax';
    this.idx.className = 'ax-idx'; this.hud.className = 'ax-hud';
    this.layer.append(this.idx, this.hud);
    onFile(() => { this.dirty = true; });
    this.refresh();
  }

  /** re-read the counts (cabinet labels, terminals) */
  refresh() {
    this.dirty = false;
    for (const c of this.cabs) {
      const n = catCounts(c.cat);
      const h = this.hots.find((q) => q.key === 'cab:' + c.cat);
      if (h) h.sub = `${n.known} of ${n.total} on file · pull a file`;
      c.lamp.level = n.known ? 1 : 0.15;
    }
  }

  // ================================================================== the shell
  private shell(): THREE.Group {
    const g = new THREE.Group();
    const b = new FacetBuilder();
    // polished concrete, a dado of olive paint, the plaster above, a coffered ceiling
    slab(b, 'floor', -W, W, -0.1, 0, BACK - 0.2, FRONT, 0x8c9088, 0.004, 0.8);
    slab(b, 'concrete', -W, W, H, H + 0.12, BACK - 0.2, FRONT, 0x4a4c48);
    for (let x = -W + 0.7; x < W; x += 0.7) b.add('metal', cbox(0.05, 0.12, FRONT - BACK, 0.006), 0x3a3c3a, at(x, H - 0.06, (FRONT + BACK) / 2));
    const wall = (x0: number, x1: number, z0: number, z1: number, y0 = 0) => { if (y0 < 1.2) slab(b, 'paint', x0, x1, y0, 1.2, z0, z1, 0x5a6448, 0.004, 0.5); slab(b, 'concrete', x0, x1, Math.max(1.2, y0), H, z0, z1, 0xa8a49a); };
    // the side walls run round their openings: the cell (left) and the vault door (right)
    const sideWall = (x0: number, x1: number, holes: [number, number, number][]) => {
      let z = BACK;
      for (const [a, c, top] of holes) { wall(x0, x1, z, a); wall(x0, x1, a, c, top); z = c; }
      wall(x0, x1, z, FRONT);
    };
    const cellHole: [number, number, number] = [CELL.z - CELL.w / 2, CELL.z + CELL.w / 2, CELL.h];
    const doorHole: [number, number, number] = [VDOOR.z - VDOOR.w / 2 - VDOOR_J, VDOOR.z + VDOOR.w / 2 + VDOOR_J, VDOOR.h + VDOOR_J];
    wall(-W, W, BACK - 0.2, BACK); sideWall(-W - 0.2, -W, [cellHole]); sideWall(W, W + 0.2, [doorHole]); wall(-W, W, FRONT, FRONT + 0.2);
    const rail = (x0: number, x1: number, z0: number, z1: number) => { slab(b, 'paint', x0, x1, 1.18, 1.24, z0, z1, 0x3a4230, 0.008); slab(b, 'rubber', x0, x1, 0, 0.1, z0, z1, 0x222222, 0.006); };
    rail(-W, W, BACK, BACK + 0.03);
    rail(-W, -W + 0.03, BACK, cellHole[0] - CELL_F); rail(-W, -W + 0.03, cellHole[1] + CELL_F, FRONT);
    rail(W - 0.03, W, BACK, doorHole[0]); rail(W - 0.03, W, doorHole[1], FRONT);
    // a floor drain, hazard tape round the projection table, a worn path to the cabinets
    for (const [x0, z0, x1, z1] of [[-0.95, TABLE.z - 0.95, 0.95, TABLE.z - 0.9], [-0.95, TABLE.z + 0.9, 0.95, TABLE.z + 0.95], [-0.95, TABLE.z - 0.95, -0.9, TABLE.z + 0.95], [0.9, TABLE.z - 0.95, 0.95, TABLE.z + 0.95]] as [number, number, number, number][]) b.add('hazard', cbox(x1 - x0, 0.004, z1 - z0, 0.001), 0xffffff, at((x0 + x1) / 2, 0.002, (z0 + z1) / 2), { rep: 0.25 });
    b.add('rust', cbox(0.36, 0.012, 0.36, 0.003), 0x9a8a78, at(1.4, 0.004, 1.9));
    // ducting and a cable tray overhead, conduit drops
    b.add('metal', hull([[-W, H - 0.02, BACK + 0.2], [-W + 0.5, H - 0.02, BACK + 0.2], [-W, H - 0.45, BACK + 0.2], [-W + 0.5, H - 0.45, BACK + 0.2], [-W, H - 0.02, FRONT], [-W + 0.5, H - 0.02, FRONT], [-W, H - 0.45, FRONT], [-W + 0.5, H - 0.45, FRONT]]), 0x8a8e8a, undefined, { rep: 0.6 });
    b.add('metal', cbox(0.4, 0.06, FRONT - BACK - 0.4, 0.008), C.dark, at(W - 0.5, H - 0.3, (FRONT + BACK) / 2));
    for (let i = 0; i < 16; i++) b.add('rubber', cbox(0.36, 0.03, 0.02, 0.006), [0x1a1a1a, 0x8a2a1a, 0x2a4a8a, 0x1a1a1a][i % 4], at(W - 0.5, H - 0.26, BACK + 0.3 + i * 0.42));
    // the door (front right) and its EXIT box
    b.add('paint', cbox(1.0, 2.15, 0.06, 0.01), 0x4a5a52, at(2.6, 1.075, FRONT - 0.03));
    b.add('metal', cbox(0.3, 0.4, 0.02, 0.005), 0x22282a, at(2.6, 1.6, FRONT - 0.065));
    b.add('enamel', cbox(0.4, 0.16, 0.08, 0.01), 0xe8e8e0, at(2.6, 2.4, FRONT - 0.06));
    g.add(b.build(this.mats));
    const ex = plate(this.mats, ['EXIT'], 0.34, 0.11, { bg: 0x1a8a3a, ink: 0xe8ffe8, emissive: true, px: 360 });
    ex.position.set(2.6, 2.4, FRONT - 0.105); ex.rotation.y = Math.PI; g.add(ex);
    this.exitGlow.position.set(2.6, 2.3, FRONT - 0.4); this.exitGlow.color.setHex(0x3aff6a); g.add(this.exitGlow);
    // grime and wet: stains down the walls, a puddle that holds the troughs' light
    g.add(grime(7.2, 1.1, 51, 0.5).translateY(0.55).translateZ(BACK + 0.012));
    const lz0 = cellHole[1] + CELL_F + 0.02, lw = grime(FRONT - lz0, 1.2, 77, 0.45); lw.rotation.y = Math.PI / 2; lw.position.set(-W + 0.012, 0.6, (lz0 + FRONT) / 2); g.add(lw);
    const rz0 = doorHole[1] + 0.02, rw = grime(FRONT - rz0, 1.2, 91, 0.45); rw.rotation.y = -Math.PI / 2; rw.position.set(W - 0.012, 0.6, (rz0 + FRONT) / 2); g.add(rw);
    const fl = grime(5.0, 5.0, 13, 0.4); fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0.004, 0.5); g.add(fl);
    for (const [x, z, w, d] of [[1.2, 1.9, 1.3, 0.8], [-1.4, -0.6, 0.9, 1.4], [0.3, 2.6, 0.7, 0.5]] as [number, number, number, number][]) {
      const wet = new THREE.Mesh(new THREE.CircleGeometry(0.5, 9), new THREE.MeshStandardMaterial({ color: 0x0a0c0c, roughness: 0.04, metalness: 0.6, transparent: true, opacity: 0.55, depthWrite: false }));
      wet.rotation.x = -Math.PI / 2; wet.scale.set(w, d, 1); wet.position.set(x, 0.006, z); wet.renderOrder = 2; wet.userData.noGlow = true; g.add(wet);
    }
    const sign = plate(this.mats, ['CODEX ARCHIVE A-1', 'M.I. OF LIMINALITY · RECORDS'], 1.0, 0.22, { bg: 0xc8c0a0 });
    sign.position.set(-1.6, 2.5, FRONT - 0.01); sign.rotation.y = Math.PI; g.add(sign);
    const hush = plate(this.mats, ['SILENCE', 'IN THE STACKS'], 0.42, 0.14, { bg: 0x2a3a34, ink: 0xd8ffe8 });
    hush.position.set(-W + 0.012, 2.45, -0.3); hush.rotation.y = Math.PI / 2; g.add(hush);
    return g;
  }

  // ================================================================== light: troughs with real cones, dust in them
  private fixtures(): THREE.Group {
    const g = new THREE.Group();
    const b = new FacetBuilder();
    const rows: [number, number, boolean][] = [[0, -2.0, true], [0, 0.6, true], [-2.4, 2.0, false]];
    rows.forEach(([x, z, shadow], i) => {
      const y = H - 0.5;
      b.add('enamel', hull([[x - 0.75, 0, z - 0.14], [x + 0.75, 0, z - 0.14], [x - 0.75, 0, z + 0.14], [x + 0.75, 0, z + 0.14], [x - 0.78, -0.1, z - 0.19], [x + 0.78, -0.1, z - 0.19], [x - 0.78, -0.1, z + 0.19], [x + 0.78, -0.1, z + 0.19]]), 0xd8d4c4, at(0, y + 0.1, 0));
      for (const dx of [-0.6, 0.6]) b.add('metal', prism(0.005, 0.4, 4), C.dark, at(x + dx, y + 0.3, z));
      const mat = new THREE.MeshBasicMaterial({ color: 0xf2f6ff, toneMapped: false });
      for (const dz of [-0.06, 0.06]) { const tg = prism(0.016, 1.42, 6); tg.rotateZ(Math.PI / 2); const m = new THREE.Mesh(tg, mat); m.position.set(x, y + 0.035, z + dz); m.userData.noGlow = true; g.add(m); }
      const L = new THREE.SpotLight(0xe4eeff, 0, 8.5, 1.05, 0.9, 1.45);
      L.position.set(x, y, z); L.target.position.set(x, 0, z + 0.05);
      if (shadow) { L.castShadow = true; L.shadow.mapSize.set(1024, 1024); L.shadow.camera.near = 0.2; L.shadow.camera.far = 4.5; L.shadow.bias = -0.0006; L.shadow.normalBias = 0.02; }
      g.add(L, L.target);
      // the visible cone: additive haze under the trough
      const sh = shaftMesh(10);
      sh.mesh.position.set(x, y - 0.02, z); sh.mesh.scale.set(1.0, (y - 0.1) * 0.92, 0.7); sh.u.uColor.value.setHex(0xcfe0ff); sh.u.uInt.value = 0.02;
      g.add(sh.mesh);
      const tb = { light: L, mat, base: shadow ? 40 : 22, seed: i * 3.7, flick: 0, shaft: sh };
      this.tubes.push(tb);
      this.pokes.add({ key: 'trough' + i, label: 'Fluorescent trough', sub: 'it hums · it stutters', m: at(x, y, z), box: [1.6, 0.18, 0.42], c: [0, 0.05, 0], notes: [{ head: 'Facilities', lines: ['The tubes stutter when a unit crosses over.', 'They also stutter when nobody is crossing. Report both.'], tone: 'memo' }], sounds: [{ g: 'fluoro_tick', v: 0.6 }, { g: 'flicker_buzz', v: 0.5, d: 100 }], act: () => { tb.flick = 1.1; } });
      const pool = glowCard(2.4, 2.8, 0xdfe8ff, 0.05); pool.rotation.x = -Math.PI / 2; pool.position.set(x, 0.005, z); g.add(pool);
    });
    g.add(b.build(this.mats, { cast: false }));
    // fills: cold over the left stacks, warm over the right (the desk's and the terminals' spill)
    this.stackFill[0].position.set(-W + 1.0, 2.4, -0.8); this.stackFill[1].position.set(W - 1.0, 2.2, -0.2);
    g.add(...this.stackFill);
    return g;
  }

  /**
   * The records room's services and its secrets (rooms/dress.ts, rooms/vault.ts): a containment cell in the left
   * wall with its locks and a terminal, the sealed door of Vault B in the right wall between the server racks and
   * the index terminals, the locker wall over the cabinets, cases of anomalous objects on the floor, pipes,
   * cable runs, hazard bands, stencils, fog on the floor; the clock, the climate panel, the leavings.
   */
  private dressing(): THREE.Group {
    const d = this.dress = new Dresser(this.mats, this.leds);
    d.pokes = this.pokes;
    const v = this.vault = new Vault(d, this.mats);
    const L = Math.PI / 2;
    // ---- the back wall: the locker wall over the cabinets (numbered vault doors, seals, a few standing open)
    v.lockers(at(0, 2.74, BACK + 0.42), 25, 3, 0.3);
    // ---- the left wall: the containment cell, its locks and its terminal, the crest over it
    const cm = at(-W, 0, CELL.z, 0, L);
    v.cell(cm, { w: CELL.w, h: CELL.h, d: CELL.d, rank: 'gluttony', cls: 'Swarm', id: 'A-07', holds: 'blob', lining: 'padded', light: 0xbfe0ff, side: -1 });
    v.crest(at(-W + 0.01, 2.68, CELL.z, 0, L), 0.22);
    v.terminal(at(-W + 0.01, 1.95, CELL.z + CELL.w / 2 + CELL_F + 0.26, 0, L - 0.5), { arm: 0.34, w: 0.3, head: 'CELL A-07 · LOG', i: 0 });
    v.stripes(-W + 0.08, CELL.z - CELL.w / 2 - CELL_F, -W + 0.2, CELL.z + CELL.w / 2 + CELL_F);
    v.stripes(-W + 0.6, CELL.z - CELL.w / 2 - CELL_F, -W + 0.72, CELL.z + CELL.w / 2 + CELL_F);
    v.stencil(-W + 0.42, CELL.z, 'KEEP CLEAR', 0.09, -L);
    this.cellL.position.copy(v.lamps.find((q) => q.kind === 'cell')!.p).add(new THREE.Vector3(0.35, 0, 0));
    // ---- the right wall: two racks against the back corner, the vault door, the clock and the climate panel above the racks
    v.rack(at(W - 0.42, 0, -1.05, 0, -L), { seed: 31, label: 'CODEX 01', hinge: 1 });
    v.rack(at(W - 0.42, 0, -0.45, 0, -L), { seed: 57, label: 'CODEX 02', hinge: 1 });
    v.blastDoor(at(W, 0, VDOOR.z, 0, -L), { w: VDOOR.w, h: VDOOR.h, id: 'B', name: 'VAULT B · DEEP ARCHIVE', rank: 'pride', sign: false });
    v.stripes(W - 0.75, VDOOR.z - VDOOR.w / 2 - VDOOR_J, W - 0.63, VDOOR.z + VDOOR.w / 2 + VDOOR_J);
    v.stencil(W - 0.42, VDOOR.z, 'VAULT B', 0.11, L);
    this.redL.position.copy(v.lamps.find((q) => q.kind === 'beacon')!.p).add(new THREE.Vector3(-0.6, -0.4, 0));
    d.clock(at(W - 0.01, 2.84, -1.05, 0, -L), 0.16);
    d.gauges(at(W - 0.01, 2.62, -0.35, 0, -L), 2, 1, { color: 0x3a4a3e, labels: ['CLIMATE', 'RH  ·  °C'], seed: 41 });
    v.sign(at(W - 0.01, 2.22, VDOOR.z + VDOOR.w / 2 + VDOOR_J + 0.2, 0, -L), 'auth', 0.18);
    v.downlight(at(W - 0.62, H, VDOOR.z));
    this.doorL.position.set(W - 0.62, H - 0.2, VDOOR.z); this.doorL.target.position.set(W + 0.35, 1.0, VDOOR.z);
    this.lockL.position.set(0, H - 0.12, BACK + 1.5); this.lockL.target.position.set(0, 2.5, BACK);
    // ---- pipes along both walls under the ceiling (marker bands, a valve, gauges), a drop to the vault door
    v.pipe([[-W + 0.1, 3.0, BACK + 0.05], [-W + 0.1, 3.0, FRONT - 0.1]], 0.05, 0x3a5a7a, { band: ['N2 · INERT', 0x6ab8e8], out: [1, 0, 0], gauges: [0] });
    v.pipe([[-W + 0.22, 3.12, BACK + 0.05], [-W + 0.22, 3.12, CELL.z + 0.4], [-W + 0.22, CELL.h + 0.35, CELL.z + 0.4]], 0.032, 0x8a6a3a, { band: ['CELL A AIR', 0xe8c228], out: [1, 0, 0], valves: [1] });
    v.pipe([[W - 0.1, 3.12, FRONT - 0.1], [W - 0.1, 3.12, VDOOR.z + VDOOR.w / 2 + 0.42], [W - 0.1, VDOOR.h + 0.62, VDOOR.z + VDOOR.w / 2 + 0.42], [W - 0.1, 2.1, VDOOR.z + VDOOR.w / 2 + 0.42]], 0.045, 0x7a2a22, { band: ['HALON · VAULT', 0xd8301e], out: [-1, 0, 0], valves: [2], gauges: [2] });
    // a cable tray across the room, loose loops down to the projection table's feed, bundles to the racks and the door
    d.tray([-W + 0.7, H - 0.32, -0.9], [W - 0.8, H - 0.32, -0.9], H, { seed: 8, cables: 9, w: 0.34 });
    d.droop([0.2, H - 0.34, -0.9], [0.0, 2.3, TABLE.z - 0.2], 0.12, 0.014, 0x1a1a1a);
    v.cables([W - 0.9, H - 0.34, -0.9], [W - 0.5, 2.6, -0.75], 4, 0.2, 0.01);
    v.cables([W - 0.9, H - 0.34, -0.9], [W - 0.3, VDOOR.h + 0.45, VDOOR.z], 3, 0.25, 0.008);
    // ---- the cases on the floor: anomalous objects under their own lamps
    // (each stands where it hides neither a cabinet, the cell nor the vault door from the room's camera)
    v.vitrine(at(-2.3, 0, -1.0, 0, 0.45), 'cube', { rank: 'envy', light: 0xc8b8ff });
    v.vitrine(at(2.62, 0, -1.6, 0, -0.5), 'watch', { rank: 'greed', light: 0xffe0b0 });
    v.vitrine(at(-2.95, 0, 0.75, 0, 0.9), 'shard', { rank: 'pride', light: 0xd8b8ff });
    // a dossier trolley by the right case
    const tr = at(2.55, 0, 1.1, 0, -0.5);
    d.b.add('metal', cbox(0.7, 0.025, 0.45, 0.006), C.steel, tr.clone().multiply(at(0, 0.82, 0)));
    d.b.add('metal', cbox(0.7, 0.025, 0.45, 0.006), C.steel, tr.clone().multiply(at(0, 0.3, 0)));
    for (const [dx, dz] of [[-0.33, -0.2], [0.33, -0.2], [-0.33, 0.2], [0.33, 0.2]]) { d.b.add('metal', prism(0.012, 0.82, 5), C.steel, tr.clone().multiply(at(dx, 0.43, dz))); d.b.add('rubber', prism(0.035, 0.025, 8), 0x1a1a1a, tr.clone().multiply(at(dx, 0.035, dz, Math.PI / 2))); }
    d.b.add('metal', tube([[-0.36, 0.84, -0.22], [-0.42, 1.0, -0.22], [-0.42, 1.0, 0.22], [-0.36, 0.84, 0.22]], 0.012, 8, 5, false), C.steel, tr.clone());
    v.dossiers(tr.clone().multiply(at(0, 0.835, 0)), 0.7, 0.45, { n: 3, seed: 5 });
    d.boxes(tr.clone().multiply(at(0, 0.315, 0)), 1, { seed: 77 });
    // ---- overflow, the filing cabinet capping the left run, the extinguisher, the desk
    d.boxes(at(-2.95, 0, 0.35, 0, L - 0.2), 2, { seed: 9 });
    d.boxes(at(3.0, 0, 0.4, 0, -L + 0.15), 2, { seed: 13 });
    d.filing(at(-W + 0.35, 0, 1.55, 0, L), { color: 0x5a6450, open: 2, seed: 4, labels: ['1979', '1983', 'VOID', 'A-1'] });
    d.clutter(at(-W + 0.35, 1.3, 1.55, 0, L), 0.36, 0.5, { seed: 29, mug: false, binder: true });
    d.extinguisher(at(-W + 0.01, 1.05, 2.3, 0, L));
    d.clutter(at(-2.75, 0.81, 1.65), 0.6, 0.5, { seed: 33, floppies: true, binder: false });
    v.dossiers(at(-2.45, 0.805, 1.6), 0.5, 0.5, { n: 2, seed: 12, open: false });
    d.puddle(-0.3, -1.7, 0.8, 0.5);
    d.puddle(W - 0.9, VDOOR.z + 0.3, 0.7, 0.9);
    // ---- the air: low fog over the whole floor, denser by the cell and the door
    v.fog(-W + 0.2, W - 0.2, BACK + 0.6, FRONT - 0.3, { k: 0.26, color: 0x7a90b0 });
    v.fog(-W + 0.2, -W + 1.6, CELL.z - 1.0, CELL.z + 1.0, { k: 0.3, color: 0x9ab8d8, layers: 2 });
    v.fog(W - 1.4, W - 0.2, VDOOR.z - 0.9, VDOOR.z + 1.0, { k: 0.26, color: 0xb87a70, layers: 2 });
    return d.done();
  }

  // ================================================================== the five cabinets
  private cabinets(): THREE.Group {
    const g = new THREE.Group();
    CATS.forEach((c, i) => {
      const x = CAB_X[i];
      const b = new FacetBuilder();
      const CW = 0.86, CH = 1.92, CD = 0.66;
      const steel = [0x6e7a64, 0x7a7e78, 0x6a7480, 0x746a7a, 0x7a6e62][i];
      b.add('paint', cbox(CW, CH, CD, 0.014), steel, at(x, CH / 2, CAB_Z), { rep: 0.5 });
      b.add('paint', cbox(CW + 0.04, 0.05, CD + 0.04, 0.01), 0x3a3e3a, at(x, CH + 0.025, CAB_Z));
      b.add('rubber', cbox(CW - 0.04, 0.08, CD - 0.04, 0.01), 0x1a1a1a, at(x, 0.04, CAB_Z));
      // the three fixed drawers (the second from the top is the one that runs)
      for (const dy of [0.38, 0.8, 1.64]) {
        b.add('paint', cbox(CW - 0.08, 0.36, 0.03, 0.01), mix(steel, 0xffffff, 0.08), at(x, dy, CAB_Z + CD / 2 + 0.01));
        b.add('chrome', cbox(0.22, 0.03, 0.04, 0.008), 0xffffff, at(x, dy + 0.06, CAB_Z + CD / 2 + 0.04));
        b.add('brass', cbox(0.12, 0.06, 0.012, 0.004), 0xffffff, at(x, dy + 0.13, CAB_Z + CD / 2 + 0.03));
      }
      g.add(b.build(this.mats));
      // the running drawer: a front, a box, folders inside
      const dr = new THREE.Group();
      const db = new FacetBuilder();
      db.add('paint', cbox(CW - 0.08, 0.36, 0.03, 0.01), mix(steel, 0xffffff, 0.12), at(0, 0, CD / 2 + 0.01));
      db.add('chrome', cbox(0.24, 0.035, 0.05, 0.008), 0xffffff, at(0, 0.06, CD / 2 + 0.045));
      db.add('metal', cbox(CW - 0.12, 0.3, 0.012, 0.004), 0x4a4e4a, at(0, -0.02, -CD / 2 + 0.06));
      for (const s of [-1, 1]) db.add('metal', cbox(0.012, 0.3, CD - 0.08, 0.004), 0x5a5e5a, at(s * (CW / 2 - 0.06), -0.02, 0));
      db.add('metal', cbox(CW - 0.12, 0.012, CD - 0.08, 0.004), 0x3a3e3a, at(0, -0.16, 0));
      dr.add(db.build(this.mats));
      // folders standing in the drawer, tabs staggered
      const tabs = new THREE.Group();
      const fb = new FacetBuilder();
      for (let k = 0; k < 14; k++) {
        const z = CD / 2 - 0.08 - k * 0.036;
        fb.add('sponge', cbox(CW - 0.18, 0.26, 0.008, 0.002), [0xd8c89a, 0xc8b888, 0xe0d4a8][k % 3], at(0, -0.03, z));
        fb.add('enamel', cbox(0.1, 0.04, 0.008, 0.002), [0xc84a3a, 0x3a8ac8, 0xe8c83a, 0x4ac86a][k % 4], at(-0.28 + (k % 5) * 0.14, 0.12, z));
      }
      tabs.add(fb.build(this.mats, { cast: false }));
      dr.add(tabs);
      dr.position.set(x, DRAWER_Y, CAB_Z);
      g.add(dr);
      // the label: an enamel plate with the drawer's name, and its lamp
      const label = plate(this.mats, [c.name.toUpperCase()], 0.7, 0.13, { bg: 0xe8e2c8, ink: 0x1a1810, px: 420 });
      label.position.set(x, 1.98 + 0.12, CAB_Z + CD / 2 - 0.04); g.add(label);
      const code = plate(this.mats, [c.code], 0.2, 0.08, { bg: c.color, ink: 0x0a0a08, emissive: true, px: 300 });
      code.position.set(-0.28, 0.13, CD / 2 + 0.03); dr.add(code);
      const lamp = this.leds.add([x + 0.3, 1.94 + 0.04, CAB_Z + CD / 2 - 0.02], c.color, { size: 0.022, level: 1 });
      const cab: Cabinet = { cat: c.key, drawer: dr, out: 0, want: 0, lamp, tabs, label };
      this.cabs.push(cab);
      this.hots.push({ key: 'cab:' + c.key, objs: [dr, label], label: c.name, sub: 'pull a file', press: () => this.openDrawer(i) });
    });
    return g;
  }

  // ================================================================== the stacks
  private stacks(): THREE.Group {
    const g = new THREE.Group();
    const b = new FacetBuilder();
    // over the cabinets: shelving to the ceiling; down both side walls: open stacks
    const shelfRun = (x0: number, x1: number, z: number, y0: number, y1: number, face: 1 | -1, side = false) => {
      const levels = Math.floor((y1 - y0) / 0.42);
      for (let l = 0; l <= levels; l++) {
        const y = y0 + l * 0.42;
        if (side) b.add('metal', cbox(0.42, 0.025, Math.abs(x1 - x0), 0.006), C.steel, at(z, y, (x0 + x1) / 2), { rep: 0.4 });
        else b.add('metal', cbox(Math.abs(x1 - x0), 0.025, 0.42, 0.006), C.steel, at((x0 + x1) / 2, y, z), { rep: 0.4 });
      }
      for (let u = x0; u <= x1 + 0.01; u += 0.9) {
        if (side) b.add('metal', cbox(0.04, y1 - y0 + 0.05, 0.04, 0.006), C.dark, at(z - face * 0.19, (y0 + y1) / 2, u));
        else b.add('metal', cbox(0.04, y1 - y0 + 0.05, 0.04, 0.006), C.dark, at(u, (y0 + y1) / 2, z + face * 0.19));
      }
    };
    // the left stacks run on from the cell's locks to the reading corner; a short run on the right past the vault door
    shelfRun(-0.85, 1.0, -W + 0.24, 0.1, H - 0.4, 1, true);
    shelfRun(0.25, 1.25, W - 0.24, 0.1, H - 0.4, -1, true);
    g.add(b.build(this.mats));
    // box files, binders and ledgers: one instanced draw per kind
    let s = 7;
    const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
    const spots: { p: THREE.Vector3; ry: number; w: number; h: number; d: number; c: number }[] = [];
    const fill = (x0: number, x1: number, z: number, y0: number, levels: number, side: boolean, face: number) => {
      for (let l = 0; l < levels; l++) {
        let u = x0 + 0.02;
        while (u < x1 - 0.1) {
          if (rnd() < 0.08) { u += 0.15 + rnd() * 0.3; continue; }
          const w = 0.06 + rnd() * 0.07, h = 0.24 + rnd() * 0.12, d = 0.26 + rnd() * 0.08;
          const lean = rnd() < 0.06 ? 0.25 : 0;
          const y = y0 + l * 0.42 + 0.015;
          const col = [0x6a2a22, 0x2a4a6a, 0x3a5a3a, 0xa88a4a, 0x8a8a7a, 0x2a2a2a, 0xc8b890, 0x5a3a5a][Math.floor(rnd() * 8)];
          spots.push({ p: side ? new THREE.Vector3(z, y, u + w / 2) : new THREE.Vector3(u + w / 2, y, z), ry: (side ? Math.PI / 2 : 0) + lean * face, w, h, d, c: col });
          u += w + 0.004;
        }
      }
    };
    fill(-0.8, 0.95, -W + 0.26, 0.1, 8, true, 1);
    fill(0.3, 1.2, W - 0.26, 0.1, 8, true, -1);
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0.0, flatShading: true });
    const im = new THREE.InstancedMesh(geo, mat, spots.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), cc = new THREE.Color();
    spots.forEach((sp, i) => { q.setFromEuler(new THREE.Euler(0, sp.ry, 0)); sc.set(sp.w, sp.h, sp.d); m4.compose(sp.p, q, sc); im.setMatrixAt(i, m4); im.setColorAt(i, cc.setHex(sp.c).multiplyScalar(0.8 + rnd() * 0.3)); });
    im.castShadow = true; im.receiveShadow = true;
    g.add(im);
    // spine labels: a light band on each box (a second instanced draw)
    const lab = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xe8e2c8, roughness: 0.9 }), spots.length);
    spots.forEach((sp, i) => { const fwd = new THREE.Vector3(0, 0, sp.d / 2 + 0.002).applyEuler(new THREE.Euler(0, sp.ry, 0)); q.setFromEuler(new THREE.Euler(0, sp.ry, 0)); sc.set(sp.w * 0.7, 0.05, 0.004); m4.compose(sp.p.clone().add(fwd).setY(sp.p.y + sp.h * 0.7), q, sc); lab.setMatrixAt(i, m4); });
    g.add(lab);
    // the rolling ladder on its rail (left stacks)
    const lb = new FacetBuilder();
    lb.add('metal', cbox(0.03, 0.03, 3.6, 0.006), C.steel, at(-W + 0.52, 3.0, 0.75));
    for (const dz of [-0.22, 0.22]) lb.add('wood', cbox(0.05, 3.0, 0.05, 0.01), 0x8a6a48, at(-W + 0.75, 1.5, 0.2 + dz, 0, 0, -0.08));
    for (let r = 0; r < 9; r++) lb.add('wood', cbox(0.04, 0.03, 0.44, 0.008), 0x7a5a3a, at(-W + 0.82 - r * 0.026, 0.25 + r * 0.32, 0.2, 0, 0, -0.08));
    g.add(lb.build(this.mats));
    return g;
  }

  // ================================================================== the projection table
  private table(): THREE.Group {
    const g = new THREE.Group();
    const b = new FacetBuilder();
    const { x, y, z } = TABLE;
    b.add('metal', prism(0.32, 0.06, 10), 0x3a3e40, at(x, 0.03, z));
    b.add('paint', prism(0.16, y - 0.12, 10, { rTop: 0.12 }), 0x4a5a5a, at(x, (y - 0.12) / 2 + 0.06, z));
    b.add('metal', prism(0.6, 0.08, 16, { rTop: 0.56 }), 0x5a6264, at(x, y - 0.04, z));
    b.add('bakelite', prism(0.56, 0.02, 16), 0x1e2224, at(x, y + 0.01, z));
    b.add('chrome', lathe([[0.3, 0], [0.34, 0], [0.34, 0.03], [0.3, 0.03]], 16), 0xd8dcdc, at(x, y, z));
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; b.add('metal', bolt(0.012, 0.008), C.steel, at(x + Math.cos(a) * 0.47, y + 0.02, z + Math.sin(a) * 0.47)); }
    // the file slot on the near rim, a cable bundle to the floor
    b.add('metal', cbox(0.3, 0.05, 0.08, 0.008), 0x2a2e30, at(x, y + 0.03, z + 0.46));
    b.add('rubber', tube([[x + 0.1, 0.4, z - 0.1], [x + 0.4, 0.1, z - 0.35], [x + 0.9, 0.02, z - 0.6], [x + 1.6, 0.02, z - 1.5]], 0.025, 14, 5), 0x1a1a1a);
    b.add('rubber', tube([[x - 0.1, 0.4, z - 0.1], [x - 0.35, 0.1, z - 0.4], [x - 0.8, 0.02, z - 0.9]], 0.02, 10, 5), 0x2a1e18);
    g.add(b.build(this.mats));
    // the lens: an emissive disc and a ring of tiny lamps
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.29, 20), this.lensMat);
    lens.rotation.x = -Math.PI / 2; lens.position.set(x, y + 0.024, z); lens.userData.noGlow = true; g.add(lens);
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; this.leds.add([x + Math.cos(a) * 0.4, y + 0.025, z + Math.sin(a) * 0.4], 0x6ae8ff, { size: 0.012, pattern: busy(i, 3) }); }
    this.lens.position.set(x, y + 0.5, z); g.add(this.lens);
    // the projection's own light cone (up from the lens)
    this.cone.rotation.x = Math.PI; this.cone.position.set(x, y + 0.02, z); this.cone.scale.set(0.42, 1.0, 0.42); this.coneU.uColor.value.setHex(0x6ae8ff);
    g.add(this.cone);
    this.holoRoot.position.set(x, y + 0.04, z);
    // the folder that drops into the slot
    const fb = new FacetBuilder();
    fb.add('sponge', cbox(0.3, 0.012, 0.22, 0.002), 0xd8c89a, at(0, 0, 0));
    fb.add('enamel', cbox(0.08, 0.004, 0.03, 0.001), 0xc84a3a, at(-0.08, 0.008, -0.12));
    this.folder.add(fb.build(this.mats, { cast: false }));
    this.folder.visible = false; g.add(this.folder);
    this.hots.push({ key: 'table', objs: [lens], glow: [], label: 'Projection table', sub: 'pull a file from a cabinet', press: () => { if (this.files.length) this.pull(this.fi); else this.openDrawer(0); } });
    return g;
  }

  // ================================================================== the reading desk
  private desk(): THREE.Group {
    const g = new THREE.Group();
    const b = new FacetBuilder();
    const x = -2.6, z = 1.65, y = 0.78;
    b.add('wood', cbox(1.0, 0.05, 0.66, 0.01), 0x6a4a30, at(x, y, z), { grain: 'x' });
    for (const [dx, dz] of [[-0.45, -0.28], [0.45, -0.28], [-0.45, 0.28], [0.45, 0.28]]) b.add('wood', cbox(0.05, y, 0.05, 0.01), 0x5a3a24, at(x + dx, y / 2, z + dz));
    b.add('wood', cbox(0.3, 0.3, 0.6, 0.01), 0x5a3a24, at(x + 0.32, y - 0.2, z));
    // the banker's lamp: a brass stem, a green glass shade
    b.add('brass', prism(0.06, 0.02, 8), 0xffffff, at(x - 0.25, y + 0.035, z - 0.15));
    b.add('brass', prism(0.008, 0.3, 6), 0xffffff, at(x - 0.25, y + 0.2, z - 0.15));
    b.add('paint', hull([[-0.16, 0, -0.06], [0.16, 0, -0.06], [-0.16, 0, 0.06], [0.16, 0, 0.06], [-0.12, 0.07, -0.02], [0.12, 0.07, -0.02], [-0.12, 0.07, 0.02], [0.12, 0.07, 0.02]]), 0x1a6a3a, at(x - 0.25, y + 0.36, z - 0.1));
    // ledgers, a card index box, a stack of folders, a mug
    b.add('leather', cbox(0.24, 0.05, 0.32, 0.006), 0x6a2a22, at(x + 0.1, y + 0.05, z + 0.1, 0, 0.2));
    b.add('leather', cbox(0.22, 0.04, 0.3, 0.006), 0x2a3a5a, at(x + 0.11, y + 0.095, z + 0.1, 0, 0.15));
    b.add('wood', cbox(0.16, 0.1, 0.3, 0.006), 0x8a6a48, at(x + 0.34, y + 0.075, z - 0.18));
    for (let i = 0; i < 6; i++) b.add('sponge', cbox(0.3, 0.012, 0.22, 0.002), [0xd8c89a, 0xc8b888][i % 2], at(x - 0.1, y + 0.035 + i * 0.014, z + 0.18, 0, (i - 3) * 0.05));
    b.add('enamel', lathe([[0, 0], [0.04, 0], [0.042, 0.09], [0, 0.09]], 8), 0xe8e4d8, at(x + 0.38, y + 0.025, z + 0.2));
    b.add('wood', cbox(0.42, 0.45, 0.42, 0.01), 0x5a3a24, at(x, 0.24, z + 0.7));
    g.add(b.build(this.mats));
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.06), this.lampMat);
    bulb.position.set(x - 0.25, y + 0.355, z - 0.1); bulb.userData.noGlow = true; g.add(bulb);
    this.lamp.position.set(x - 0.25, y + 0.34, z - 0.1); this.lamp.target.position.set(x - 0.1, 0, z + 0.2);
    this.lamp.castShadow = true; this.lamp.shadow.mapSize.set(512, 512); this.lamp.shadow.camera.near = 0.05; this.lamp.shadow.camera.far = 3; this.lamp.shadow.bias = -0.0008;
    g.add(this.lamp, this.lamp.target);
    const pool = glowCard(1.2, 0.9, 0xffb468, 0.16); pool.rotation.x = -Math.PI / 2; pool.position.set(x, y + 0.03, z); pool.name = 'deskPool'; g.add(pool);
    const sheet = paper(['INDEX', '~', '~', '~', '~', '~'], 0.2, 0.28, { seed: 17, rule: true });
    sheet.rotation.set(-Math.PI / 2, 0, 0.3); sheet.position.set(x - 0.05, y + 0.03, z + 0.15); g.add(sheet);
    this.hots.push({ key: 'lamp', objs: [bulb], label: "Banker's lamp", sub: 'switch it', press: () => { this.lampOn = this.lampOn ? 0 : 1; uiSound('click', 1); } });
    return g;
  }

  // ================================================================== the index terminals
  private terminals(): THREE.Group {
    const g = new THREE.Group();
    const b = new FacetBuilder();
    const x = W - 0.55, z = 1.9;
    b.add('paint', cbox(0.7, 0.8, 1.2, 0.014), 0x5a6a5a, at(x, 0.4, z), { rep: 0.5 });
    b.add('bakelite', cbox(0.74, 0.04, 1.24, 0.01), 0x262826, at(x, 0.82, z));
    const spots = [crtSet(b, x - 0.05, 1.1, z - 0.3, 0.46, 0.38, { color: C.beige, depth: 0.38, ry: -Math.PI / 2, seed: 31 }), crtSet(b, x - 0.05, 1.1, z + 0.3, 0.46, 0.38, { color: 0xbab49a, depth: 0.38, ry: -Math.PI / 2, seed: 32 })];
    b.add('bakelite', cbox(0.2, 0.03, 0.5, 0.008), 0x2a2a28, at(x - 0.25, 0.86, z));
    g.add(b.build(this.mats));
    spots.forEach((spot, i) => {
      const tb = feedTube(spot.sw, spot.sh, 96, 72, 0x9dff9a);
      tb.mesh.applyMatrix4(spot.m); g.add(tb.mesh);
      const cv = document.createElement('canvas'); cv.width = 96; cv.height = 72;
      const ctx = cv.getContext('2d')!;
      const tex = new THREE.CanvasTexture(cv); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
      tb.setFeed(tex, false); tb.mat.uniforms.uGain.value = 1.7;
      this.terms.push({ tb, cv, ctx, tex, acc: i * 0.3 });
    });
    this.termGlow.position.set(x - 0.5, 1.1, z); g.add(this.termGlow);
    this.hots.push({ key: 'term', objs: [...this.terms.map((q) => q.tb.mesh)], glow: [], label: 'Index terminals', sub: 'the drawers in numbers · open the inhabitants', press: () => this.openDrawer(0) });
    return g;
  }
  private drawTerm(i: number, t: number) {
    const T = this.terms[i], c = T.ctx;
    c.fillStyle = '#031208'; c.fillRect(0, 0, 96, 72);
    if (i === 0) {
      bitText(c, 'INDEX', 3, 1, { color: '#c8ffc0', outline: null });
      CATS.forEach((k, j) => {
        const n = catCounts(k.key), y = 20 + j * 10;
        c.fillStyle = '#0a3a1a'; c.fillRect(30, y, 60, 5);
        c.fillStyle = j === CATS.findIndex((q) => q.key === this.cat) && this.state !== 'room' ? '#ffd23a' : '#3aff6a';
        c.fillRect(30, y, Math.round(60 * n.known / Math.max(1, n.total)), 5);
        c.fillStyle = '#' + k.color.toString(16).padStart(6, '0'); c.fillRect(4, y, 20, 5);
      });
    } else {
      const off = Math.floor(t * 8);
      for (let r = 0; r < 8; r++) { const k = off + r; const h = Math.sin(k * 12.9898) * 43758.5453; const w = 20 + Math.floor((h - Math.floor(h)) * 70); c.fillStyle = r === 7 ? '#c8ffc0' : '#2ac85a'; c.fillRect(4, 4 + r * 8, Math.min(88, w), 4); }
      if (Math.floor(t * 2) % 2) { c.fillStyle = '#c8ffc0'; c.fillRect(88, 62, 4, 6); }
    }
    for (let y = 0; y < 72; y += 2) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, y, 96, 1); }
    T.tex.needsUpdate = true;
  }

  // ================================================================== drawers and files
  openDrawer(i: number) {
    const c = CATS[i];
    if (!c) return;
    this.closeHolo(true);
    this.cat = c.key;
    this.files = archiveFiles(c.key);
    this.pick = Math.max(0, Math.min(this.files.length - 1, this.files.findIndex((f) => f.known)));
    this.scroll = Math.max(0, this.pick - 3);
    for (const cb of this.cabs) cb.want = cb.cat === c.key ? 1 : 0;
    this.state = 'drawer';
    this.pose = cabPose(i);
    uiSound('slam', 0.25); setTimeout(() => uiSound('ratchet', 0.5), 80);
    this.onFocus?.(true);
    this.paintIndex();
  }
  private paintIndex() {
    const idx = this.idx;
    idx.innerHTML = '';
    const c = CATS.find((q) => q.key === this.cat)!;
    const n = this.files.filter((f) => f.known).length;
    const head = document.createElement('div');
    head.className = 'ax-ih';
    head.innerHTML = `<b>${esc(c.name)}</b><small>${n} of ${this.files.length} on file · scroll · pick a file</small>`;
    idx.append(head);
    const VIS = 9;
    this.scroll = Math.max(0, Math.min(Math.max(0, this.files.length - VIS), this.scroll));
    const list = document.createElement('div'); list.className = 'ax-list';
    if (this.scroll > 0) list.append(this.word('▲ more', 'more', () => { this.scroll -= VIS - 1; this.paintIndex(); }));
    this.files.slice(this.scroll, this.scroll + VIS).forEach((f, k) => {
      const i = this.scroll + k;
      const w = this.word(f.known ? f.title : 'Unfiled · ' + f.code.split('//')[0].trim().slice(0, 12), 'file' + (f.known ? '' : ' unk') + (i === this.pick ? ' on' : ''), () => this.pull(i), f.known ? `${f.sub}${f.pct < 100 && f.cat !== 'items' && f.cat !== 'places' ? ` · ${f.pct}%` : ''}` : 'not yet found in the field');
      w.addEventListener('pointerenter', () => { this.pick = i; for (const e of list.querySelectorAll('.file')) e.classList.remove('on'); w.classList.add('on'); });
      list.append(w);
    });
    if (this.scroll + VIS < this.files.length) list.append(this.word('▼ more', 'more', () => { this.scroll += VIS - 1; this.paintIndex(); }));
    idx.append(list);
    const foot = document.createElement('div'); foot.className = 'ax-row';
    foot.append(this.word('‹ Shut the drawer', 'back', () => this.back()));
    idx.append(foot);
    idx.classList.add('on');
    this.hud.classList.remove('on');
    requestAnimationFrame(() => (list.querySelector('.file.on') as HTMLElement | null ?? list.querySelector('button') as HTMLElement | null)?.focus({ preventScroll: true }));
  }
  private word(label: string, cls: string, fn: () => void, sub?: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ax-w ' + cls;
    b.innerHTML = `<span class="ft-ptr" aria-hidden="true"></span><span class="l">${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}`;
    b.addEventListener('click', (e) => { e.stopPropagation(); uiSound('tick', 0.6); fn(); });
    return b;
  }

  // ================================================================== the projection
  pull(i: number) {
    const f = this.files[i];
    if (!f) return;
    this.fi = i; this.pick = i; this.page = 0; this.rec = false; this.recT = 0;
    this.state = 'holo';
    this.idx.classList.remove('on');
    for (const cb of this.cabs) cb.want = 0;
    // the folder drops into the slot, the lens wakes, the hologram unfolds from it
    this.folderT = 0; this.folder.visible = true;
    uiSound('relay', 0.7); setTimeout(() => uiSound('hum', 0.6), 200);
    this.setHolo(f);
    this.orbit.yaw = 0.35; this.orbit.pitch = 0.1; this.orbit.r = 1.75; this.orbit.yawV = 0;
    this.onFocus?.(true);
    this.paintHud(true);
  }
  private setHolo(f: ArchiveFile) {
    if (this.holo) { this.disposeHolo(this.holo.group); this.holoRoot.remove(this.holo.group); }
    const c = CATS.find((q) => q.key === f.cat)!;
    HOLO_U.uTint.value.setHex(f.known ? c.color : 0x7a8a8a).multiplyScalar(f.known ? 1.0 : 0.8);
    HOLO_U.uGlitch.value = f.known ? 0.08 : 0.9;
    this.holo = holoModel(f.model, f.known, f.cat === 'places' ? 0.42 : 0.74);
    this.holoRoot.add(this.holo.group);
    this.unfold = 0;
  }
  private disposeHolo(o: THREE.Object3D) {
    o.traverse((n) => { const l = n as THREE.LineSegments; if (l.isLineSegments) l.geometry.dispose(); });
  }
  private closeHolo(quiet = false) {
    if (this.holo) { this.disposeHolo(this.holo.group); this.holoRoot.remove(this.holo.group); this.holo = null; }
    this.folder.visible = false; this.folderT = -1;
    this.rec = false;
    this.hud.classList.remove('on'); this.hud.innerHTML = ''; this.anchors = [];
    if (!quiet) uiSound('shutter', 0.4);
  }
  private file() { return this.files[this.fi]; }
  private paintHud(fresh = false) {
    const f = this.file();
    if (!f) return;
    const hud = this.hud;
    hud.innerHTML = '';
    this.anchors = [];
    const c = CATS.find((q) => q.key === f.cat)!;
    const hex = '#' + c.color.toString(16).padStart(6, '0');
    hud.style.setProperty('--ax-c', f.known ? hex : '#8a9a9a');
    const el = (cls: string, html: string) => { const e = document.createElement('div'); e.className = cls; e.innerHTML = html; hud.append(e); return e; };
    // the title block floats left of the projection, the page right of it, the controls under the table rim
    const title = el('ax-t', `<small>${esc(f.code)}</small><b>${esc(f.known ? f.title : 'Unfiled')}</b><i>${esc(f.known ? f.sub : 'not yet found in the field')}</i>${f.danger && f.known ? `<span class="ax-dg">${Array.from({ length: 10 }, (_, k) => `<em class="${k < f.danger! ? 'on' : ''}"></em>`).join('')}</span>` : ''}`);
    this.anchors.push({ el: title, p: new THREE.Vector3(HOLO_C.x - 0.42, HOLO_C.y + 0.32, HOLO_C.z), dx: -12, dy: 0, align: 'r' });
    const pg = f.known ? f.pages[this.page] : { h: 'Redacted', lines: ['This file is in the drawer because something like it was reported. Nobody has brought anything back yet.'], locked: undefined };
    const pages = f.known ? f.pages.length : 1;
    const body = pg.locked ? `<p class="lk">[REDACTED] · ${esc(pg.locked)}</p>` : pg.lines.map((l) => `<p>${esc(l)}</p>`).join('');
    const page = el('ax-p' + (this.rec ? ' rec' : ''), `<small>page ${this.page + 1} / ${pages}</small><b>${esc(pg.h)}</b>${body}`);
    this.anchors.push({ el: page, p: new THREE.Vector3(HOLO_C.x + 0.42, HOLO_C.y + 0.32, HOLO_C.z), dx: 12, dy: 0, align: 'l' });
    if (this.rec) { this.typed = 0; for (const p of page.querySelectorAll('p')) { (p as HTMLElement).dataset.full = p.textContent ?? ''; p.textContent = ''; } }
    const ctl = el('ax-c', '');
    const row = document.createElement('div'); row.className = 'ax-row';
    row.append(
      this.word('‹', 'pg', () => this.flip(-1)),
      this.word(`page ${this.page + 1} of ${pages}`, 'pgn', () => this.flip(1)),
      this.word('›', 'pg', () => this.flip(1)),
      this.word(this.rec ? '■ Stop the recording' : '▶ Play the recording', 'rec', () => this.toggleRec()),
    );
    const row2 = document.createElement('div'); row2.className = 'ax-row';
    row2.append(this.word('‹ Previous file', 'nf', () => this.nextFile(-1)), this.word('Back to the drawer', 'back', () => this.back()), this.word('Next file ›', 'nf', () => this.nextFile(1)));
    ctl.append(row, row2);
    this.anchors.push({ el: ctl, p: new THREE.Vector3(TABLE.x, TABLE.y - 0.05, TABLE.z + 0.6), dx: 0, dy: 10, align: 'c' });
    const tc = el('ax-tc', `<span class="r">${this.rec ? 'REC' : 'FILE'}</span> <span class="n">00:00:00</span>`);
    this.anchors.push({ el: tc, p: new THREE.Vector3(HOLO_C.x, HOLO_C.y + 0.62, HOLO_C.z), dx: 0, dy: -8, align: 'c' });
    hud.classList.add('on');
    if (fresh) { hud.classList.remove('in'); void hud.offsetWidth; hud.classList.add('in'); }
    this.placeWords();
    if (fresh) requestAnimationFrame(() => (row.querySelector('.rec') as HTMLElement | null)?.focus({ preventScroll: true }));
  }
  flip(d: number) {
    const f = this.file();
    if (!f || !f.known) { uiSound('error', 0.4); return; }
    const n = f.pages.length;
    this.page = (this.page + d + n) % n;
    uiSound('tab', 0.6);
    this.paintHud();
  }
  nextFile(d: number) {
    if (!this.files.length) return;
    const i = (this.fi + d + this.files.length) % this.files.length;
    this.fi = i; this.pick = i; this.page = 0; this.rec = false;
    uiSound('relay', 0.6);
    this.setHolo(this.files[i]);
    this.paintHud(true);
  }
  toggleRec() {
    const f = this.file();
    if (!f) return;
    this.rec = !this.rec; this.recT = 0; this.voiceT = 0.6;
    uiSound(this.rec ? 'rocker' : 'click', 0.8);
    if (this.rec && !f.known) { this.rec = false; uiSound('error', 0.5); return; }
    this.paintHud();
  }
  /** Esc: projection -> drawer -> room */
  back(): boolean {
    if (this.state === 'holo') { this.closeHolo(); this.openDrawer(CATS.findIndex((c) => c.key === this.cat)); return true; }
    if (this.state === 'drawer') {
      this.state = 'room'; this.pose = POSES.room;
      for (const cb of this.cabs) cb.want = 0;
      this.idx.classList.remove('on'); this.idx.innerHTML = '';
      uiSound('slam', 0.3);
      this.onFocus?.(false);
      return true;
    }
    return false;
  }
  /** dev / screenshots: skip the flights and the unfold (software GL runs a few frames a second) */
  settle() {
    this.unfold = 1;
    for (const c of this.cabs) c.out = c.want;
    if (this.state === 'holo') { const o = this.orbit, cp = Math.cos(o.pitch); this.camP.set(HOLO_C.x + Math.sin(o.yaw) * o.r * cp, HOLO_C.y + 0.12 + Math.sin(o.pitch) * o.r, HOLO_C.z + Math.cos(o.yaw) * o.r * cp); this.camL.copy(HOLO_C).setY(HOLO_C.y + 0.02); this.camF = 50; }
    else { this.camP.copy(this.pose.pos); this.camL.copy(this.pose.look); this.camF = this.pose.fov; }
  }
  /** Q / E in front of the cabinets: the next drawer */
  nextDrawer(d: number) { const i = CATS.findIndex((c) => c.key === this.cat); this.openDrawer((i + d + CATS.length) % CATS.length); }
  /** keys while the projection is up (title.ts forwards them; arrows and Q / E come through its FocusNav) */
  key(e: KeyboardEvent): boolean {
    if (this.state !== 'holo') return false;
    const k = e.key;
    if (k === 'r' || k === 'R') this.toggleRec();
    else if (k === '+' || k === '=') this.orbit.r = Math.max(0.9, this.orbit.r - 0.2);
    else if (k === '-' || k === '_') this.orbit.r = Math.min(2.8, this.orbit.r + 0.2);
    else return false;
    return true;
  }
  /** pointer drag on the stage canvas (orbit) and the wheel (zoom) */
  drag(kind: 'down' | 'move' | 'up', x: number, y: number) {
    if (this.state !== 'holo') return;
    const o = this.orbit;
    if (kind === 'down') { o.drag = true; o.lx = x; o.ly = y; return; }
    if (kind === 'up') { o.drag = false; return; }
    if (!o.drag) return;
    const dx = x - o.lx, dy = y - o.ly; o.lx = x; o.ly = y;
    o.yaw -= dx * 0.008; o.yawV = -dx * 0.5; o.pitch = Math.max(-0.25, Math.min(0.75, o.pitch + dy * 0.005)); o.idle = 0;
  }
  wheel(dy: number) { if (this.state === 'holo') this.orbit.r = Math.max(0.9, Math.min(2.8, this.orbit.r + dy * 0.0016)); }

  private placeWords() {
    if (!this.project || !this.anchors.length) return;
    for (const a of this.anchors) {
      const p = this.project(a.p);
      if (!p) { a.el.style.visibility = 'hidden'; continue; }
      a.el.style.visibility = '';
      const w = a.el.offsetWidth, h = a.el.offsetHeight, VW = window.innerWidth, VH = window.innerHeight;
      let x = a.align === 'r' ? p.x - w + a.dx : a.align === 'l' ? p.x + a.dx : p.x - w / 2 + a.dx;
      let y = a.align === 'c' ? p.y + a.dy : p.y - h / 2 + a.dy;
      x = Math.max(8, Math.min(VW - w - 8, x)); y = Math.max(8, Math.min(VH - h - 8, y));
      a.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }
  }

  // ================================================================== frame
  pointer(nx: number, ny: number) { this.ptr.set(nx, ny); }
  setBuild(on: boolean) { this.buildT = on ? 1 : 0; }
  leave() { if (this.state !== 'room') { this.closeHolo(true); this.idx.classList.remove('on'); this.state = 'room'; this.pose = POSES.room; for (const cb of this.cabs) cb.want = 0; this.onFocus?.(false); } }
  frame(aspect: number, portrait: boolean) {
    const c = this.cam;
    c.aspect = aspect;
    c.fov = portrait ? Math.min(92, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camF / 2)) / aspect)) * 0.95) : this.camF;
    c.updateProjectionMatrix();
  }
  update(dt: number, t: number, full: boolean) {
    this.t = t;
    if (this.dirty) this.refresh();
    U.uTime.value = t;
    HOLO_U.uTime.value = t;
    // ---- the troughs hum and stutter; their haze follows them
    for (const tb of this.tubes) {
      if (tb.flick <= 0 && Math.random() < dt * 0.03) tb.flick = 0.2 + Math.random() * 0.35;
      tb.flick = Math.max(0, tb.flick - dt);
      const k = tb.flick > 0 ? (Math.sin(t * 60 + tb.seed) > 0 ? 0.2 : 1) : 0.97 + Math.sin(t * 100 + tb.seed) * 0.03;
      tb.light.intensity = tb.base * k;
      tb.mat.color.setRGB(0.95 * (0.3 + 0.9 * k), 0.97 * (0.3 + 0.9 * k), 1.0 * (0.3 + 0.9 * k));
      tb.shaft.u.uInt.value = 0.022 * k;
    }
    this.lampLvl = damp(this.lampLvl, this.lampOn, 12, dt);
    this.lamp.intensity = 2.6 * this.lampLvl;
    this.lampMat.color.setScalar(0.15 + 1.1 * this.lampLvl);
    const dp = this.scene.getObjectByName('deskPool'); if (dp) dp.visible = this.lampLvl > 0.1;
    this.exitGlow.intensity = 0.45 + Math.sin(t * 0.7) * 0.03;
    this.leds.update(t);
    if (full) this.dress.update(t);
    this.vault.update(t, dt);
    if (full) this.pokes.update(dt, t, this.cam);
    // the vault door's beacon sweeps red across the right wall; the cell's lamp hums
    this.redL.intensity = 0.25 + this.vault.beaconK(t) * 3.2;
    this.cellL.intensity = 2.4 + Math.sin(t * 50) * 0.08 + (Math.sin(t * 0.37) > 0.985 ? -1.6 : 0);
    // ---- in the projection only the floating words take presses (a stray click must not pull a drawer)
    for (const h of this.hots) h.off = this.state === 'holo';
    // ---- the drawers
    for (const c of this.cabs) { c.out = damp(c.out, c.want, 7, dt); c.drawer.position.z = CAB_Z + c.out * 0.52; }
    // ---- the projection
    const on = this.state === 'holo' && !!this.holo;
    this.unfold = on ? Math.min(1, this.unfold + dt * 0.9) : 0;
    const base = TABLE.y + 0.04;
    HOLO_U.uTop.value = base + this.unfold * 1.2 - 0.05;
    HOLO_U.uAlpha.value = on ? 0.85 + (this.rec ? 0.15 : 0) : 0;
    const sw = (t * (this.rec ? 0.9 : 0.35)) % 1;
    HOLO_U.uSweep.value = base + sw * 1.0;
    if (this.holo) { this.holo.tick(t, this.rec); this.holo.group.rotation.y = this.rec ? 0 : t * 0.25; }
    this.coneU.uInt.value = damp(this.coneU.uInt.value, on ? 0.09 : 0.0, 4, dt);
    this.lens.intensity = damp(this.lens.intensity, on ? 2.4 : 0.4, 4, dt);
    this.lensMat.color.setHex(on ? 0x8af4ff : 0x1a6a7a);
    if (this.folderT >= 0) { this.folderT = Math.min(1, this.folderT + dt * 2.2); const k = this.folderT; this.folder.position.set(TABLE.x, TABLE.y + 0.05 + (1 - k) * 0.5, TABLE.z + 0.46); this.folder.rotation.x = -Math.PI / 2 * k * 0.9; }
    // ---- the recording: dictation, the voice, a timecode
    if (this.rec) {
      this.recT += dt;
      this.voiceT -= dt;
      const f = this.file();
      if (this.voiceT <= 0 && f?.voice) { gameSound(f.voice, 0.5); this.voiceT = 4 + Math.random() * 3; }
      const ps = this.hud.querySelectorAll('.ax-p p');
      this.typed += dt * 42;
      let left = Math.floor(this.typed);
      for (const p of ps) { const full = (p as HTMLElement).dataset.full ?? ''; const n = Math.min(full.length, left); if ((p.textContent ?? '').length !== n) p.textContent = full.slice(0, n); left -= n; }
      if (Math.floor(this.typed) % 6 === 0 && left <= 0 && Math.random() < 0.05) uiSound('type', 0.2);
    }
    const tcEl = this.hud.querySelector('.ax-tc .n');
    if (tcEl) { const s = Math.floor(this.rec ? this.recT : t); tcEl.textContent = `${String(Math.floor(s / 3600) % 100).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
    // ---- terminals
    for (let i = 0; i < this.terms.length; i++) { const T = this.terms[i]; T.acc += dt; if (T.acc > 0.25) { T.acc = 0; this.drawTerm(i, t); } }
    if (!full) return;
    // ---- dust in the cones (the middle trough's)
    const L0 = this.tubes[1].light;
    this.dust.update(t, L0.position, this.v.set(0, -1, 0), Math.cos(1.0), Math.cos(0.4), 3.2, new THREE.Color(0xdfe8ff), on ? 0.6 : 0.15);
    // ---- camera
    this.ptrS.x = damp(this.ptrS.x, this.ptr.x, 3, dt); this.ptrS.y = damp(this.ptrS.y, this.ptr.y, 3, dt);
    this.build = damp(this.build, this.buildT, 3, dt);
    let goal: Pose = this.build > 0.5 ? POSES.build : this.pose;
    if (this.state === 'holo' && this.build < 0.5) {
      const o = this.orbit;
      if (!o.drag) { o.idle += dt; o.yaw += o.yawV * dt * 0.02; o.yawV = damp(o.yawV, 0, 3, dt); if (o.idle > 4) o.yaw += dt * 0.08; }
      const cp = Math.cos(o.pitch);
      goal = { pos: new THREE.Vector3(HOLO_C.x + Math.sin(o.yaw) * o.r * cp, HOLO_C.y + 0.12 + Math.sin(o.pitch) * o.r, HOLO_C.z + Math.cos(o.yaw) * o.r * cp), look: HOLO_C.clone().setY(HOLO_C.y + 0.02), fov: 50 };
    }
    const k = 1 - Math.exp(-dt * (this.state === 'holo' ? 7 : 4.5));
    this.camP.lerp(goal.pos, k); this.camL.lerp(goal.look, k); this.camF += (goal.fov - this.camF) * k;
    const par = this.state === 'room' ? 1 : 0.2;
    this.cam.position.set(this.camP.x - this.ptrS.x * 0.18 * par + Math.sin(t * 0.27) * 0.01, this.camP.y + this.ptrS.y * 0.06 * par + Math.sin(t * 0.39) * 0.006, this.camP.z);
    this.cam.lookAt(this.v.set(this.camL.x + this.ptrS.x * 0.3 * par, this.camL.y - this.ptrS.y * 0.12 * par, this.camL.z));
    this.cam.updateMatrixWorld();
    this.placeWords();
  }
}
function mix(a: number, b: number, t: number) {
  const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
void blink; void tube;
