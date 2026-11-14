// THE MONITOR ROOM: the main menu. A dim Meridian observation booth: a steel
// rack of chunky enamel CRTs (three big feeds: the codex archive, the control
// room and unit room 4; four small sets with the unit's pulse, the corridor camera, the log printer and the seismograph), an
// annunciator strip, a raked desk console with toggle rows and pilot lamps, a
// gooseneck microphone, a coffee mug breathing steam, an ashtray, clipboards
// and notes, a banker's lamp, a push-button phone, the swivel chair, cable
// runs, a fluorescent fixture that stutters, and a wired-glass window onto the
// dark. Green phosphor is the key light; the lamp makes a warm pool on the
// desk; everything else is shadow. The lab kit adds the institute clock (it
// chimes), a vent (its fan spins up) and an extinguisher; the phone rings, and
// every desk thing puts up a note on an in-scene plate when pressed (rooms/pokes.ts).
//
// The 2D menu (title.ts) floats over the dark half; the two feed tubes are
// hot props (and have DOM twins for keyboard / gamepad / touch). dive(key)
// flies the camera into a tube; back(key) pulls out of it.
import * as THREE from 'three';
import type { FMats } from '../scene/pixtex';
import { Puffs, Dust, shaftMesh } from '../scene/fx';
import type { Hot, StageRoom, Grade } from './stage';
import { feedTube, drawCaption, type FeedTube } from './feed';
import {
  FacetBuilder, at, cbox, prism, lathe, extrude, gem, bolt, hull, tube, C, crtSet, Toggle, LedBank, blink, busy, flicker, plate, paper, slab, glowCard, Wobble,
  uiSound, gameSound, type CrtSpot,
} from './props';
import { bitText } from '../../../gfx/bitfont';
import { crestTex, pageTex } from '../rooms/vaultTex';
import { Pokes, type PokeNote } from '../rooms/pokes';
import { Dresser } from '../rooms/dress';
import { eyeJar, type EyeJar } from './eyeJar';

// internal keys: 'research' is the control room (it grew out of the research lab), 'subject' the unit room
// (saved decorations are filed under these keys, so they stay)
export type FeedKey = 'archive' | 'research' | 'subject';
export const FEEDS: { key: FeedKey; cam: string; name: string; label: string; sub: string }[] = [
  { key: 'archive', cam: 'CAM 1', name: 'CODEX ARCHIVE A-1', label: 'Codex archive', sub: 'inhabitants, items, places, anomalies · pull a file, project it' },
  { key: 'research', cam: 'CAM 2', name: 'CONTROL ROOM C-1', label: 'Control room', sub: 'the main computer: the research tree · the sample benches' },
  { key: 'subject', cam: 'CAM 3', name: 'UNIT ROOM 4', label: 'Unit room', sub: 'chair No. 4 · the unit on file · fit chips, limbs, designs' },
];

const W = 2.7, BACK = -2.12, FRONT = 2.8, H = 2.75;
/** what the booth's desk things say when pressed (rooms/pokes.ts plates) */
const BOOTH: Record<'mic' | 'mug' | 'board' | 'phone' | 'chair' | 'window', PokeNote[]> = {
  mic: [{ head: 'Intercom · all cells', lines: ['Key down to talk. The cells hear you through the walls.', 'Some of them answer. Log every answer.'], tone: 'memo' }],
  mug: [{ head: 'Mug', lines: ['WORLD\'S OKAYEST OPERATOR.', 'Coffee still warm. Nobody has been at this desk for six hours.'], tone: 'memo' }],
  board: [
    { head: 'Intake sheet · unit room 4', lines: ['Unit on file: debtor, consenting (see signature).', 'Debt: outstanding. Next of kin: none listed.'], stamp: 'RM 4', tone: 'memo' },
    { head: 'Intake sheet · remarks', lines: ['Unit asked where the others went.', 'Told it: through the wall. Told it: they are paying it off.'], tone: 'red' },
  ],
  phone: [
    { head: 'Line 1 · the floor above', lines: ['Nobody on the line. Breathing, then the dial tone.', 'There is no floor above the monitor room.'], stamp: 'LOGGED', tone: 'red' },
    { head: 'Line 1 · Dr. Calder', lines: ['"Stop calling the board. They do not have phones down there."'], tone: 'lore' },
  ],
  chair: [{ head: 'Chair', lines: ['Still warm. The seat remembers whoever sat in it last.', 'Swivel squeaks at 3 rotations. Do not do more than 3.'], tone: 'memo' }],
  window: [
    { head: 'Window', lines: ['There is nothing out there.', 'There is nothing out there, and it is closer than it was.'], tone: 'red' },
    { head: 'Facilities', lines: ['Wired glass, 12 mm. Rated for: knocking from this side only.'], tone: 'memo' },
  ],
};
const DESK_Y = 0.76, DESK_Z0 = -1.46, DESK_Z1 = -0.6;
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
const easeIn = (t: number) => t * t * t;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

interface FeedSet { key: FeedKey; tube: FeedTube; spot: CrtSpot; light: THREE.PointLight; housing: THREE.Object3D; lamp: ReturnType<LedBank['add']> }
interface Aux { tube: FeedTube; cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; draw: (t: number) => void; acc: number }

