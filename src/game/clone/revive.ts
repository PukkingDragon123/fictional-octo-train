// THE REVIVE (round 21, wave 4): the clone bay under the control room, played when the unit dies with
// a clone banked (./clone.ts). A tiled bay round the vat (./vat.ts): steel walls of pipe and gauges, a
// trolley with a towel and a fresh jumpsuit, drain channels, hazard tape, caged work lamps, the vat's
// green light on everything. The shots: the spare hanging in the medium, the pilot lamps go amber, the
// medium drains (the body sinks to its knees on the grate), the sleeve lifts into the cap in a burst of
// steam, the body (the unit's own HumanRig) gets up and walks out at the camera, a hard white cut back
// into the link. Rendered small into its own canvas, the menu rooms' composite blown up by a whole
// number. Esc / Enter / Space / a tap skip to the end. Words: none (the subtitle strip carries the
// relay's one line).
import * as THREE from 'three';
import type { HumanRig, Appearance } from '../../entities/humanRig';
import { U } from '../../gfx/materials';
import { SPOTU } from '../../gfx/postfx';
import { facetMats, disposeFacetMats, type FMats, type FKey } from '../../ui/menus/scene/pixtex';
import { FacetBuilder, at, cbox, prism, tube, bolt, gem, extrude } from '../../ui/menus/scene/facet';
import { makePost, Bloom } from '../../ui/menus/scene/post';
import { Puffs, shaftMesh } from '../../ui/menus/scene/fx';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildVat, cloneRig, VAT, type Vat } from './vat';
import { G } from '../G';
import { bus } from '../../core/events';

