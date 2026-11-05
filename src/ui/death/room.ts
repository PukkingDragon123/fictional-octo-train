// The observation room: where the Meridian Institute watches the subjects die.
// A dim monitor room built from the menu rooms' faceted kit: a steel rack of
// chunky olive-and-beige CRTs (the big one in the middle plays the tape of your
// death), a console desk with toggles, lamps, papers, a keyboard and cold
// coffee, the "days without a deletion" sign, a wall of shame, and three staff
// (preview rigs dressed by the game's own items). Lit by the tubes' green, one
// warm desk lamp with a haze cone and a cold bulb behind the crew. Rendered
// small into its own canvas, then a crisp composite (one-pixel silhouette
// lines, grade, dither) blown up by a whole number.
import * as THREE from 'three';
import { createPreviewRig, randomAppearance, type HumanRig, type Outfit, type Appearance } from '../../entities/humanRig';
import type { ActionAnim } from '../../entities/humanAnim';
import { randomLooks } from '../../entities/humanLooks';
import { Player } from '../../entities/player';
import { hasItemDef } from '../../items/item';
import { U } from '../../gfx/materials';
import { SPOTU } from '../../gfx/postfx';
import { bitText } from '../../gfx/bitfont';
import { facetMats, disposeFacetMats, plateTex, type FMats, type FKey } from '../menus/scene/pixtex';
import { FacetBuilder, at, cbox, prism, lathe, extrude, tube, band, gem, bolt, hull, jitter } from '../menus/scene/facet';
import { makePost } from '../menus/scene/post';
import { Dust, shaftMesh, Puffs } from '../menus/scene/fx';
import { DeathFeed, SideTube, type SideKind } from './feed';
import type { TapeFrame } from './recorder';
import type { Gesture, Who } from './lines';

type V3 = [number, number, number];
const C = {
  olive: 0x6e7650, oliveDk: 0x464c32, beige: 0xcfc3a2, beigeDk: 0xa89c7e, steel: 0x8a8e8e, dark: 0x3e4244, desk: 0x7a8068,
  wall: 0x8a9478, wallDk: 0x5a6450, floor: 0x8c8a80, red: 0xb83a24, cream: 0xe6dfcc,
};

/** what a set of worn items looks like, by the game's own dressing rules */
function outfitOf(keys: string[]): Outfit {
  const fake: any = { worn: new Map(), handR: null, handL: null, lightItem: null, outfitDirty: false };
  for (const k of keys) { if (!hasItemDef(k)) continue; try { Player.prototype.wear.call(fake, { uid: 0, key: k, cond: 1, age: 0 } as any); } catch { /* not wearable */ } }
  try { return Player.prototype.computeOutfit.call(fake); } catch { return {}; }
}

function seeded(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296); }