export class MonitorRoom implements StageRoom {
  id = 'monitor';
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(48, 16 / 9, 0.05, 30);
  hots: Hot[] = [];
  // bright and punchy: saturated phosphor green and lamp amber, lifted shadows, a light vignette, barely any menu-side dimming
  grade: Grade = { exposure: 2.0, lift: [0.94, 1.0, 1.02], gain: [1.04, 1.02, 0.96], vig: 0.35, sat: 1.06, contrast: 1.06, side: [1, 0, 0.08, 0.42], ao: 0.8, scatter: 0.4, bounce: 0.22, shafts: [new THREE.Vector3(0.2, H - 0.2, -0.1), new THREE.Vector3()], shaftK: 0.5, shaftColor: 0xe0ecff };
  /** the decorator's group (collectibles) */
  deco = new THREE.Group();
  floor = { minX: -W + 0.3, maxX: W - 0.3, minZ: DESK_Z1 + 0.25, maxZ: 1.2, y: 0 };
  surfaces = [
    { minX: -1.8, maxX: 1.8, minZ: -0.92, maxZ: DESK_Z1 + 0.04, y: DESK_Y + 0.025 },
    { minX: -1.7, maxX: 1.7, minZ: -1.98, maxZ: -1.72, y: 2.47 },
    { minX: W - 0.62, maxX: W - 0.08, minZ: 1.0, maxZ: 1.5, y: 1.06 },
  ];
  guideSpot = { pos: new THREE.Vector3(1.7, 0, 0.3), look: new THREE.Vector3(0.4, 1.6, 1.9) };
  feeds: FeedSet[] = [];
  /** the props that answer a press (rooms/pokes.ts): notes on the desk things, the clock, the vent */
  private pokes = new Pokes(this.hots);
  private dress: Dresser | null = null;
  /** a feed tube was pressed */
  onFeed?: (k: FeedKey) => void;
  /** the intercom microphone was keyed */
  onMic?: () => void;
  /** framing: content offset in normalised screen units (the menu's side stays dark) */
  frX = 0; frY = 0;
  private frXT = 0.22; private frYT = 0;
  private portrait = false;
  private mats: FMats;
  private leds = new LedBank(160);
  private aux: Aux[] = [];
  private toggles: { t: Toggle; fn?: (on: boolean) => void }[] = [];
  private puffs = new Puffs(40);
  private smoke = new Puffs(24);
  private hemi = new THREE.HemisphereLight(0xb4c8dc, 0x3a2a18, 0.85);
  private lamp = new THREE.SpotLight(0xffc488, 0, 3.4, 0.82, 0.55, 2);
  private lampOn = true; private lampLvl = 1;
  private lampBulb: THREE.MeshBasicMaterial;
  private tubeLight = new THREE.PointLight(0xdaeaff, 0, 7, 2);
  private tubeMat = new THREE.MeshBasicMaterial({ color: 0x101010, toneMapped: false });
  private tubeK = 1; private tubeNext = 2; private tubeDrop = 0;
  /** the tube's cone of haze and the dust turning in it; the lamp's warm cone over the desk */
  private tubeShaft = shaftMesh(10); private lampShaft = shaftMesh(9);
  private dust = new Dust(160, new THREE.Box3(new THREE.Vector3(-W + 0.4, 0.4, BACK + 0.4), new THREE.Vector3(W - 0.4, H - 0.2, 1.6)));
  // every stage room carries the same light rig (1 hemi, 4 point, 3 spot with one shadow) so they share shader programs
  private alarm = new THREE.SpotLight(0xff3a1a, 0, 6, 0.9, 0.6, 1.6);
  private alarmT = 0;
  private winLight = new THREE.SpotLight(0x5a74b0, 1.6, 6, 0.5, 0.8, 1.6);
  private winShape: THREE.Mesh; private winT = -1; private winNext = 25;
  private micLed!: ReturnType<LedBank['add']>; private micT = 0;
  private jar: EyeJar | null = null;
  private mug = new THREE.Group(); private mugW = new Wobble(260, 7); private mugSteam = 0;
  private chair = new THREE.Group(); private chairV = 0; private chairA = 0.34;
  private board = new THREE.Group(); private boardW = new Wobble(140, 4);
  private phone = new THREE.Group(); private phoneW = new Wobble(400, 10); private ringT = 0;
  private cig = new THREE.Vector3();
  // camera
  private home = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 48 };
  private camPos = new THREE.Vector3(); private camLook = new THREE.Vector3(); private camFov = 48;
  private ptr = new THREE.Vector2(); private ptrS = new THREE.Vector2();
  private lean: FeedSet | null = null;
  private build = false;
  private buildPose = { pos: new THREE.Vector3(0.35, 2.45, 2.35), look: new THREE.Vector3(0.05, 0.35, -0.55), fov: 62 };
  private flight: { from: { pos: THREE.Vector3; look: THREE.Vector3; fov: number }; to: { pos: THREE.Vector3; look: THREE.Vector3; fov: number }; t: number; dur: number; ease: (k: number) => number; res: () => void; fr: number } | null = null;
  private capT = 0; private blinkOn = false;
  private v = new THREE.Vector3();

  constructor(mats: FMats) {
    this.mats = mats;
    const S = this.scene;
    S.background = new THREE.Color(0x000000);
    S.add(this.shell(), this.rack(), this.desk(), this.leds.mesh, this.puffs.mesh, this.smoke.mesh, this.deco, this.pokes.group);
    // the booth's own wall furniture from the lab kit: the institute clock (it chimes), a return-air vent (its fan spins up)
    {
      const d = this.dress = new Dresser(mats);
      d.pokes = this.pokes;
      d.clock(at(2.06, 2.2, BACK + 0.01), 0.13);
      d.vent(at(-2.06, 2.28, BACK + 0.01), 0.36, 0.24);
      d.extinguisher(at(-2.12, 1.02, BACK + 0.01));
      S.add(d.done());
    }
    this.deco.name = 'deco';
    // lights: phosphor key, the lamp's pool, a cold stutter overhead, the window's dark blue
    S.add(this.hemi, this.alarm, this.alarm.target, this.tubeLight);
    this.tubeLight.position.set(0.2, H - 0.3, -0.1);
    this.tubeShaft.mesh.position.set(0.2, H - 0.14, -0.1); this.tubeShaft.mesh.scale.set(1.2, H - 0.2, 0.7); this.tubeShaft.u.uColor.value.setHex(0xd8e8ff);
    this.lampShaft.u.uColor.value.setHex(0xffc488);
    S.add(this.tubeShaft.mesh, this.dust.points);
    // a wet patch on the lino under the window, holding the window's blue and the tube
    const wet = new THREE.Mesh(new THREE.CircleGeometry(0.5, 9), new THREE.MeshStandardMaterial({ color: 0x0a0c0c, roughness: 0.04, metalness: 0.65, transparent: true, opacity: 0.55, depthWrite: false }));
    wet.rotation.x = -Math.PI / 2; wet.scale.set(1.4, 0.9, 1); wet.position.set(-1.6, 0.006, 0.4); wet.renderOrder = 2; wet.userData.noGlow = true; S.add(wet);
    this.alarm.position.set(1.85, 2.5, -1.6); this.alarm.target.position.set(0.2, 0.6, 0.2);
    this.lamp.castShadow = true;
    this.lamp.shadow.mapSize.set(1024, 1024);
    this.lamp.shadow.camera.near = 0.05; this.lamp.shadow.camera.far = 3.5;
    this.lamp.shadow.bias = -0.0008; this.lamp.shadow.normalBias = 0.01;
    this.winLight.position.set(-W + 0.05, 1.7, -0.35);
    this.winLight.target.position.set(0.2, 0.4, -0.5);
    S.add(this.winLight, this.winLight.target);
    // the shape that sometimes stands in the window
    const sg = new FacetBuilder();
    sg.add('rubber', hull([[-0.16, 0, -0.08], [0.16, 0, -0.08], [-0.2, 0.9, -0.06], [0.2, 0.9, -0.06], [-0.1, 1.15, -0.04], [0.1, 1.15, -0.04], [0, 1.32, 0], [0.12, 1.25, 0.04], [-0.12, 1.25, 0.04]]), 0x050505);
    const sm = sg.build(mats, { cast: false });
    this.winShape = sm.children[0] as THREE.Mesh;
    this.winShape.rotation.y = Math.PI / 2;
    this.winShape.position.set(-W - 1.2, 0.35, -0.35);
    this.winShape.visible = false;
    S.add(this.winShape);
    this.lampBulb = new THREE.MeshBasicMaterial({ color: 0xffd8a0, toneMapped: false });
    this.buildLamp();
    this.buildProps();
    this.setFraming(16 / 9, false);
    this.camPos.copy(this.home.pos); this.camLook.copy(this.home.look); this.camFov = this.home.fov;
  }

  // ================================================================== the shell
  private shell(): THREE.Group {
    const b = new FacetBuilder();
    const WALL = 0x7c8668, LOWER = 0x55604a, CONC = 0x9a968c;
    // floor: worn linoleum tiles; ceiling: acoustic tile grid
    slab(b, 'floor', -W, W, -0.1, 0, BACK - 0.2, FRONT, 0x8a8e7e);
    slab(b, 'concrete', -W, W, H, H + 0.12, BACK - 0.2, FRONT, 0x4a4a46);
    for (let x = -W + 0.6; x < W; x += 0.6) b.add('metal', cbox(0.025, 0.02, FRONT - BACK, 0.004), C.darker, at(x, H - 0.01, (FRONT + BACK) / 2));
    for (let z = BACK + 0.6; z < FRONT; z += 0.6) b.add('metal', cbox(W * 2, 0.02, 0.025, 0.004), C.darker, at(0, H - 0.01, z));
    // walls: painted block, a darker dado, skirting
    const wall = (x0: number, x1: number, z0: number, z1: number) => {
      slab(b, 'paint', x0, x1, 0, 1.05, z0, z1, LOWER, 0.004, 0.5);
      slab(b, 'concrete', x0, x1, 1.05, H, z0, z1, CONC);
    };
    wall(-W, W, BACK - 0.2, BACK);
    wall(-W - 0.2, -W, BACK, -1.15); wall(-W - 0.2, -W, 0.45, FRONT);
    slab(b, 'paint', -W - 0.2, -W, 0, 0.95, -1.15, 0.45, LOWER, 0.004, 0.5);
    slab(b, 'concrete', -W - 0.2, -W, 1.95, H, -1.15, 0.45, CONC);
    wall(W, W + 0.2, BACK, -0.1); wall(W, W + 0.2, 1.0, FRONT);
    slab(b, 'concrete', W, W + 0.2, 2.15, H, -0.1, 1.0, CONC);
    wall(-W, W, FRONT, FRONT + 0.2);
    // the dado rail and skirting all round
    const rail = (x0: number, x1: number, z0: number, z1: number) => { slab(b, 'paint', x0, x1, 1.03, 1.08, z0, z1, 0x3a4232, 0.008); slab(b, 'rubber', x0, x1, 0, 0.09, z0, z1, 0x2a2a2a, 0.006); };
    rail(-W, W, BACK, BACK + 0.03);
    rail(-W, -W + 0.03, BACK, -1.15); rail(-W, -W + 0.03, 0.45, FRONT);
    rail(W - 0.03, W, BACK, -0.1); rail(W - 0.03, W, 1.0, FRONT);
    // the window to the dark (left): a heavy steel frame, wired glass, a sill
    const wz = -0.35, ww = 1.6, wy = 1.45, wh = 1.0;
    b.add('paint', extrude([[-ww / 2 - 0.08, -wh / 2 - 0.08], [ww / 2 + 0.08, -wh / 2 - 0.08], [ww / 2 + 0.08, wh / 2 + 0.08], [-ww / 2 - 0.08, wh / 2 + 0.08]], 0.24, 0.012,
      [[[-ww / 2, -wh / 2], [ww / 2, -wh / 2], [ww / 2, wh / 2], [-ww / 2, wh / 2]]]), 0x3e4636, at(-W - 0.08, wy, wz, 0, Math.PI / 2));
    b.add('paint', cbox(0.2, 0.04, ww + 0.2, 0.01), 0x4a5240, at(-W + 0.06, wy - wh / 2 - 0.1, wz));
    b.add('metal', cbox(0.03, wh, 0.04, 0.008), C.darker, at(-W - 0.08, wy, wz));
    for (let i = 0; i < 10; i++) b.add('metal', bolt(0.008, 0.006), C.steel, at(-W + 0.045, wy - wh / 2 - 0.04 + (i % 2) * (wh + 0.08), wz - ww / 2 + 0.1 + Math.floor(i / 2) * (ww - 0.2) / 4, 0, 0, -Math.PI / 2));
    // beyond the window: a black void with a far corridor lamp
    slab(b, 'concrete', -W - 4.2, -W - 0.2, -0.2, 3.2, -2.5, 1.8, 0x141414);
    b.add('rubber', cbox(0.3, 0.06, 0.06, 0.01), 0x101010, at(-W - 3.2, 2.2, -1.6));
    // the door (right): steel, a small wired window, a red IN USE lamp
    b.add('paint', cbox(0.08, 2.1, 1.0, 0.012), 0x4e5a52, at(W + 0.04, 1.05, 0.45));
    b.add('paint', extrude([[-0.58, 0], [0.58, 0], [0.58, 2.22], [-0.58, 2.22]], 0.16, 0.01, [[[-0.5, 0], [0.5, 0], [0.5, 2.12], [-0.5, 2.12]]]), 0x2e3630, at(W - 0.02, 0, 0.45, 0, -Math.PI / 2));
    b.add('rubber', cbox(0.02, 0.32, 0.24, 0.004), 0x0c0c0c, at(W - 0.01, 1.58, 0.45));
    b.add('chrome', cbox(0.06, 0.04, 0.2, 0.01), 0xffffff, at(W - 0.04, 1.02, 0.12));
    for (const y of [0.3, 1.8]) b.add('metal', cbox(0.03, 0.18, 0.05, 0.01), C.darker, at(W - 0.01, y, 0.93));
    // conduit and cable trays overhead, a duct
    b.add('metal', cbox(W * 2, 0.06, 0.32, 0.008), C.dark, at(0, H - 0.22, BACK + 0.4));
    for (let x = -W + 0.3; x < W; x += 0.5) b.add('metal', cbox(0.02, 0.2, 0.02, 0.004), C.darker, at(x, H - 0.1, BACK + 0.4));
    b.add('metal', cbox(0.6, 0.36, FRONT - BACK, 0.02), 0x5a5e5a, at(1.6, H - 0.2, (FRONT + BACK) / 2), { rep: 0.6 });
    for (let z = BACK + 0.3; z < FRONT; z += 0.9) b.add('metal', cbox(0.64, 0.4, 0.03, 0.006), 0x4a4e4a, at(1.6, H - 0.2, z));
    for (let i = 0; i < 5; i++) {
      const x = -1.3 + i * 0.45, sag = 0.06 + (i % 3) * 0.04;
      b.add('rubber', tube([[x, H - 0.2, BACK + 0.42], [x + 0.05, H - 0.32 - sag, BACK + 0.3], [x + 0.08, H - 0.28, BACK + 0.15], [x + 0.1, 2.5, BACK + 0.14]], 0.012 + (i % 2) * 0.004, 8, 4), [0x2a2a2a, 0x3a2a22, 0x1e2a22][i % 3]);
    }
    // floor cable run from the rack round the desk, under a rubber ramp
    b.add('rubber', tube([[-1.9, 0.02, BACK + 0.3], [-2.2, 0.02, -1.2], [-2.3, 0.02, 0.2], [-2.0, 0.02, 1.4]], 0.018, 12, 4), 0x222222);
    b.add('rubber', tube([[-1.85, 0.02, BACK + 0.32], [-2.15, 0.025, -1.2], [-2.25, 0.025, 0.2], [-1.9, 0.025, 1.4]], 0.014, 12, 4), 0x2e241c);
    b.add('rubber', hull([[-2.5, 0, 0.6], [-1.8, 0, 0.6], [-2.5, 0, 0.9], [-1.8, 0, 0.9], [-2.45, 0.035, 0.68], [-1.85, 0.035, 0.68], [-2.45, 0.035, 0.82], [-1.85, 0.035, 0.82]]), 0x1e1e1e);
    // a pin board (right wall) with the shift notes; a filing cabinet under it; a fire extinguisher
    b.add('sponge', cbox(0.03, 0.62, 0.9, 0.008), 0xa07a50, at(W - 0.02, 1.62, -1.25));
    b.add('wood', cbox(0.04, 0.66, 0.94, 0.008), 0x6a5038, at(W - 0.035, 1.62, -1.25));
    b.add('paint', cbox(0.5, 1.02, 0.46, 0.015), 0x6e7660, at(W - 0.3, 0.51, 1.25));
    for (let i = 0; i < 3; i++) { b.add('paint', cbox(0.02, 0.28, 0.4, 0.006), 0x7a826a, at(W - 0.56, 0.2 + i * 0.32, 1.25)); b.add('chrome', cbox(0.03, 0.02, 0.12, 0.004), 0xffffff, at(W - 0.58, 0.28 + i * 0.32, 1.25)); }
    b.add('paint', lathe([[0, 0], [0.075, 0], [0.08, 0.04], [0.08, 0.46], [0.06, 0.52], [0.02, 0.56], [0, 0.56]], 7), 0xb82a1e, at(W - 0.14, 0.12, 1.75));
    b.add('metal', cbox(0.04, 0.12, 0.06, 0.01), C.darker, at(W - 0.14, 0.72, 1.75));
    b.add('rubber', tube([[W - 0.12, 0.66, 1.78], [W - 0.08, 0.5, 1.84], [W - 0.1, 0.3, 1.82]], 0.008, 6, 4), 0x1a1a1a);
    const g = b.build(this.mats);
    // pinned notes, the shift rota, a photo of the subject
    const notes: [string[], number, number, number, number, number, string?][] = [
      [['ROTA', '~', '~', '~', '~'], 0.2, 0.26, 1.72, -1.45, 0.04],
      [['~', '~', '~'], 0.14, 0.1, 1.5, -1.1, -0.08, '#d8c860'],
      [['FEED', 'RB-17', 'NEVER'], 0.14, 0.14, 1.78, -1.05, 0.06, '#d8c860'],
      [['~', '~', '~', '~', '~', '~'], 0.18, 0.24, 1.48, -1.5, -0.03],
      [['~', '~'], 0.12, 0.1, 1.82, -0.86, 0.1, '#c8a8d0'],
    ];
    for (const [lines, w, h, y, z, rz, bg] of notes) {
      const p = paper(lines, w, h, { bg: bg ?? '#e6dfca', seed: Math.round(z * 100), ppm: bg ? 360 : 300, rule: !bg });
      p.position.set(W - 0.045, y, z); p.rotation.set(0, -Math.PI / 2, rz);
      g.add(p);
    }
    // the plate over the door
    const sign = plate(this.mats, ['OBSERVATION'], 0.5, 0.11, { bg: 0xc8b890 });
    sign.position.set(W - 0.012, 2.3, 0.45); sign.rotation.y = -Math.PI / 2;
    g.add(sign);
    // the Institute's seal over the pin board, in a brass rim; a classified file pinned among the notes (rooms/vaultTex.ts)
    const sb = new FacetBuilder();
    sb.add('brass', lathe([[0, 0], [0.18, 0], [0.185, 0.012], [0.17, 0.022], [0, 0.02]], 20), 0xc8a060, at(W - 0.005, 2.24, -1.25, 0, 0, Math.PI / 2));
    g.add(sb.build(this.mats, { cast: false }));
    const sealTex = crestTex(96, '#e8c878', '#2a3a4c');
    const seal = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.33), new THREE.MeshStandardMaterial({ map: sealTex, transparent: true, alphaTest: 0.35, roughness: 0.5, metalness: 0.3 }));
    seal.position.set(W - 0.03, 2.24, -1.25); seal.rotation.y = -Math.PI / 2; g.add(seal);
    const fileTex = pageTex(71, { photo: true, rank: 'wrath', stamp: 'EYES ONLY' });
    const file = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.225), new THREE.MeshStandardMaterial({ map: fileTex, roughness: 0.9 }));
    file.position.set(W - 0.048, 1.6, -1.64); file.rotation.set(0, -Math.PI / 2, 0.05); file.receiveShadow = true; g.add(file);
    // the IN USE lamp
    this.leds.add([W - 0.03, 2.48, 0.45], 0xff3020, { size: 0.03, level: 1, facing: new THREE.Euler(0, -Math.PI / 2, 0) });
    this.leds.add([-W - 3.2, 2.17, -1.6], 0xd8c8a0, { size: 0.05, pattern: flicker(3) });
    // the fluorescent fixture: an enamel pan and a tube that stutters
    const fb = new FacetBuilder();
    fb.add('enamel', hull([[-0.7, 0, -0.12], [0.7, 0, -0.12], [-0.7, 0, 0.12], [0.7, 0, 0.12], [-0.72, -0.08, -0.16], [0.72, -0.08, -0.16], [-0.72, -0.08, 0.16], [0.72, -0.08, 0.16]]), 0xb8b4a0);
    fb.add('metal', cbox(1.36, 0.012, 0.012, 0.003), C.dark, at(0, -0.13, 0));
    const fix = fb.build(this.mats, { cast: false });
    fix.position.set(0.2, H - 0.02, -0.1);
    g.add(fix);
    const tg = prism(0.018, 1.3, 6); tg.rotateZ(Math.PI / 2);
    const tubeM = new THREE.Mesh(tg, this.tubeMat);
    tubeM.position.set(0.2, H - 0.12, -0.1);
    g.add(tubeM);
    // a cool spill on the floor from the window, a green wash under the rack
    const pool = glowCard(1.4, 2.2, 0x3a5a9a, 0.12); pool.rotation.x = -Math.PI / 2; pool.position.set(-W + 0.8, 0.005, -0.35); g.add(pool);
    const wash = glowCard(4.2, 1.4, 0x3aff6a, 0.07); wash.rotation.x = -Math.PI / 2; wash.position.set(0, 0.006, BACK + 0.9); g.add(wash);
    return g;
  }

  // ================================================================== the monitor bank
  private rack(): THREE.Group {
    const b = new FacetBuilder();
    const g = new THREE.Group();
    const RZ = BACK + 0.04, RW = 1.85;
    // the frame: angle-iron uprights, shelves, a back panel with vents
    for (const x of [-RW, -0.6, 0.6, RW]) {
      b.add('metal', cbox(0.05, 2.5, 0.05, 0.008), C.dark, at(x, 1.25, RZ + 0.5));
      b.add('metal', cbox(0.05, 2.5, 0.05, 0.008), C.dark, at(x, 1.25, RZ + 0.04));
    }
    for (const y of [0.83, 1.5, 2.06, 2.45]) {
      b.add('metal', cbox(RW * 2 + 0.06, 0.035, 0.54, 0.008), C.steel, at(0, y, RZ + 0.27), { rep: 0.5 });
      b.add('hazard', cbox(RW * 2 + 0.06, 0.012, 0.012, 0.003), 0xffffff, at(0, y - 0.005, RZ + 0.545), { rep: 0.2 });
      for (let x = -RW + 0.2; x < RW; x += 0.6) b.add('metal', bolt(0.008, 0.006), C.darker, at(x, y + 0.018, RZ + 0.5));
    }
    b.add('metal', cbox(RW * 2, 2.4, 0.02, 0.006), 0x2a2e2c, at(0, 1.25, RZ - 0.01));
    // the base cabinet: louvres and a dial plate, cables pouring out
    b.add('paint', cbox(RW * 2, 0.8, 0.5, 0.015), 0x4e5644, at(0, 0.41, RZ + 0.25), { rep: 0.5 });
    for (let i = 0; i < 6; i++) for (const x of [-1.2, 0, 1.2]) b.add('metal', cbox(0.5, 0.012, 0.02, 0.003), C.darker, at(x, 0.2 + i * 0.07, RZ + 0.51));
    // the three feed sets (bottom row), four small sets (top row)
    const big: [FeedKey, number][] = [['archive', -1.22], ['research', 0], ['subject', 1.22]];
    const spots: [FeedKey, CrtSpot][] = big.map(([k, x], i) => [k, crtSet(b, x, 1.17, RZ + 0.5, 0.84, 0.62, { color: [0xc4bc9e, C.beige, 0xbab49a][i], depth: 0.48, seed: i + 3 })]);
    const small = [-1.38, -0.46, 0.46, 1.38].map((x, i) => crtSet(b, x, 1.78, RZ + 0.47, 0.62, 0.48, { color: [0x8a9070, C.beige, 0x9a9a84, C.cream][i], depth: 0.4, knobs: i % 2 === 0, seed: i + 9 }));
    // the annunciator strip on top: lit tiles with the room names
    b.add('paint', cbox(RW * 2 - 0.1, 0.3, 0.3, 0.02), 0x3a4232, at(0, 2.27, RZ + 0.35));
    const housing = b.build(this.mats);
    g.add(housing);
    // tubes
    for (const [key, spot] of spots) {
      const tb = feedTube(spot.sw, spot.sh, 160, 120);
      tb.mesh.applyMatrix4(spot.m);
      g.add(tb.mesh);
      const light = new THREE.PointLight(0x7aff8a, 0.22, 2.4, 2);
      light.position.copy(spot.center).add(new THREE.Vector3(0, -0.05, 0.55));
      g.add(light);
      const f = FEEDS.find((q) => q.key === key)!;
      const lab = plate(this.mats, [`${f.cam} · ${f.name}`], 0.5, 0.06, { bg: 0xb8b090, px: 520 });
      lab.position.set(spot.center.x - 0.05, 0.93, RZ + 0.53);
      g.add(lab);
      const lamp = this.leds.add([spot.center.x + 0.28, 0.93, RZ + 0.535], 0x40ff60, { size: 0.012, level: 0.2 });
      this.feeds.push({ key, tube: tb, spot, light, housing, lamp });
      drawCaption(tb, f.cam, f.name, true);
    }
    // aux sets: pulse, corridor, log printer, seismograph
    small.forEach((spot, i) => {
      const tb = feedTube(spot.sw, spot.sh, 96, 72, [0x9dff9a, 0xa8ffb0, 0xffc070, 0x9dff9a][i]);
      tb.mesh.applyMatrix4(spot.m);
      g.add(tb.mesh);
      const cv = document.createElement('canvas'); cv.width = 96; cv.height = 72;
      const ctx = cv.getContext('2d')!;
      const tex = new THREE.CanvasTexture(cv);
      tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
      tb.setFeed(tex, false);
      tb.mat.uniforms.uGain.value = 1.6;
      const aux: Aux = { tube: tb, cv, ctx, tex, acc: Math.random(), draw: [this.drawPulse, this.drawCorridor, this.drawLog, this.drawSeismo][i].bind(this, ctx) };
      this.aux.push(aux);
    });
    // annunciator tiles
    const tiles = ['A-1', 'C-1', 'UNIT 4', 'PRESS', 'POWER', 'ALARM'];
    tiles.forEach((tx, i) => {
      const t = plate(this.mats, [tx], 0.3, 0.12, { bg: [0x8ac070, 0x8ac070, 0x8ac070, 0xd0a040, 0x8ac070, 0xd04030][i], ink: 0x0a1008, px: 300, emissive: true });
      t.position.set(-1.5 + i * 0.6, 2.27, RZ + 0.505);
      g.add(t);
      const m = t.children[1] as THREE.Mesh;
      (m.material as THREE.MeshBasicMaterial).color.setScalar(i === 5 ? 0.12 : 0.5);
      m.userData.tile = i;
    });
    // sticky notes on the bezels
    const sticky: [string[], number, number, number][] = [[['DONT', 'TAP'], -0.82, 1.37, 0.12], [['~', '~'], 0.36, 1.42, -0.1], [['CH 3', 'LAG'], 1.57, 1.0, 0.05]];
    for (const [lines, x, y, rz] of sticky) { const p = paper(lines, 0.09, 0.09, { bg: '#d8c860', seed: Math.round(x * 50) + 3, ppm: 520 }); p.position.set(x, y, RZ + 0.535); p.rotation.z = rz; g.add(p); }
    // rack-top clutter: a dead set, a box of tapes
    const cb = new FacetBuilder();
    for (let i = 0; i < 6; i++) cb.add('bakelite', cbox(0.18, 0.11, 0.03, 0.006), 0xffffff, at(-1.0 + i * 0.035, 2.53, RZ + 0.3, 0, 0.02 * i));
    cb.add('paint', cbox(0.42, 0.14, 0.3, 0.015), 0x8a6a4a, at(1.2, 2.54, RZ + 0.25, 0, 0.1));
    g.add(cb.build(this.mats));
    return g;
  }

  // ================================================================== the desk console
  private desk(): THREE.Group {
    const b = new FacetBuilder();
    const g = new THREE.Group();
    const X0 = -1.95, X1 = 1.95, top = DESK_Y;
    // the steel desk: a linoleum top with a rubber nosing, pedestals with drawers, a modesty panel
    b.add('paint', cbox(X1 - X0, 0.04, DESK_Z1 - DESK_Z0, 0.01), 0x8a8a7c, at(0, top - 0.02, (DESK_Z0 + DESK_Z1) / 2), { rep: 0.8 });
    b.add('rubber', cbox(X1 - X0 + 0.02, 0.05, 0.03, 0.01), 0x262626, at(0, top - 0.02, DESK_Z1 + 0.005));
    for (const x of [X0 + 0.25, X1 - 0.25]) {
      b.add('paint', cbox(0.48, top - 0.06, 0.78, 0.012), 0x7a786c, at(x, (top - 0.04) / 2, (DESK_Z0 + DESK_Z1) / 2), { rep: 0.5 });
      for (let i = 0; i < 3; i++) {
        b.add('paint', cbox(0.44, 0.2, 0.02, 0.006), 0x868476, at(x, 0.12 + i * 0.22, DESK_Z1 + 0.012));
        b.add('chrome', cbox(0.12, 0.018, 0.024, 0.006), 0xffffff, at(x, 0.18 + i * 0.22, DESK_Z1 + 0.026));
      }
    }
    b.add('paint', cbox(X1 - X0 - 0.95, 0.5, 0.02, 0.006), 0x4e5846, at(0, 0.45, DESK_Z0 + 0.12));
    // the raked console on the back half: a sloped face with switch rows and lamp windows
    const rk = DESK_Z0 + 0.02, rf = -1.02, ry0 = top, ry1 = top + 0.24;
    b.add('paint', hull([[X0 + 0.05, ry0, rk], [X1 - 0.05, ry0, rk], [X0 + 0.05, ry0, rf], [X1 - 0.05, ry0, rf], [X0 + 0.05, ry1, rk], [X1 - 0.05, ry1, rk], [X0 + 0.05, ry0 + 0.05, rf], [X1 - 0.05, ry0 + 0.05, rf]]), 0x6a6c62, undefined, { rep: 0.5 });
    const slope = Math.atan2(ry1 - ry0 - 0.05, rf - rk);
    const face = (u: number, v: number) => new THREE.Vector3(u, ry0 + 0.05 + (ry1 - ry0 - 0.05) * (1 - v), rf + (rk - rf) * (1 - v));
    const faceRot = new THREE.Euler(-Math.PI / 2 - slope, 0, 0);
    // engraved panel seams
    for (const x of [-1.25, -0.42, 0.42, 1.25]) b.add('metal', cbox(0.012, 0.01, 0.46, 0.003), C.darker, at(x, (ry0 + ry1) / 2 + 0.02, (rk + rf) / 2, -slope + Math.PI));
    // the keyboard and the phone, the mic, the clipboard...
    // keyboard: a heavy beige slab with rows of keys
    const kx = 0.05, kz = -0.82;
    b.add('paint', hull([[-0.32, top, kz - 0.11], [0.32, top, kz - 0.11], [-0.32, top, kz + 0.11], [0.32, top, kz + 0.11], [-0.31, top + 0.05, kz - 0.1], [0.31, top + 0.05, kz - 0.1], [-0.31, top + 0.025, kz + 0.1], [0.31, top + 0.025, kz + 0.1]]), C.beige, at(kx, 0, 0), { rep: 0.3 });
    for (let r = 0; r < 4; r++) for (let c = 0; c < 13; c++) {
      if (r === 3 && c > 2 && c < 10) { if (c === 3) b.add('bakelite', cbox(0.24, 0.02, 0.034, 0.006), 0xd8d0b8, at(kx, top + 0.035, kz + 0.075)); continue; }
      b.add('bakelite', cbox(0.034, 0.02, 0.034, 0.006), r === 0 && c > 9 ? 0xb06040 : 0xd8d0b8, at(kx - 0.255 + c * 0.0425, top + 0.042 - r * 0.0055, kz - 0.07 + r * 0.045));
    }
    // the ashtray, a pencil cup, loose cassette
    b.add('chrome', lathe([[0, 0], [0.06, 0], [0.065, 0.012], [0.055, 0.02], [0.045, 0.008], [0, 0.008]], 8), 0xb0b0b0, at(1.05, top, -0.74));
    b.add('enamel', prism(0.005, 0.07, 5), 0xe8e0d0, at(1.08, top + 0.016, -0.74, 0, 0, Math.PI / 2 - 0.1));
    this.cig.set(1.115, top + 0.02, -0.74);
    b.add('paint', lathe([[0, 0], [0.035, 0], [0.038, 0.11], [0.032, 0.11], [0.03, 0.01], [0, 0.01]], 7), 0x4a5a6a, at(-1.05, top, -0.78));
    for (let i = 0; i < 4; i++) b.add('wood', prism(0.004, 0.17, 5), [0xd8b040, 0x3a6aa0, 0xd8b040, 0xa83a2a][i], at(-1.05 + (i - 1.5) * 0.012, top + 0.1, -0.78 + (i % 2) * 0.01, 0.1 * (i - 1.5), 0, 0.12 * (i - 1.5)));
    b.add('bakelite', cbox(0.1, 0.015, 0.064, 0.004), 0xffffff, at(0.62, top + 0.008, -0.68, 0, 0.4));
    const g0 = b.build(this.mats);
    g.add(g0);
    // toggle rows on the raked face: each one flips; some of them do things
    const fns: ((on: boolean) => void)[] = [
      (on) => { this.lampOn = on; },
      (on) => { for (const a of this.aux) a.tube.power = on ? 1 : 0.05; },
      (on) => { this.alarmT = on ? 6 : 0; if (on) uiSound('klaxon', 0.35); },
      (on) => { this.tubeK = on ? 1 : 0.0; },
    ];
    const labels = ['LAMP', 'AUX', 'ALARM', 'TUBE', 'AIR', 'DOOR', 'SPARE', 'GAS'];
    for (let r = 0; r < 2; r++) for (let i = 0; i < 8; i++) {
      const u = -1.5 + i * 0.13 + (i > 3 ? 0.25 : 0), v = 0.3 + r * 0.42;
      const t = new Toggle(this.mats, { cap: r === 0 && i < 4 ? [0xd8c8a0, 0x60a060, 0xc03020, 0xd8c8a0][i] : undefined });
      t.group.position.copy(face(u, v)); t.group.rotation.copy(faceRot);
      g.add(t.group);
      const on = r === 0 && i < 4 ? i !== 2 : Math.random() < 0.5;
      t.flip(on); t.update(1);
      const fn = r === 0 && i < 4 ? fns[i] : undefined;
      this.toggles.push({ t, fn });
      this.hots.push({ key: `sw${r}${i}`, objs: [t.group], label: r === 0 ? labels[i] : 'Switch', sub: r === 0 && i < 4 ? ['desk lamp', 'the small sets', 'the alarm klaxon', 'the ceiling tube'][i] : 'flip it', press: () => { const on2 = t.flip(); fn?.(on2); uiSound('toggle', 0.9); } });
    }
    // lamp windows and LEDs across the right half of the console
    for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) {
      const u = 0.35 + i * 0.13, v = 0.2 + r * 0.28;
      const col = [0x40ff60, 0xffb030, 0xff3a20][((i * 7 + r * 3) % 5) % 3];
      this.leds.add(face(u, v).add(new THREE.Vector3(0, 0.004, 0)), col, { size: 0.011, pattern: (i + r) % 3 === 0 ? busy(i * 3 + r, 3 + r) : (i + r) % 4 === 1 ? blink(0.6 + i * 0.07, 0.5, r * 0.3) : undefined, level: (i * r) % 3 === 0 ? 0.1 : 1 });
    }
    // two VU meters (rectangular windows, needles)
    const mb = new FacetBuilder();
    for (const x of [1.42, 1.72]) {
      const p = face(x, 0.55);
      mb.add('metal', cbox(0.2, 0.012, 0.13, 0.004), C.darker, at(p.x, p.y + 0.002, p.z, faceRot.x + Math.PI / 2, 0, 0));
      mb.add('enamel', cbox(0.17, 0.004, 0.1, 0.002), 0xe8d8a0, at(p.x, p.y + 0.008, p.z, faceRot.x + Math.PI / 2, 0, 0));
    }
    g.add(mb.build(this.mats, { cast: false }));
    // the microphone: a weighted base, gooseneck, a grille head; the push-to-talk key
    const mic = new THREE.Group();
    const mk = new FacetBuilder();
    mk.add('metal', lathe([[0, 0], [0.08, 0], [0.085, 0.02], [0.06, 0.035], [0.02, 0.04], [0, 0.04]], 8), C.darker);
    mk.add('chrome', tube([[0, 0.03, 0], [0, 0.16, 0], [0.01, 0.28, 0.03], [0.04, 0.34, 0.1], [0.07, 0.35, 0.16]], 0.008, 12, 5), 0xffffff);
    mk.add('chrome', lathe([[0, -0.02], [0.022, -0.02], [0.03, 0.02], [0.034, 0.06], [0.03, 0.08], [0, 0.085]], 8), 0xd0d0d0, at(0.075, 0.35, 0.17, Math.PI / 2 - 0.3, 0, 0));
    mk.add('rubber', lathe([[0, 0], [0.032, 0], [0.034, 0.03], [0, 0.034]], 8), 0x202020, at(0.088, 0.352, 0.226, Math.PI / 2 - 0.3, 0, 0));
    mk.add('bakelite', cbox(0.05, 0.016, 0.04, 0.006), 0xffffff, at(0, 0.045, 0.045));
    mk.add('rubber', tube([[0, 0.01, -0.06], [-0.05, 0.005, -0.25], [-0.2, 0.005, -0.38]], 0.006, 8, 4), 0x1a1a1a);
    mic.add(mk.build(this.mats));
    mic.position.set(-0.62, top, -0.86); mic.rotation.y = 0.35;
    g.add(mic);
    this.micLed = this.leds.add(new THREE.Vector3(-0.62, top + 0.055, -0.82).add(new THREE.Vector3(0.016, 0, 0.032)), 0xff2a1a, { size: 0.008, level: 0.05 });
    this.hots.push({ key: 'mic', objs: [mic], label: 'Intercom', sub: 'key the microphone · the cells can hear you', press: () => { this.keyMic(); this.note('mic', mic); } });
    // the mug of coffee, steaming
    const mb2 = new FacetBuilder();
    mb2.add('enamel', lathe([[0, 0], [0.04, 0], [0.042, 0.005], [0.044, 0.1], [0.04, 0.1], [0.038, 0.012], [0, 0.012]], 8), 0xe8e4d8);
    mb2.add('rubber', lathe([[0, 0.085], [0.039, 0.085], [0, 0.086]], 8), 0x2a1408);
    mb2.add('enamel', tube([[0.04, 0.08, 0], [0.068, 0.072, 0], [0.072, 0.045, 0], [0.06, 0.025, 0], [0.042, 0.022, 0]], 0.007, 8, 4), 0xe8e4d8);
    mb2.add('paint', lathe([[0.0445, 0.04], [0.0445, 0.07]], 8), 0xa83a2a);
    this.mug.add(mb2.build(this.mats));
    this.mug.position.set(0.82, top, -0.76);
    g.add(this.mug);
    // round 18: Specimen 07, a human eye in a jar, on the desk (no longer a panel ornament)
    this.jar = eyeJar();
    // round 18b: bigger and at the desk's front edge, so it reads at the room's resolution
    this.jar.group.position.set(1.12, top, -0.66); this.jar.group.rotation.y = -0.35; this.jar.group.scale.setScalar(2.35);
    g.add(this.jar.group);
    this.hots.push({ key: 'jar', objs: [this.jar.hit], label: 'Specimen 07', sub: 'it watches the desk', press: () => { this.jar?.poke(); uiSound('tink', 0.6); gameSound('glass_clink', 0.35); } });
    this.hots.push({ key: 'mug', objs: [this.mug], label: 'Coffee', sub: 'still warm', press: () => { this.mugW.kick(5); this.mugSteam = 1.2; uiSound('tink', 0.8); gameSound('glass_clink', 0.3); this.note('mug', this.mug); } });
    // the clipboard with the subject's sheet, loose pages
    const cbb = new FacetBuilder();
    cbb.add('wood', cbox(0.24, 0.008, 0.32, 0.003), 0x8a6a48, at(0, 0.004, 0), { grain: 'z' });
    cbb.add('chrome', cbox(0.1, 0.014, 0.04, 0.004), 0xffffff, at(0, 0.012, -0.14));
    this.board.add(cbb.build(this.mats));
    const sheet = paper(['INTAKE', '~', '~', '~', '~', '~', '~', '~'], 0.21, 0.28, { seed: 11, stamp: 'RM 4' });
    sheet.rotation.x = -Math.PI / 2; sheet.position.set(0, 0.0095, 0.012);
    this.board.add(sheet);
    this.board.position.set(-0.3, top + 0.002, -0.74); this.board.rotation.y = 0.28;
    g.add(this.board);
    this.hots.push({ key: 'board', objs: [this.board], label: 'Intake sheet', sub: 'unit 4 · the file on the desk', press: () => { this.boardW.kick(4); uiSound('tick', 0.8); gameSound('paper', 0.6); this.note('board', this.board); } });
    for (const [x, z, r, s] of [[1.35, -0.72, -0.4, 3], [1.5, -0.8, 0.25, 4], [-1.5, -0.72, 0.1, 5]] as [number, number, number, number][]) {
      const p = paper(['~', '~', '~', '~', '~', '~'], 0.21, 0.28, { seed: s * 7 });
      p.rotation.set(-Math.PI / 2, 0, r); p.position.set(x, top + 0.003 + s * 0.0006, z);
      g.add(p);
    }
    // the phone: a squat two-tone set with a coiled cord and a row of keys
    const pb = new FacetBuilder();
    pb.add('bakelite', hull([[-0.11, 0, -0.1], [0.11, 0, -0.1], [-0.11, 0, 0.1], [0.11, 0, 0.1], [-0.09, 0.08, -0.08], [0.09, 0.08, -0.08], [-0.08, 0.05, 0.08], [0.08, 0.05, 0.08]]), 0x3a2a20);
    pb.add('bakelite', hull([[-0.13, 0.08, -0.04], [0.13, 0.08, -0.04], [-0.13, 0.08, 0.02], [0.13, 0.08, 0.02], [-0.12, 0.12, -0.03], [0.12, 0.12, -0.03], [-0.12, 0.12, 0.01], [0.12, 0.12, 0.01]]), 0x2a1e18);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) pb.add('enamel', cbox(0.022, 0.012, 0.018, 0.004), 0xe0d8c0, at(-0.04 + c * 0.028, 0.06 - r * 0.004, 0.0 + r * 0.025, -0.35, 0, 0));
    pb.add('rubber', tube([[0.12, 0.1, 0], [0.16, 0.04, 0.05], [0.14, 0.01, 0.12], [0.05, 0.01, 0.16]], 0.006, 10, 4), 0x1a1a1a);
    this.phone.add(pb.build(this.mats));
    this.phone.position.set(1.45, top, -1.0); this.phone.rotation.y = -0.4;
    g.add(this.phone);
    // the phone: it rings (the real bell), then the line clicks and a note of who called
    this.hots.push({ key: 'phone', objs: [this.phone], label: 'Telephone', sub: 'the line to the floor above', press: () => { this.phoneW.kick(6); this.ringT = 2.4; gameSound('phone_ring', 0.55); setTimeout(() => uiSound('relay', 0.7), 2200); setTimeout(() => gameSound('static_burst', 0.3), 2350); this.note('phone', this.phone); } });
    // the swivel chair in front of the desk
    const ch = new FacetBuilder();
    ch.add('metal', prism(0.03, 0.34, 6), C.dark, at(0, 0.27, 0));
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; ch.add('metal', cbox(0.04, 0.03, 0.3, 0.008), C.darker, at(Math.sin(a) * 0.15, 0.07, Math.cos(a) * 0.15, 0, a)); ch.add('rubber', prism(0.025, 0.03, 6), 0x1a1a1a, at(Math.sin(a) * 0.29, 0.025, Math.cos(a) * 0.29, 0, 0, Math.PI / 2)); }
    ch.add('leather', cbox(0.5, 0.08, 0.48, 0.03), 0x5a4030, at(0, 0.47, 0));
    ch.add('metal', cbox(0.05, 0.3, 0.03, 0.01), C.dark, at(0, 0.6, 0.25, -0.15));
    ch.add('leather', hull([[-0.22, 0.62, 0.24], [0.22, 0.62, 0.24], [-0.24, 1.02, 0.3], [0.24, 1.02, 0.3], [-0.2, 0.64, 0.3], [0.2, 0.64, 0.3], [-0.22, 1.0, 0.36], [0.22, 1.0, 0.36]]), 0x5a4030);
    for (const k of [-1, 1]) { ch.add('metal', cbox(0.03, 0.18, 0.03, 0.008), C.dark, at(k * 0.24, 0.6, 0.02)); ch.add('rubber', cbox(0.05, 0.03, 0.26, 0.01), 0x222222, at(k * 0.24, 0.7, 0.0)); }
    this.chair.add(ch.build(this.mats));
    this.chair.position.set(0.3, 0, -0.05);
    this.chair.rotation.y = this.chairA;
    g.add(this.chair);
    this.hots.push({ key: 'chair', objs: [this.chair], label: 'Chair', sub: 'the night shift\'s seat', press: () => { this.chairV += 4 + Math.random() * 3; uiSound('creak', 0.8); gameSound('chair_squeak', 0.4); this.note('chair', this.chair); } });
    return g;
  }

  /** the banker's lamp on the left of the desk: the warm key on the papers */
  private buildLamp() {
    const g = new THREE.Group();
    const b = new FacetBuilder();
    b.add('brass', lathe([[0, 0], [0.09, 0], [0.095, 0.015], [0.06, 0.03], [0, 0.03]], 8), 0xffffff);
    b.add('brass', prism(0.008, 0.3, 6), 0xffffff, at(0, 0.18, 0));
    b.add('brass', tube([[0, 0.32, 0], [0.02, 0.36, 0.04], [0.04, 0.38, 0.1]], 0.008, 6, 4), 0xffffff);
    // the green glass shade, a half-cylinder hood
    const sh: [number, number][] = [];
    for (let i = 0; i <= 5; i++) { const a = Math.PI * (i / 5); sh.push([Math.cos(a) * 0.1, Math.sin(a) * 0.065]); }
    const hood = extrude([...sh, ...sh.slice().reverse().map(([x, y]) => [x * 0.92, y * 0.88] as [number, number])], 0.3, 0.006);
    b.add('paint', hood, 0x2a6a3a, at(0.04, 0.37, 0.12, 0, Math.PI / 2, 0), { rep: 0.2 });
    g.add(b.build(this.mats));
    const bulb = new THREE.Mesh(prism(0.025, 0.2, 6), this.lampBulb);
    bulb.rotation.x = Math.PI / 2; bulb.position.set(0.04, 0.39, 0.12);
    g.add(bulb);
    g.position.set(-1.55, DESK_Y, -1.12); g.rotation.y = 0.7;
    this.lamp.position.set(0.04, 0.36, 0.14);
    g.add(this.lamp);
    this.lamp.target.position.set(0.2, -0.8, 0.5);
    g.add(this.lamp.target);
    // the lamp's warm cone down onto the desk (the light it throws, made visible by the smoke)
    this.lampShaft.mesh.position.set(0.04, 0.36, 0.14); this.lampShaft.mesh.scale.set(0.32, 0.4, 0.26); this.lampShaft.mesh.rotation.set(0.35, 0, -0.2);
    g.add(this.lampShaft.mesh);
    this.scene.add(g);
    this.hots.push({ key: 'lamp', objs: [g], label: 'Desk lamp', sub: 'the pull chain', press: () => { this.lampOn = !this.lampOn; this.toggles[0].t.flip(this.lampOn); uiSound('click', 0.9); } });
    const pool = glowCard(1.6, 1.0, 0xffb060, 0.09); pool.rotation.x = -Math.PI / 2; pool.position.set(-0.9, DESK_Y + 0.004, -0.85); pool.name = 'lampPool';
    this.scene.add(pool);
  }

  /** hot feeds, the window and the annunciator */
  private buildProps() {
    for (const f of this.feeds) {
      const meta = FEEDS.find((q) => q.key === f.key)!;
      this.hots.push({
        key: 'feed:' + f.key, objs: [f.tube.mesh], glow: [], label: meta.label, sub: meta.sub,
        hover: (on) => { f.tube.hover = on ? 1 : 0; f.lamp.level = on ? 1 : 0.2; this.lean = on ? f : this.lean === f ? null : this.lean; if (on) uiSound('tick', 0.5); },
        press: () => this.onFeed?.(f.key),
      });
    }
    // the window: knock, and something knocks back
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshStandardMaterial({ color: 0x0a0e12, roughness: 0.15, metalness: 0.6, transparent: true, opacity: 0.5, depthWrite: false }));
    win.rotation.y = Math.PI / 2; win.position.set(-W - 0.05, 1.45, -0.35);
    win.userData.noGlow = true;
    this.scene.add(win);
    // wire mesh in the glass
    const wb = new FacetBuilder();
    for (let i = 1; i < 12; i++) wb.add('metal', cbox(0.003, 1.0, 0.003, 0.001), 0x2a2a2a, at(-W - 0.04, 1.45, -0.35 - 0.8 + i * (1.6 / 12)));
    for (let i = 1; i < 8; i++) wb.add('metal', cbox(0.003, 0.003, 1.6, 0.001), 0x2a2a2a, at(-W - 0.04, 1.45 - 0.5 + i * (1.0 / 8), -0.35));
    this.scene.add(wb.build(this.mats, { cast: false }));
    this.hots.push({ key: 'window', objs: [win], glow: [], label: 'Window', sub: 'there is nothing out there', press: () => { uiSound('tink', 1); gameSound('knock', 0.5); setTimeout(() => uiSound('tink', 0.6), 160); if (this.winT < 0 && Math.random() < 0.6) { this.winT = 0; } this.note('window', win); } });
  }

  // ================================================================== aux tube pictures
  private drawPulse(c: CanvasRenderingContext2D, t: number) {
    const Wc = 96, Hc = 72;
    c.fillStyle = '#000'; c.fillRect(0, 0, Wc, Hc);
    c.fillStyle = '#1a4a1a';
    for (let x = 0; x < Wc; x += 8) for (let y = 20; y < Hc - 6; y += 8) c.fillRect(x, y, 1, 1);
    c.fillStyle = '#9dff9a';
    let py = 46;
    for (let x = 0; x < Wc; x++) {
      const ph = ((x / Wc) * 3 + t * 1.6) % 1;
      const y = ph < 0.05 ? 42 : ph < 0.08 ? 50 : ph < 0.11 ? 24 : ph < 0.14 ? 54 : ph > 0.25 && ph < 0.33 ? 43 : 46;
      const lo = Math.min(py, y), hi = Math.max(py, y);
      c.fillRect(x, lo, 1, Math.max(1, hi - lo));
      py = y;
    }
    // the sweep: a dark gap travelling across
    const sx = Math.floor((t * 30) % Wc);
    c.fillStyle = '#000'; c.fillRect(sx, 18, 6, Hc - 22);
    bitText(c, 'RM 4', 3, 1, { color: '#c8ffc0', outline: null });
    bitText(c, String(108 + Math.round(Math.sin(t * 0.7) * 6)), 92, 1, { color: '#c8ffc0', outline: null, align: 'right' });
  }
  private drawCorridor(c: CanvasRenderingContext2D, t: number) {
    const Wc = 96, Hc = 72;
    c.fillStyle = '#000'; c.fillRect(0, 0, Wc, Hc);
    // a long corridor in one-point perspective, a light that stutters halfway down
    const vx = 48, vy = 30;
    const lit = Math.sin(t * 17) + Math.sin(t * 5.3) > -0.6 ? 1 : 0.3;
    for (let i = 0; i < 9; i++) {
      const k = Math.pow(0.72, i), x0 = vx - 50 * k, x1 = vx + 50 * k, y0 = vy - 34 * k, y1 = vy + 42 * k;
      const v = Math.round((i === 3 ? 140 * lit : 70) * k + 12);
      c.fillStyle = `rgb(${v},${v},${v})`;
      c.fillRect(Math.round(x0), Math.round(y1), Math.round(x1 - x0), 1);
      c.fillRect(Math.round(x0), Math.round(y0), 1, Math.round(y1 - y0));
      c.fillRect(Math.round(x1), Math.round(y0), 1, Math.round(y1 - y0));
      if (i === 3) { c.fillStyle = `rgb(${Math.round(200 * lit)},${Math.round(200 * lit)},${Math.round(200 * lit)})`; c.fillRect(vx - 6, Math.round(y0) + 1, 12, 1); }
    }
    // sometimes someone is standing at the end of it
    const s = (t % 47) / 47;
    if (s > 0.62 && s < 0.7) { c.fillStyle = '#d8d8d8'; c.fillRect(vx - 1, vy - 2, 2, 7); c.fillRect(vx - 1, vy - 4, 2, 2); }
    bitText(c, 'COR C', 3, 1, { color: '#c8ffc0', outline: null });
  }
  private logLines: string[] = [];
  private logT = 0;
  private drawLog(c: CanvasRenderingContext2D, t: number) {
    const Wc = 96, Hc = 72;
    const POOL = ['DOOR 7 OK', 'RB-17 CALM', 'PRESS IDLE', 'RM 4 OK', 'TANK 3 +2', 'ARM HOMED', 'AIR 0.94', 'GRID OK', 'RB-17 ?', 'TAPE FULL', 'NO ENTRY', 'CH 3 LAG', 'DEBT +4%'];
    if (t - this.logT > 1.1 || !this.logLines.length) { this.logT = t; this.logLines.push(POOL[Math.floor(Math.random() * POOL.length)]); if (this.logLines.length > 3) this.logLines.shift(); }
    c.fillStyle = '#000'; c.fillRect(0, 0, Wc, Hc);
    this.logLines.forEach((ln, i) => bitText(c, ln, 6, 8 + i * 16, { color: '#ffd8a0', outline: null }));
    if ((t * 2) % 1 < 0.5) { c.fillStyle = '#ffd8a0'; c.fillRect(6, 10 + this.logLines.length * 16, 6, 12); }
  }
  private seis: number[] = [];
  private drawSeismo(c: CanvasRenderingContext2D, t: number) {
    const Wc = 96, Hc = 72;
    const shake = Math.sin(t * 0.3) > 0.85 ? 18 : 3;
    this.seis.push((Math.random() - 0.5) * shake + Math.sin(t * 9) * 2);
    if (this.seis.length > Wc) this.seis.shift();
    c.fillStyle = '#000'; c.fillRect(0, 0, Wc, Hc);
    c.fillStyle = '#1a4a1a'; c.fillRect(0, 44, Wc, 1);
    c.fillStyle = '#9dff9a';
    let py = 44;
    this.seis.forEach((v, x) => { const y = Math.round(44 + v); c.fillRect(x, Math.min(py, y), 1, Math.max(1, Math.abs(y - py))); py = y; });
    bitText(c, 'DEPTH', 3, 1, { color: '#c8ffc0', outline: null });
  }

  // ================================================================== interaction
  /** the intercom: a squeal of feedback, the lamp on the mic, and the cells hear it */
  /** a desk prop's note on the booth's readout plate (cycled per prop) */
  private noteN: Record<string, number> = {};
  private note(k: keyof typeof BOOTH, o: THREE.Object3D) {
    const list = BOOTH[k], i = (this.noteN[k] = (this.noteN[k] ?? -1) + 1);
    this.pokes.say(list[i % list.length], new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()));
  }
  keyMic() {
    this.micT = 1.6;
    uiSound('buzz', 0.5);
    gameSound('hush_shh', 0.25, 1.4);
    this.onMic?.();
  }
  setFeedTexture(key: FeedKey, tex: THREE.Texture | null, linear: boolean) { const f = this.feeds.find((q) => q.key === key); if (!f) return; f.tube.setFeed(tex, linear); f.tube.mat.uniforms.uGain.value = linear ? 2.6 : 1.35; }
  /** the tube for a feed (title.ts drives snow while switching) */
  tube(key: FeedKey) { return this.feeds.find((q) => q.key === key)!.tube; }
  /** where a feed's glass is (world corners), for its DOM twin */
  feedCorners(key: FeedKey): THREE.Vector3[] {
    const f = this.feeds.find((q) => q.key === key)!;
    const w = f.spot.sw / 2, h = f.spot.sh / 2;
    return [[-w, -h], [w, -h], [w, h], [-w, h]].map(([x, y]) => new THREE.Vector3(x, y, 0.02).applyMatrix4(f.spot.m));
  }
  pointer(nx: number, ny: number) { this.ptr.set(nx, ny); }
  /** the decorator's build mode: a high shot down on the desk and the floor in front of it */
  setBuild(on: boolean) { this.build = on; if (on) this.lean = null; }
  /** hover a feed from its DOM twin */
  leanTo(key: FeedKey | null) {
    for (const f of this.feeds) { const on = f.key === key; f.tube.hover = on ? 1 : 0; f.lamp.level = on ? 1 : 0.2; }
    this.lean = key ? this.feeds.find((q) => q.key === key) ?? null : null;
  }

  // ================================================================== camera
  setFraming(aspect: number, portrait: boolean) {
    this.portrait = portrait;
    if (portrait) {
      // the bank in the upper part, the desk and the menu words below; the lens widens to keep the bank's width
      this.home.pos.set(0.0, 1.62, 2.6);
      this.home.look.set(0.0, 1.38, -1.8);
      const dist = this.home.pos.z + 1.55, halfW = 1.98;
      this.home.fov = Math.min(96, THREE.MathUtils.radToDeg(2 * Math.atan(halfW / dist / aspect)));
      this.frXT = 0; this.frYT = 0.26;
    } else {
      this.home.pos.set(0.42, 1.64, 1.85);
      this.home.look.set(0.1, 1.36, -1.8);
      const dist = this.home.pos.distanceTo(this.home.look);
      // wide enough for the bank plus the menu's dark side
      const needW = 2.05 / (1 - 0.22), hf = THREE.MathUtils.radToDeg(2 * Math.atan(needW / dist / aspect));
      this.home.fov = Math.max(44, Math.min(62, hf));
      this.frXT = aspect < 1.45 ? 0.16 : 0.22; this.frYT = 0;
    }
  }
  /** fly into a feed's glass until it fills the view; resolves at the end */
  dive(key: FeedKey, ms = 720): Promise<void> {
    const f = this.feeds.find((q) => q.key === key)!;
    const n = new THREE.Vector3(0, 0, 1).transformDirection(f.spot.m);
    const fov = 30;
    const dist = (f.spot.sh / 2) / Math.tan(THREE.MathUtils.degToRad(fov / 2)) * (this.portrait ? 1.6 : 0.82);
    const to = { pos: f.spot.center.clone().addScaledVector(n, dist), look: f.spot.center.clone(), fov };
    return this.fly(to, ms, easeIn, 0);
  }
  /** start inside a feed's glass and pull back home */
  back(key: FeedKey, ms = 900): Promise<void> {
    const f = this.feeds.find((q) => q.key === key)!;
    const n = new THREE.Vector3(0, 0, 1).transformDirection(f.spot.m);
    const fov = 30, dist = (f.spot.sh / 2) / Math.tan(THREE.MathUtils.degToRad(fov / 2)) * 0.8;
    this.camPos.copy(f.spot.center).addScaledVector(n, dist); this.camLook.copy(f.spot.center); this.camFov = fov;
    this.frX = 0; this.frY = 0;
    return this.fly({ pos: this.home.pos.clone(), look: this.home.look.clone(), fov: this.home.fov }, ms, easeOut, 1);
  }
  private fly(to: { pos: THREE.Vector3; look: THREE.Vector3; fov: number }, ms: number, ease: (k: number) => number, fr: number): Promise<void> {
    this.flight?.res();
    return new Promise((res) => { this.flight = { from: { pos: this.camPos.clone(), look: this.camLook.clone(), fov: this.camFov }, to, t: 0, dur: ms / 1000, ease, res, fr }; });
  }
  get flying() { return !!this.flight; }

  frame(aspect: number, portrait: boolean) {
    if (portrait !== this.portrait || Math.abs(aspect - this.cam.aspect) > 0.01) this.setFraming(aspect, portrait);
    const c = this.cam;
    c.aspect = aspect;
    c.fov = this.camFov;
    c.updateProjectionMatrix();
    const e = c.projectionMatrix.elements;
    e[8] = -this.frX; e[9] = -this.frY;
    c.projectionMatrixInverse.copy(c.projectionMatrix).invert();
  }

  // ================================================================== frame
  update(dt: number, t: number, full: boolean) {
    this.jar?.update(dt, t, this.cam, this.ptr);
    if (full) this.lamp.getWorldPosition(this.grade.shafts![1]);
    if (full) { this.dress?.update(t); this.pokes.update(dt, t, this.cam); }
    // ---- lights: the lamp, the stuttering tube, the alarm, the phosphor spill
    this.lampLvl = damp(this.lampLvl, this.lampOn ? 1 : 0, 18, dt);
    const buzz = 0.96 + Math.random() * 0.04;
    this.lamp.intensity = 5.2 * this.lampLvl * buzz;
    this.lampBulb.color.setRGB(0.3 + 3.2 * this.lampLvl, 0.25 + 2.5 * this.lampLvl, 0.15 + 1.5 * this.lampLvl);
    const pool = this.scene.getObjectByName('lampPool'); if (pool) pool.visible = this.lampLvl > 0.05;
    this.tubeNext -= dt;
    if (this.tubeNext < 0) { this.tubeDrop = Math.random() < 0.5 ? 0.06 + Math.random() * 0.3 : 0; this.tubeNext = 1.5 + Math.random() * 5; }
    this.tubeDrop = Math.max(0, this.tubeDrop - dt);
    const tl = this.tubeK * (this.tubeDrop > 0 ? (Math.random() < 0.5 ? 0.1 : 0.6) : 1);
    this.tubeLight.intensity = 7.2 * tl;
    this.tubeMat.color.setScalar(0.08 + 1.6 * tl);
    this.tubeShaft.u.uInt.value = 0.02 * tl;
    this.lampShaft.u.uInt.value = 0.03 * this.lampLvl;
    if (full) this.dust.update(t, this.tubeLight.position, this.v.set(0, -1, 0), Math.cos(1.1), Math.cos(0.5), 1.8 * tl, new THREE.Color(0xdfe8ff), 0.05 + 0.25 * this.lampLvl);
    this.alarmT = Math.max(0, this.alarmT - dt);
    this.alarm.intensity = this.alarmT > 0 ? 7 * Math.max(0, Math.sin(t * 9)) : 0;
    this.winLight.intensity = 0.9 + Math.sin(t * 0.37) * 0.15;
    let glow = 0;
    for (const f of this.feeds) {
      f.tube.update(dt, t);
      f.light.intensity = 0.35 + f.tube.glow * 0.8;
      glow += f.tube.glow;
    }
    // ---- aux tubes: redraw a few times a second
    for (const a of this.aux) {
      a.tube.update(dt, t);
      a.acc += dt;
      if (a.acc > (full ? 0.15 : 0.5)) { a.acc = 0; a.draw(t); a.tex.needsUpdate = true; }
    }
    // ---- the captions (clock and REC) once a second
    this.capT -= dt;
    if (this.capT <= 0) {
      this.capT = 0.5; this.blinkOn = !this.blinkOn;
      for (const f of this.feeds) { const m = FEEDS.find((q) => q.key === f.key)!; drawCaption(f.tube, m.cam, m.name, this.blinkOn); }
    }
    // ---- props
    for (const s of this.toggles) s.t.update(dt);
    this.leds.update(t);
    this.micT = Math.max(0, this.micT - dt);
    this.micLed.level = this.micT > 0 ? 1 : 0.05;
    const mw = this.mugW.update(dt);
    this.mug.rotation.z = mw * 0.08; this.mug.position.x = 0.82 + mw * 0.004;
    this.board.rotation.y = 0.28 + this.boardW.update(dt) * 0.05;
    const pw = this.phoneW.update(dt);
    this.ringT = Math.max(0, this.ringT - dt);
    this.phone.position.y = DESK_Y + Math.abs(pw) * 0.004 + (this.ringT > 0 ? Math.abs(Math.sin(t * 60)) * 0.003 : 0);
    this.chairV *= Math.exp(-dt * 1.4);
    this.chairA += this.chairV * dt;
    this.chairA += (0.34 - this.chairA) * Math.min(1, dt * 0.25) * (Math.abs(this.chairV) < 0.3 ? 1 : 0);
    this.chair.rotation.y = this.chairA;
    // steam off the mug, smoke off the cigarette (only where light reaches)
    if (full) {
      this.mugSteam = Math.max(0, this.mugSteam - dt);
      if (Math.random() < dt * (3 + this.mugSteam * 14)) this.puffs.emit(this.v.set(0.82 + (Math.random() - 0.5) * 0.03, DESK_Y + 0.1, -0.76), new THREE.Vector3((Math.random() - 0.5) * 0.02, 0.06, 0), { life: 2.4, s0: 0.012, s1: 0.06, color: 0xb8c8c0, rise: 0.02 });
      if (Math.random() < dt * 5) this.smoke.emit(this.v.copy(this.cig), new THREE.Vector3(0.004, 0.05, 0), { life: 3.2, s0: 0.004, s1: 0.05, color: 0x9aa0a8, rise: 0.03 });
      const lit = (p: THREE.Vector3) => 0.25 + this.lampLvl * 0.6 / (0.4 + p.distanceToSquared(this.lamp.getWorldPosition(this.v)) * 2);
      this.puffs.update(dt, this.cam, lit);
      this.smoke.update(dt, this.cam, () => 0.45);
    }
    // the shape in the window
    this.winNext -= dt;
    if (this.winNext < 0 && this.winT < 0) { this.winT = 0; this.winNext = 30 + Math.random() * 50; }
    if (this.winT >= 0) {
      this.winT += dt;
      const k = this.winT / 3.5;
      this.winShape.visible = k < 1;
      this.winShape.position.z = 0.5 - k * 1.8;
      if (k >= 1) this.winT = -1;
    }
    if (!full) return;
    // ---- camera: home, a lean toward a hovered tube, the pointer's parallax, a hand on it
    const fl = this.flight;
    if (fl) {
      fl.t += dt;
      const k = Math.min(1, fl.t / fl.dur), e = fl.ease(k);
      this.camPos.lerpVectors(fl.from.pos, fl.to.pos, e);
      this.camLook.lerpVectors(fl.from.look, fl.to.look, e);
      this.camFov = THREE.MathUtils.lerp(fl.from.fov, fl.to.fov, e);
      this.frX = THREE.MathUtils.lerp(fl.fr === 1 ? 0 : this.frX, fl.fr * this.frXT, Math.min(1, e * 1.4));
      this.frY = THREE.MathUtils.lerp(fl.fr === 1 ? 0 : this.frY, fl.fr * this.frYT, Math.min(1, e * 1.4));
      if (k >= 1) { this.flight = null; fl.res(); }
    } else {
      this.ptrS.x = damp(this.ptrS.x, this.ptr.x, 3, dt); this.ptrS.y = damp(this.ptrS.y, this.ptr.y, 3, dt);
      const H0 = this.build ? this.buildPose : this.home;
      const lp = this.v.copy(H0.look);
      let fov = this.build ? (this.portrait ? Math.min(90, H0.fov * 1.35) : H0.fov) : H0.fov;
      if (this.lean && !this.portrait && !this.build) { lp.lerp(this.lean.spot.center, 0.12); fov -= 1.5; }
      this.camLook.set(damp(this.camLook.x, lp.x + this.ptrS.x * 0.12, 3, dt), damp(this.camLook.y, lp.y - this.ptrS.y * 0.06, 3, dt), damp(this.camLook.z, lp.z, 3, dt));
      this.camPos.set(damp(this.camPos.x, H0.pos.x - this.ptrS.x * 0.06, 2.5, dt), damp(this.camPos.y, H0.pos.y + this.ptrS.y * 0.03, 2.5, dt), damp(this.camPos.z, H0.pos.z, 2.5, dt));
      this.camFov = damp(this.camFov, fov, 4, dt);
      this.frX = damp(this.frX, this.build ? 0 : this.frXT, 4, dt); this.frY = damp(this.frY, this.build ? 0 : this.frYT, 4, dt);
    }
    const nx = Math.sin(t * 0.29) * 0.006 + Math.sin(t * 0.71 + 1) * 0.003, ny = Math.sin(t * 0.41 + 2) * 0.004;
    this.cam.position.set(this.camPos.x + nx, this.camPos.y + ny, this.camPos.z);
    this.cam.lookAt(this.camLook);
    this.cam.rotateZ(Math.sin(t * 0.33) * 0.003);
  }
}
