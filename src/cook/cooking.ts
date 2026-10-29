// Hands-on cooking (first person, on the fp stage). Step up to a stove, a lit
// campfire, a grill or a drum stove and press E: the burner glows under a
// cast-iron pan and a pot, your ingredients sit on a board. Drag food into the
// pan or the pot; pieces cook on the side that touches the iron, so click one
// to flip it (Space tosses the whole pan). Hold the mouse on the pot and circle
// to stir or it catches. Raw, cooked, perfect, burnt: you can see it happen.
// Click the plate to serve: what you plated decides the dish (recipes.ts).
import { consume } from '../build/keys';
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import { clamp, lerp } from '../core/math';
import { fpGroup, fpClaim, fpRelease, fpCamera, fpBlend } from '../fp/fp';
import { worldMaterial } from '../gfx/materials';
import { ModelBuilder } from '../gfx/modelBuilder';
import { itemDef, type Item } from '../items/item';
import { createItem } from '../items/factory';
import { itemGeometry } from '../items/itemMeshes';
import { Sheet, sheetMesh, overlayRay, whenFonts, FONT } from '../build/paper';
import { aimY } from '../build/shapes';
import { fpArmsFor, type FpArm } from '../fp/hands';
import { Shape } from '../craft/shapes';
import { pixMat } from '../craft/fpTex';
import { inkMesh, ink, shade, shadowBlob, WorkLamp, Puffs, Shimmer } from '../craft/fpScene';
import { face as polyFace, ngon } from '../ui/touch/facet';
import { objDef } from '../world/objects';
import { CROPS } from '../items/worldSystems';
import { TimedAction } from '../actions/action';
import { grantNode } from '../game/research';
import { classOf, matchRecipe, recipeKnown, RECIPES, type DishRecipe } from './recipes';
import { bump, mark } from '../build/progress';
import type { Player } from '../entities/player';
import type { TileObject, Zone } from '../world/zone';

const N_SLOTS = 8;
const PAN_X = -0.17, POT_X = 0.27, PLATE = new THREE.Vector3(0.56, 0.0, 0.06);
const MEATY = new Set(['meat', 'organ', 'human', 'marrow', 'tallow']);
interface Bit { it: Item; mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; base: THREE.Color; down: number; up: number; flip: number; px: number; pz: number; spin: number; meat: boolean }
interface Slot { it: Item | null; mesh: THREE.Mesh | null; x: number; z: number }

/** a held "Cooking" action keeps the survivor at the stove in third person */
class CookingAction extends TimedAction {
  constructor(p: Player, private alive: () => boolean, fx: number, fz: number) { super(p); this.name = 'Cooking'; this.duration = 1e6; this.anim = 'cook'; this.showBar = false; this.fixedTime = true; this.locks = true; this.face = { x: fx, z: fz }; }
  isValid() { return this.alive(); }
  perform() { /* never completes */ }
}

const cookMat = (tag: string) => worldMaterial({ noVis: true, noFog: true, noGrid: true, ckTag: tag } as any) as THREE.MeshLambertMaterial;

export class CookView {
  open = false;
  private g: THREE.Group;
  private rig = new THREE.Group();
  private panG = new THREE.Group();
  private potG = new THREE.Group();
  private spoon = new THREE.Group();
  private plateM: THREE.Mesh;
  private burnerMat: THREE.MeshLambertMaterial;
  private brothMat: THREE.MeshLambertMaterial;
  private broth: THREE.Mesh;
  private flames: THREE.Mesh;
  private light = new THREE.PointLight(0xff7a2a, 1.2, 1.6, 2);
  private surface: THREE.Mesh;
  private grate!: THREE.Object3D;
  private hob!: THREE.Object3D;
  private coils!: THREE.Mesh;
  private emberMat: THREE.MeshStandardMaterial | null = null;
  private roomLamp!: WorkLamp;
  private puffs!: Puffs;
  private shimmer!: Shimmer;
  private puffT = 0;
  private tapeM!: THREE.Mesh;
  private slots: Slot[] = [];
  private bits: Bit[] = [];
  private pot: { it: Item; cls: string }[] = [];
  private potC = 0; private stick = 0; private stirA = 0; private stirring = false; private lastAng = 0;
  private drag: { slot: Slot; mesh: THREE.Mesh } | null = null;
  private dragFrom = new THREE.Vector2();
  private panKick = 0;
  private heat = 0.8;
  private kind: 'stove' | 'fire' = 'fire';
  private station: { zk: string; x: number; y: number; uid: number } | null = null;
  private sizzleT = 0; private bubbleT = 0;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private tmp = new THREE.Vector3();
  /** an empty element held as G.ui.modal while cooking (blocks walking and world clicks) */
  private token = document.createElement('div');
  private card = new Sheet(320, 330);
  private cardM: THREE.Mesh;
  private cardSig = '';
  private cardPop = 0;
  private fresh = new Set<string>();
  private knob = new THREE.Group();
  private probe = new THREE.Group();
  private probeNeedle = new THREE.Group();
  private dishM: THREE.Mesh;
  private flag = new Sheet(176, 44);
  private flagM: THREE.Mesh;
  private dishT = 0;
  /** your own hands: the left holds the skillet's handle, the right reaches for whatever you point at */
  private armL: FpArm | null = null;
  private armR: FpArm | null = null;
  private armSkin = -1;
  private rHand = new THREE.Vector3(0.1, 0.25, 0.45);
  private rGoal = new THREE.Vector3();
  private rDir = new THREE.Vector3();
  private points: THREE.Points;
  private pPos: Float32Array; private pVel: Float32Array; private pLife: Float32Array; private pCol: Float32Array; private pN = 0;
  private bitMats: THREE.MeshLambertMaterial[] = [];
  private geoCache = new Map<string, THREE.BufferGeometry>();
  /** dish keys -> quality of the last one plated (applied as a mood bonus when eaten) */
  lastQ = new Map<string, number>();

