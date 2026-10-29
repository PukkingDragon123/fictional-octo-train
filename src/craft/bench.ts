// The workbench in first person: a greasy workshop table under a gooseneck
// lamp, a vice bolted on one end, a pegboard behind it. Your iron cube sits
// open on the left of the boards; pull things out of it onto the table, then
// work them by hand: drag one onto another to put them together, or take a
// blueprint sheet off the pegboard. Hand steps (sawing, striking, binding)
// go to the close-up; ordinary recipes are assembled by holding your hands on
// the work while the hammer and saw do their thing, a slate keeping tally.
// Every recipe in the game can be made here. No DOM.
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import type { TileObject } from '../world/zone';
import { type Item, itemDef, itemName } from '../items/item';
import { allRecipes, type Recipe } from '../items/recipes';
import { checkRecipe, CraftAction } from '../interact/crafting';
import { hasUnlock, researchNode } from '../game/research';
import { fpGroup, fpClaim, fpRelease, fpOwner, fpCamera } from '../fp/fp';
import { CubeView } from './cubeView';
import { HAND_OPS, type HandOp, matches, pickTool, pickParts, partLabel, toolLabel } from './handOps';
import { Tweens, easeOut, easeBack, makeArm, poseArm, type Arm, makeItemObj, fitItemObj, type ItemObj, pointerRay, Particles, keepEye } from './fpKit';
import { pixMat } from './fpTex';
import { ink, inkMesh, shade, shadowBlob, WorkLamp } from './fpScene';
import { gem } from '../ui/touch/facet';
import { pixTag, stamp, disposeTag, type PixTag } from './tags';
import { Shape } from './shapes';
import { Dymo, Slate, HoverTag, clickTag } from './props';
import { recipeHint } from './knowledge';