const slab = (b: FacetBuilder, k: FKey, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, col: number, c = 0.01, o: Parameters<FacetBuilder['add']>[4] = {}) =>
  b.add(k, cbox(x1 - x0, y1 - y0, z1 - z0, c), col, at((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), o);

// ------------------------------------------------------------------ the crew
interface Staffer {
  rig: HumanRig; base: THREE.Vector3; yaw: number; seated: boolean;
  look: THREE.Vector3; lookTo: THREE.Vector3; lookW: number;
  act: ActionAnim; actDur: number; actUntil: number; typing: boolean;
  talk: number; lean: number; leanT: number; t: number;
}

const CREW: { items: string[]; app: Partial<Appearance>; fem: boolean; at: V3; face: V3; seated: boolean; seed: number }[] = [
  // Dr. Hale: standing behind the chair with her coffee
  { items: ['shirt_office', 'lab_coat', 'slacks', 'dress_shoes', 'glasses'], app: { hairStyle: 'bob', build: 'slim', bodyShape: 0.95, hair: 0x6a4628, facialHair: 'none', beard: false }, fem: true, at: [0.86, 0, 0.32], face: [-0.05, 1.3, -1.3], seated: false, seed: 101 },
  // Ortiz: the technician at the keyboard
  { items: ['tshirt', 'lab_coat', 'jeans', 'sneakers'], app: { hairStyle: 'short', build: 'average', bodyShape: 0.15, facialHair: 'stubble', hair: 0x2a1c14 }, fem: false, at: [-0.34, 0, -0.16], face: [-0.34, 1.0, -1.3], seated: true, seed: 202 },
  // Sgt. Brandt: security, leaning on the end of the console
  { items: ['security_uniform', 'slacks', 'dress_shoes', 'hat_cap'], app: { hairStyle: 'buzz', build: 'broad', bodyShape: 0, facialHair: 'moustache', hair: 0x3b2a1e }, fem: false, at: [-1.42, 0, -0.3], face: [0.1, 1.3, -1.3], seated: false, seed: 303 },
];

// ------------------------------------------------------------------ shots
export type ShotName = 'feed' | 'room' | 'reverse' | 'type' | 'case' | 'wide';
interface Shot { pos: THREE.Vector3; look: THREE.Vector3; fov: number }

const SCREEN = { x: 0, y: 1.39, z: -1.324, w: 0.62, h: 0.47 };

function shotFor(name: ShotName, aspect: number): Shot {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const portrait = aspect < 1;
  switch (name) {
    case 'feed': {
      // the tube fills the picture
      const fov = 36, th = Math.tan(THREE.MathUtils.degToRad(fov / 2));
      const d = Math.max(SCREEN.h / 0.86 / (2 * th), SCREEN.w / 0.94 / (2 * th * aspect));
      return { pos: v(SCREEN.x, SCREEN.y, SCREEN.z + d + 0.01), look: v(SCREEN.x, SCREEN.y, SCREEN.z), fov };
    }
    case 'room': return portrait
      ? { pos: v(0.3, 1.78, 2.7), look: v(-0.12, 1.2, -1.0), fov: 60 }
      : { pos: v(0.5, 1.72, 1.95), look: v(-0.14, 1.26, -1.3), fov: 46 };
    case 'wide': return portrait
      ? { pos: v(0.1, 1.9, 3.1), look: v(-0.1, 1.2, -1.2), fov: 62 }
      : { pos: v(0.6, 1.8, 2.6), look: v(-0.1, 1.25, -1.3), fov: 48 };
    case 'reverse': return portrait
      ? { pos: v(0.0, 1.66, -1.18), look: v(-0.3, 1.3, 0.6), fov: 92 }
      : { pos: v(0.1, 1.68, -1.2), look: v(-0.42, 1.26, 0.6), fov: 74 };
    case 'type': return portrait
      ? { pos: v(-0.92, 1.4, -1.14), look: v(-0.32, 0.94, -0.5), fov: 74 }
      : { pos: v(-0.98, 1.38, -1.14), look: v(-0.3, 0.94, -0.5), fov: 60 };
    case 'case': {
      // face on: the tube in the upper part of the picture, room for the keys below it
      const fov = 40, th = Math.tan(THREE.MathUtils.degToRad(fov / 2));
      const d = Math.max(SCREEN.h / (portrait ? 0.42 : 0.66) / (2 * th), SCREEN.w / (portrait ? 0.96 : 0.86) / (2 * th * aspect));
      const drop = portrait ? 0.1 : 0.085;
      return { pos: v(SCREEN.x, SCREEN.y - drop * 0.4, SCREEN.z + d), look: v(SCREEN.x, SCREEN.y - drop, SCREEN.z), fov };
    }
  }
}

const ease = (k: number) => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;

export class ObsRoom {
  readonly canvas = document.createElement('canvas');
  renderer: THREE.WebGLRenderer | null = null;
  readonly scene = new THREE.Scene();
  readonly cam = new THREE.PerspectiveCamera(44, 16 / 9, 0.05, 30);
  readonly feed: DeathFeed;
  private sides: SideTube[] = [];
  private mats: FMats;
  private rt: THREE.WebGLRenderTarget | null = null;
  private post = makePost();
  private lowW = 0; private lowH = 0; private S = 2;
  private ro: ResizeObserver | null = null;
  /** a 1x1 compare-mode depth target of our own: the world material's shadow samplers must be bound to one in this context */
  private noShadow: THREE.WebGLRenderTarget | null = null;
  readonly crew: Staffer[] = [];
  private t = 0;
  // lights
  private hemi = new THREE.HemisphereLight(0x4a5868, 0x14100c, 1.7);
  private crtBig = new THREE.PointLight(0x7aff9a, 4.5, 6.5, 1.2);
  private crtBank = new THREE.PointLight(0x5ad07a, 3, 6, 1.2);
  private lamp = new THREE.SpotLight(0xffc07a, 30, 4, 0.62, 0.55, 1.4);
  private rim = new THREE.SpotLight(0x9ab0e0, 24, 9, 0.5, 0.7, 1.2);
  private door = new THREE.PointLight(0xffd8a0, 4, 4.5, 1.4);
  private doorBulb = new THREE.MeshBasicMaterial({ color: 0xffe0b0, toneMapped: false });
  private recL = new THREE.PointLight(0xff3020, 0.25, 1.4, 2);
  private lampAt = new THREE.Vector3(-1.62, 1.18, -0.98);
  private lampTo = new THREE.Vector3(-1.2, 0.76, -0.78);
  private shaft = shaftMesh(9);
  private dust: Dust;
  private puffs = new Puffs(40);
  private steamAt: THREE.Vector3[] = [new THREE.Vector3(-1.12, 0.86, -0.84)];
  private steamT = 0;
  private recMat = new THREE.MeshBasicMaterial({ color: 0xff3a20, toneMapped: false });
  private bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe6b0, toneMapped: false });
  private signTex: THREE.CanvasTexture;
  private signCv = document.createElement('canvas');
  private signDays = 0;
  private texs: THREE.Texture[] = [];
  // camera
  private shotA: Shot; private shotB: Shot; private blend = 1; private blendDur = 0; private shotName: ShotName = 'feed';
  private shake = 0;
  /** handheld drift (0 locked off .. 1) */
  hand = 1;
  private v1 = new THREE.Vector3(); private v2 = new THREE.Vector3();

  constructor(private host: HTMLElement, frames: TapeFrame[], deathAt: number, o: { low: boolean; cam: string; zone: string; file: string; clock: () => string; daysWithout: number; map: (c: CanvasRenderingContext2D, W: number, H: number, t: number) => void; still: HTMLCanvasElement | null }) {
    this.canvas.className = 'dz-cv';
    host.append(this.canvas);
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, powerPreference: o.low ? 'low-power' : 'default' });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.setPixelRatio(1);
      this.renderer.setClearColor(0x000000, 1);
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      const nsd = new THREE.DepthTexture(1, 1);
      nsd.compareFunction = THREE.LessEqualCompare;
      this.noShadow = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, depthTexture: nsd });
      this.renderer.initRenderTarget(this.noShadow);
    } catch (e) { console.warn('observation room renderer unavailable', e); this.renderer = null; }
    this.mats = facetMats(o.low);
    const S = this.scene;
    S.background = new THREE.Color(0x000000);
    // ---- the room, the rack, the desk, the props
    S.add(this.shell(), this.rack(), this.desk(), this.chairs());
    // ---- the tubes
    this.feed = new DeathFeed(SCREEN.w, SCREEN.h, frames, deathAt, { cam: o.cam, zone: o.zone, file: o.file, clock: o.clock });
    this.feed.tube.mesh.position.set(SCREEN.x, SCREEN.y, SCREEN.z);
    S.add(this.feed.tube.mesh);
    const side = (kind: SideKind, w: number, h: number, p: V3, ry: number, rx: number, extra: ConstructorParameters<typeof SideTube>[3] = {}) => {
      const s = new SideTube(w, h, kind, extra);
      s.tube.mesh.position.set(p[0], p[1], p[2]); s.tube.mesh.rotation.set(rx, ry, 0, 'YXZ');
      S.add(s.tube.mesh); this.sides.push(s);
    };
    for (const [i, m] of MEDIUM.entries()) side(i === 0 ? 'vitals' : 'map', m.sw, m.sh, m.screen, m.ry, 0, { map: o.map });
    const kinds: SideKind[] = ['cam', 'static', 'next', 'log'];
    for (const [i, m] of SMALL.entries()) side(kinds[i], m.sw, m.sh, m.screen, m.ry, m.rx, { still: o.still, label: 'CAM 0' + (i + 2), file: o.file });
    // ---- the sign: days without a deletion
    this.signCv.width = 40; this.signCv.height = 24;
    this.signTex = new THREE.CanvasTexture(this.signCv);
    this.signTex.magFilter = this.signTex.minFilter = THREE.NearestFilter; this.signTex.generateMipmaps = false; this.signTex.colorSpace = THREE.SRGBColorSpace;
    this.texs.push(this.signTex);
    this.signDays = o.daysWithout;
    this.paintSign();
    S.add(this.signs());
    // ---- the crew
    for (const c of CREW) {
      const rnd = seeded(c.seed);
      const app = { ...randomAppearance(rnd), ...randomLooks(rnd, c.fem), ...c.app } as Appearance;
      const rig = createPreviewRig(app, outfitOf(c.items), { outline: false });
      rig.skin.castShadow = true;
      const base = new THREE.Vector3(...c.at);
      const yaw = Math.atan2(c.face[0] - c.at[0], c.face[2] - c.at[2]);
      rig.root.position.copy(base); rig.root.rotation.y = yaw;
      S.add(rig.root);
      const look = new THREE.Vector3(...c.face);
      this.crew.push({ rig, base, yaw, seated: c.seated, look: look.clone(), lookTo: look, lookW: 0.8, act: '', actDur: 1, actUntil: 0, typing: false, talk: 0, lean: 0, leanT: 0, t: rnd() * 10 });
    }
    // Hale's mug
    const mug = this.mugModel(0xd8d4c8);
    mug.position.set(0, -0.06, 0.03); mug.rotation.set(0, 0, Math.PI / 2);
    this.crew[0].rig.heldR.add(mug);
    // ---- light
    S.add(this.hemi);
    this.crtBig.position.set(0, 1.4, -0.72); S.add(this.crtBig);
    this.crtBank.position.set(0, 2.05, -0.95); S.add(this.crtBank);
    this.lamp.position.copy(this.lampAt); this.lamp.target.position.copy(this.lampTo);
    this.lamp.castShadow = !o.low; this.lamp.shadow.mapSize.set(512, 512); this.lamp.shadow.bias = -0.002; this.lamp.shadow.camera.near = 0.1;
    S.add(this.lamp, this.lamp.target);
    this.rim.position.set(0.9, 2.75, 3.0); this.rim.target.position.set(-0.2, 1.1, -0.4);
    this.rim.castShadow = !o.low; this.rim.shadow.mapSize.set(512, 512); this.rim.shadow.bias = -0.002;
    S.add(this.rim, this.rim.target);
    this.recL.position.set(0.17, 1.09, -1.2); S.add(this.recL);
    // a caged bulb over the door behind the crew
    this.door.position.set(-1.7, 2.42, 3.2); S.add(this.door);
    const db = new THREE.Mesh(gem(0.035, 6, 0.05), this.doorBulb); db.position.set(-1.7, 2.4, 3.33); S.add(db);
    // the lamp's haze cone and its dust
    const sm = this.shaft.mesh;
    sm.position.copy(this.lampAt);
    const dir = this.v1.copy(this.lampTo).sub(this.lampAt).normalize();
    sm.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    sm.scale.set(Math.tan(0.62) * 0.55, 0.55, Math.tan(0.62) * 0.55);
    this.shaft.u.uColor.value.set(0xffc890);
    this.shaft.u.uInt.value = 0.11;
    S.add(sm);
    this.dust = new Dust(o.low ? 60 : 140, new THREE.Box3(new THREE.Vector3(-2.1, 0.7, -1.3), new THREE.Vector3(-0.8, 1.3, -0.4)));
    S.add(this.dust.points, this.puffs.mesh);
    // ---- camera
    this.shotA = this.shotB = shotFor('feed', 16 / 9);
    if (typeof ResizeObserver !== 'undefined') { this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host); }
    this.resize();
  }

  // ================================================================ modelling
  private shell(): THREE.Group {
    const b = new FacetBuilder();
    const W = 3.0, BK = -2.05, FR = 3.45, H = 2.9;
    slab(b, 'floor', -W, W, -0.1, 0, BK, FR, C.floor);
    // the wall behind the rack: green glazed tile, concrete above
    slab(b, 'tile', -W, W, 0, 1.45, BK - 0.15, BK, 0x9aae90);
    slab(b, 'concrete', -W, W, 1.45, H, BK - 0.15, BK, 0x8a8a80);
    for (const k of [-1, 1]) {
      slab(b, 'paint', k * W, k * (W + 0.15), 0, 1.2, BK, FR, C.wallDk, 0.01);
      slab(b, 'concrete', k * W, k * (W + 0.15), 1.2, H, BK, FR, 0x8a8a80);
      slab(b, 'metal', k * W - (k > 0 ? 0.03 : 0), k * W + (k < 0 ? 0.03 : 0), 1.18, 1.24, BK, FR, C.dark, 0.008);
    }
    // the wall behind the crew
    slab(b, 'paint', -W, W, 0, 1.2, FR, FR + 0.15, C.wallDk);
    slab(b, 'concrete', -W, W, 1.2, H, FR, FR + 0.15, 0x8a8a80);
    slab(b, 'metal', -W, W, 1.18, 1.24, FR - 0.03, FR, C.dark, 0.008);
    slab(b, 'tile', -W, W, 1.42, 1.48, BK, BK + 0.03, 0x4e6a46, 0.01);
    // ceiling, a beam, a dead tube fixture
    slab(b, 'concrete', -W, W, H, H + 0.12, BK, FR, 0x4a4a46);
    const I: [number, number][] = [[-0.07, -0.1], [0.07, -0.1], [0.07, -0.08], [0.008, -0.08], [0.008, 0.08], [0.07, 0.08], [0.07, 0.1], [-0.07, 0.1], [-0.07, 0.08], [-0.008, 0.08], [-0.008, -0.08], [-0.07, -0.08]];
    for (const z of [-0.6, 1.6]) b.add('rust', extrude(I, 2 * W, 0.003), 0x8a7a6a, at(0, H - 0.1, z, 0, Math.PI / 2), { grain: 'z' });
    b.add('metal', cbox(1.3, 0.08, 0.24, 0.02), C.steel, at(0.3, H - 0.24, 0.6));
    for (const dz of [-0.06, 0.06]) b.add('glass', prism(0.022, 1.2, 6), 0x2a3030, at(0.3, H - 0.3, 0.6 + dz, 0, 0, Math.PI / 2));
    for (const dx of [-0.6, 1.2]) b.add('metal', prism(0.008, 0.2, 4), C.dark, at(dx, H - 0.1, 0.6));
    // pipes along the ceiling and down the left wall, a conduit to the rack
    const pipe = (pts: V3[], r: number, k: FKey, col: number) => { b.add(k, tube(pts, r, Math.max(6, pts.length * 4), 6, false), col); for (const p of pts) b.add('metal', prism(r * 1.45, r * 1.2, 8), C.dark, at(p[0], p[1], p[2])); };
    pipe([[-W + 0.14, 0, BK + 0.3], [-W + 0.14, H - 0.2, BK + 0.3], [-W + 0.14, H - 0.2, FR - 0.2]], 0.06, 'rust', 0xffffff);
    pipe([[-W + 0.3, H - 0.32, BK + 0.12], [W - 0.3, H - 0.32, BK + 0.12]], 0.04, 'paint', 0x6a7a5a);
    pipe([[1.4, H - 0.32, BK + 0.12], [1.4, 2.35, BK + 0.12]], 0.025, 'metal', C.steel);
    // the door behind the crew: a steel leaf, a wired window, a push plate
    const dx = -1.7;
    for (const k of [-1, 1]) b.add('metal', cbox(0.08, 2.15, 0.12, 0.012), C.dark, at(dx + k * 0.5, 1.075, FR - 0.04));
    b.add('metal', cbox(1.08, 0.08, 0.12, 0.012), C.dark, at(dx, 2.17, FR - 0.04));
    b.add('paint', cbox(0.92, 2.08, 0.05, 0.01), C.olive, at(dx, 1.04, FR - 0.03), { rep: 0.5 });
    b.add('metal', extrude([[-0.2, -0.16], [0.2, -0.16], [0.2, 0.16], [-0.2, 0.16]], 0.03, 0.006, [[[-0.16, -0.12], [0.16, -0.12], [0.16, 0.12], [-0.16, 0.12]]]), C.dark, at(dx, 1.62, FR - 0.06));
    b.add('glass', cbox(0.32, 0.24, 0.01, 0.002), 0x30382c, at(dx, 1.62, FR - 0.055));
    b.add('metal', cbox(0.24, 0.06, 0.03, 0.008), C.steel, at(dx + 0.3, 1.02, FR - 0.08));
    // a filing cabinet and a water cooler by the door
    for (let i = 0; i < 3; i++) {
      b.add('paint', cbox(0.46, 0.42, 0.6, 0.012), C.olive, at(-0.65, 0.22 + i * 0.43, FR - 0.33), { rep: 0.5 });
      b.add('metal', cbox(0.16, 0.025, 0.03, 0.006), C.steel, at(-0.65, 0.33 + i * 0.43, FR - 0.64));
      b.add('paint', cbox(0.08, 0.05, 0.012, 0.003), C.cream, at(-0.65, 0.38 + i * 0.43, FR - 0.632));
    }
    // the wall clock (twelve facets), stopped
    b.add('metal', lathe([[0, 0], [0.17, 0], [0.18, 0.02], [0.17, 0.05], [0, 0.05]], 12), C.dark, at(1.6, 2.2, FR - 0.01, -Math.PI / 2));
    b.add('enamel', lathe([[0, 0], [0.15, 0], [0, 0.002]], 12), C.cream, at(1.6, 2.2, FR - 0.065, -Math.PI / 2));
    b.add('metal', cbox(0.012, 0.11, 0.006, 0.002), 0x1a1a1a, at(1.6, 2.25, FR - 0.07, 0, 0, 0.7));
    b.add('metal', cbox(0.012, 0.08, 0.006, 0.002), 0x1a1a1a, at(1.6, 2.22, FR - 0.072, 0, 0, -1.9));
    const g = b.build(this.mats, { cast: false });
    // the wall of shame
    g.add(this.shameBoard(0.55, 1.62, FR - 0.03));
    return g;
  }

  /** the corkboard: polaroids of the dead, red crosses, pins, string, a painted header */
  private shameBoard(x: number, y: number, z: number): THREE.Group {
    const W = 160, H = 96;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d')!;
    const r = seeded(77);
    const cork = ['#5a3c22', '#6e4a2a', '#7e5834', '#8e6a40', '#4a301c'];
    for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) { c.fillStyle = cork[Math.floor(r() * r() * 5)]; c.fillRect(xx, yy, 1, 1); }
    c.fillStyle = '#2a1a0e'; c.fillRect(0, 0, W, 2); c.fillRect(0, H - 2, W, 2); c.fillRect(0, 0, 2, H); c.fillRect(W - 2, 0, 2, H);
    c.fillStyle = '#9a7a4a'; c.fillRect(2, 2, W - 4, 1);
    // header on a strip of masking tape
    c.fillStyle = '#d8ccaa'; c.fillRect(30, 5, 100, 15); c.fillStyle = '#b8ac8a'; c.fillRect(30, 19, 100, 1);
    bitText(c, 'WALL OF SHAME', 80, 6, { font: 'body', color: '#7a1a10', outline: null, shadow: null, align: 'center' });
    const photos: [number, number][] = [];
    for (let row = 0; row < 2; row++) for (let col = 0; col < 6; col++) photos.push([10 + col * 24 + Math.floor(r() * 4), 26 + row * 34 + Math.floor(r() * 4)]);
    photos.forEach(([px, py], i) => {
      c.fillStyle = '#1a140c'; c.fillRect(px + 1, py + 1, 19, 25);
      c.fillStyle = '#e8e2d0'; c.fillRect(px, py, 19, 25);
      c.fillStyle = ['#3a4a3a', '#4a3a2a', '#2a3a4a', '#4a4a3a'][i % 4]; c.fillRect(px + 2, py + 2, 15, 15);
      // a head and shoulders
      c.fillStyle = ['#c8a080', '#a07050', '#e0b898', '#7a5038'][Math.floor(r() * 4)];
      c.fillRect(px + 7, py + 5, 5, 6); c.fillRect(px + 4, py + 12, 11, 5);
      c.fillStyle = '#2a2018'; c.fillRect(px + 7, py + 4, 5, 2);
      c.fillStyle = '#6a6458'; c.fillRect(px + 3, py + 20, 12, 1); c.fillRect(px + 3, py + 22, 8, 1);
      if (r() < 0.75) { c.fillStyle = '#c01a10'; for (let k = 0; k < 13; k++) { c.fillRect(px + 3 + k, py + 3 + k, 2, 1); c.fillRect(px + 15 - k, py + 3 + k, 2, 1); } }
      c.fillStyle = ['#d02a20', '#2a8a30', '#d8c020'][i % 3]; c.fillRect(px + 8, py - 1, 3, 3); c.fillStyle = '#ffffff'; c.fillRect(px + 8, py - 1, 1, 1);
    });
    // red string between a few of them
    c.fillStyle = '#a01810';
    const link = (a: number, b2: number) => { const [ax, ay] = photos[a], [bx, by] = photos[b2]; const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay)); for (let k = 0; k <= n; k++) c.fillRect(Math.round(ax + 9 + (bx - ax) * k / n), Math.round(ay + (by - ay) * k / n + Math.sin(k / n * Math.PI) * 3), 1, 1); };
    link(1, 8); link(8, 4); link(3, 10);
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
    this.texs.push(tex);
    const g = new THREE.Group();
    const bw = 1.5, bh = bw * H / W;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0, flatShading: true }));
    face.position.set(x, y, z - 0.03); face.rotation.y = Math.PI;
    face.receiveShadow = true;
    const fb = new FacetBuilder();
    fb.add('wood', cbox(bw + 0.08, bh + 0.08, 0.04, 0.012), 0x8a6a48, at(x, y, z - 0.005), { grain: 'x' });
    g.add(fb.build(this.mats), face);
    return g;
  }

  private signs(): THREE.Group {
    const g = new THREE.Group();
    const b = new FacetBuilder();
    // the plate on the wall above the rack, the digits in a steel box
    b.add('metal', cbox(1.16, 0.3, 0.04, 0.01), C.dark, at(0.02, 2.5, -1.99));
    for (const x of [-0.53, 0.57]) b.add('metal', bolt(0.012, 0.01), C.steel, at(x, 2.5, -1.965, Math.PI / 2));
    b.add('metal', extrude([[-0.15, -0.11], [0.15, -0.11], [0.15, 0.11], [-0.15, 0.11]], 0.05, 0.008, [[[-0.12, -0.085], [0.12, -0.085], [0.12, 0.085], [-0.12, 0.085]]]), C.dark, at(0.4, 2.5, -1.95));
    g.add(b.build(this.mats));
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.22), new THREE.MeshStandardMaterial({ map: this.track(plateTex(['DAYS WITHOUT', 'A DELETION'], { w: 96, h: 32, bg: 0xc8b060 })), roughness: 0.6, flatShading: true }));
    plate.position.set(-0.2, 2.5, -1.965);
    const dig = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.17), new THREE.MeshBasicMaterial({ map: this.signTex, toneMapped: false }));
    dig.position.set(0.4, 2.5, -1.955);
    g.add(plate, dig);
    // KEEP QUIET above the door, a stencilled CAM ROOM B by the rack
    const quiet = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.12), new THREE.MeshStandardMaterial({ map: this.track(plateTex(['OBSERVATION B'], { w: 72, h: 18, bg: 0xb8b4a0 })), roughness: 0.6 }));
    quiet.position.set(-1.7, 2.66, 3.42); quiet.rotation.y = Math.PI;
    g.add(quiet);
    return g;
  }
  private track<T extends THREE.Texture>(t: T): T { this.texs.push(t); return t; }

  /** the flip digits: amber numerals on black */
  private paintSign() {
    const c = this.signCv.getContext('2d')!;
    c.fillStyle = '#0a0806'; c.fillRect(0, 0, 40, 24);
    c.fillStyle = '#1e1810'; c.fillRect(2, 11, 36, 1);
    bitText(c, String(Math.min(99, this.signDays)).padStart(2, '0'), 20, 4, { font: 'body', color: '#ffb43c', outline: null, shadow: null, align: 'center' });
    this.signTex.needsUpdate = true;
  }
  /** reset the sign (the count flips down to zero) */
  resetSign(cb?: () => void) {
    const step = () => {
      if (this.signDays <= 0) { this.paintSign(); return; }
      this.signDays = Math.max(0, this.signDays > 9 ? Math.floor(this.signDays / 2) : this.signDays - 1);
      this.paintSign(); cb?.();
      setTimeout(step, 90);
    };
    step();
  }

  private crt(b: FacetBuilder, P: THREE.Matrix4, w: number, h: number, d: number, sw: number, sh: number, sy: number, body: number, bezel: number) {
    const T = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => P.clone().multiply(at(x, y, z, rx, ry, rz));
    const fd = d * 0.5;
    b.add('paint', cbox(w, h, fd, 0.035), body, T(0, h / 2, -fd / 2), { rep: 0.3 });
    const bx = w * 0.42, by = h * 0.42;
    b.add('paint', hull([[-bx, h / 2 - by, -fd], [bx, h / 2 - by, -fd], [-bx, h / 2 + by, -fd], [bx, h / 2 + by, -fd], [-w * 0.22, h / 2 - h * 0.22, -d], [w * 0.22, h / 2 - h * 0.22, -d], [-w * 0.22, h / 2 + h * 0.2, -d], [w * 0.22, h / 2 + h * 0.2, -d]]), body, T(0, 0, 0), { rep: 0.3 });
    // the bezel round the glass
    const ow = w / 2 - 0.02, oh = h / 2 - 0.02, iw = sw / 2 + 0.008, ih = sh / 2 + 0.008;
    b.add('paint', extrude([[-ow, -oh], [ow, -oh], [ow, oh], [-ow, oh]], 0.026, 0.008, [[[-iw, -ih + (sy - h / 2)], [iw, -ih + (sy - h / 2)], [iw, ih + (sy - h / 2)], [-iw, ih + (sy - h / 2)]]]), bezel, T(0, h / 2, 0.008));
    // a dark mask just behind the glass
    b.add('rubber', cbox(sw + 0.03, sh + 0.03, 0.02, 0.004), 0x111111, T(0, sy, -0.012));
    // knobs and a speaker grille on the strip under the glass
    const ky = (sy - sh / 2) / 2 + 0.005;
    if (ky > 0.04) {
      for (const kx of [w * 0.3, w * 0.38]) b.add('bakelite', lathe([[0, 0], [0.018, 0], [0.02, 0.012], [0.015, 0.022], [0, 0.024]], 6), 0xffffff, T(kx, ky, 0.02, Math.PI / 2));
      for (let i = 0; i < 6; i++) b.add('metal', cbox(0.006, 0.03, 0.006, 0.002), 0x222222, T(-w * 0.36 + i * 0.016, ky, 0.022));
    }
    for (let i = 0; i < 6; i++) b.add('metal', cbox(w * 0.5, 0.004, 0.012, 0.001), 0x1a1a1a, T(0, h + 0.001, -fd * 0.2 - i * 0.03));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('rubber', prism(0.018, 0.018, 6), 0x8a8a8a, T(sx * (w / 2 - 0.05), -0.009, sz * fd * 0.35 - fd / 2));
    // the cable out of the back
    b.add('rubber', tube([[0.02, h * 0.3, -d * 0.95], [0.04, h * 0.1, -d - 0.06], [0.0, -0.3, -d - 0.12]], 0.008, 6, 4), 0x9a9a9a, P.clone());
  }

  private rack(): THREE.Group {
    const b = new FacetBuilder();
    // uprights and two steel shelves
    for (const x of [-1.78, 1.78]) for (const z of [-1.4, -1.96]) {
      b.add('metal', cbox(0.05, 2.32, 0.05, 0.008), C.steel, at(x, 1.16, z));
      for (let y = 0.15; y < 2.3; y += 0.12) b.add('metal', cbox(0.052, 0.012, 0.012, 0.002), 0x2a2a2a, at(x, y, z + 0.0));
    }
    slab(b, 'metal', -1.82, 1.82, 0.98, 1.02, -1.98, -1.36, C.steel, 0.008);
    slab(b, 'metal', -1.82, 1.82, 1.8, 1.84, -2.0, -1.42, C.steel, 0.008);
    slab(b, 'metal', -1.82, 1.82, 2.3, 2.33, -2.0, -1.42, C.dark, 0.006);
    // the tubes' housings
    const P = (x: number, y: number, z: number, ry = 0, rx = 0) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, 0, 'YXZ')).setPosition(x, y, z);
    this.crt(b, P(0, 1.02, BIG.front), BIG.w, BIG.h, BIG.d, SCREEN.w, SCREEN.h, SCREEN.y - 1.02, C.beige, C.oliveDk);
    for (const m of MEDIUM) this.crt(b, P(m.at[0], 1.02, m.at[2], m.ry), m.w, m.h, m.d, m.sw, m.sh, m.sy, C.olive, C.oliveDk);
    for (const m of SMALL) this.crt(b, P(m.at[0], 1.84, m.at[2], m.ry, m.rx), m.w, m.h, m.d, m.sw, m.sh, m.sy, m.i % 2 ? C.beigeDk : C.olive, C.oliveDk);
    // a stencilled plate under the big tube and the REC lamp
    b.add('metal', cbox(0.05, 0.04, 0.03, 0.006), C.dark, at(0.17, 1.09, BIG.front + 0.02));
    const g = b.build(this.mats);
    const rec = new THREE.Mesh(gem(0.014, 6, 0.012), this.recMat);
    rec.rotation.x = Math.PI / 2; rec.position.set(0.17, 1.09, BIG.front + 0.04);
    g.add(rec);
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.05), new THREE.MeshStandardMaterial({ map: this.track(plateTex(['CAM 07 · MAIN'], { w: 64, h: 16, bg: 0xb8ac88, rivets: false })), roughness: 0.6 }));
    lbl.position.set(-0.05, 1.09, BIG.front + 0.024);
    g.add(lbl);
    return g;
  }

  private mugModel(col: number): THREE.Group {
    const b = new FacetBuilder();
    b.add('enamel', lathe([[0, 0], [0.04, 0], [0.043, 0.01], [0.044, 0.1], [0.038, 0.1], [0.036, 0.016], [0, 0.016]], 8), col, at(0, 0, 0));
    b.add('enamel', band(0.028, 0.012, 0.012, 0.01, 8, 0.6, Math.PI * 0.2), col, at(0.05, 0.055, 0, Math.PI / 2, 0, Math.PI / 2));
    b.add('rubber', lathe([[0, 0], [0.037, 0], [0, 0.002]], 8), 0x2a1a0e, at(0, 0.085, 0));
    return b.build(this.mats);
  }

  private desk(): THREE.Group {
    const b = new FacetBuilder();
    const X0 = -2.25, X1 = 2.25, Z0 = -1.32, Z1 = -0.6, TOP = 0.76;
    slab(b, 'paint', X0, X1, TOP - 0.04, TOP, Z0, Z1, C.desk, 0.012, { rep: 0.6 });
    slab(b, 'metal', X0, X1, TOP - 0.05, TOP - 0.01, Z1 - 0.02, Z1 + 0.012, C.dark, 0.006);
    slab(b, 'rubber', -1.0, 0.9, TOP, TOP + 0.006, -1.08, -0.64, 0x3a3e38, 0.002);
    // pedestals with drawers at the ends, a back panel, the kneehole open
    for (const [a, c] of [[X0, -1.55], [1.5, X1]] as [number, number][]) {
      slab(b, 'paint', a, c, 0.04, TOP - 0.04, Z0 + 0.02, Z1 - 0.03, C.olive, 0.012, { rep: 0.5 });
      for (let i = 0; i < 3; i++) {
        slab(b, 'paint', a + 0.04, c - 0.04, 0.08 + i * 0.22, 0.27 + i * 0.22, Z1 - 0.035, Z1 - 0.02, C.oliveDk, 0.006);
        b.add('metal', cbox(0.14, 0.02, 0.025, 0.005), C.steel, at((a + c) / 2, 0.22 + i * 0.22, Z1 - 0.01));
      }
    }
    slab(b, 'paint', -1.55, 1.5, 0.2, TOP - 0.04, Z0 + 0.02, Z0 + 0.05, C.oliveDk, 0.006);
    // the console bridge: a slanted panel along the back of the desk
    b.add('paint', hull([[X0 + 0.1, TOP, -1.12], [X1 - 0.1, TOP, -1.12], [X0 + 0.1, TOP, Z0], [X1 - 0.1, TOP, Z0], [X0 + 0.1, 0.97, -1.23], [X1 - 0.1, 0.97, -1.23], [X0 + 0.1, 0.97, Z0], [X1 - 0.1, 0.97, Z0]]), C.oliveDk, undefined, { rep: 0.4 });
    const RX = 1.088;
    const onPanel = (x: number, s: number, lift = 0) => at(x, TOP + 0.21 * s + lift * 0.464, -1.12 - 0.11 * s + lift * 0.886, RX);
    const lamps = [0xff5a2a, 0xffb43c, 0x8dff7a, 0xff5a2a, 0x8dff7a];
    for (let i = 0; i < 26; i++) {
      const x = -1.95 + i * 0.15;
      if (Math.abs(x) < 0.12) continue;
      // toggles on the lower row, lamps above, rocker keys at the top
      b.add('metal', prism(0.012, 0.012, 6), C.steel, onPanel(x, 0.25));
      b.add('metal', prism(0.004, 0.04, 4), 0xc8c8c8, onPanel(x, 0.25, 0.02).multiply(at(0, 0, 0, i % 3 ? 0.4 : -0.4)));
      b.add('lamp', gem(0.011, 6, 0.008), lamps[i % lamps.length], onPanel(x, 0.58, 0.006));
      b.add('bakelite', cbox(0.05, 0.012, 0.03, 0.004), i % 4 ? 0x5a3420 : 0xb83a24, onPanel(x + 0.02, 0.86, 0.006));
    }
    // two meters in the middle of the bridge
    for (const x of [-0.08, 0.08]) {
      b.add('metal', cbox(0.1, 0.012, 0.08, 0.004), C.dark, onPanel(x, 0.5));
      b.add('enamel', cbox(0.08, 0.004, 0.06, 0.001), C.cream, onPanel(x, 0.5, 0.008));
      b.add('metal', cbox(0.003, 0.004, 0.05, 0.001), 0xb82a1a, onPanel(x, 0.5, 0.012).multiply(at(0, 0, 0.01, 0, x > 0 ? 0.6 : -0.3)));
    }
    // the keyboard
    const kx = -0.34, kz = -0.8;
    b.add('enamel', cbox(0.52, 0.045, 0.2, 0.012, 0.04), C.beige, at(kx, TOP + 0.03, kz, 0.08));
    for (let r = 0; r < 4; r++) for (let k = 0; k < 13; k++) {
      if (r === 3 && k > 2 && k < 10) { if (k === 3) b.add('bakelite', cbox(0.2, 0.016, 0.03, 0.004), 0xd8ccb0, at(kx, TOP + 0.06, kz + 0.06, 0.08)); continue; }
      b.add('bakelite', cbox(0.03, 0.016, 0.03, 0.004), (k + r) % 5 === 0 ? 0x7a5a3a : 0xd8ccb0, at(kx - 0.215 + k * 0.036, TOP + 0.058 + r * 0.003, kz - 0.06 + r * 0.04, 0.08));
    }
    b.add('rubber', tube([[kx, TOP + 0.04, kz - 0.1], [kx + 0.05, TOP + 0.01, kz - 0.25], [kx + 0.02, TOP + 0.01, -1.1]], 0.006, 6, 4), 0x9a9a9a);
    // papers, the manila file, a clipboard
    const rr = seeded(9);
    for (let i = 0; i < 6; i++) b.add('enamel', cbox(0.21, 0.003, 0.29, 0.001), i % 3 ? 0xe8e2d2 : 0xd8d0bc, at(0.2 + rr() * 0.6, TOP + 0.007 + i * 0.002, -0.9 + rr() * 0.2, 0, rr() * 1.2 - 0.6));
    b.add('paint', cbox(0.24, 0.006, 0.32, 0.002), 0xc8a860, at(0.52, TOP + 0.02, -0.82, 0, 0.25), { rep: 0.4 });
    b.add('enamel', cbox(0.07, 0.002, 0.09, 0.001), 0x3a3a3a, at(0.47, TOP + 0.024, -0.86, 0, 0.25));
    b.add('wood', cbox(0.23, 0.01, 0.32, 0.003), 0xa07a50, at(-1.22, TOP + 0.01, -1.02, 0, -0.4));
    b.add('enamel', cbox(0.2, 0.003, 0.27, 0.001), 0xe8e2d2, at(-1.22, TOP + 0.017, -1.01, 0, -0.4));
    b.add('metal', cbox(0.09, 0.02, 0.04, 0.006), C.steel, at(-1.18, TOP + 0.024, -1.15, 0, -0.4));
    // the desk lamp: a weighted base, two arms, the shade
    const L = this.lampAt;
    b.add('metal', lathe([[0, 0], [0.09, 0], [0.095, 0.02], [0.06, 0.035], [0, 0.04]], 8), 0x3a4a3a, at(-1.75, TOP, -1.12));
    b.add('metal', tube([[-1.75, TOP + 0.04, -1.12], [-1.78, TOP + 0.32, -1.1], [L.x - 0.02, L.y + 0.04, L.z - 0.04]], 0.009, 8, 5, false), 0x3a4a3a);
    const shq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), this.v2.copy(this.lampTo).sub(L).normalize());
    const shade = new THREE.Matrix4().compose(L.clone(), shq, new THREE.Vector3(1, 1, 1));
    b.add('metal', lathe([[0.03, 0.06], [0.05, 0.03], [0.1, -0.06], [0.11, -0.08], [0.104, -0.08], [0.094, -0.06], [0.044, 0.03], [0.024, 0.055]], 9), 0x3a5a3a, shade.clone().multiply(at(0, 0.02, 0)));
    // the coffee, an ashtray, the hotline, binders
    const ash = (x: number, z: number) => { b.add('metal', lathe([[0, 0], [0.07, 0], [0.075, 0.02], [0.06, 0.022], [0.055, 0.008], [0, 0.008]], 8), C.steel, at(x, TOP, z)); for (let i = 0; i < 3; i++) b.add('enamel', cbox(0.03, 0.008, 0.008, 0.002), 0xd8d0c0, at(x - 0.02 + i * 0.02, TOP + 0.014, z + (i - 1) * 0.02, 0, i)); };
    ash(1.12, -0.86);
    b.add('bakelite', hull([[-0.1, 0, -0.09], [0.1, 0, -0.09], [-0.1, 0, 0.09], [0.1, 0, 0.09], [-0.07, 0.08, -0.06], [0.07, 0.08, -0.06], [-0.08, 0.06, 0.07], [0.08, 0.06, 0.07]]), 0xc83a2a, at(1.55, TOP, -1.0, 0, 0.3));
    b.add('bakelite', cbox(0.24, 0.035, 0.05, 0.015), 0xc83a2a, at(1.55, TOP + 0.1, -1.0, 0, 0.3));
    for (let i = 0; i < 4; i++) b.add('paint', cbox(0.06, 0.3, 0.26, 0.01), [0x3a5a8a, 0x8a3a2a, 0x3a3a3a, 0x6a6a3a][i], at(1.9 + i * 0.065, TOP + 0.15, -1.12, 0, 0, i === 3 ? 0.25 : 0), { rep: 0.4 });
    const g = b.build(this.mats);
    const mug = this.mugModel(0xc8d0d8); mug.position.set(-1.12, TOP, -0.84); g.add(mug);
    const bulb = new THREE.Mesh(gem(0.026, 6, 0.03), this.bulbMat);
    bulb.position.copy(L).addScaledVector(this.v2.copy(this.lampTo).sub(L).normalize(), 0.03);
    g.add(bulb);
    return g;
  }

  private chairs(): THREE.Group {
    const g = new THREE.Group();
    const chair = (x: number, z: number, ry: number) => {
      const b = new FacetBuilder();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.add('metal', cbox(0.04, 0.03, 0.3, 0.008), C.dark, at(Math.sin(a) * 0.14, 0.06, Math.cos(a) * 0.14, 0, a));
        b.add('rubber', prism(0.022, 0.03, 6), 0x5a5a5a, at(Math.sin(a) * 0.28, 0.022, Math.cos(a) * 0.28, 0, 0, Math.PI / 2));
      }
      b.add('metal', prism(0.025, 0.36, 8), C.steel, at(0, 0.24, 0));
      b.add('leather', jitter(cbox(0.46, 0.08, 0.44, 0.03), 0.004, 3), 0x5a4a3a, at(0, 0.45, 0));
      b.add('metal', cbox(0.04, 0.34, 0.03, 0.008), C.dark, at(0, 0.6, 0.22, -0.1));
      b.add('leather', jitter(cbox(0.42, 0.42, 0.07, 0.03), 0.004, 5), 0x5a4a3a, at(0, 0.86, 0.25, -0.12));
      const m = b.build(this.mats);
      m.position.set(x, 0, z); m.rotation.y = ry;
      g.add(m);
    };
    chair(-0.34, -0.06, 0);
    chair(1.7, 0.4, 2.2);
    return g;
  }

  // ================================================================ the crew
  /** a gesture for a line (emotes, a sip of coffee, a lean, typing) */
  gesture(who: Who, g: Gesture) {
    const s = this.crew[who]; if (!s) return;
    switch (g) {
      case 'facepalm': case 'point': case 'shrug': case 'mock': case 'clap': s.rig.playEmote(g, false); break;
      case 'head': s.rig.playEmote('facepalm', false); break;
      case 'sip': if (who === 0) { s.act = 'drink'; s.actDur = 2.2; s.actUntil = this.t + 2.2; } else s.rig.playEmote('shrug', false); break;
      case 'lean': s.leanT = 2.6; break;
      case 'type': s.typing = true; break;
    }
  }
  setTyping(who: Who, on: boolean) { const s = this.crew[who]; if (s) s.typing = on; }
  /** everyone looks at a point (or back at the big tube with null); `except` keeps watching the tube */
  lookAt(p: THREE.Vector3 | null, except: Who | -1 = -1) {
    this.crew.forEach((s, i) => {
      if (i === except || !p) s.lookTo = new THREE.Vector3(SCREEN.x + (i - 1) * 0.1, SCREEN.y, SCREEN.z);
      else s.lookTo = p.clone();
    });
  }
  /** a speaker's head (world) */
  head(who: Who, out = new THREE.Vector3()) { return this.crew[who].rig.bones.head.getWorldPosition(out); }
  talking(who: Who, on: boolean) { const s = this.crew[who]; if (s) s.talk = on ? 1 : 0; }

  private updateCrew(dt: number) {
    for (const s of this.crew) {
      s.t += dt;
      s.look.lerp(s.lookTo, 1 - Math.exp(-dt * 5));
      s.leanT = Math.max(0, s.leanT - dt);
      s.lean += ((s.leanT > 0 ? 1 : 0) - s.lean) * (1 - Math.exp(-dt * 4));
      const act: ActionAnim = s.typing ? 'type' : this.t < s.actUntil ? s.act : '';
      s.rig.update(dt, {
        speed: 0, stance: 'stand', full: s.seated ? 'sit' : '', action: act, actionDur: act === 'type' ? 1 : s.actDur, fidget: true,
        wx: s.base.x, wy: 0, wz: s.base.z, wyaw: s.yaw, ground: () => 0,
        lookX: s.look.x, lookY: s.look.y, lookZ: s.look.z, lookW: s.lookW,
      } as any);
      const j = s.rig.j;
      if (s.lean > 0.01) { j.spine.rotation.x += 0.28 * s.lean; j.head.rotation.x -= 0.12 * s.lean; }
      if (s.talk > 0) { j.head.rotation.x += Math.sin(s.t * 13) * 0.035; j.head.rotation.z += Math.sin(s.t * 7.3) * 0.02; }
      // a slow sway so nobody is a statue
      if (!s.seated) s.rig.root.position.x = s.base.x + Math.sin(s.t * 0.4) * 0.012;
    }
  }

  // ================================================================ camera
  /** cut (secs 0) or move to a shot */
  shot(name: ShotName, secs = 0) {
    const aspect = this.lowW / Math.max(1, this.lowH) || 16 / 9;
    const now = this.currentShot();
    this.shotA = now;
    this.shotB = shotFor(name, aspect);
    this.shotName = name;
    this.blendDur = secs; this.blend = secs > 0 ? 0 : 1;
  }
  /** a close single on one of the crew, from the tube bank (portrait screens can't hold all three) */
  single(who: Who, secs = 0.45) {
    const h = this.head(who, new THREE.Vector3());
    this.shotA = this.currentShot();
    this.shotB = { pos: new THREE.Vector3(h.x * 0.4, 1.62, -1.18), look: h.clone().setY(h.y - 0.16), fov: 64 };
    this.shotName = 'reverse';
    this.blendDur = secs; this.blend = secs > 0 ? 0 : 1;
  }
  get shotNow() { return this.shotName; }
  /** the camera has arrived (no move in progress) */
  get settled() { return this.blend >= 1; }
  private currentShot(): Shot {
    const k = ease(Math.min(1, this.blend));
    return { pos: this.shotA.pos.clone().lerp(this.shotB.pos, k), look: this.shotA.look.clone().lerp(this.shotB.look, k), fov: this.shotA.fov + (this.shotB.fov - this.shotA.fov) * k };
  }
  bump(n = 0.6) { this.shake = Math.max(this.shake, n); }

  private updateCamera(dt: number) {
    if (this.blend < 1) this.blend = Math.min(1, this.blend + dt / Math.max(0.001, this.blendDur));
    const s = this.currentShot();
    const t = this.t, h = this.hand;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const nx = (Math.sin(t * 0.53) * 0.6 + Math.sin(t * 1.31 + 1) * 0.3) * 0.006 * h + (Math.random() - 0.5) * this.shake * 0.01;
    const ny = (Math.sin(t * 0.41 + 2) * 0.6 + Math.sin(t * 0.97) * 0.3) * 0.005 * h + (Math.random() - 0.5) * this.shake * 0.01;
    this.cam.position.set(s.pos.x + nx, s.pos.y + ny, s.pos.z);
    this.cam.lookAt(s.look.x + nx * 0.3, s.look.y + ny * 0.3, s.look.z);
    this.cam.rotateZ(Math.sin(t * 0.33) * 0.004 * h);
    this.cam.fov = s.fov;
    this.cam.aspect = this.lowW / Math.max(1, this.lowH);
    this.cam.updateProjectionMatrix();
  }

  /** CSS rect of the big tube's glass inside the host (for the report laid over it) */
  screenRect(): { x: number; y: number; w: number; h: number } {
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => this.v1.set(SCREEN.x + sx * SCREEN.w / 2, SCREEN.y + sy * SCREEN.h / 2, SCREEN.z + 0.01).project(this.cam).clone());
    return this.rectOf(pts);
  }
  /** CSS position of a world point inside the host */
  toCss(p: THREE.Vector3): { x: number; y: number; behind: boolean } {
    const v = this.v2.copy(p).project(this.cam);
    const r = this.canvas.getBoundingClientRect(), hr = this.host.getBoundingClientRect();
    return { x: r.left - hr.left + (v.x + 1) / 2 * r.width, y: r.top - hr.top + (1 - v.y) / 2 * r.height, behind: v.z > 1 };
  }
  private rectOf(pts: THREE.Vector3[]) {
    const r = this.canvas.getBoundingClientRect(), hr = this.host.getBoundingClientRect();
    const xs = pts.map((v) => r.left - hr.left + (v.x + 1) / 2 * r.width), ys = pts.map((v) => r.top - hr.top + (1 - v.y) / 2 * r.height);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  // ================================================================ frame
  private resize() {
    if (!this.renderer) return;
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const dw = w * dpr, dh = h * dpr;
    const low = this.mats.tile instanceof THREE.MeshLambertMaterial;
    const target = low ? 480 * 270 : 600 * 338;
    const S = Math.max(2, Math.round(Math.sqrt((dw * dh) / target)));
    const lw = Math.max(32, Math.ceil(dw / S)), lh = Math.max(32, Math.ceil(dh / S));
    const cw = (lw * S) / dpr, ch = (lh * S) / dpr;
    Object.assign(this.canvas.style, { width: cw + 'px', height: ch + 'px', left: Math.floor((w - cw) / 2) + 'px', top: Math.floor((h - ch) / 2) + 'px' });
    this.S = S;
    if (lw === this.lowW && lh === this.lowH) return;
    this.lowW = lw; this.lowH = lh;
    this.renderer.setSize(lw, lh, false);
    this.rt?.dispose();
    this.rt = new THREE.WebGLRenderTarget(lw, lh, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, depthTexture: new THREE.DepthTexture(lw, lh) });
    const u = this.post.u;
    u.tColor.value = this.rt.texture; u.tDepth.value = this.rt.depthTexture; u.uRes.value.set(lw, lh);
    u.uNear.value = this.cam.near; u.uFar.value = this.cam.far;
    // re-aim the current shot for the new shape
    this.shotB = shotFor(this.shotName, lw / lh);
    if (this.blend >= 1) this.shotA = this.shotB;
  }

  /** advance everything by dt and draw */
  frame(dt: number) {
    this.t += dt;
    this.feed.update(dt);
    for (const s of this.sides) s.update(dt);
    this.updateCrew(dt);
    // the tubes light the room: the big one follows its picture
    const fb = this.feed.tube.u;
    const flick = 0.92 + Math.sin(this.t * 61) * 0.03 + Math.random() * 0.05;
    this.crtBig.intensity = (3.8 + fb.uNoise.value * 2.4 - fb.uBlank.value * 1.2) * flick * fb.uPower.value + fb.uFlash.value * 8;
    this.crtBank.intensity = 3 * flick;
    const blink = Math.floor(this.t * 1.6) % 2 === 0;
    this.recMat.color.setRGB(blink ? 2 : 0.25, blink ? 0.3 : 0.04, blink ? 0.15 : 0.02);
    this.recL.intensity = blink ? 0.3 : 0.02;
    // the lamp hums and dips now and then
    const dip = Math.sin(this.t * 0.7) > 0.985 ? 0.4 : 1;
    this.lamp.intensity = 30 * dip * (0.97 + Math.random() * 0.03);
    const df = Math.sin(this.t * 0.31) > 0.97 ? (Math.random() < 0.5 ? 0.2 : 1) : 1;
    this.door.intensity = 4 * df; this.doorBulb.color.setRGB(2.4 * df, 2.0 * df, 1.4 * df);
    this.bulbMat.color.setRGB(2.2 * dip, 1.9 * dip, 1.3 * dip);
    this.shaft.u.uInt.value = 0.1 * dip;
    // coffee steam
    this.steamT -= dt;
    if (this.steamT <= 0) {
      this.steamT = 0.16;
      const hm = this.crew[0].rig.heldR.getWorldPosition(this.v1);
      for (const p of [this.steamAt[0], hm.clone().add(new THREE.Vector3(0, 0.1, 0))]) this.puffs.emit(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.03, 0, (Math.random() - 0.5) * 0.03)), new THREE.Vector3((Math.random() - 0.5) * 0.02, 0.05, 0), { life: 2.2, s0: 0.008, s1: 0.05, color: 0xb0b8a8, rise: 0.06 });
    }
    this.updateCamera(dt);
    this.puffs.update(dt, this.cam, (p) => 0.35 + Math.max(0, 1.2 - p.distanceTo(this.lampAt)) * 0.6 + Math.max(0, 1.4 - p.distanceTo(this.crtBig.position)) * 0.4);
    const dir = this.v1.copy(this.lampTo).sub(this.lampAt).normalize();
    this.dust.update(this.t, this.lampAt, dir, Math.cos(0.62), Math.cos(0.62 * 0.45), 0.9 * dip, new THREE.Color(0xffd8a0));
    this.render();
  }

  /** grade (set by the director: the room goes colder and darker on the report) */
  grade(o: { exposure?: number; vig?: number }) {
    const u = this.post.u;
    if (o.exposure !== undefined) u.uExposure.value = o.exposure;
    if (o.vig !== undefined) u.uVig.value = o.vig;
  }

  private render() {
    const r = this.renderer; if (!r || !this.rt) return;
    const u = this.post.u;
    u.uTime.value = this.t;
    u.uLift.value.set(0.84, 1.0, 1.08); u.uGain.value.set(1.1, 1.02, 0.86);
    u.uSat.value = 0.92; u.uContrast.value = 1.1; u.uSide.value.set(1, 0, 0, 0.4); u.uFloor.value = 0.25; u.uGrain.value = 0.014;
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
      r.setRenderTarget(null);
      r.render(this.post.scene, this.post.cam);
    } finally {
      U.uCutOn.value = saved.cut; U.uVisOn.value = saved.vis; U.uFogNear.value = saved.fn; U.uFogFar.value = saved.ff; U.uGridScale.value = saved.gs; U.uCollapse.value = saved.col; U.uSnapOn.value = saved.snap;
      SPOTU.tSpotShadow.value = ss.ts; SPOTU.tSunShadow.value = ss.tu; SPOTU.uSpotOn.value = ss.so; SPOTU.uSunOn.value = ss.su; SPOTU.uSpotShadowOn.value = ss.sh;
    }
  }

  dispose() {
    this.ro?.disconnect();
    for (const s of this.crew) s.rig.dispose();
    this.feed.dispose();
    for (const s of this.sides) s.dispose();
    for (const t of this.texs) t.dispose();
    this.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry) m.geometry.dispose(); });
    this.rt?.dispose();
    this.noShadow?.dispose();
    disposeFacetMats();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss?.();
    this.canvas.remove();
  }
}