type V3 = [number, number, number];
/** a right-triangle shelf bracket (an extruded gusset) */
const extrudeTri = (w: number, h: number) => extrude([[0, 0], [w, 0], [0, -h]], 0.02);
const slab = (b: FacetBuilder, k: FKey, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, col: number, c = 0.006) =>
  b.add(k, cbox(x1 - x0, y1 - y0, z1 - z0, c), col, at((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const W = 3.0, BACK = -2.4, FRONT = 3.6, H = 3.0;

/** the room's sound, through the game's engine (recorded samples) */
function snd(key: string, vol = 0.7, rate = 1) { try { (G.audio as unknown as { flat?: (k: string, b: string, v: number, r: number) => unknown })?.flat?.(key, 'sfx', vol, rate); } catch { /* audio optional */ } }

interface Shot { pos: THREE.Vector3; look: THREE.Vector3; fov: number }
const S = (p: V3, l: V3, fov: number): Shot => ({ pos: new THREE.Vector3(...p), look: new THREE.Vector3(...l), fov });

class ReviveScene {
  readonly root = document.createElement('div');
  readonly canvas = document.createElement('canvas');
  renderer: THREE.WebGLRenderer | null = null;
  readonly scene = new THREE.Scene();
  readonly cam = new THREE.PerspectiveCamera(44, 16 / 9, 0.05, 30);
  private mats: FMats;
  private rt: THREE.WebGLRenderTarget | null = null;
  private noShadow: THREE.WebGLRenderTarget | null = null;
  private post = makePost();
  // the menu rooms' glow (src/ui/menus/monitor/stage.ts): only real emitters bloom
  private bloom = Object.assign(new Bloom(), { thr: 3.2, knee: 0.3 });
  private lowW = 0; private lowH = 0;
  private vat: Vat;
  private rig: HumanRig;
  private puffs = new Puffs(90);
  private flash = document.createElement('div');
  private lamps: THREE.SpotLight[] = [];
  private under: THREE.PointLight | null = null;
  private env: THREE.Texture | null = null;
  private spill!: THREE.Mesh; private spillMat!: THREE.MeshBasicMaterial; private spillL!: THREE.PointLight;
  t = 0;
  /** the cut: total length */
  readonly LEN = 11.2;

  constructor(app: Appearance) {
    this.root.className = 'rv-root';
    Object.assign(this.root.style, { position: 'fixed', inset: '0', zIndex: '9000', background: '#000', overflow: 'hidden', cursor: 'pointer' });
    Object.assign(this.canvas.style, { position: 'absolute', imageRendering: 'pixelated' });
    Object.assign(this.flash.style, { position: 'absolute', inset: '0', background: '#000', opacity: '1', pointerEvents: 'none', transition: 'none' });
    this.root.append(this.canvas, this.flash);
    const low = /[?&]low/.test(location.search);
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      const nsd = new THREE.DepthTexture(1, 1);
      nsd.compareFunction = THREE.LessEqualCompare;
      this.noShadow = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, depthTexture: nsd });
      this.renderer.initRenderTarget(this.noShadow);
    } catch (e) { console.warn('revive renderer unavailable', e); this.renderer = null; }
    this.mats = facetMats(low);
    const sc = this.scene;
    sc.background = new THREE.Color(0x000000);
    sc.add(this.shell(), this.props());
    this.vat = buildVat(this.mats, { ceiling: H });
    sc.add(this.vat.group);
    this.vat.mode = 1;
    // the spare: the unit's own body, bare but for the issue undershirt and shorts, hanging in the medium
    this.rig = cloneRig(app, 1);
    this.rig.skin.castShadow = true;
    this.vat.bay.add(this.rig.root);
    sc.add(this.puffs.mesh);
    // the medium as it leaves: a bright spill spreading over the grate and down the drain channel
    this.spillMat = new THREE.MeshBasicMaterial({ color: 0x7affa0, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    this.spill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.spillMat);
    this.spill.rotation.x = -Math.PI / 2; this.spill.renderOrder = 3;
    sc.add(this.spill);
    this.spillL = new THREE.PointLight(0x60ff90, 0, 2.6, 1.6);
    sc.add(this.spillL);
    // ---- light: the exam bay's rig (src/ui/body/health3d.ts) scaled to a room: a bright sky/bounce, a warm key and a cool
    // fill and a green rim off the tiles, then the two pendant lamps throwing warm pools on the floor, the vat's own glow
    // lighting the body from below and behind, and a reflected room for glints on the tiles, metal and glass
    sc.add(new THREE.HemisphereLight(0xf4f6f8, 0x6a6e66, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(-1.4, 2.6, 2.2);
    // the key throws real shadows: contact under the vat, the trolley and the unit
    if (!low) { key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0015; Object.assign(key.shadow.camera, { left: -3.2, right: 3.2, top: 3.2, bottom: -3.2, near: 0.1, far: 9 }); }
    const fill = new THREE.DirectionalLight(0xe8f0ff, 0.45); fill.position.set(2.2, 0.8, 2.4);
    const rimL = new THREE.DirectionalLight(0xe8f4ff, 0.9); rimL.position.set(1.4, 1.8, -2.4);
    sc.add(key, fill, rimL);
    // the pendants: warm spots straight down, shadows from the one on the key side, a haze cone under each
    for (const [i, x] of [-1.25, 1.25].entries()) {
      const L = new THREE.SpotLight(0xffd9a6, 44, 6.5, 0.78, 0.5, 1.5);
      L.position.set(x, H - 0.95, 0.75); L.target.position.set(x * 0.55, 0, 0.1);
      if (i === 1 && !low) { L.castShadow = true; L.shadow.mapSize.set(512, 512); L.shadow.bias = -0.002; L.shadow.camera.near = 0.2; }
      sc.add(L, L.target); this.lamps.push(L);
      const sh = shaftMesh(9);
      sh.mesh.position.set(x, H - 1.0, 0.75); sh.mesh.scale.set(Math.tan(0.78) * 1.9, 1.9, Math.tan(0.78) * 1.9);
      sh.u.uColor.value.set(0xffd8a0); sh.u.uInt.value = 0.022;
      sc.add(sh.mesh);
    }
    // the tray lamps on the back wall wash the tiles and the gauge board
    for (const x of [-1.4, 1.4]) { const wl = new THREE.PointLight(0xffe0b0, 5, 3.4, 1.5); wl.position.set(x, H - 0.85, BACK + 0.7); sc.add(wl); }
    // the vat: glow from the grate up the body, and a cyan-green rim from behind
    const under = new THREE.PointLight(0x60ffc8, 2.2, 1.1, 2); under.position.set(0, VAT.base + 0.12, 0.25);
    const back = new THREE.SpotLight(0x8affe0, 9, 3.4, 0.32, 0.4, 1.6); back.position.set(0, 1.9, -1.4); back.target.position.set(0, 1.1, 0.6);
    sc.add(under, back, back.target);
    this.under = under;
    if (this.renderer) {
      const pm = new THREE.PMREMGenerator(this.renderer);
      this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      pm.dispose();
      sc.environment = this.env; sc.environmentIntensity = 0.12;
    }
    this.post.u.uExposure.value = 1.2; this.post.u.uVig.value = 0.5;
    this.cam.position.set(0, 1.35, 2.2); this.cam.lookAt(0, 1.2, 0);
  }

  // ================================================================ the bay
  private shell(): THREE.Group {
    const b = new FacetBuilder();
    const TILE = 0xeef2e2, PAINT = 0xcfe0c4;
    slab(b, 'floor', -W, W, -0.1, 0, BACK, FRONT, 0xc4c8b8, 0.004);
    slab(b, 'paint', -W, W, H, H + 0.1, BACK, FRONT, 0xd8dccc);
    // institutional paint over the dado, cream glazed tile below it, the green cap between
    const wall = (x0: number, x1: number, z0: number, z1: number) => { slab(b, 'tile', x0, x1, 0, 1.25, z0, z1, TILE); slab(b, 'paint', x0, x1, 1.25, H, z0, z1, PAINT); slab(b, 'tile', x0, x1, 1.23, 1.29, z0, z1, 0x3a8a62, 0.008); slab(b, 'tile', x0, x1, 0, 0.1, z0, z1, 0x2e6a4e, 0.006); };
    wall(-W, W, BACK - 0.2, BACK); wall(-W - 0.2, -W, BACK, FRONT); wall(W, W + 0.2, BACK, FRONT);
    // hazard tape round the vat's footprint, drain channels to the back wall
    const r = VAT.r + 0.45;
    for (const [x, z, w, d] of [[0, -r, r * 2, 0.06], [0, r, r * 2, 0.06], [-r, 0, 0.06, r * 2], [r, 0, 0.06, r * 2]] as [number, number, number, number][]) b.add('hazard', cbox(w, 0.004, d, 0.001), 0xe8c030, at(x, 0.003, z));
    slab(b, 'rust', -0.12, 0.12, -0.01, 0.006, BACK + 0.02, -r, 0x4a3e32, 0.002);
    for (let z = BACK + 0.1; z < -r; z += 0.12) b.add('metal', cbox(0.22, 0.012, 0.02, 0.003), 0x2a2c2a, at(0, 0.008, z));
    // pipes along the back wall, valves, a gauge board in the machine kit's green
    const pipe = (y: number, col: number, k: FKey, rr: number) => b.add(k, tube([[-W, y, BACK + 0.12], [W, y, BACK + 0.12]], rr, 4, 8, false), col);
    pipe(2.55, 0xc87a48, 'copper', 0.05); pipe(2.36, 0x6a6e66, 'metal', 0.04); pipe(0.38, 0x3a6a3a, 'paint', 0.06);
    for (const x of [-2.2, -0.9, 1.3, 2.4]) { b.add('brass', prism(0.07, 0.06, 8), 0xc8a050, at(x, 2.55, BACK + 0.12, 0, 0, Math.PI / 2)); b.add('metal', cbox(0.03, 0.22, 0.03, 0.004), 0x4a4e4a, at(x, 2.55, BACK + 0.12)); }
    b.add('paint', cbox(1.3, 0.8, 0.12, 0.02), 0x3e7048, at(-1.7, 1.75, BACK + 0.08));
    b.add('metal', cbox(1.36, 0.06, 0.14, 0.01), 0x6a6e66, at(-1.7, 2.18, BACK + 0.08));
    for (const [x, y] of [[-2.05, 1.85], [-1.7, 1.85], [-1.35, 1.85]]) {
      b.add('brass', prism(0.13, 0.04, 14), 0xc8a050, at(x, y, BACK + 0.16, Math.PI / 2));
      b.add('enamel', prism(0.11, 0.045, 14), 0xf0ead8, at(x, y, BACK + 0.17, Math.PI / 2));
      b.add('rubber', cbox(0.012, 0.09, 0.006, 0.001), 0x1a1a1a, at(x, y + 0.02, BACK + 0.2, 0, 0, (x + 1.7) * 2));
    }
    for (let i = 0; i < 6; i++) b.add('lamp', gem(0.022, 6, 0.018), i % 3 === 0 ? 0xff5030 : 0x60ff70, at(-2.2 + i * 0.2, 1.48, BACK + 0.15, Math.PI / 2));
    // a breaker box with its door ajar, a conduit up to the tray
    b.add('metal', cbox(0.5, 0.7, 0.16, 0.012), 0x7a7e76, at(1.9, 1.6, BACK + 0.1));
    b.add('metal', cbox(0.48, 0.66, 0.02, 0.006), 0x8a8e86, at(2.12, 1.6, BACK + 0.32, 0, -1.0));
    b.add('hazard', cbox(0.3, 0.05, 0.01, 0.002), 0xe8c030, at(1.9, 1.86, BACK + 0.19));
    b.add('metal', cbox(0.05, H - 1.95, 0.05, 0.006), 0x5a5e58, at(1.9, (H + 1.95) / 2, BACK + 0.06));
    // the cable tray under the ceiling
    for (const s of [-1, 1]) b.add('metal', cbox(W * 2, 0.06, 0.02, 0.004), 0x6a6e66, at(0, H - 0.3, BACK + 0.45 + s * 0.13));
    for (let x = -W + 0.2; x < W; x += 0.32) b.add('metal', cbox(0.02, 0.015, 0.28, 0.003), 0x585c56, at(x, H - 0.33, BACK + 0.45));
    // caged work lamps off the tray
    for (const x of [-1.4, 1.4]) {
      b.add('chrome', cbox(0.01, 0.4, 0.01, 0.002), 0xa0a49e, at(x, H - 0.5, BACK + 0.6));
      b.add('metal', prism(0.1, 0.15, 8, { rTop: 0.05 }), 0xe8b030, at(x, H - 0.7, BACK + 0.6));
      for (let i = 0; i < 4; i++) b.add('metal', cbox(0.008, 0.13, 0.008, 0.002), 0x2a2a26, at(x + Math.cos(i * 1.57) * 0.08, H - 0.82, BACK + 0.6 + Math.sin(i * 1.57) * 0.08));
      b.add('lamp', prism(0.055, 0.09, 8), 0xfff2c8, at(x, H - 0.8, BACK + 0.6));
    }
    // the two pendants over the floor: enamel shades on a drop rod, the bulb hot under them
    for (const x of [-1.25, 1.25]) {
      b.add('chrome', cbox(0.014, 0.8, 0.014, 0.003), 0xb0b4ae, at(x, H - 0.45, 0.75));
      b.add('enamel', prism(0.26, 0.14, 12, { rTop: 0.07 }), 0x3e7048, at(x, H - 0.9, 0.75));
      b.add('brass', prism(0.075, 0.05, 10), 0xc8a050, at(x, H - 0.82, 0.75));
      b.add('lamp', prism(0.07, 0.07, 10), 0xfff4d8, at(x, H - 0.97, 0.75));
    }
    // fluorescent troughs
    for (const z of [0.2, 2.0]) { b.add('metal', cbox(1.6, 0.08, 0.3, 0.01), 0xc8ccc4, at(0, H - 0.05, z)); b.add('lamp', cbox(1.4, 0.03, 0.06, 0.006), 0xf0f6ff, at(0, H - 0.1, z - 0.07)); b.add('lamp', cbox(1.4, 0.03, 0.06, 0.006), 0xf0f6ff, at(0, H - 0.1, z + 0.07)); }
    const g = b.build(this.mats);
    // wet floor: dark specular puddles round the drain
    for (const [x, z, w, d] of [[0.7, 0.9, 0.9, 0.6], [-0.6, 1.4, 0.7, 0.5], [0.2, -1.4, 0.5, 0.8]] as [number, number, number, number][]) {
      const wet = new THREE.Mesh(new THREE.CircleGeometry(0.5, 9), new THREE.MeshStandardMaterial({ color: 0x0a0c0c, roughness: 0.04, metalness: 0.6, transparent: true, opacity: 0.5, depthWrite: false }));
      wet.rotation.x = -Math.PI / 2; wet.scale.set(w, d, 1); wet.position.set(x, 0.006, z); wet.renderOrder = 2; g.add(wet);
    }
    return g;
  }

  private props(): THREE.Group {
    const b = new FacetBuilder();
    // the trolley: a steel cart with a folded towel and a fresh issue jumpsuit
    const tx = -1.75, tz = 0.9;
    b.add('chrome', cbox(0.9, 0.03, 0.5, 0.006), 0xc0c4c0, at(tx, 0.82, tz));
    b.add('chrome', cbox(0.9, 0.03, 0.5, 0.006), 0xb0b4b0, at(tx, 0.3, tz));
    for (const [dx, dz] of [[-0.42, -0.22], [0.42, -0.22], [-0.42, 0.22], [0.42, 0.22]]) {
      b.add('chrome', cbox(0.025, 0.8, 0.025, 0.004), 0xb8bcb8, at(tx + dx, 0.44, tz + dz));
      b.add('rubber', prism(0.04, 0.03, 8), 0x1a1a1a, at(tx + dx, 0.04, tz + dz, Math.PI / 2));
    }
    b.add('sponge', cbox(0.36, 0.08, 0.3, 0.02), 0xe8e2d0, at(tx - 0.2, 0.88, tz));
    b.add('sponge', cbox(0.34, 0.03, 0.28, 0.01), 0xd8d0bc, at(tx - 0.2, 0.935, tz, 0, 0.1));
    b.add('paint', cbox(0.4, 0.07, 0.32, 0.015), 0xd9a826, at(tx + 0.2, 0.875, tz, 0, -0.08));
    b.add('paint', cbox(0.38, 0.02, 0.3, 0.006), 0xc8961e, at(tx + 0.2, 0.92, tz, 0, -0.08));
    b.add('rubber', cbox(0.22, 0.06, 0.12, 0.02), 0x2a2622, at(tx - 0.15, 0.36, tz));
    // a stool and a monitor on a wall arm (the vitals, green phosphor)
    b.add('metal', prism(0.18, 0.04, 10), 0x3a3e3a, at(1.9, 0.62, 1.1));
    for (let i = 0; i < 3; i++) { const a = i * 2.09; b.add('chrome', tube([[1.9, 0.6, 1.1], [1.9 + Math.cos(a) * 0.2, 0.0, 1.1 + Math.sin(a) * 0.2]], 0.014, 2, 5, false), 0xb8bcb8); }
    // (the vitals set sits on a steel shelf bolted to the right wall, its cable down the wall to the floor duct)
    b.add('metal', cbox(0.5, 0.03, 0.46, 0.006), 0x6a6e66, at(W - 0.25, 1.5, 0.55));
    for (const dz of [-0.18, 0.18]) b.add('metal', extrudeTri(0.4, 0.3), 0x5a5e58, at(W - 0.02, 1.36, 0.55 + dz, 0, Math.PI / 2));
    for (const dz of [-0.18, 0.18]) b.add('chrome', bolt(0.016, 0.012), 0xc8ccc8, at(W - 0.01, 1.47, 0.55 + dz, 0, 0, Math.PI / 2));
    b.add('enamel', cbox(0.4, 0.36, 0.42, 0.03), 0xcfc4a6, at(W - 0.25, 1.695, 0.55));
    b.add('screen', cbox(0.02, 0.24, 0.3, 0.006), 0x2aff7a, at(W - 0.46, 1.71, 0.55));
    b.add('rubber', tube([[W - 0.06, 1.6, 0.8], [W - 0.04, 1.0, 0.85], [W - 0.04, 0.05, 0.9]], 0.014, 6, 5), 0x1a1a1a);
    // a coil of hose from the vat's drain valve
    for (let i = 0; i < 5; i++) b.add('rubber', cbox(0.42 - i * 0.04, 0.03, 0.04, 0.008), 0x2a2a2a, at(1.1, 0.02 + i * 0.016, -0.9, 0, i * 0.6));
    b.add('rubber', tube([[VAT.r + 0.3, 0.04, -0.12], [0.9, 0.02, -0.5], [1.1, 0.04, -0.85]], 0.03, 8, 6), 0x2a2a2a);
    for (let i = 0; i < 8; i++) b.add('chrome', bolt(0.02, 0.014), 0xc8ccc8, at(-1.75 - 0.44 + i * 0.125, 0.835, 0.9 - 0.25));
    return b.build(this.mats);
  }

  // ================================================================ the cut
  /** the shot at time t (blended between keys) */
  private shotAt(t: number, aspect: number): Shot {
    const port = aspect < 1;
    const k: [number, Shot][] = [
      [0, S([0.2, 1.55, 3.1], [0, 1.45, 0], 44)],
      [2.2, S([0.1, 1.5, 2.55], [0, 1.4, 0], 44)],
      [2.6, S([1.75, 1.3, 2.4], [0, 1.0, 0], 50)],
      [5.2, S([1.5, 1.15, 2.1], [0, 0.75, 0], 50)],
      [5.6, S([-1.5, 0.55, 2.3], [0, 1.25, 0], 54)],
      [7.0, S([-1.3, 0.6, 2.5], [0, 1.4, 0], 54)],
      [7.4, S([0.1, 1.5, 3.0], [0, 1.35, 0.4], 46)],
      [10.4, S([0.15, 1.58, 3.45], [0, 1.5, 1.4], 46)],
    ];
    let i = 0;
    while (i < k.length - 1 && k[i + 1][0] <= t) i++;
    const [t0, a] = k[i];
    const b = k[Math.min(k.length - 1, i + 1)];
    // a cut on every other key, a move between the pairs
    const moving = i % 2 === 0 && b[0] > t0;
    const u = moving ? ease(clamp01((t - t0) / (b[0] - t0))) : 0;
    const B = moving ? b[1] : a;
    const pos = a.pos.clone().lerp(B.pos, u), look = a.look.clone().lerp(B.look, u);
    let fov = a.fov + (B.fov - a.fov) * u;
    if (port) { fov = Math.min(75, fov * 1.45); pos.z += 0.6; }
    return { pos, look, fov };
  }

  private cues = new Set<string>();
  private v = new THREE.Vector3();
  private cue(k: string, at: number, fn: () => void) { if (this.t >= at && !this.cues.has(k)) { this.cues.add(k); fn(); } }

  frame(dt: number) {
    this.t += dt;
    const t = this.t, v = this.vat;
    // ---- the timeline
    this.cue('hum', 0, () => { snd('machine_hum', 0.35, 0.8); snd('bubble_drift', 0.4); });
    this.cue('alarm', 1.6, () => { v.mode = 2; snd('press_klaxon', 0.35, 1.1); });
    this.cue('drain', 2.5, () => { v.mode = 1; snd('pour', 0.7, 0.7); snd('bh_gurgle', 0.6); });
    this.cue('gurgle', 4.2, () => snd('bh_gurgle', 0.5, 0.85));
    this.cue('lift', 5.5, () => { snd('press_hiss', 0.75); snd('slam_hydraulic', 0.5, 1.2); });
    this.cue('gasp', 6.6, () => { snd('wake_gasp', 0.8); });
    this.cue('cough', 7.6, () => snd('cough', 0.55));
    this.cue('steps', 8.2, () => snd('step_wetcarpet', 0.6));
    this.cue('steps2', 8.9, () => snd('step_wetcarpet', 0.6, 1.05));
    this.cue('steps3', 9.6, () => snd('step_wetcarpet', 0.6, 0.95));
    this.cue('flash', 10.5, () => snd('sentinel_vanish', 0.45));
    v.level = 1 - ease(clamp01((t - 2.5) / 2.8));
    v.lift = ease(clamp01((t - 5.6) / 1.2));
    if (t > 7.2) v.mode = 0;
    v.update(dt, t);
    // (the vat's own lamp stays inside the glass: it lights the medium and the body's edge, not the room)
    v.light.distance = 1.6; v.light.intensity *= 0.25 + 0.55 * v.level;
    // steam where the sleeve breaks its seal
    if (t > 5.55 && t < 7.6) for (let n = 0; n < 2; n++) {
      const a = Math.random() * Math.PI * 2;
      this.puffs.emit(new THREE.Vector3(Math.cos(a) * VAT.r, VAT.base + 0.05 + Math.random() * 0.3, Math.sin(a) * VAT.r), new THREE.Vector3(Math.cos(a) * 0.55, 0.35 + Math.random() * 0.3, Math.sin(a) * 0.55), { life: 1.2, s0: 0.04, s1: 0.16, color: 0x9ab8ac, rise: 0.32 });
    }
    // the drain: the medium runs out over the grate and down the channel to the back wall
    const drain = clamp01((t - 2.6) / 2.4), dry = clamp01((t - 6.5) / 3);
    this.spillMat.opacity = 0.55 * Math.min(1, drain * 3) * (1 - dry * 0.7);
    const len = 0.6 + drain * (VAT.r + 0.45 - BACK - 0.1);
    this.spill.scale.set(0.22 + drain * 0.1, len, 1);
    this.spill.position.set(0, 0.012, VAT.r * 0.3 - len / 2);
    this.spillL.position.set(0, 0.25, -1.2); this.spillL.intensity = 2.6 * this.spillMat.opacity;
    if (t > 2.6 && t < 5.4 && Math.random() < 0.9) {
      const zz = -VAT.r - 0.1 - Math.random() * 1.2;
      this.puffs.emit(new THREE.Vector3((Math.random() - 0.5) * 0.18, 0.03, zz), new THREE.Vector3(0, 0.05, -0.6), { life: 0.6, s0: 0.03, s1: 0.06, color: 0x60e080, rise: 0.02 });
    }
    // drips off the body once the medium is gone
    if (t > 5.2 && t < 9.5 && Math.random() < 0.3) {
      const hp = this.rig.root.getWorldPosition(new THREE.Vector3());
      this.puffs.emit(hp.add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.2)), new THREE.Vector3(0, -1.2, 0), { life: 0.5, s0: 0.012, s1: 0.006, color: 0x6aff90, rise: -0.4 });
    }
    this.puffs.update(dt, this.cam, () => 0.7);
    // ---- the body: hangs, sinks to its knees with the medium, gets up, walks out
    const R = this.rig, j = R.j;
    let full: '' | 'kneel' = '', speed = 0, y = 0, z = 0;
    if (t < 3.6) y = 0.32 * (0.35 + 0.65 * v.level) + Math.sin(t * 1.3) * 0.025;
    else if (t < 7.3) { full = 'kneel'; y = Math.max(0, 0.12 - (t - 3.6) * 0.3); }
    else if (t < 8.1) { y = 0; }
    else { speed = 0.95; z = Math.min(1.75, (t - 8.1) * 0.62); }
    R.root.position.set(0, y, z);
    // the head: bowed (looking at the grate) until it comes up at the gasp, then at the camera
    const up = clamp01((t - 6.4) / 0.8);
    const lk = this.v.set(0, VAT.base + 0.1, z + 0.55).lerp(this.cam.position, up);
    R.update(dt, { speed, stance: 'stand', full, fidget: false, wx: 0, wy: VAT.base, wz: z, wyaw: 0, ground: () => (z > VAT.r ? -VAT.base : 0), lookX: lk.x, lookY: lk.y, lookZ: lk.z, lookW: 0.85, tired: t > 7.3 ? 0.8 : 0, exhausted: t > 7.3 ? 0.6 : 0 } as never);
    if (t < 3.6) {
      // limp in the medium: arms drifting out, one knee loose
      const f = Math.sin(t * 0.9);
      j.uarmL.rotation.z += 0.28 + f * 0.06; j.uarmR.rotation.z -= 0.28 + f * 0.06;
      j.farmL.rotation.x -= 0.2; j.farmR.rotation.x -= 0.2;
      j.thighL.rotation.x += 0.06; j.shinL.rotation.x += 0.12;
    }
    // (the step down off the plinth: the root drops as it clears the glass)
    if (z > VAT.r + 0.1) R.root.position.y = -Math.min(VAT.base, (z - VAT.r - 0.1) * 1.6);
    // ---- the lamps buzz
    this.lamps[0].intensity = 44 * (Math.sin(t * 0.8) > 0.97 && Math.random() < 0.5 ? 0.65 : 1);
    // the vat's glow on the body stays while it is on the grate, fading as it walks out
    if (this.under) this.under.intensity = 2.2 * (0.55 + 0.45 * v.level) * (1 - clamp01((t - 8.4) / 2) * 0.5);
    // ---- the picture
    this.resize();
    const sh = this.shotAt(t, this.lowW / Math.max(1, this.lowH));
    this.cam.position.copy(sh.pos); this.cam.lookAt(sh.look);
    if (this.cam.fov !== sh.fov) { this.cam.fov = sh.fov; this.cam.updateProjectionMatrix(); }
    // fade in from the death, a hard white cut out at the end
    const fin = clamp01(1 - t / 0.9), out = clamp01((t - 10.5) / 0.4);
    this.flash.style.background = out > 0 ? '#f4fff6' : '#000';
    this.flash.style.opacity = String(Math.max(fin, out));
    this.render();
  }

  private resize() {
    if (!this.renderer) return;
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const dw = w * dpr, dh = h * dpr;
    const s = Math.max(2, Math.round(Math.sqrt((dw * dh) / (330 * 186))));
    const lw = Math.max(32, Math.ceil(dw / s)), lh = Math.max(32, Math.ceil(dh / s));
    const cw = (lw * s) / dpr, ch = (lh * s) / dpr;
    Object.assign(this.canvas.style, { width: cw + 'px', height: ch + 'px', left: Math.floor((w - cw) / 2) + 'px', top: Math.floor((h - ch) / 2) + 'px' });
    if (lw === this.lowW && lh === this.lowH) return;
    this.lowW = lw; this.lowH = lh;
    this.renderer.setSize(lw, lh, false);
    this.cam.aspect = lw / lh; this.cam.updateProjectionMatrix();
    this.rt?.dispose();
    this.rt = new THREE.WebGLRenderTarget(lw, lh, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, depthTexture: new THREE.DepthTexture(lw, lh) });
    const u = this.post.u;
    u.tColor.value = this.rt.texture; u.tDepth.value = this.rt.depthTexture; u.uRes.value.set(lw, lh);
    u.uNear.value = this.cam.near; u.uFar.value = this.cam.far;
  }

  private render() {
    const r = this.renderer; if (!r || !this.rt) return;
    const u = this.post.u;
    u.uTime.value = this.t;
    u.uLift.value.set(0.96, 0.98, 1.0); u.uGain.value.set(1.0, 1.0, 1.0);
    u.uSat.value = 1.06; u.uContrast.value = 1.26; u.uSide.value.set(1, 0, 0, 0.35); u.uFloor.value = 0.05; u.uGrain.value = 0.014;
    u.uOutline.value = 0.55; u.uSharp.value = 0.16; u.uAA.value = 0; u.uLevels.value = 32; u.uKeepSat.value = 0.6; u.uHalation.value = 0.08;
    u.uBloom.value = 0.45; u.uAO.value = 0.5; u.uAORad.value = 0.22; u.uBounce.value = 0; u.uScatter.value = 0;
    u.uFocal.value = this.lowH / (2 * Math.tan(THREE.MathUtils.degToRad(this.cam.fov) / 2));
    const saved = { cut: U.uCutOn.value, vis: U.uVisOn.value, fn: U.uFogNear.value, ff: U.uFogFar.value, gs: U.uGridScale.value, col: U.uCollapse.value, snap: U.uSnapOn.value };
    const ss = { ts: SPOTU.tSpotShadow.value, tu: SPOTU.tSunShadow.value, so: SPOTU.uSpotOn.value, su: SPOTU.uSunOn.value, sh: SPOTU.uSpotShadowOn.value };
    const nsd = this.noShadow?.depthTexture ?? null;
    SPOTU.tSpotShadow.value = nsd; SPOTU.tSunShadow.value = nsd; SPOTU.uSpotOn.value = 0; SPOTU.uSunOn.value = 0; SPOTU.uSpotShadowOn.value = 0;
    U.uCutOn.value = 0; U.uVisOn.value = 0; U.uFogNear.value = 1e4; U.uFogFar.value = 2e4; U.uGridScale.value = 0; U.uCollapse.value = 0; U.uSnapOn.value = 0;
    try {
      r.setRenderTarget(this.rt);
      r.setClearColor(0x000000, 1);
      r.clear(true, true, true);
      r.render(this.scene, this.cam);
      this.bloom.run(r, this.rt.texture, this.rt.width, this.rt.height, u.uExposure.value);
      u.tB1.value = this.bloom.tex[0]; u.tB2.value = this.bloom.tex[1]; u.tB3.value = this.bloom.tex[2];
      r.setRenderTarget(null);
      r.render(this.post.scene, this.post.cam);
    } finally {
      U.uCutOn.value = saved.cut; U.uVisOn.value = saved.vis; U.uFogNear.value = saved.fn; U.uFogFar.value = saved.ff; U.uGridScale.value = saved.gs; U.uCollapse.value = saved.col; U.uSnapOn.value = saved.snap;
      SPOTU.tSpotShadow.value = ss.ts; SPOTU.tSunShadow.value = ss.tu; SPOTU.uSpotOn.value = ss.so; SPOTU.uSunOn.value = ss.su; SPOTU.uSpotShadowOn.value = ss.sh;
    }
  }

  /** jump to the step out (a skip) */
  skipTo(t: number) { if (this.t < t) this.t = t; }

  dispose() {
    this.rig.dispose();
    this.vat.dispose();
    this.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry) m.geometry.dispose(); });
    this.rt?.dispose(); this.noShadow?.dispose(); this.env?.dispose(); this.bloom.dispose();
    disposeFacetMats();
    this.renderer?.dispose(); this.renderer?.forceContextLoss?.();
    this.root.remove();
  }
}