  constructor() {
    this.g = fpGroup('cook');
    this.g.add(this.rig);
    const M = cookMat('base');
    // ---- what you cook on: the hob (an enamel range) or the fire (stones, coals, logs, a grate).
    // Both sit in the room the eye shows behind them; one invisible plane takes the pointer.
    this.surface = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.95), new THREE.MeshBasicMaterial({ visible: false }));
    this.surface.rotation.x = -Math.PI / 2; this.surface.position.y = 0.0; this.rig.add(this.surface);
    this.hob = this.buildHob(); this.rig.add(this.hob);
    this.grate = this.buildFire(); this.grate.visible = false; this.rig.add(this.grate);
    // glowing coils under the pan and the pot (stove), coloured by the heat each frame
    this.burnerMat = new THREE.MeshBasicMaterial({ color: 0x000000 }) as unknown as THREE.MeshLambertMaterial;
    const coil = new Shape(8);
    for (const [x, z, r] of [[PAN_X, 0, 0.13], [POT_X, -0.04, 0.095]] as [number, number, number][]) for (let i = 0; i < 3; i++) coil.ring(x, -0.004, z, r - i * 0.035, 0.0045, 0xffffff, 12, [Math.PI / 2, 0, 0]);
    this.coils = new THREE.Mesh(coil.build(), this.burnerMat as unknown as THREE.Material);
    this.hob.add(this.coils);
    // flames licking up round the pan (fires): faceted tongues, additive, each its own flicker
    this.flames = new THREE.Group() as unknown as THREE.Mesh;
    const tongue = new Shape(4); tongue.lathe(0, 0, 0, [[0.022, 0], [0.026, 0.02], [0.016, 0.05], [0.006, 0.075], [0, 0.09]], 0xffffff, 5);
    const tg = tongue.build();
    for (let i = 0; i < 12; i++) {
      const a = i * 0.53 + 0.2, r = 0.19 + (i % 3) * 0.03;
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0xffd070 : i % 3 === 1 ? 0xff8a2a : 0xe8501a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.position.set(PAN_X + Math.cos(a) * r, -0.075, Math.sin(a) * r);
      m.userData.ph = i * 1.7; m.userData.s = 0.7 + (i % 4) * 0.2; m.renderOrder = 5;
      (this.flames as unknown as THREE.Group).add(m);
    }
    this.rig.add(this.flames);
    // ---- cast-iron skillet: a thick base, a flared lip, a long handle with a hanging hole
    const sk = new Shape(6);
    sk.lathe(0, 0, 0, [[0, 0.0], [0.15, 0.0], [0.163, 0.004], [0.17, 0.018], [0.178, 0.042], [0.184, 0.048], [0.18, 0.05], [0.172, 0.044], [0.162, 0.016], [0.15, 0.01], [0, 0.01]], 0xffffff, 12);
    sk.rod([-0.17, 0.03, 0], [-0.45, 0.068, 0], 0.012, 0xffffff, 6);
    sk.ring(-0.465, 0.07, 0, 0.016, 0.006, 0xffffff, 8, [Math.PI / 2, 0, 0]);
    sk.box(-0.19, 0.022, 0, 0.05, 0.022, 0.03, 0xffffff, 0.006);
    const pan = new THREE.Mesh(sk.build(), pixMat('castIron', { color: 0x9a9a9a }));
    pan.castShadow = true;
    this.panG.add(pan); this.panG.add(inkMesh(pan.geometry, 0.0025));
    this.panG.position.set(PAN_X, 0.0, 0);
    this.rig.add(this.panG);
    // ---- stock pot: galvanised, a rolled rim, two loop handles; broth and a wooden spoon
    const pt = new Shape(7);
    pt.lathe(0, 0, 0, [[0, 0], [0.1, 0], [0.108, 0.006], [0.11, 0.02], [0.11, 0.128], [0.116, 0.132], [0.112, 0.136], [0.104, 0.13], [0.104, 0.012], [0, 0.012]], 0xffffff, 12);
    for (const sx of [-1, 1]) pt.ring(sx * 0.122, 0.108, 0, 0.018, 0.0045, 0xd0d0d0, 8, [0, Math.PI / 2, 0]);
    const potM = new THREE.Mesh(pt.build(), pixMat('galv', { side: THREE.DoubleSide }));
    potM.castShadow = true;
    this.potG.add(potM); this.potG.add(inkMesh(potM.geometry, 0.0025));
    this.brothMat = cookMat('broth');
    const bb = new ModelBuilder(); bb.cylinder(0, 0, 0, 0.102, 0.004, 12, 'white');
    this.broth = new THREE.Mesh(bb.build(), this.brothMat); this.broth.position.y = 0.03; this.potG.add(this.broth);
    const spS = new Shape(9); spS.lathe(0, 0, 0, [[0, 0], [0.016, 0.008], [0.019, 0.03], [0.012, 0.052], [0.006, 0.06], [0.0065, 0.26], [0.004, 0.27], [0, 0.272]], 0xffffff, 6);
    const sp = new THREE.Mesh(spS.build(), pixMat('handle', { color: 0xb08860 }));
    sp.rotation.z = 0.35; this.spoon.add(sp); this.spoon.position.set(0.05, 0.02, 0); this.potG.add(this.spoon);
    this.potG.position.set(POT_X, 0, -0.04);
    this.rig.add(this.potG);
    // ---- the butcher-block board on its own blocks, and a chipped enamel camp plate
    const bd = new Shape(4);
    bd.jbox(-0.28, -0.02, 0.3, 0.8, 0.034, 0.17, 0xffffff, 0.003, 21);
    const board = new THREE.Mesh(bd.build(), pixMat('endgrain'));
    board.receiveShadow = true; board.castShadow = true;
    this.rig.add(board); this.rig.add(inkMesh(board.geometry, 0.003));
    const knife = new Shape(6); knife.plate(0, 0, 0, [new THREE.Vector2(0, 0), new THREE.Vector2(0.16, 0.004), new THREE.Vector2(0.17, 0.022), new THREE.Vector2(0, 0.026)], 0.003, 0xffffff);
    const kn = new THREE.Mesh(knife.build(), pixMat('steel')); kn.rotation.set(-Math.PI / 2, 0, 0.12); kn.position.set(0.0, 0.016, 0.35); this.rig.add(kn);
    const kh = new Shape(9); kh.box(-0.05, 0, 0.0, 0.1, 0.018, 0.022, 0xffffff, 0.006);
    const khm = new THREE.Mesh(kh.build(), pixMat('handle', { color: 0x7a5032 })); khm.rotation.y = -0.12; khm.position.set(0.0, 0.014, 0.362); this.rig.add(khm);
    const pl = new Shape(5);
    pl.lathe(0, 0, 0, [[0, 0], [0.07, 0], [0.074, 0.004], [0.09, 0.008], [0.11, 0.016], [0.114, 0.019], [0.108, 0.02], [0.088, 0.012], [0.07, 0.006], [0, 0.006]], 0xffffff, 12);
    this.plateM = new THREE.Mesh(pl.build(), pixMat('enamelCream', { color: 0xf0f0ff }));
    this.plateM.castShadow = true;
    this.plateM.add(inkMesh(this.plateM.geometry, 0.0025));
    this.plateM.position.copy(PLATE); this.rig.add(this.plateM);
    for (let i = 0; i < N_SLOTS; i++) this.slots.push({ it: null, mesh: null, x: -0.6 + i * 0.09, z: 0.3 });
    for (let i = 0; i < 10; i++) this.bitMats.push(cookMat('bit' + i));
    // light: the heat glow from under the pan, a cold room light from above and behind that throws the shadows
    this.light.position.set(PAN_X, 0.04, 0.02); this.rig.add(this.light);
    this.roomLamp = new WorkLamp(this.rig, new THREE.Vector3(-0.3, 1.3, -0.5), new THREE.Vector3(0.05, 0, 0.05), { color: 0xd8dce8, intensity: 3, angle: 0.9, dist: 3, mapSize: 512 });
    this.rig.add(new THREE.HemisphereLight(0x8a90a0, 0x2a1a10, 0.45));
    for (const [x, z, w, d] of [[PAN_X, 0, 0.42, 0.34], [POT_X, -0.04, 0.27, 0.24], [PLATE.x, PLATE.z, 0.26, 0.22]] as [number, number, number, number][]) { const sb = shadowBlob(w, d, 0.55); sb.position.set(x, 0.001, z); this.rig.add(sb); }
    // smoke, steam and the shimmer of heat over the fire
    this.puffs = new Puffs(30); this.rig.add(this.puffs.g);
    this.shimmer = new Shimmer(5, 0.12, 0.3); this.shimmer.g.position.set(PAN_X, 0.05, -0.02); this.rig.add(this.shimmer.g);
    // smoke / steam / spatter points
    const N = 96;
    this.pPos = new Float32Array(N * 3); this.pVel = new Float32Array(N * 3); this.pLife = new Float32Array(N); this.pCol = new Float32Array(N * 3);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(pg, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
    this.points.frustumCulled = false; this.rig.add(this.points);
    // camera framing: looking down at the stovetop, the room above its back edge
    this.rig.position.set(0, 0.0, -1.75);
    this.rig.rotation.x = 0.82;
    // ---- the recipe card, propped against the back of the stove (typed, coffee-stained)
    this.cardM = sheetMesh(this.card, 0.27, 0.27 * 330 / 320);
    this.cardM.position.set(0.6, 0.14, -0.34); this.cardM.rotation.set(-0.32, -0.22, 0.04);
    this.rig.add(this.cardM);
    // ---- a strip of embossed label tape along the front edge: the controls
    const tape = new Sheet(1024, 38);
    whenFonts(() => {
      tape.fill(0x161616); tape.grain(0.1, 9);
      tape.text('CLICK FOOD: FLIP · SPACE: TOSS · HOLD THE POT & CIRCLE: STIR · PLATE: SERVE · E: STEP BACK', 512, 7, { font: FONT.sign, size: 22, color: 0xe8e8e0, align: 'center', weight: '600' });
      tape.commit();
    });
    const tm = sheetMesh(tape, 0.96, 0.036); tm.position.set(-0.08, -0.03, 0.402); this.rig.add(tm); this.tapeM = tm;
    // ---- the bakelite heat knob (stoves)
    const knS = new Shape(8); knS.lathe(0, 0, 0, [[0, 0], [0.034, 0], [0.036, 0.006], [0.033, 0.022], [0.026, 0.03], [0, 0.031]], 0xffffff, 8);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; knS.box(Math.cos(a) * 0.034, 0.004, Math.sin(a) * 0.034, 0.006, 0.02, 0.006, 0xd0c0b0, 0.002, [0, -a, 0]); }
    const knm = new THREE.Mesh(knS.build(), pixMat('bakelite'));
    const tkS = new Shape(8); tkS.box(0, 0.029, 0.013, 0.005, 0.004, 0.022, 0xffffff, 0.0015);
    knm.add(new THREE.Mesh(tkS.build(), pixMat('enamelCream')));
    knm.rotation.x = Math.PI / 2; this.knob.add(knm);
    this.knob.position.set(0.62, -0.03, 0.4); this.rig.add(this.knob);
    // ---- a probe thermometer that sticks into whatever you look at
    const face = new Sheet(96, 96); whenFonts(() => { octFace(face, '°F'); face.commit(); });
    const prS = new Shape(8); prS.lathe(0, 0, 0, [[0, -0.095], [0.0018, -0.093], [0.003, -0.08], [0.003, -0.004], [0.026, -0.002], [0.029, 0.004], [0.028, 0.012], [0.024, 0.013], [0, 0.013]], 0xffffff, 8);
    const prm = new THREE.Mesh(prS.build(), pixMat('chrome')); this.probe.add(prm);
    const fm = new THREE.Mesh(polyFace(ngon(8, 0.025)), new THREE.MeshLambertMaterial({ map: face.tex })); fm.rotation.x = -Math.PI / 2; fm.position.y = 0.0125; this.probe.add(fm);
    const nd = new ModelBuilder(); nd.box(0, 0, -0.0095, 0.0022, 0.0016, 0.019, 'white', { color: 0xc8302a });
    this.probeNeedle.add(new THREE.Mesh(nd.build(), M)); this.probeNeedle.position.y = 0.0135; this.probe.add(this.probeNeedle);
    this.probe.rotation.x = -0.5; this.probe.visible = false; this.rig.add(this.probe);
    // ---- the plated dish and its little paper flag
    this.dishM = new THREE.Mesh(new THREE.BufferGeometry(), M); this.dishM.visible = false; this.rig.add(this.dishM);
    this.flagM = sheetMesh(this.flag, 0.1, 0.025); this.flagM.visible = false; this.rig.add(this.flagM);
    window.addEventListener('mousedown', (e) => this.onDown(e), true);
    window.addEventListener('mouseup', (e) => this.onUp(e), true);
    // touch: the finger is the cursor (drag food, circle the pot); swallow the emulated mouse events
    const fake = (t: Touch, e: TouchEvent) => ({ button: 0, clientX: t.clientX, clientY: t.clientY, stopPropagation: () => e.stopPropagation() }) as unknown as MouseEvent;
    const aim = (t: Touch) => { G.input.mouseX = t.clientX; G.input.mouseY = t.clientY; };
    window.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; if (!this.open || !t) return; aim(t); if (this.hit()) { e.preventDefault(); this.onDown(fake(t, e)); } }, { capture: true, passive: false });
    window.addEventListener('touchmove', (e) => { const t = e.changedTouches[0]; if (!this.open || !t || (!this.drag && !this.stirring)) return; aim(t); e.preventDefault(); }, { capture: true, passive: false });
    window.addEventListener('touchend', (e) => { const t = e.changedTouches[0]; if (!this.open || !t || (!this.drag && !this.stirring)) return; aim(t); e.preventDefault(); this.onUp(fake(t, e)); }, { capture: true, passive: false });
    window.addEventListener('wheel', (e) => { if (this.open && this.kind === 'stove') { this.heat = clamp(this.heat - Math.sign(e.deltaY) * 0.1, 0.2, 1.2); } }, { passive: true });
    bus.on('fpLost', (n: string) => { if (n === 'cook' && this.open) this.close(); });
    bus.on('travelEnd', () => this.close());
  }

  /** an enamel range: chipped cream top, cast-iron trivets over the coils, a chrome trim, the oven door below */
  private buildHob(): THREE.Group {
    const g = new THREE.Group();
    const en = new Shape(4), iron = new Shape(6), chrome = new Shape(6), dark = new Shape(6);
    en.box(0, -0.05, 0, 1.62, 0.05, 0.88, 0xffffff, 0.012);
    en.box(0, -0.75, 0.42, 1.62, 0.7, 0.03, 0xf0ece0, 0.01);
    en.box(0, 0, -0.45, 1.62, 0.2, 0.05, 0xffffff, 0.012);
    chrome.box(0, -0.06, 0.448, 1.64, 0.018, 0.012, 0xffffff, 0.004);
    chrome.capsule(-0.5, -0.16, 0.46, 0.008, 1.0, 0xffffff, [0, 0, -Math.PI / 2]);
    for (const x of [-0.55, 0.55]) chrome.box(x, -0.18, 0.44, 0.03, 0.04, 0.03, 0xd0d0d0, 0.006);
    // the drip pans and the trivets
    for (const [x, z, r] of [[PAN_X, 0, 0.17], [POT_X, -0.04, 0.13]] as [number, number, number][]) {
      chrome.lathe(x, -0.012, z, [[0.03, 0], [r, 0.004], [r + 0.012, 0.012], [r + 0.01, 0.014], [r - 0.01, 0.006], [0.03, 0.002]], 0xb8b8b0, 10);
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; iron.box(x + Math.cos(a) * r * 0.62, -0.01, z + Math.sin(a) * r * 0.62, r * 0.9, 0.012, 0.014, 0xffffff, 0.003, [0, -a, 0]); }
      iron.lathe(x, -0.012, z, [[r + 0.005, 0], [r + 0.02, 0], [r + 0.02, 0.012], [r + 0.005, 0.012]], 0xffffff, 8);
    }
    // the back guard: a clock that stopped, a row of dead pilot lamps
    dark.box(0.42, 0.06, -0.42, 0.16, 0.09, 0.012, 0x2a2622, 0.004);
    for (let i = 0; i < 4; i++) chrome.dome(-0.55 + i * 0.12, 0.1, -0.422, 0.012, 0xa08870);
    for (let i = 0; i < 6; i++) dark.gem(-0.3 + Math.sin(i * 3.1) * 0.5, -0.0005, 0.25 + Math.cos(i * 1.7) * 0.15, 0.018 + (i % 3) * 0.01, 0x3a2410, 0.3, i, [1.6, 0.06, 1]);
    const mesh = (sh: Shape, mat: THREE.Material) => { const m = new THREE.Mesh(sh.build(), mat); g.add(m); return m; };
    mesh(en, pixMat('enamelCream')); mesh(iron, pixMat('castIron')); mesh(chrome, pixMat('chrome')); mesh(dark, pixMat('soot'));
    ink(g, 0.003); shade(g);
    return g;
  }

  /** a campfire: a ring of sooted stones on an ash bed, logs burning down to coals, an iron grate across, a flat stone for the plate */
  private buildFire(): THREE.Group {
    const g = new THREE.Group();
    const stone = new Shape(6), ash = new Shape(3), embers = new Shape(5), logs = new Shape(8), grate = new Shape(6), crate = new Shape(4), wood = new Shape(6);
    const cx = -0.02, cz = -0.06;
    ash.lathe(cx, -0.1, cz, [[0, 0.012], [0.4, 0.008], [0.62, 0.0], [0.7, -0.01]], 0xffffff, 10, undefined, [1.05, 1, 0.62]);
    embers.gem(cx - 0.05, -0.1, cz, 0.36, 0xffffff, 0.12, 5, [1.15, 0.12, 0.58]);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2, r = 0.075 + ((i * 7) % 5) * 0.008;
      stone.gem(cx + Math.cos(a) * 0.56, -0.07, cz + Math.sin(a) * 0.34, r, i % 2 ? 0xd8d4cc : 0xb8b4ac, 0.22, i + 3, [1.1, 0.75, 0.9]);
    }
    for (const [ax, az, bx, bz] of [[-0.42, 0.08, 0.2, -0.18], [-0.3, -0.24, 0.3, 0.06], [0.0, -0.3, -0.08, 0.16]]) logs.rod([cx + ax, -0.07, cz + az], [cx + bx, -0.045, cz + bz], 0.036, 0xffffff, 6);
    // the grate: two rails on the stones, bars across
    for (const z of [-0.3, 0.2]) grate.box(cx, -0.03, cz + z * 0.9 + 0.04, 1.06, 0.018, 0.024, 0xffffff, 0.004);
    for (let x = -0.5; x <= 0.5; x += 0.07) grate.box(cx + x, -0.014, cz + 0.0, 0.012, 0.012, 0.5, 0xffffff, 0.003);
    // a flat stone for the plate, a crate the recipe card leans on, the split logs under the board, a woodpile
    stone.gem(PLATE.x, -0.06, PLATE.z, 0.15, 0xc8c4bc, 0.15, 41, [1, 0.32, 0.85]);
    crate.jbox(0.68, -0.1, -0.42, 0.28, 0.24, 0.2, 0xffffff, 0.003, 3);
    for (const x of [-0.6, 0.04]) wood.rod([x, -0.06, 0.22], [x, -0.06, 0.38], 0.04, 0xffffff, 6);
    for (let i = 0; i < 4; i++) wood.rod([-0.85 + (i % 2) * 0.05, -0.08 + Math.floor(i / 2) * 0.07, -0.45], [-0.6 + (i % 2) * 0.05, -0.08 + Math.floor(i / 2) * 0.07, -0.2], 0.035, i % 2 ? 0xd8c8b0 : 0xffffff, 6);
    const mesh = (sh: Shape, mat: THREE.Material) => { const m = new THREE.Mesh(sh.build(), mat); g.add(m); return m; };
    mesh(ash, pixMat('ash', { glow: 0.8 }));
    const em = mesh(embers, pixMat('embers', { glow: 1.4 })); this.emberMat = em.material as THREE.MeshStandardMaterial;
    mesh(stone, pixMat('stone')); mesh(logs, pixMat('charLog', { glow: 1.6 })); mesh(grate, pixMat('rust', { color: 0x8a8480 }));
    mesh(crate, pixMat('crate')); mesh(wood, pixMat('plank', { color: 0xc8b8a0 }));
    ink(g, 0.003); shade(g);
    return g;
  }

  // ================================================================= open / close
  /** is this object a cooking station (and how) */
  stationKind(o: TileObject): 'stove' | 'fire' | null {
    const d = objDef(o.key); if (!d?.heat) return null;
    if (d.heat === 'stove') return 'stove';
    if (d.heat === 'fire' || d.heat === 'grill') return 'fire';
    if (o.key === 'campfire_unlit') return 'fire';
    return null;
  }

  private ensureArms(p: Player) {
    const skin = (p as any).app?.skin ?? 0xe8b98f;
    if (this.armL && this.armSkin === skin) return;
    if (this.armL) { this.armL.root.removeFromParent(); this.armR!.root.removeFromParent(); this.armL.dispose(); this.armR!.dispose(); }
    const a = fpArmsFor(p as any);
    this.armL = a.left; this.armR = a.right; this.armSkin = skin;
    // left hand round the skillet's handle (it rides the pan when you toss)
    const hand = new THREE.Vector3(-0.45, 0.05, 0.0), dir = new THREE.Vector3(0.12, -0.16, -0.3).normalize();
    aimY(this.armL.root, dir, new THREE.Vector3(0, -1, 0.2));
    this.armL.root.position.copy(hand).addScaledVector(dir, -0.3);
    this.panG.add(this.armL.root);
    this.armL.pose('grip', true);
    this.rig.add(this.armR.root);
    this.armR.pose('relaxed', true);
  }
  /** the right arm reaches for the cursor: the hand eases toward the goal, the elbow trails toward you */
  private updateArms(dt: number, hov: ReturnType<CookView['hit']>) {
    const L = this.armL, R = this.armR; if (!L || !R) return;
    const pt = this.drag ? this.drag.mesh.position : this.stirring ? null : hov ? this.lastPt : null;
    if (this.stirring) { this.spoon.getWorldPosition(this.rGoal); this.rig.worldToLocal(this.rGoal); this.rGoal.y += 0.2; this.rGoal.x += Math.sin(this.stirA) * 0.03; this.rGoal.z += Math.cos(this.stirA) * 0.03; }
    else if (pt) this.rGoal.set(pt.x + 0.02, (this.drag ? pt.y : 0.02) + 0.09, pt.z + 0.06);
    else this.rGoal.set(0.42, 0.12, 0.48);
    this.rHand.lerp(this.rGoal, 1 - Math.exp(-dt * 10));
    this.rDir.set(0.1, -0.2, -0.32).normalize();
    aimY(R.root, this.rDir, new THREE.Vector3(0, -1, 0.15));
    R.root.position.copy(this.rHand).addScaledVector(this.rDir, -0.3);
    R.pose(this.drag ? 'pinch' : this.stirring ? 'grip' : hov?.kind === 'bit' ? 'point' : hov?.kind === 'slot' ? 'open' : 'relaxed');
    L.update(dt); R.update(dt);
  }
  private lastPt: THREE.Vector3 | null = null;

  openAt(p: Player, o: TileObject): boolean {
    const kind = this.stationKind(o); if (!kind || this.open) return false;
    this.ensureArms(p);
    const z = G.getZone(p.zoneKey);
    // light a cold fire on the way in if we can
    if (kind === 'fire' && !this.litAt(z, o.x, o.y)) {
      const igniter = p.findTool('#lighter') || p.findTool('#matches') || p.findTool('#firestarter');
      const fuel = p.findItem((_i, d) => !!d.burn);
      if (igniter && (fuel || (o.state.fuel ?? 0) > 0 || o.key === 'campfire_unlit')) G.items?.lightFire?.(p, o, igniter, fuel);
      else { bus.emit('think', p, 'Cold. I need something to light it, and something to burn.'); return true; }
    }
    if (!fpClaim('cook', 3, { cinematic: 'full', eyePitch: 34 })) return false;
    this.kind = kind;
    this.station = { zk: z.key, x: o.x, y: o.y, uid: o.uid };
    this.heat = kind === 'stove' ? 0.8 : 1;
    this.open = true;
    this.fillBoard(p);
    G.ui && (G.ui.modal = this.token);
    this.knob.visible = kind === 'stove';
    this.hob.visible = kind === 'stove'; this.grate.visible = kind !== 'stove';
    // the label tape: along the range's front edge, or along the chopping board by the fire
    if (kind === 'stove') { this.tapeM.position.set(-0.08, -0.026, 0.4425); this.tapeM.scale.setScalar(1); }
    else { this.tapeM.position.set(-0.28, -0.003, 0.3858); this.tapeM.scale.set(0.8, 0.8, 1); }
    p.actions.clear();
    p.actions.add(new CookingAction(p, () => this.open, o.x + 0.5, o.y + 0.5));
    this.rig.position.y = -0.5; // slides up into view
    G.audio?.ui?.('metal_clank', 0.4);
    this.cardSig = '';
    bus.emit('cookOpen', o);
    return true;
  }

  close() {
    if (!this.open) return;
    const p = G.local;
    this.open = false;
    // whatever is still in the pan or pot comes back with how cooked it got
    for (const b of this.bits) { this.giveBack(p, b.it, Math.min(b.down, b.up), Math.max(b.down, b.up)); this.rig.remove(b.mesh); }
    for (const q of this.pot) this.giveBack(p, q.it, this.potC, this.potC + this.stick);
    this.bits = []; this.pot = []; this.potC = 0; this.stick = 0;
    for (const s of this.slots) { if (s.mesh) this.rig.remove(s.mesh); s.mesh = null; s.it = null; }
    if (this.drag) { this.rig.remove(this.drag.mesh); this.drag = null; }
    if (G.ui?.modal === this.token) G.ui.modal = null;
    this.dishM.visible = this.flagM.visible = false;
    fpRelease('cook');
    if (p && p.actions.current instanceof CookingAction) p.actions.clear();
    if (p) bus.emit('inventoryChanged', p);
  }
  private giveBack(p: Player | undefined, it: Item, lo: number, hi: number) {
    if (!p) return;
    if (hi >= 1.6) it.cooked = 1.7; else if (lo >= 0.8) it.cooked = 1; else it.cooked = Math.max(it.cooked ?? 0, lo * 0.9);
    p.inv.add(it);
  }

  private litAt(z: Zone, x: number, y: number): boolean {
    for (const o of z.objectsAt(x, y)) {
      if (o.key === 'campfire') return o.state.lit !== false;
      const d = objDef(o.key);
      if (d?.heat === 'stove') return true;
      if ((d?.heat === 'fire' || d?.heat === 'grill') && o.state.lit) return true;
    }
    return false;
  }
  /** live heat 0..1.2 from the station (fires burn out, stoves need power) */
  private stationHeat(): number {
    const s = this.station; if (!s) return 0;
    const z = G.zones.get(s.zk); if (!z) return 0;
    if (this.kind === 'stove') {
      const o = z.objects.get(s.uid); if (!o) return 0;
      const powered = z.circuitPowered(z.roomAt(o.x, o.y).circuit) || !!G.items?.generatorPowers?.(z, o.x, o.y);
      return powered ? this.heat : 0;
    }
    return this.litAt(z, s.x, s.y) ? 1 : 0;
  }

  // ================================================================= the board
  private cookable(it: Item): boolean {
    const d = itemDef(it.key), f = d.food;
    if (!f || f.canned || f.pills || d.tags?.includes('dish')) return false;
    if ((it.cooked ?? 0) >= 1.6) return false;
    return !!f.cookable || ['veg', 'fruit', 'sweet', 'grain', 'egg', 'weird'].includes(f.ingredient ?? '') || !!d.tags?.includes('produce');
  }
  private fillBoard(p: Player) {
    const items = p.allItems().filter((i) => this.cookable(i));
    const rank = (i: Item) => (MEATY.has(classOf(i.key)) ? 0 : classOf(i.key) === 'veg' ? 1 : 2);
    items.sort((a, b) => rank(a) - rank(b));
    for (const s of this.slots) { if (s.mesh) this.rig.remove(s.mesh); s.mesh = null; s.it = null; }
    let i = 0;
    for (const it of items) {
      if (i >= N_SLOTS) break;
      const s = this.slots[i++];
      s.it = it;
      s.mesh = new THREE.Mesh(this.bitGeo(it), cookMat('board'));
      s.mesh.position.set(s.x, 0.03, s.z);
      s.mesh.rotation.y = (i * 1.7) % 1;
      this.rig.add(s.mesh);
    }
  }
  /** a cooking-sized chunk for an ingredient (meat slab, veg ball, organ lump, glowing gland) */
  private bitGeo(it: Item): THREE.BufferGeometry {
    const c = classOf(it.key);
    const key = c === 'veg' || c === 'fruit' ? 'v:' + it.key : c;
    let g = this.geoCache.get(key);
    if (g) return g;
    const mb = new ModelBuilder();
    if (c === 'veg' || c === 'fruit' || c === 'sweet' || c === 'grain' || c === 'egg' || c === 'extra') {
      const crop = Object.values(CROPS).find((q) => q.item === it.key);
      const col = crop?.color ?? itemDef(it.key).tint ?? (c === 'egg' ? 0xf2ead0 : c === 'sweet' ? 0xf2d890 : 0x8ac05a);
      mb.sphere(0, 0.022, 0, 0.032, 7, 5, 'white', { color: col, sy: 0.75 });
      mb.sphere(0.024, 0.02, 0.012, 0.022, 6, 4, 'white', { color: col, sy: 0.7 });
    } else if (c === 'organ' || c === 'glow' || c === 'tallow' || c === 'weird') {
      const col = itemDef(it.key).tint ?? 0x8a2234;
      mb.sphere(0, 0.024, 0, 0.042, 7, 5, c === 'organ' ? 'i_bt_organ' : 'white', { color: c === 'organ' ? 0xffffff : col, sy: 0.6, emissive: c === 'glow' ? 0.8 : 0 });
    } else {
      // a rounded cut: a plump slab with a fat cap along one edge
      const t = c === 'human' ? 'i_bt_pale' : 'i_bt_marble';
      mb.push().scale(1.35, 1, 0.9); mb.sphere(0, 0.017, 0, 0.042, 10, 6, t, { sy: 0.42 }); mb.pop();
      mb.push().translate(0.0, 0.02, 0.03).scale(1.3, 1, 0.45); mb.sphere(0, 0, 0, 0.034, 8, 4, t, { sy: 0.35, color: 0xf2e0d8 }); mb.pop();
    }
    g = mb.build(); this.geoCache.set(key, g);
    return g;
  }

  // ================================================================= cooking
  private addToPan(it: Item) {
    if (this.bits.length >= 6) { bus.emit('think', G.local, 'The pan is full.'); return false; }
    const i = this.bits.length, a = i * 2.2 + 0.4, r = i === 0 ? 0.0 : 0.09;
    const mat = this.bitMats[i % this.bitMats.length];
    const mesh = new THREE.Mesh(this.bitGeo(it), mat);
    const b: Bit = { it, mesh, mat, base: new THREE.Color(1, 1, 1), down: Math.max(0, (it.cooked ?? 0) * 0.9), up: Math.max(0, (it.cooked ?? 0) * 0.9), flip: 0, px: PAN_X + Math.cos(a) * r, pz: Math.sin(a) * r, spin: Math.random() * 6, meat: MEATY.has(classOf(it.key)) };
    mesh.position.set(b.px, 0.25, b.pz);
    this.rig.add(mesh);
    this.bits.push(b);
    this.spatter(b.px, 0.04, b.pz, 10);
    G.audio?.ui?.('sizzle', 0.5 * this.stationHeat() + 0.1);
    return true;
  }
  private addToPot(it: Item) {
    if (this.pot.length >= 5) { bus.emit('think', G.local, 'The pot is full.'); return false; }
    this.pot.push({ it, cls: classOf(it.key) });
    this.splash(POT_X, 0.06, -0.04, 8);
    G.audio?.ui?.('pour', 0.4);
    return true;
  }
  flip(b: Bit) { if (b.flip > 0) return; b.flip = 0.0001; G.audio?.ui?.('pan_toss', 0.45); this.spatter(b.px, 0.05, b.pz, 6); }
  toss() {
    if (!this.bits.length) return;
    this.panKick = 1;
    for (const b of this.bits) if (Math.random() < 0.85) { b.flip = 0.0001 - Math.random() * 0.12; }
    G.audio?.ui?.('pan_toss', 0.7);
    this.spatter(PAN_X, 0.06, 0, 18);
  }

  update(dt: number) {
    if (!this.open) return;
    const p = G.local;
    const inp = G.input;
    if (!p || p.body.dead) { this.close(); return; }
    // leave
    if (inp.hit('pause') || inp.hit('interact')) { consume('pause', 'interact'); this.close(); return; }
    if (inp.mouseReleased[2] && !this.drag) { this.close(); return; }
    if (inp.hit('shove')) this.toss();
    const H = this.stationHeat();
    // slide the rig into place, pan kick
    // the stove rises into view with the cut-in
    // portrait: the whole fire steps back (and down, filling the bottom) so the board, the pan, the pot and the plate all fit across
    const asp = innerWidth / Math.max(1, innerHeight);
    this.rig.position.y = lerp(-0.5, asp >= 1.2 ? 0.0 : -0.17, fpBlend());
    this.rig.scale.setScalar(asp >= 1.2 ? 1 : Math.max(0.36, asp * 0.8));
    this.panKick = Math.max(0, this.panKick - dt * 3.5);
    const kick = Math.sin(this.panKick * Math.PI) * 0.06;
    this.panG.position.y = kick; this.panG.rotation.z = -kick * 1.5;
    // burner glow + flames + light
    const fl = 0.85 + Math.sin(G.time * 13) * 0.08 + Math.sin(G.time * 31) * 0.05;
    this.burnerMat.color.setRGB(Math.min(1, H * 1.0 * fl), H * 0.35 * fl, H * 0.08);
    const fire = this.kind === 'fire';
    this.flames.visible = fire && H > 0;
    if (this.flames.visible) for (const m of this.flames.children) { const u = m.userData; const f = 0.6 + 0.4 * Math.sin(G.time * (9 + u.s * 4) + u.ph) * Math.sin(G.time * 23 + u.ph * 2); m.scale.set(u.s, u.s * (0.5 + H * 0.9 * f), u.s); m.rotation.y = G.time * 2 + u.ph; }
    this.light.intensity = H * (fire ? 2.6 : 1.1) * fl;
    if (this.emberMat) this.emberMat.emissiveIntensity = (0.5 + H * 1.3) * fl;
    this.roomLamp.update(dt, 0.02);
    // smoke off the fire, steam off the pot, the air wavering over the heat
    this.puffT -= dt;
    if (this.puffT <= 0 && H > 0.1) {
      this.puffT = fire ? 0.16 : 0.4;
      if (fire) this.puffs.emit(PAN_X + 0.2 + (Math.random() - 0.5) * 0.5, 0.02, -0.26 + Math.random() * 0.08, 0x3a3632, 0.045, 2.0, 0.14, 0.06);
    }
    this.puffs.update(dt);
    this.shimmer.update(G.time, fire ? H : H * 0.5);
    // pan pieces: the side on the iron cooks
    const rate = H * 0.11;
    let sizzle = 0;
    for (const b of this.bits) {
      const ck = rate * (b.meat ? 0.85 : 1.25) / Math.max(0.6, (itemDef(b.it.key).food?.cookMins ?? 15) / 18);
      b.down += ck * dt;
      b.up += ck * dt * 0.12; // a little heat through the top
      sizzle += H;
      // flip animation
      if (b.flip !== 0) {
        b.flip += dt / 0.42;
        if (b.flip >= 1) { b.flip = 0; const t = b.down; b.down = b.up; b.up = t; }
      }
      const f = Math.max(0, b.flip);
      const yy = 0.012 + kick + Math.sin(f * Math.PI) * 0.16;
      b.mesh.position.set(b.px, lerp(b.mesh.position.y, yy, b.flip > 0 ? 1 : 1 - Math.exp(-dt * 14)), b.pz);
      b.mesh.rotation.set(f * Math.PI, b.spin, 0);
      // colour: what you see is the top; the edges show the underside
      const top = b.up * 0.7 + b.down * 0.3, hi = Math.max(b.up, b.down);
      this.tint(b.mat, top, hi, b.meat);
      if (hi > 1.25 && Math.random() < dt * (hi - 1.1) * 8) this.smoke(b.px, 0.05, b.pz, hi > 1.6);
      if (b.down > 1.6 && Math.random() < dt * 2) this.flare(b.px, b.pz);
    }
    // pot: cooks together, sticks unless stirred
    if (this.pot.length) {
      this.potC += H * 0.06 * dt;
      this.stick = clamp(this.stick + H * dt * (this.stirring ? -0.35 : 0.03), 0, 1.5);
      const c = this.potC + this.stick * 0.6;
      this.brothMat.color.setRGB(lerp(0.75, 0.45, clamp(c, 0, 1)) * (c > 1.6 ? 0.4 : 1), lerp(0.62, 0.26, clamp(c, 0, 1)) * (c > 1.6 ? 0.4 : 1), lerp(0.42, 0.12, clamp(c, 0, 1)) * (c > 1.6 ? 0.4 : 1));
      this.broth.position.y = 0.05 + Math.min(4, this.pot.length) * 0.012 + Math.sin(G.time * 9) * 0.002 * H;
      if (H > 0.3 && this.potC > 0.4 && Math.random() < dt * 6 * H) this.steam(POT_X, 0.12, -0.04);
      this.bubbleT -= dt;
      if (this.bubbleT <= 0 && H > 0.3 && this.potC > 0.3) { this.bubbleT = 0.7 + Math.random() * 0.4; G.audio?.ui?.('pot_bubble', 0.3); }
      if (this.stick > 1 && Math.random() < dt * 3) this.smoke(POT_X, 0.12, -0.04, true);
    } else this.brothMat.color.setRGB(0.12, 0.12, 0.13);
    this.broth.visible = true;
    // stir
    this.updateStir(dt);
    this.spoon.rotation.y = this.stirA;
    // sizzle loop
    this.sizzleT -= dt;
    if (sizzle > 0.2 && this.sizzleT <= 0) { this.sizzleT = 0.75; G.audio?.ui?.('sizzle', Math.min(0.7, 0.18 + sizzle * 0.1)); }
    // drag
    if (this.drag) {
      const hit = this.surfacePoint();
      if (hit) this.drag.mesh.position.set(hit.x, 0.09, hit.z);
    }
    // board hover bob
    const hov = this.hit();
    for (const s of this.slots) if (s.mesh) { const on = hov?.slot === s; s.mesh.scale.setScalar(lerp(s.mesh.scale.x, on ? 1.25 : 1, 1 - Math.exp(-dt * 12))); s.mesh.position.y = 0.03 + (on ? 0.02 + Math.sin(G.time * 8) * 0.008 : 0); }
    this.plateM.scale.setScalar(lerp(this.plateM.scale.x, hov?.kind === 'plate' ? 1.12 : 1, 1 - Math.exp(-dt * 12)));
    this.updateArms(dt, hov);
    this.updatePoints(dt);
    this.render3d(dt, H, hov);
  }

  private tint(m: THREE.MeshLambertMaterial, top: number, hi: number, meat: boolean) {
    // raw → golden brown → charcoal
    const c = clamp(top, 0, 1), b = clamp((hi - 1.25) / 0.6, 0, 1);
    let r = lerp(1, meat ? 0.62 : 0.9, c), g = lerp(1, meat ? 0.44 : 0.72, c), bl = lerp(1, meat ? 0.3 : 0.42, c);
    r = lerp(r, 0.13, b); g = lerp(g, 0.1, b); bl = lerp(bl, 0.08, b);
    m.color.setRGB(r, g, bl);
  }

  // ================================================================= mouse
  private surfacePoint(): THREE.Vector3 | null {
    overlayRay(this.ray, fpCamera(), G.input.mouseX, G.input.mouseY, this.ndc);
    const h = this.ray.intersectObject(this.surface, false)[0];
    if (!h) return null;
    return this.rig.worldToLocal(this.tmp.copy(h.point));
  }
  /** what the mouse is over: a board slot, a pan piece, the pan, the pot, the plate */
  private hit(): { kind: 'slot' | 'bit' | 'pan' | 'pot' | 'plate'; slot?: Slot; bit?: Bit } | null {
    const pt = this.surfacePoint(); if (!pt) { this.lastPt = null; return null; }
    this.lastPt = pt;
    let best: Bit | null = null, bd = 0.06;
    for (const b of this.bits) { const d = Math.hypot(pt.x - b.px, pt.z - b.pz); if (d < bd) { bd = d; best = b; } }
    if (best) return { kind: 'bit', bit: best };
    if (Math.hypot(pt.x - PAN_X, pt.z) < 0.19) return { kind: 'pan' };
    if (Math.hypot(pt.x - POT_X, pt.z + 0.04) < 0.14) return { kind: 'pot' };
    if (Math.hypot(pt.x - PLATE.x, pt.z - PLATE.z) < 0.13) return { kind: 'plate' };
    for (const s of this.slots) if (s.it && Math.abs(pt.x - s.x) < 0.045 && Math.abs(pt.z - s.z) < 0.08) return { kind: 'slot', slot: s };
    return null;
  }
  private onDown(e: MouseEvent) {
    if (!this.open || e.button !== 0) return;
    const h = this.hit(); if (!h) return;
    e.stopPropagation();
    if (h.kind === 'slot' && h.slot?.it && h.slot.mesh) {
      this.drag = { slot: h.slot, mesh: h.slot.mesh };
      this.dragFrom.set(e.clientX, e.clientY);
      G.audio?.ui?.('grab', 0.4);
    } else if (h.kind === 'bit' && h.bit) this.flip(h.bit);
    else if (h.kind === 'pot') { this.stirring = true; this.lastAng = this.potAngle(); }
    else if (h.kind === 'plate') this.plateIt();
    else if (h.kind === 'pan') this.toss();
  }
  private onUp(e: MouseEvent) {
    if (!this.open || e.button !== 0) return;
    this.stirring = false;
    const d = this.drag; if (!d) return;
    this.drag = null;
    const s = d.slot, it = s.it!;
    const moved = Math.hypot(e.clientX - this.dragFrom.x, e.clientY - this.dragFrom.y) > 12;
    const pt = this.surfacePoint();
    const intoPot = moved && pt && Math.hypot(pt.x - POT_X, pt.z + 0.04) < 0.16;
    const intoPan = !moved || (pt && Math.hypot(pt.x - PAN_X, pt.z) < 0.22);
    const p = G.local;
    let ok = false;
    if (intoPot) ok = this.addToPot(it); else if (intoPan) ok = this.addToPan(it);
    if (ok && p) {
      p.removeItem(it);
      this.rig.remove(d.mesh); s.mesh = null; s.it = null;
      bus.emit('inventoryChanged', p);
    } else d.mesh.position.set(s.x, 0.03, s.z);
  }
  private potAngle(): number {
    const pt = this.surfacePoint(); if (!pt) return this.lastAng;
    return Math.atan2(pt.z + 0.04, pt.x - POT_X);
  }
  private updateStir(dt: number) {
    if (!this.stirring) return;
    const a = this.potAngle();
    let da = a - this.lastAng; if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
    this.lastAng = a;
    this.stirA += da;
    if (Math.abs(da) > 0.02) { this.stick = Math.max(0, this.stick - Math.abs(da) * 0.08); if (Math.random() < Math.abs(da)) G.audio?.ui?.('pour', 0.12); }
    void dt;
  }

  // ================================================================= plating
  private score(lo: number, hi: number, meat: boolean): { s: number; raw: boolean; burnt: boolean; perfect: boolean } {
    const burnt = hi >= 1.6, raw = lo < 0.75;
    const perfect = !burnt && lo >= 0.95 && hi <= 1.4;
    const s = burnt ? 0.1 : raw ? (meat ? 0.2 + lo * 0.3 : 0.6) : perfect ? 1 : 0.75;
    return { s, raw: raw && meat, burnt, perfect };
  }
  plateIt() {
    const p = G.local; if (!p) return;
    const fromPan = this.bits.length > 0;
    if (!fromPan && !this.pot.length) { bus.emit('think', p, 'Nothing to plate.'); return; }
    const keys = fromPan ? this.bits.map((b) => b.it.key) : this.pot.map((q) => q.it.key);
    const scores = fromPan
      ? this.bits.map((b) => this.score(Math.min(b.down, b.up), Math.max(b.down, b.up), b.meat))
      : this.pot.map((q) => this.score(this.potC, this.potC + this.stick * 0.7, MEATY.has(q.cls)));
    const items = fromPan ? this.bits.map((b) => b.it) : this.pot.map((q) => q.it);
    const r = matchRecipe(keys, fromPan ? 'pan' : 'pot');
    const nBurnt = scores.filter((s) => s.burnt).length, anyRaw = scores.some((s) => s.raw);
    let q = scores.reduce((a, s) => a + s.s, 0) / scores.length;
    let out: Item;
    let label = '';
    let discovered: DishRecipe | null = null;
    if (nBurnt * 2 > scores.length) { out = createItem('dish_burnt'); out.cooked = 1.7; label = 'BURNT'; q = 0.05; }
    else if (anyRaw && (r || scores.length > 1)) { out = createItem('dish_raw_mess'); label = 'UNDERCOOKED'; q = 0.15; }
    else if (r) {
      if (!recipeKnown(r)) { q *= 0.85; discovered = r; grantNode(r.node!); }
      out = createItem(r.dish); out.cooked = 1;
      label = q >= 0.92 ? 'PERFECT' : q >= 0.7 ? 'GOOD' : 'ROUGH';
      if (q >= 0.92) out.name = 'Perfect ' + itemDef(r.dish).name; else if (q < 0.5) out.name = 'Rough ' + itemDef(r.dish).name;
    } else {
      // no recipe: the pieces come back cooked on their own
      for (let i = 0; i < items.length; i++) { const sc = scores[i]; items[i].cooked = sc.burnt ? 1.7 : sc.raw ? 0.5 : 1; p.inv.add(items[i]); }
      this.clearVessel(fromPan);
      bus.emit('inventoryChanged', p);
      return;
    }
    out.data = { ...(out.data || {}), q: Math.round(q * 100) / 100, by: p.name };
    this.lastQ.set(out.key, q);
    p.inv.add(out);
    this.clearVessel(fromPan);
    // feedback
    const good = label === 'PERFECT' || label === 'GOOD';
    this.showDish(out.key, label);
    G.audio?.ui?.(good ? 'pan_toss' : 'dryfire', 0.6);
    this.plateM.position.y = 0.08; this.plateM.scale.setScalar(1.3);
    this.spatter(PLATE.x, 0.05, PLATE.z, good ? 14 : 4, good ? [1, 0.85, 0.4] : [0.3, 0.3, 0.3]);
    p.body.addXp('cooking', good ? 10 : 4);
    if (good) { bump('cook_dish'); if (label === 'PERFECT') bump('cook_perfect'); }
    if (discovered) { bump('cook_discover'); this.fresh.add(discovered.key); this.cardPop = 1; G.audio?.ui?.('elevator_ding', 0.5); bus.emit('think', p, `Huh. ${discovered.name}. Writing that down.`); }
    if (keys.some((k) => itemDef(k).tags?.includes('weirdpart'))) mark('cook:weird');
    this.cardSig = '';
    bus.emit('dishPlated', p, out, q);
    bus.emit('inventoryChanged', p);
    setTimeout(() => { this.plateM.position.y = PLATE.y; }, 260);
  }
  private clearVessel(pan: boolean) {
    if (pan) { for (const b of this.bits) this.rig.remove(b.mesh); this.bits = []; }
    else { this.pot = []; this.potC = 0; this.stick = 0; }
  }
  /** the dish sits on the plate for a moment under a typed paper flag */
  private showDish(key: string, label: string) {
    this.dishM.geometry = itemGeometry(key) ?? new THREE.BufferGeometry();
    this.dishM.position.set(PLATE.x, 0.016, PLATE.z); this.dishM.scale.setScalar(1.6); this.dishM.visible = true;
    const f = this.flag; f.card(false); f.frame(0, 0, 176, 44, 0x8a7a60, 2);
    const col = label === 'PERFECT' ? 0x2a6a2a : label === 'GOOD' ? 0x2a2622 : 0xa8302a;
    f.text(label, 88, 6, { font: FONT.pen, size: 32, color: col, align: 'center', weight: '700' }); f.commit();
    this.flagM.position.set(PLATE.x - 0.06, 0.09, PLATE.z - 0.02); this.flagM.rotation.set(-0.5, 0.2, 0); this.flagM.visible = true;
    this.dishT = 2.2;
  }

  // ================================================================= particles (overlay points)
  private emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, r: number, g: number, b: number) {
    const N = this.pLife.length;
    let i = this.pN < N ? this.pN++ : (Math.random() * N) | 0;
    if (i >= N) i = N - 1;
    this.pPos[i * 3] = x; this.pPos[i * 3 + 1] = y; this.pPos[i * 3 + 2] = z;
    this.pVel[i * 3] = vx; this.pVel[i * 3 + 1] = vy; this.pVel[i * 3 + 2] = vz;
    this.pLife[i] = life; this.pCol[i * 3] = r; this.pCol[i * 3 + 1] = g; this.pCol[i * 3 + 2] = b;
  }
  private spatter(x: number, y: number, z: number, n: number, col = [1, 0.92, 0.6]) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = 0.2 + Math.random() * 0.4; this.emit(x, y, z, Math.cos(a) * s, 0.4 + Math.random() * 0.6, Math.sin(a) * s, 0.35 + Math.random() * 0.25, col[0], col[1], col[2]); } }
  private splash(x: number, y: number, z: number, n: number) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28; this.emit(x, y, z, Math.cos(a) * 0.15, 0.5 + Math.random() * 0.3, Math.sin(a) * 0.15, 0.4, 0.7, 0.55, 0.35); } }
  private steam(x: number, y: number, z: number) { if (Math.random() < 0.3) this.puffs.emit(x, y + 0.03, z, 0xd8dce0, 0.022, 1.4, 0.12, 0.08); this.emit(x + (Math.random() - 0.5) * 0.12, y, z + (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.03, 0.12 + Math.random() * 0.08, 0, 1.4, 0.85, 0.88, 0.9); }
  private smoke(x: number, y: number, z: number, black: boolean) { const v = black ? 0.12 : 0.55; if (Math.random() < 0.4) this.puffs.emit(x, y + 0.02, z, black ? 0x1a1816 : 0x8a8680, 0.02, 1.6, 0.1, 0.03); this.emit(x + (Math.random() - 0.5) * 0.06, y, z + (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.04, 0.1 + Math.random() * 0.06, 0, 1.6, v, v, v * 1.05); }
  private flare(x: number, z: number) { for (let i = 0; i < 3; i++) this.emit(x + (Math.random() - 0.5) * 0.05, 0.04, z + (Math.random() - 0.5) * 0.05, 0, 0.25 + Math.random() * 0.2, 0, 0.35, 1, 0.55, 0.15); }
  private updatePoints(dt: number) {
    for (let i = 0; i < this.pN; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt;
      const k = i * 3;
      if (this.pLife[i] <= 0) { this.pPos[k + 1] = -9; continue; }
      const heavy = this.pVel[k + 1] > 0.3 || this.pCol[k] > 0.95; // spatter falls, smoke rises
      if (heavy) this.pVel[k + 1] -= dt * 2.6;
      this.pPos[k] += this.pVel[k] * dt; this.pPos[k + 1] += this.pVel[k + 1] * dt; this.pPos[k + 2] += this.pVel[k + 2] * dt;
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    this.points.geometry.setDrawRange(0, this.pN);
  }

  // ================================================================= DOM
  private render3d(dt: number, H: number, hov: ReturnType<CookView['hit']>) {
    // knob follows the heat
    this.knob.rotation.z = lerp(this.knob.rotation.z, -(H / 1.2) * 4.2 + 2.1, 1 - Math.exp(-dt * 10));
    // the probe: in the hovered piece (or the pot), its needle on how done it is
    let target: { x: number; y: number; z: number; v: number } | null = null;
    if (hov?.kind === 'bit' && hov.bit) target = { x: hov.bit.px, y: hov.bit.mesh.position.y + 0.03, z: hov.bit.pz, v: Math.max(hov.bit.down, hov.bit.up) };
    else if (hov?.kind === 'pot' && this.pot.length) target = { x: POT_X + 0.04, y: 0.12, z: -0.04, v: this.potC + this.stick * 0.6 };
    this.probe.visible = !!target;
    if (target) {
      this.probe.position.set(target.x, target.y + 0.09, target.z);
      this.probeNeedle.rotation.y = Math.PI * (0.75 - clamp(target.v / 2, 0, 1) * 1.5);
    }
    // plated dish and flag fade away
    if (this.dishT > 0) { this.dishT -= dt; if (this.dishT <= 0) this.dishM.visible = this.flagM.visible = false; else this.dishM.rotation.y += dt * 0.8; }
    // the card: redraw when what you know changes, pop when something new is written on it
    this.cardPop = Math.max(0, this.cardPop - dt * 1.6);
    this.cardM.scale.setScalar(1 + Math.sin(this.cardPop * Math.PI) * 0.12);
    const sig = RECIPES.map((r) => (recipeKnown(r) ? 1 : 0)).join('') + [...this.fresh].join(',');
    if (sig === this.cardSig) return;
    this.cardSig = sig;
    whenFonts(() => {
      const c = this.card;
      c.card(true, 28, 44);
      c.text('Recipes', 30, 6, { font: FONT.pen, size: 34, color: 0xa8302a, weight: '700' });
      let y = 48;
      for (const r of RECIPES) {
        const known = recipeKnown(r);
        c.text(known ? r.name : '? ? ?', 30, y, { font: FONT.type, size: 17, color: known ? 0x2a2622 : 0xa89a80, maxW: 232 });
        c.text(r.vessel === 'pot' ? 'pot' : 'pan', 308, y - 2, { font: FONT.pen, size: 20, color: 0x4a5a8a, align: 'right' });
        if (this.fresh.has(r.key)) c.stamp('NEW', 270, y + 9, 0xc8302a, 13, -0.2);
        y += 28;
      }
      c.commit();
    });
  }
}


/** an octagonal dial face (no round gauges): cream enamel, ticks, a red zone, the unit */
function octFace(sh: Sheet, label: string) {
  const g = sh.ctx, cx = sh.w / 2, cy = sh.h / 2, r = sh.w / 2 - 2;
  const oct = (rr: number) => { g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i / 8) * Math.PI * 2; g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); };
  sh.fill(0x141414);
  g.fillStyle = '#e8dcbc'; oct(r); g.fill();
  g.strokeStyle = '#2a2622'; g.lineWidth = 2; oct(r - 1); g.stroke();
  g.strokeStyle = '#b8302a'; g.lineWidth = r * 0.12; g.beginPath(); g.moveTo(cx + Math.cos(Math.PI * 2.05) * r * 0.78, cy + Math.sin(Math.PI * 2.05) * r * 0.78); g.lineTo(cx + Math.cos(Math.PI * 2.25) * r * 0.78, cy + Math.sin(Math.PI * 2.25) * r * 0.78); g.stroke();
  for (let i = 0; i <= 20; i++) {
    const a = Math.PI * (0.75 + i * 0.075), long = i % 5 === 0, r0 = long ? r * 0.62 : r * 0.72;
    sh.line(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r * 0.84, cy + Math.sin(a) * r * 0.84, 0x2a2622, long ? 2 : 1);
  }
  sh.text(label, cx, cy + r * 0.28, { font: FONT.sign, size: Math.round(r * 0.36), color: 0x2a2622, align: 'center', weight: '600' });
}