// the tube bank's layout (rack local: x across, front faces +z)
const BIG = { w: 0.9, h: 0.74, d: 0.62, front: -1.33 };
const MEDIUM = [-1, 1].map((k) => {
  const w = 0.62, h = 0.52, sw = 0.4, sh = 0.3, sy = 0.29, ry = -k * 0.2;
  const at: V3 = [k * 0.98, 1.02, -1.42];
  const screen: V3 = [at[0] + Math.sin(ry) * 0.012, at[1] + sy, at[2] + Math.cos(ry) * 0.012];
  return { w, h, d: 0.5, sw, sh, sy, ry, at, screen };
});
const SMALL = [-1.29, -0.43, 0.43, 1.29].map((x, i) => {
  const w = 0.54, h = 0.44, sw = 0.34, sh = 0.26, sy = 0.24, ry = -x * 0.12, rx = 0.16;
  const at: V3 = [x, 1.84, -1.52];
  // the glass centre, through the tilt (rx about the housing's foot) and the turn
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, 0, 'YXZ')).setPosition(at[0], at[1], at[2]);
  const p = new THREE.Vector3(0, sy, 0.012).applyMatrix4(m);
  return { w, h, d: 0.46, sw, sh, sy, ry, rx, at, i, screen: [p.x, p.y, p.z] as V3 };
});