/** play the revive; resolves when the new body has walked out (or it was skipped) */
export function playRevive(o: { app: Appearance; name: string }): Promise<void> {
  return new Promise((resolve) => {
    const sc = new ReviveScene(o.app);
    document.body.append(sc.root);
    let raf = 0, last = performance.now(), done = false, skips = 0;
    const end = () => {
      if (done) return; done = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', key, true);
      sc.root.removeEventListener('pointerdown', tap);
      try { sc.dispose(); } catch (e) { console.warn('revive dispose', e); sc.root.remove(); }
      resolve();
      bus.emit('subtitle', { who: 'RELAY', text: `${o.name.toUpperCase()} · RELINKED`, dur: 2.6, style: 'radio' });
    };
    const skip = () => { skips++; if (skips === 1 && sc.t < 7.4) sc.skipTo(7.4); else sc.skipTo(sc.LEN - 0.7); };
    const key = (e: KeyboardEvent) => { e.stopImmediatePropagation(); if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); skip(); } };
    const tap = () => skip();
    window.addEventListener('keydown', key, true);
    sc.root.addEventListener('pointerdown', tap);
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      try { sc.frame(dt); } catch (e) { console.warn('revive frame', e); end(); return; }
      if (sc.t >= sc.LEN) { end(); return; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    if (import.meta.env.DEV) (window as unknown as { __revive: unknown }).__revive = { sc, skip, end, seek: (t: number) => sc.skipTo(t) };
  });
}