interface Staged { it: Item; obj: ItemObj; spot: number; sh: THREE.Mesh }
interface Sheet { t: PixTag; run: () => void }
const SPOTS_X = 5, SPOTS_Z = 3, SPOT = 0.13;
/** how far down the eyes look at the bench (the room shows over the pegboard) */
const BENCH_PITCH = 26;
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Bench {
  open = false;
  private built = false;
  private g!: THREE.Group;
  private top = new THREE.Group();
  private peg = new THREE.Group();
  private cube = new CubeView();
  private staged: Staged[] = [];
  private stageG = new THREE.Group();
  private obj: TileObject | null = null;
  private tw = new Tweens();
  private arms: Arm[] = [];
  private dust = new Particles(100, false, 2);
  private sparks = new Particles(100, true, 3);
  private rc = new THREE.Raycaster();
  private drag: { id: number; it: Item; from: 'cube' | 'bench'; ghost: ItemObj; x0: number; y0: number; live: boolean } | null = null;
  private px = 0; private py = 0;
  private hold: { r: Recipe; t: number; dur: number; down: boolean; tick: number } | null = null;
  private lastT = performance.now();
  private lastTap = { uid: 0, t: 0 };
  private dirty = true;
  private suspended = false;
  private sheets: Sheet[] = [];
  private fixed: Sheet[] = [];
  private press: { id: number; x: number; y: number; sheet: Sheet | null } | null = null;
  private slate!: Slate;
  private dymo!: Dymo;
  private tag!: HoverTag;
  private lampL: WorkLamp | null = null;
  root: HTMLDivElement;

  constructor() {
    const r = document.createElement('div');
    r.className = 'fpk fpk-bench';
    document.body.appendChild(r);
    this.root = r;
    r.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    r.addEventListener('contextmenu', (e) => e.preventDefault());
    r.addEventListener('touchmove', (e) => { if (this.open) e.preventDefault(); }, { passive: false });
    bus.on('inventoryChanged', () => { this.dirty = true; });
    bus.on('fpLost', (n: string) => { if (n === 'bench' && this.open) this.suspended = true; });
    bus.on('fpChange', (n: string | null) => { if (n === null && this.open && this.suspended) setTimeout(() => this.resume(), 0); });
  }

  private build() {
    if (this.built) return;
    this.built = true;
    const g = (this.g = fpGroup('bench'));
    // no backdrop: the room you are standing in shows round the bench (the eye draws it)
    g.add(new THREE.HemisphereLight(0x9a9488, 0x2a2018, 0.55));
    const fill = new THREE.DirectionalLight(0x8a9ab0, 0.35); fill.position.set(-0.8, 0.6, 0.4); g.add(fill);
    this.buildBench();
    this.top.add(this.stageG);
    this.top.add(this.cube.root);
    this.cube.root.scale.setScalar(0.58);
    this.cube.root.position.set(-0.52, 0, -0.04);
    g.add(this.top);
    const sweep = clickTag('Sweep back into the cube', 'tag', 110, 0.27), away = clickTag('Step away', 'tag', 70, 0.21, '(Esc)');
    // both tags hang off hooks on the pegboard, swinging a little
    // tags you can pull: one tied to the cube's corner, one hung on the vice's tommy bar
    sweep.mesh.geometry.translate(0, -0.05, 0); away.mesh.geometry.translate(0, -0.04, 0);
    sweep.mesh.position.set(-0.5, 0.07, 0.24); sweep.mesh.rotation.set(-0.38, 0.08, 0.05);
    away.mesh.position.set(0.6, 0.08, 0.1); away.mesh.rotation.set(-0.42, -0.12, -0.06);
    this.top.add(sweep.mesh, away.mesh);
    this.fixed = [{ t: sweep, run: () => this.clear() }, { t: away, run: () => this.close() }];
    g.add(this.dust.points, this.sparks.points);
    // the chalk slate stands on the bench leaning on the pegboard; label tape sticks along the top rail
    this.slate = new Slate(this.top);
    this.slate.tag.mesh.position.set(-0.16, 0.13, -0.3); this.slate.tag.mesh.rotation.set(-0.16, 0.05, 0.03);
    this.dymo = new Dymo(this.top, 0, 'stick');
    this.dymo.place(-0.26, 0.535, -0.322);
    this.tag = new HoverTag(this.top, true);
    for (const s of [1, -1] as const) { const a = makeArm(s); g.add(a.root); this.arms.push(a); }
  }

  /** the workbench: oiled plank top on a 2x4 frame, a pegboard back with a shelf, vice, lamp, tools, sawdust */
  private buildBench() {
    const T = this.top;
    const wood = new Shape(2.3), frame = new Shape(4), peg = new Shape(5), steel = new Shape(6), iron = new Shape(5), green = new Shape(5),
      handle = new Shape(9), red = new Shape(7), rubber = new Shape(8), galv = new Shape(6), rag = new Shape(5), dust = new Shape(9), brass = new Shape(8), cardboard = new Shape(5), rust = new Shape(6);
    // ---- the top: three thick boards, the front one darker with oil, a steel lip on the front edge
    const tints = [0xffffff, 0xf0e4d8, 0xe0d2c4];
    for (let i = 0; i < 3; i++) wood.jbox(0, -0.06, -0.22 + i * 0.22, 2.5, 0.06, 0.218, tints[i], 0.0025, 11 + i);
    steel.box(0, -0.07, 0.334, 2.52, 0.075, 0.012, 0xd8d8d0, 0.003);
    for (let x = -1.1; x <= 1.1; x += 0.36) steel.dome(x, -0.035, 0.341, 0.006, 0xc8c8c0);
    // apron and legs under the front (only the tops show)
    frame.box(0, -0.22, 0.3, 2.5, 0.15, 0.03, 0xc8b8a0, 0.006);
    for (const x of [-1.05, 1.05]) frame.box(x, -0.6, 0.27, 0.09, 0.55, 0.09, 0xd0c0a8, 0.008);
    // ---- the back: 2x4 posts, a pegboard, a top rail and a shelf
    for (const x of [-1.12, 1.12]) frame.box(x, 0, -0.35, 0.09, 0.5, 0.06, 0xe0d0b8, 0.008);
    frame.box(0, 0.45, -0.35, 2.4, 0.04, 0.05, 0xd8c8b0, 0.006);
    frame.box(0, 0.0, -0.345, 2.3, 0.03, 0.04, 0xc0b098, 0.005);
    frame.jbox(0, 0.49, -0.31, 2.3, 0.022, 0.13, 0xf0e0c8, 0.002, 4);
    for (const x of [-0.8, 0, 0.8]) frame.taper(x, 0.41, -0.26, 0.03, 0.03, 0.03, 0.08, 0.08, 0xb0a088, undefined, 0, -0.025);
    peg.box(0, 0.03, -0.355, 2.3, 0.42, 0.012, 0xffffff, 0.002);
    // ---- the vice: green enamel body, steel jaws faced with hatching, a chrome screw and tommy bar
    green.jbox(0.68, 0, -0.16, 0.17, 0.065, 0.13, 0xffffff, 0.002, 5);
    green.box(0.68, 0.065, -0.21, 0.15, 0.055, 0.035, 0xffffff, 0.006);
    green.box(0.68, 0.065, -0.1, 0.15, 0.055, 0.035, 0xffffff, 0.006);
    green.box(0.68, -0.012, -0.16, 0.2, 0.012, 0.15, 0xc8c8c8, 0.004);
    steel.box(0.68, 0.075, -0.188, 0.15, 0.04, 0.008, 0xb0b0a8, 0.002);
    steel.box(0.68, 0.075, -0.122, 0.15, 0.04, 0.008, 0xb0b0a8, 0.002);
    steel.cyl(0.68, 0.085, -0.08, 0.008, 0.14, 0xe8e8e0, 8, [Math.PI / 2, 0, 0]);
    steel.capsule(0.6, 0.085, 0.065, 0.005, 0.16, 0xf0f0e8, [0, 0, -Math.PI / 2]);
    for (const [x, z] of [[0.6, -0.22], [0.76, -0.22], [0.6, -0.1], [0.76, -0.1]]) steel.dome(x, 0.0, z, 0.007, 0x9a9a92, [0, 0, 0]);
    // ---- the gooseneck lamp clamped to the shelf: cast base, jointed steel arms, a green enamel shade
    iron.box(0.86, 0.512, -0.29, 0.08, 0.03, 0.1, 0xffffff, 0.006);
    iron.box(0.86, 0.45, -0.245, 0.06, 0.07, 0.012, 0xffffff, 0.003);
    steel.rod([0.86, 0.54, -0.29], [0.78, 0.72, -0.2], 0.007, 0xe0e0d8, 6);
    steel.rod([0.78, 0.72, -0.2], [0.735, 0.68, -0.13], 0.006, 0xe0e0d8, 6);
    iron.cyl(0.78, 0.71, -0.2, 0.014, 0.022, 0xffffff, 8, [0, 0, Math.PI / 2]);
    // ---- tools laid down: a claw hammer, a red screwdriver, a chisel, a carpenter's pencil, pliers
    handle.box(0.5, 0.004, 0.2, 0.24, 0.022, 0.026, 0xffffff, 0.008, [0, 0.35, 0]);
    iron.jbox(0.4, 0.002, 0.255, 0.035, 0.032, 0.11, 0xffffff, 0.0015, 3, [0, 0.35, 0]);
    red.cyl(-0.24, 0.012, 0.21, 0.012, 0.1, 0xffffff, 6, [0, 0, Math.PI / 2 + 0.03]);
    steel.cyl(-0.34, 0.012, 0.212, 0.0035, 0.11, 0xffffff, 6, [0, 0, Math.PI / 2 + 0.03]);
    handle.box(0.28, 0.002, -0.24, 0.12, 0.018, 0.02, 0xc89870, 0.006, [0, -0.2, 0]);
    steel.box(0.2, 0.002, -0.22, 0.09, 0.008, 0.018, 0xffffff, 0.002, [0, -0.2, 0]);
    handle.box(-0.06, 0.002, 0.25, 0.14, 0.008, 0.012, 0xe0b040, 0.002, [0, 0.9, 0]);
    red.box(0.12, 0.003, 0.26, 0.09, 0.012, 0.016, 0xd0d0d0, 0.004, [0, -0.25, 0]);
    red.box(0.12, 0.003, 0.285, 0.09, 0.012, 0.016, 0xd0d0d0, 0.004, [0, 0.1, 0]);
    iron.box(0.055, 0.003, 0.268, 0.05, 0.014, 0.022, 0xffffff, 0.003, [0, -0.1, 0]);
    // a tin of nails and a can of screws, a coffee can of brushes
    galv.lathe(0.45, 0, -0.24, [[0, 0], [0.04, 0], [0.042, 0.004], [0.042, 0.07], [0.044, 0.074], [0, 0.074]], 0xffffff, 8);
    for (let i = 0; i < 9; i++) steel.rod([0.45 + Math.sin(i * 2.3) * 0.025, 0.06, -0.24 + Math.cos(i * 1.7) * 0.025], [0.45 + Math.sin(i * 2.3) * 0.03, 0.09 + (i % 3) * 0.006, -0.24 + Math.cos(i * 1.7) * 0.03], 0.0025, 0x9a9890, 4);
    rust.lathe(-0.85, 0, -0.22, [[0, 0], [0.05, 0], [0.052, 0.005], [0.05, 0.11], [0.053, 0.114], [0, 0.114]], 0xffffff, 8);
    for (let i = 0; i < 3; i++) { handle.rod([-0.85 + (i - 1) * 0.018, 0.08, -0.22], [-0.85 + (i - 1) * 0.04, 0.24, -0.24 - i * 0.012], 0.006, 0xd8c098, 5); rubber.box(-0.85 + (i - 1) * 0.04, 0.23, -0.24 - i * 0.012, 0.03, 0.04, 0.012, 0x2a2620, 0.004); }
    // a greasy rag in a heap near the cube
    rag.jbox(-0.3, 0, 0.16, 0.12, 0.022, 0.1, 0xffffff, 0.009, 7, [0, 0.6, 0]);
    rag.jbox(-0.27, 0.012, 0.15, 0.08, 0.02, 0.06, 0xe8e0d0, 0.008, 9, [0.1, -0.3, 0]);
    // ---- sawdust round the vice and shavings curled on the boards
    for (let i = 0; i < 70; i++) {
      const a = i * 2.39996, r = Math.sqrt(i / 70) * 0.16, x = 0.66 + Math.cos(a) * r * 1.3, z = 0.04 + Math.sin(a) * r * 0.7;
      dust.gem(x, 0.002 + (1 - r / 0.16) * 0.006, z, 0.004 + (i % 4) * 0.0015, i % 3 ? 0xf0dcb0 : 0xd8b888, 0.4, i, [1.4, 0.35, 1.1]);
    }
    for (let i = 0; i < 14; i++) dust.lathe(-0.05 + Math.sin(i * 4.1) * 0.5, 0.004, 0.12 + Math.cos(i * 2.7) * 0.18, [[0.004, 0], [0.012, 0.003], [0.006, 0.008]], 0xf8e8c0, 5, [Math.PI / 2, i, 0.3]);
    // ---- on the shelf: paint tins, a jar of screws, a cardboard box of fuses, a brass oil can
    galv.lathe(-0.62, 0.501, -0.3, [[0, 0], [0.045, 0], [0.047, 0.006], [0.047, 0.09], [0.042, 0.096], [0, 0.096]], 0xd8d0c0, 8);
    green.lathe(-0.5, 0.501, -0.31, [[0, 0], [0.038, 0], [0.04, 0.006], [0.04, 0.075], [0.036, 0.08], [0, 0.08]], 0xffffff, 8);
    cardboard.jbox(-0.25, 0.501, -0.3, 0.16, 0.07, 0.1, 0xffffff, 0.002, 3);
    cardboard.jbox(-0.27, 0.571, -0.31, 0.12, 0.05, 0.08, 0xe0d0b8, 0.002, 5);
    brass.lathe(0.12, 0.501, -0.3, [[0, 0], [0.04, 0], [0.042, 0.01], [0.04, 0.045], [0.02, 0.07], [0.008, 0.08], [0.006, 0.17], [0.003, 0.18], [0, 0.18]], 0xffffff, 8);
    galv.lathe(0.4, 0.501, -0.3, [[0, 0], [0.05, 0], [0.052, 0.006], [0.052, 0.12], [0.046, 0.126], [0, 0.126]], 0xc8c0b0, 8);
    // ---- tools hung on the pegboard: a hand saw, spanners, a coil of wire
    const P = this.peg;
    const sawBlade = new Shape(6);
    sawBlade.plate(0, 0, 0, [new THREE.Vector2(0, 0.06), new THREE.Vector2(0.34, 0.035), new THREE.Vector2(0.34, 0.0), new THREE.Vector2(0, -0.01)], 0.003, 0xe8e8e0);
    const sawM = new THREE.Mesh(sawBlade.build(), pixMat('steel'));
    sawM.position.set(-1.04, -0.02, 0.008); sawM.rotation.z = -0.62; P.add(sawM);
    const sawH = new Shape(9); sawH.box(-0.06, -0.035, 0.002, 0.1, 0.1, 0.022, 0xffffff, 0.008);
    const shM = new THREE.Mesh(sawH.build(), pixMat('handle')); shM.position.copy(sawM.position); shM.rotation.z = -0.62; P.add(shM);
    const span = new Shape(6);
    for (let i = 0; i < 3; i++) { const x = 0.9 + i * 0.06, l = 0.14 + i * 0.025; span.box(x, -0.17, 0.006, 0.016, l, 0.005, 0xffffff, 0.002); span.plate(x, -0.17 + l, 0.006, [new THREE.Vector2(-0.018, 0), new THREE.Vector2(0.018, 0), new THREE.Vector2(0.022, 0.03), new THREE.Vector2(0.008, 0.03), new THREE.Vector2(0.004, 0.012), new THREE.Vector2(-0.004, 0.012), new THREE.Vector2(-0.008, 0.03), new THREE.Vector2(-0.022, 0.03)], 0.005, 0xffffff); }
    const spM = new THREE.Mesh(span.build(), pixMat('chrome')); P.add(spM);
    const coil = new Shape(8);
    for (let i = 0; i < 4; i++) coil.ring(0.66 + i * 0.004, -0.1, 0.012 + i * 0.003, 0.055 - i * 0.002, 0.004, 0xffffff, 10);
    const coM = new THREE.Mesh(coil.build(), pixMat('brass', { color: 0xd88a50 })); P.add(coM);
    const hooks = new Shape(8);
    for (const [x, y] of [[-1.0, 0.06], [0.9, -0.03], [0.96, -0.005], [1.02, 0.02], [0.66, -0.05]]) hooks.rod([x, y, 0], [x, y + 0.006, 0.03], 0.0025, 0xc0c0b8, 4);
    P.add(new THREE.Mesh(hooks.build(), pixMat('steel')));
    // ---- meshes, one per surface
    const mesh = (sh: Shape, mat: THREE.Material, parent: THREE.Object3D = T) => { const m = new THREE.Mesh(sh.build(), mat); parent.add(m); return m; };
    mesh(wood, pixMat('bench')); mesh(frame, pixMat('plank')); mesh(peg, pixMat('pegboard')); mesh(steel, pixMat('steel')); mesh(iron, pixMat('castIron'));
    mesh(green, pixMat('enamelGreen')); mesh(handle, pixMat('handle')); mesh(red, pixMat('enamelRed')); mesh(rubber, pixMat('rubber')); mesh(galv, pixMat('galv'));
    mesh(rag, pixMat('rag')); mesh(dust, pixMat('plank', { color: 0xfff0d0 })); mesh(brass, pixMat('brass')); mesh(cardboard, pixMat('cardboard')); mesh(rust, pixMat('rust'));
    // a printed label on the fuse box
    const lab = pixTag('card', 60, 26, 0.13);
    lab.clear(); lab.type('FUSES', 12, 4, '#8a1a10', 9); lab.type('15 AMP · 10 PCS', 12, 15, undefined, 6); lab.flush();
    lab.mesh.position.set(-0.25, 0.539, -0.249); T.add(lab.mesh);
    ink(T, 0.0028);
    ink(P, 0.0028);
    // the bulb in the shade, and the light it throws: a real shadow under everything on the boards
    // the shade: green enamel outside, cream inside (both faces drawn, no ink: you see into it)
    const shadeG = new THREE.Group();
    const sh = new Shape(5);
    sh.lathe(0, 0, 0, [[0.012, 0.11], [0.02, 0.105], [0.026, 0.085], [0.05, 0.035], [0.085, 0.004], [0.088, 0], [0.084, -0.002]], 0xffffff, 8);
    sh.cyl(0, 0.105, 0, 0.012, 0.03, 0xc8c8c8, 6);
    const shOut = new THREE.Mesh(sh.build(), pixMat('enamelGreen', { side: THREE.DoubleSide }));
    shOut.userData.noInk = true; shadeG.add(shOut);
    shadeG.add(inkMesh(shOut.geometry, 0.0035));
    const inner = new Shape(5); inner.lathe(0, 0, 0, [[0.08, 0.002], [0.047, 0.036], [0.024, 0.082], [0.011, 0.1]], 0xfff4e0, 8);
    const shIn = new THREE.Mesh(inner.build(), new THREE.MeshBasicMaterial({ color: 0xf0e0b8, side: THREE.DoubleSide }));
    shadeG.add(shIn);
    const bulb = new THREE.Mesh(gem(0.024, 0, 0.1), new THREE.MeshBasicMaterial({ color: 0xfff6d8 }));
    bulb.position.y = 0.04; shadeG.add(bulb);
    shadeG.position.set(0.7, 0.6, -0.1); shadeG.rotation.set(0.35, 0, 0.5); shadeG.scale.setScalar(0.8);
    T.add(shadeG);
    this.lampL = new WorkLamp(T, new THREE.Vector3(0.66, 0.57, -0.05), new THREE.Vector3(0.05, 0, 0.0), { intensity: 6, angle: 1.05, dist: 2.6, mapSize: 512 });
    T.add(this.peg);
    this.peg.position.set(0, 0.24, -0.345);
    for (const sb of [shadowBlob(0.4, 0.3, 0.5)]) { sb.position.set(-0.52, 0.0016, -0.04); T.add(sb); }
    shade(T);
  }

  private layout() {
    const asp = window.innerWidth / Math.max(1, window.innerHeight);
    // landscape: the bench runs off both sides; portrait: it steps back so the cube and the boards both fit
    const k = asp >= 1.2 ? Math.min(1, asp / 1.6) : Math.max(0.42, asp * 0.95);
    this.top.position.set(asp < 1.2 ? 0.06 : -0.04, asp < 1.2 ? -0.2 : -0.3, -2.0);
    this.top.rotation.set(0.74, 0, 0);
    this.top.scale.setScalar(k);
    this.cube.root.position.x = asp < 1.2 ? -0.42 : -0.52;
  }

  /** stand at a workbench */
  show(o: TileObject | null) {
    const p = G.local;
    if (!p) return;
    this.build();
    if (!fpClaim('bench', 3, { cinematic: 'full', eyePitch: BENCH_PITCH })) return;
    if (G.ui?.inventory?.open) G.ui.inventory.toggle(false);
    this.open = true; this.suspended = false;
    G.hudBody?.setHidden?.('bench', true);
    this.obj = o;
    this.root.classList.add('on');
    G.input.pointerOverUI = true;
    const back = p.worn.get('back' as any);
    this.cube.setContainer(back?.inv ?? null);
    this.cube.setLid(1); this.cube.setBolts(1); this.cube.setInside(1);
    this.cube.root.rotation.set(0, 0.22, 0);
    this.layout();
    this.dirty = true;
    G.audio?.ui?.('cube_clunk', 0.5);
    const y0 = this.top.position.y;
    this.top.position.y = y0 - 0.5;
    this.tw.add(0.35, (k) => { this.top.position.y = y0 - 0.5 + 0.5 * k; }, easeBack);
  }

  private resume() {
    if (!this.open || fpOwner()) return;
    // back into the eyes (an inspection handed the stage back)
    if (!fpClaim('bench', 3, { cinematic: 'full', eyePitch: BENCH_PITCH })) return;
    keepEye('bench', BENCH_PITCH);
    this.suspended = false;
    this.root.classList.add('on');
    G.input.pointerOverUI = true;
    this.dirty = true;
  }

  close() {
    if (!this.open) return;
    this.open = false; this.hold = null;
    G.hudBody?.setHidden?.('bench', false);
    this.cancelDrag();
    this.root.classList.remove('on');
    this.slate.hide(); this.tag.hide();
    for (const s of this.staged) this.drop(s);
    this.staged = [];
    this.cube.hidden.clear();
    if (fpOwner() === 'bench') fpRelease('bench');
    G.input.pointerOverUI = false;
  }

  /** put everything back in the cube */
  private clear() {
    for (const s of this.staged) this.drop(s);
    this.staged = []; this.cube.hidden.clear(); this.dirty = true;
    G.audio?.ui?.('cube_place', 0.4);
  }

  // ---------------------------------------------------------------- staging
  private spotPos(i: number, out: THREE.Vector3) {
    const x = i % SPOTS_X, z = Math.floor(i / SPOTS_X);
    return out.set(-0.12 + x * SPOT, 0.0, -0.17 + z * SPOT);
  }
  private freeSpot(near?: THREE.Vector3): number {
    let best = -1, bd = 1e9;
    for (let i = 0; i < SPOTS_X * SPOTS_Z; i++) {
      if (this.staged.some((s) => s.spot === i)) continue;
      const d = near ? this.spotPos(i, _w).distanceTo(near) : i;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  stage(it: Item, near?: THREE.Vector3): boolean {
    if (this.staged.some((s) => s.it === it)) return true;
    const spot = this.freeSpot(near);
    if (spot < 0) { this.dymo.show('the bench is full', true); return false; }
    const obj = makeItemObj(it.key);
    fitItemObj(obj, 0, SPOT * 0.9, SPOT * 0.9, SPOT * 0.6, 1.4);
    this.spotPos(spot, obj.outer.position);
    const ty = SPOT * 0.3;
    obj.outer.userData.uid = it.uid;
    obj.outer.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    this.stageG.add(obj.outer);
    const sh = shadowBlob(SPOT * 0.95, SPOT * 0.75, 0.5);
    sh.position.set(obj.outer.position.x, 0.0015, obj.outer.position.z);
    this.stageG.add(sh);
    this.staged.push({ it, obj, spot, sh });
    this.cube.hidden.add(it); this.cube.refresh();
    this.tw.add(0.2, (k) => { obj.outer.position.y = 0.12 * (1 - k) + ty; }, easeOut, () => { G.audio?.ui?.('cube_place', 0.35); });
    this.dirty = true;
    return true;
  }
  /** take a staged thing (and its shadow) off the boards */
  private drop(s: Staged) { this.stageG.remove(s.obj.outer); this.stageG.remove(s.sh); }
  private unstage(it: Item) {
    const i = this.staged.findIndex((s) => s.it === it);
    if (i < 0) return;
    this.drop(this.staged[i]);
    this.staged.splice(i, 1);
    this.cube.hidden.delete(it); this.cube.refresh();
    this.dirty = true;
  }
  /** staged things that still exist (crafting uses them up) */
  private prune() {
    const all = new Set(G.local.allItems());
    for (const s of [...this.staged]) if (!all.has(s.it)) { this.drop(s); this.staged.splice(this.staged.indexOf(s), 1); this.cube.hidden.delete(s.it); }
  }

  // ---------------------------------------------------------------- blueprint sheets: what can be made from what is on the bench
  private renderSheets() {
    const p = G.local;
    const onBench = this.staged.map((s) => s.it);
    const known: Set<string> = (p as any).knownRecipes || new Set();
    const rows: { title: string; lines: string; mark: string; ok: boolean; score: number; run: () => void }[] = [];
    const nm = (m: string) => (m.startsWith('#') ? m.slice(1) : itemDef(m).name);
    for (const h of HAND_OPS) {
      if (!h.item) continue;
      const tgt = onBench.find((it) => h.item!(it, itemDef(it.key)));
      if (!tgt) continue;
      const tool = pickTool(p, h, tgt);
      const parts = pickParts(p, h, tgt, onBench);
      const lock = h.requires && !hasUnlock(h.requires) ? researchNode(h.requires)?.title || h.requires : '';
      const miss = parts.filter((q) => q.missing).map((q) => partLabel(q.req));
      const ok = !lock && !!tool && !miss.length;
      rows.push({ ok, score: ok ? 3 : 1, run: () => { if (ok) this.handStep(tgt, h); else this.dymo.show(lock ? 'research: ' + lock : 'need ' + (tool ? miss.join(', ') : toolLabel(h)), true); },
        title: h.name, lines: itemName(tgt) + ' + ' + (tool?.it ? itemName(tool.it) : tool ? 'hands' : toolLabel(h)) + (miss.length ? '. need ' + miss.join(', ') : ''), mark: lock ? 'RESEARCH' : ok ? 'BY HAND' : 'MISSING' });
    }
    for (const r of allRecipes()) {
      const uses = r.inputs.filter((i) => !i.keep).some((inp) => onBench.some((it) => matches(it, inp.item)));
      const benchOnly = (r.needs || []).includes('workbench');
      if (!uses && !(benchOnly && onBench.length === 0)) continue;
      if (r.learned && !known.has(r.key)) {
        if (uses) rows.push({ ok: false, score: 0, run: () => this.dymo.show('schematic unknown', true), title: r.name, lines: recipeHint(r) || 'schematic unknown', mark: 'UNKNOWN' });
        continue;
      }
      const chk = checkRecipe(p, r, onBench);
      const need = this.notOnBench(r, onBench);
      const ok = chk.ok && !need.length;
      rows.push({
        ok, score: ok ? 2.5 : chk.ok ? 2 : uses ? 1 : 0.5,
        run: () => { if (ok) this.assemble(r); else if (chk.ok && need.length) this.pull(r); else this.dymo.show('need ' + chk.missing.slice(0, 2).join(', '), true); },
        title: r.name,
        lines: r.inputs.map((i) => (i.count && i.count > 1 ? i.count + 'x ' : '') + nm(i.item) + (i.keep ? ' (tool)' : '')).join(', ') + (!chk.ok ? '. need ' + chk.missing.slice(0, 2).join(', ') : ''),
        mark: ok ? 'READY' : chk.ok ? 'PULL PARTS' : 'MISSING',
      });
    }
    rows.sort((a, b) => b.score - a.score);
    for (const s of this.sheets) disposeTag(s.t);
    this.sheets = [];
    const list = rows.length ? rows.slice(0, 6) : [{ title: 'Empty bench', lines: 'drag things out of the cube onto the boards', mark: '', ok: false, score: 0, run: () => {} }];
    list.forEach((row, i) => {
      const t = pixTag('blueprint', 84, 56, 0.28);
      t.clear();
      t.type(row.title, 5, 7, undefined, 8.5, 'sign');
      t.para(row.lines, 5, 18, 76, '#c8d8f0', 7.5, 3, 6.5);
      if (row.mark) stamp(t, row.mark, 7, 45, row.ok ? '#8ae88a' : row.mark === 'PULL PARTS' || row.mark === 'BY HAND' ? '#ffd860' : '#ff7a6a');
      t.flush();
      const col = i % 3, ln = Math.floor(i / 3);
      t.mesh.position.set(-0.3 + col * 0.3, 0.098 - ln * 0.198, 0.012);
      t.mesh.rotation.z = (i % 2 ? 0.03 : -0.025);
      this.peg.add(t.mesh);
      this.sheets.push({ t, run: row.run });
    });
  }

  /** consumed inputs not yet laid out on the bench */
  private notOnBench(r: Recipe, onBench: Item[]): string[] {
    const used = new Set<Item>();
    const out: string[] = [];
    for (const inp of r.inputs) {
      if (inp.keep || inp.uses || inp.fluid) continue;
      const n = inp.count ?? 1;
      const got = onBench.filter((it) => !used.has(it) && matches(it, inp.item)).slice(0, n);
      got.forEach((g) => used.add(g));
      if (got.length < n) out.push((n - got.length > 1 ? (n - got.length) + 'x ' : '') + (inp.item.startsWith('#') ? inp.item.slice(1) : itemDef(inp.item).name.toLowerCase()));
    }
    return out;
  }

  /** lay a recipe's parts out of the cube onto the bench */
  private pull(r: Recipe) {
    const p = G.local;
    const onBench = new Set(this.staged.map((s) => s.it));
    const pool = p.allItems().filter((i) => !p.isWorn(i) && !onBench.has(i));
    for (const inp of r.inputs) {
      if (inp.keep || inp.uses || inp.fluid) continue;
      let have = this.staged.filter((s) => matches(s.it, inp.item)).length;
      for (const it of pool) { if (have >= (inp.count ?? 1)) break; if (matches(it, inp.item) && !onBench.has(it)) { this.stage(it); onBench.add(it); have++; } }
    }
  }

  private handStep(target: Item, h: HandOp) {
    const p = G.local;
    (G as any).craft?.inspect?.(target, p.containerOf(target) || p.inv, { op: h.key, bench: true });
  }

  /** hold your hands on the work until it comes together */
  private assemble(r: Recipe) {
    const speed = hasUnlock('rc_bench') ? 0.65 : 1;
    const dur = Math.max(0.9, Math.min(5, r.time * 0.12 * speed));
    this.hold = { r, t: 0, dur, down: false, tick: 0 };
    this.drawSlate();
  }
  private drawSlate() {
    const h = this.hold;
    if (!h) { this.slate.hide(); return; }
    const need = Math.max(3, Math.round(h.dur / 0.32));
    this.slate.draw(h.r.name.toUpperCase(), (h.t / h.dur) * need, need, 'hold on the bench to work it');
  }

  private finishAssemble() {
    const h = this.hold!;
    this.hold = null;
    this.slate.hide();
    const p = G.local;
    const before = new Set(p.allItems());
    const a = new CraftAction(p, h.r);
    a.prefer = this.staged.map((s) => s.it);
    try { a.perform(); } catch (e) { console.warn('bench craft', e); }
    G.missions?.set?.('craft:bench');
    const fresh = p.allItems().filter((i) => !before.has(i));
    this.prune();
    for (const it of fresh) this.stage(it);
    G.audio?.ui?.('craft_done', 0.5);
    this.top.localToWorld(_v.set(0.15, 0.05, 0));
    this.sparks.emit(_v.x, _v.y, _v.z, 20, 0xfff0b0, 0.6, 0.6);
    this.dymo.show('+ ' + (fresh.length ? itemName(fresh[0]) : h.r.name));
    this.dirty = true;
  }

  // ---------------------------------------------------------------- input
  private onKey(e: KeyboardEvent) {
    if (!this.open || this.suspended || G.input.textFocus) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (e.code === 'Escape') { if (this.hold) { this.hold = null; this.slate.hide(); } else this.close(); }
  }

  private stagedAt(x: number, y: number): Staged | null {
    pointerRay(this.rc, fpCamera(), x, y);
    const hits = this.rc.intersectObjects(this.staged.map((s) => s.obj.outer), true);
    for (const h of hits) { let o: THREE.Object3D | null = h.object; while (o && o.userData.uid === undefined) o = o.parent; const s = o ? this.staged.find((q) => q.it.uid === o!.userData.uid) : null; if (s) return s; }
    return null;
  }
  private sheetAt(x: number, y: number): Sheet | null {
    pointerRay(this.rc, fpCamera(), x, y);
    const all = [...this.sheets, ...this.fixed];
    const hits = this.rc.intersectObjects(all.map((s) => s.t.mesh), false);
    return hits[0] ? all.find((s) => s.t.mesh === hits[0].object) || null : null;
  }
  /** the bench surface point under the pointer (bench-local), or null */
  private benchAt(x: number, y: number): THREE.Vector3 | null {
    const ray = pointerRay(this.rc, fpCamera(), x, y);
    this.top.updateWorldMatrix(true, false);
    const inv = new THREE.Matrix4().copy(this.top.matrixWorld).invert();
    const r = ray.clone().applyMatrix4(inv);
    if (Math.abs(r.direction.y) < 1e-4) return null;
    const t = -r.origin.y / r.direction.y;
    if (t < 0) return null;
    const p = r.at(t, new THREE.Vector3());
    return Math.abs(p.x) < 0.76 && Math.abs(p.z) < 0.32 ? p : null;
  }

  private onDown(e: PointerEvent) {
    if (!this.open || this.suspended) return;
    this.px = e.clientX; this.py = e.clientY;
    if (this.hold) { this.hold.down = true; return; }
    const sh = this.sheetAt(e.clientX, e.clientY);
    if (sh) { this.press = { id: e.pointerId, x: e.clientX, y: e.clientY, sheet: sh }; return; }
    const s = this.stagedAt(e.clientX, e.clientY);
    if (s) { this.beginDrag(e, s.it, 'bench'); return; }
    pointerRay(this.rc, fpCamera(), e.clientX, e.clientY);
    const h = this.cube.pickAt(this.rc);
    if (h) this.beginDrag(e, h.a.items[0], 'cube');
  }

  private beginDrag(e: PointerEvent, it: Item, from: 'cube' | 'bench') {
    const ghost = makeItemObj(it.key);
    fitItemObj(ghost, 0, 0.11, 0.11, 0.08, 1.4);
    ghost.outer.visible = false;
    this.g.add(ghost.outer);
    this.drag = { id: e.pointerId, it, from, ghost, x0: e.clientX, y0: e.clientY, live: false };
  }
  private cancelDrag() { if (this.drag) { this.drag.ghost.outer.parent?.remove(this.drag.ghost.outer); this.drag = null; } }

  private onMove(e: PointerEvent) {
    if (!this.open || this.suspended) return;
    this.px = e.clientX; this.py = e.clientY;
    const d = this.drag;
    if (d && d.id === e.pointerId && !d.live && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 6) {
      d.live = true; d.ghost.outer.visible = true;
      if (d.from === 'bench') { const s = this.staged.find((q) => q.it === d.it); if (s) s.obj.outer.visible = false; }
      G.audio?.itemSound?.(d.it.key, 'pick', G.local);
      this.tag.hide();
    }
    if (!d && !this.hold && e.pointerType === 'mouse') {
      const s = this.stagedAt(e.clientX, e.clientY);
      let it = s?.it || null;
      if (!it) { pointerRay(this.rc, fpCamera(), e.clientX, e.clientY); it = this.cube.pickAt(this.rc)?.a.items[0] || null; }
      if (it) {
        const pos = s ? s.obj.outer.getWorldPosition(_v) : this.cube.itemWorldPos(it, _v);
        if (pos) { this.top.updateWorldMatrix(true, false); this.tag.item(it, 1, this.top.worldToLocal(pos)); }
      } else this.tag.hide();
    }
  }

  private onUp(e: PointerEvent) {
    if (!this.open || this.suspended) return;
    if (this.hold) { this.hold.down = false; return; }
    const pr = this.press;
    if (pr && pr.id === e.pointerId) {
      this.press = null;
      if (pr.sheet && Math.hypot(e.clientX - pr.x, e.clientY - pr.y) < 12 && this.sheetAt(e.clientX, e.clientY) === pr.sheet) { G.audio?.ui?.('bag_rot', 0.35); pr.sheet.run(); }
      return;
    }
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.cancelDrag();
    const s0 = this.staged.find((q) => q.it === d.it);
    if (s0) s0.obj.outer.visible = true;
    if (!d.live) {
      const now = performance.now();
      if (this.lastTap.uid === d.it.uid && now - this.lastTap.t < 360) { this.lastTap.uid = 0; const p = G.local; (G as any).craft?.inspect?.(d.it, p.containerOf(d.it) || p.inv, { bench: true }); }
      else this.lastTap = { uid: d.it.uid, t: now };
      return;
    }
    const other = this.stagedAt(e.clientX, e.clientY);
    if (other && other.it !== d.it) { this.combine(d.it, other.it); return; }
    const at = this.benchAt(e.clientX, e.clientY);
    if (d.from === 'cube') { if (at && at.x > -0.25) this.stage(d.it, at); return; }
    if (!at || at.x < -0.25) { this.unstage(d.it); G.audio?.ui?.('cube_place', 0.4); return; }
    const s = this.staged.find((q) => q.it === d.it);
    if (s) { const sp = this.freeSpot(at); if (sp >= 0) { s.spot = sp; this.spotPos(sp, s.obj.outer.position); s.obj.outer.position.y = SPOT * 0.3; } }
  }

  /** two things put together by hand */
  private combine(a: Item, b: Item) {
    const p = G.local;
    for (const [t, o] of [[a, b], [b, a]] as [Item, Item][]) {
      for (const h of HAND_OPS) {
        if (!h.item?.(t, itemDef(t.key))) continue;
        if (!(h.parts || []).some((pr) => pr.any.some(([m]) => matches(o, m)))) continue;
        if (h.requires && !hasUnlock(h.requires)) { this.dymo.show('research: ' + (researchNode(h.requires)?.title || ''), true); return; }
        const parts = pickParts(p, h, t, this.staged.map((s) => s.it));
        if (parts.some((q) => q.missing)) { this.dymo.show('need ' + parts.filter((q) => q.missing).map((q) => partLabel(q.req)).join(', '), true); return; }
        if (!pickTool(p, h, t)) { this.dymo.show('need ' + toolLabel(h), true); return; }
        this.handStep(t, h);
        return;
      }
    }
    const onBench = this.staged.map((s) => s.it);
    const known: Set<string> = (p as any).knownRecipes || new Set();
    const r = allRecipes().find((rr) => (!rr.learned || known.has(rr.key)) && rr.inputs.some((i) => !i.keep && matches(a, i.item)) && rr.inputs.some((i) => matches(b, i.item)) && checkRecipe(p, rr, onBench).ok);
    if (r) { if (this.notOnBench(r, onBench).length) this.pull(r); this.assemble(r); return; }
    G.audio?.ui?.('bag_bad', 0.4);
    this.dymo.show('those don\'t go together', true);
  }

  // ---------------------------------------------------------------- frame
  update() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    if (!this.open) return;
    this.tw.update(dt);
    if (this.suspended) return;
    if (this.dirty) {
      this.dirty = false;
      this.prune();
      const back = G.local.worn.get('back' as any);
      if ((back?.inv ?? null) !== this.cube.c) this.cube.setContainer(back?.inv ?? null); else this.cube.refresh();
      this.renderSheets();
    }
    for (const st of this.staged) { st.sh.position.x = st.obj.outer.position.x; st.sh.position.z = st.obj.outer.position.z; st.sh.visible = st.obj.outer.visible; }
    this.cube.update(dt);
    this.dust.update(dt, 1.6); this.sparks.update(dt, 2.4);
    this.dymo.update(dt);
    this.lampL?.update(dt);
    const d = this.drag;
    if (d?.live) { pointerRay(this.rc, fpCamera(), this.px, this.py).at(1.3, _v); d.ghost.outer.position.lerp(_v, 1 - Math.exp(-30 * dt)); }
    const h = this.hold;
    if (h && h.down) {
      const before = Math.floor(h.t / 0.32);
      h.t += dt; h.tick -= dt;
      const at = this.benchAt(this.px, this.py) || _w.set(0.2, 0, 0);
      if (h.tick <= 0) {
        h.tick = 0.32;
        const anim = h.r.anim;
        G.audio?.ui?.(anim === 'saw' ? 'craft_saw' : anim === 'hammer' ? 'craft_clang' : anim === 'stitch' || anim === 'mix' ? 'craft_wrap' : 'craft_thud', 0.4);
        const wp = this.top.localToWorld(_v.copy(at));
        if (anim === 'hammer') this.sparks.emit(wp.x, wp.y + 0.02, wp.z, 8, 0xffc050, 0.6, 0.6); else this.dust.emit(wp.x, wp.y + 0.02, wp.z, 6, 0xd8c8a0, 0.4, 0.4);
      }
      if (Math.floor(h.t / 0.32) > before) this.drawSlate();
      if (h.t >= h.dur) this.finishAssemble();
    }
    const [aR, aL] = this.arms;
    this.top.updateWorldMatrix(true, false);
    const lt = this.top.localToWorld(_v.set(-0.15, 0.03, 0.1));
    aL.target.lerp(lt, 1 - Math.exp(-12 * dt));
    let rt: THREE.Vector3;
    if (d?.live) rt = d.ghost.outer.getWorldPosition(_w).add(_v.set(0.02, -0.04, 0.03));
    else if (h?.down) rt = this.top.localToWorld((this.benchAt(this.px, this.py) || _w.set(0.2, 0, 0)).clone().setY(0.05 + Math.abs(Math.sin(now * 0.02)) * 0.05));
    else rt = this.top.localToWorld(_w.set(0.35, 0.04, 0.12));
    aR.target.lerp(rt, 1 - Math.exp(-14 * dt));
    aL.want = 'flat'; aR.want = d?.live ? 'pinch' : h?.down ? 'fist' : 'relaxed';
    poseArm(aL, Math.PI, dt); poseArm(aR, d?.live ? -Math.PI / 2 : Math.PI, dt);
  }
}
