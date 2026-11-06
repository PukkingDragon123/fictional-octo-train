// MONSTER CONTAINMENT, cell C-1: the observation corridor in front of a wall of
// reinforced glass (three thick panes in a riveted steel frame, wire inlay,
// scratches, smears, a starred crack that grows) and behind it a steel-plated
// cell with claw gouges, a drain, a hazard plinth, a caged work lamp hard
// overhead, two amber beacons in the corners, and specimen RB-17 "Hush" (the
// game's own creature, src/creatures/species/hush.ts, built and animated by
// its own code) chained by the wrists to the back wall.
// In the corridor: the restraint pedestal (a winch lever, the alarm mushroom,
// a gauge), a steel shelf of sample jars, the intercom grille, signs.
// Interactions: tap the glass (a ripple runs out from your knuckle; the Hush
// hunts sound, so it turns, stalks to the glass, raises its finger; tap too
// often and it slams the pane), pull the restraints (the winch drags it back),
// the alarm, the intercom (it shushes), poke the jars.
// THE WING (rooms/wing.ts): past the Hush's cell the corridor runs on both
// ways along a row of smaller cells, one per species in the Meridian file.
// Q / E, the arrows, a drag or the wheel walk the camera from cell to cell;
// a press on a cell selects it and opens its file (title.ts: specimens/panel.ts).
import * as THREE from 'three';
import type { FMats } from '../scene/pixtex';
import { Puffs, Chain } from '../scene/fx';
import type { Hot, StageRoom, Grade } from '../monitor/stage';
import { species } from '../../../creatures/registry';
import '../../../creatures/species/hush';
import type { Rig } from '../../../creatures/species';
import {
  FacetBuilder, at, cbox, prism, lathe, extrude, gem, bolt, hull, tube, C, LedBank, blink, busy, plate, paper, slab, glowCard, Wobble, uiSound, gameSound,
} from '../monitor/props';
import { SpecimenWing, PITCH, wingSpecies, type Cell } from './wing';
import { dressSpecimen, SpecimenLife } from './specimenDetail';
import { menuEvent, wireMeta } from '../../../game/achievements';
import { checkMilestones } from '../../../game/meridian';

const W = 2.7, CELL = -4.0, FRONT = 4.0, H = 3.3, GZ = 0;
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
const HOME = new THREE.Vector3(0, 0, -2.55);

// ------------------------------------------------------------------ the glass
const GLASS_VERT = /* glsl */`
varying vec2 vUv; varying vec3 vW;
void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const GLASS_FRAG = /* glsl */`
uniform sampler2D tMarks; uniform vec3 uTint; uniform vec3 uBeacon; uniform float uTime;
uniform vec3 uTap; uniform float uTapT; uniform float uFlash;
varying vec2 vUv; varying vec3 vW;
void main() {
  vec4 m = texture2D(tMarks, vUv);
  // a cold sheen that thickens toward the frame, streaks of reflected light
  vec2 e = abs(vUv - 0.5) * 2.0;
  float edge = smoothstep(0.75, 1.0, max(e.x, e.y));
  float streak = smoothstep(0.035, 0.0, abs(fract(vUv.x * 1.3 + vUv.y * 0.9 + 0.12) - 0.5)) * 0.5 + smoothstep(0.012, 0.0, abs(fract(vUv.x * 1.3 + vUv.y * 0.9 + 0.2) - 0.5)) * 0.4;
  vec3 c = uTint * (0.015 + edge * 0.05 + streak * 0.03);
  c += uBeacon * (0.008 + streak * 0.05 + m.a * 0.06);
  c += m.rgb * m.a * (0.035 + length(uBeacon) * 0.05);
  // the tap: a ring running out from the knuckle
  // a faceted (hexagonal) ring in the pane's plane
  vec2 q = abs(vW.xy - uTap.xy);
  float d = max(q.x * 0.866 + q.y * 0.5, q.y);
  float r = uTapT * 1.6;
  float ring = smoothstep(0.05, 0.0, abs(d - r)) * (1.0 - smoothstep(0.0, 1.0, uTapT)) * step(0.0, uTapT);
  c += vec3(0.6, 0.85, 0.8) * ring * 0.9;
  c += vec3(1.0, 0.25, 0.15) * uFlash * (0.15 + m.a * 0.6);
  gl_FragColor = vec4(c, 1.0);
}`;

/** pixel scratches, smears, hand prints and a starred crack on the glass (RGBA) */
function marksCanvas(seed: number, crack: number): HTMLCanvasElement {
  const Wc = 256, Hc = 256;
  const cv = document.createElement('canvas'); cv.width = Wc; cv.height = Hc;
  const c = cv.getContext('2d')!;
  let s = seed;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  // scratches
  for (let i = 0; i < 30; i++) {
    let x = rnd() * Wc, y = rnd() * Hc; const a = rnd() * Math.PI, len = 12 + rnd() * 60;
    c.fillStyle = `rgba(220,235,230,${0.25 + rnd() * 0.35})`;
    for (let k = 0; k < len; k++) { c.fillRect(Math.round(x), Math.round(y), 1, 1); x += Math.cos(a); y += Math.sin(a) + (rnd() - 0.5) * 0.3; }
  }
  // greasy smears (dithered)
  for (let i = 0; i < 4; i++) {
    const cx = rnd() * Wc, cy = 100 + rnd() * 120, r = 12 + rnd() * 24;
    for (let y = -r; y < r; y++) for (let x = -r; x < r; x++) if (x * x + y * y < r * r && rnd() < 0.18) { c.fillStyle = 'rgba(170,180,160,0.3)'; c.fillRect(Math.round(cx + x), Math.round(cy + y * 0.5), 1, 1); }
  }
  // a palm print (four finger smears and a heel)
  if (seed % 2) {
    const px = 60 + rnd() * 120, py = 120 + rnd() * 60;
    c.fillStyle = 'rgba(200,210,200,0.3)';
    for (let f = 0; f < 4; f++) for (let k = 0; k < 10; k++) c.fillRect(Math.round(px - 7 + f * 4 + (rnd() - 0.5)), Math.round(py - 12 - k + (f === 0 || f === 3 ? 3 : 0)), 2, 1);
    for (let y = 0; y < 9; y++) for (let x = 0; x < 12; x++) if (rnd() < 0.55) c.fillRect(Math.round(px - 6 + x), Math.round(py - 2 + y), 1, 1);
  }
  // the crack: a starburst with jagged legs and a ring
  if (crack > 0) {
    const cx = 104 + seed % 40, cy = 116;
    c.fillStyle = 'rgba(235,250,245,0.9)';
    const legs = 5 + Math.floor(crack * 5);
    for (let l = 0; l < legs; l++) {
      let x = cx, y = cy; const a = (l / legs) * Math.PI * 2 + rnd() * 0.4; const len = (24 + rnd() * 60) * (0.5 + crack * 0.6);
      for (let k = 0; k < len; k++) { c.fillRect(Math.round(x), Math.round(y), 1, 1); x += Math.cos(a) + (rnd() - 0.5) * 0.9; y += Math.sin(a) + (rnd() - 0.5) * 0.9; }
    }
    for (let k = 0; k < 40; k++) { const a = (k / 40) * Math.PI * 2, r = 10 + crack * 8 + (rnd() - 0.5) * 3; c.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1); }
    c.fillStyle = 'rgba(255,255,255,1)'; c.fillRect(cx - 1, cy - 1, 3, 3);
  }
  return cv;
}

interface Pane { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; tex: THREE.CanvasTexture; seed: number; crack: number; x0: number; x1: number }

export class ContainmentRoom implements StageRoom {
  id = 'containment';
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(46, 16 / 9, 0.05, 30);
  feedCam = new THREE.PerspectiveCamera(68, 4 / 3, 0.05, 30);
  hots: Hot[] = [];
  grade: Grade = { exposure: 2.2, lift: [0.92, 0.98, 1.06], gain: [1.04, 1.0, 0.94], vig: 0.35, sat: 1.06, contrast: 1.06 };
  deco = new THREE.Group();
  floor = { minX: -W + 0.6, maxX: W - 0.6, minZ: 0.45, maxZ: 1.5, y: 0 };
  surfaces = [{ minX: -W + 0.1, maxX: -W + 0.5, minZ: 0.7, maxZ: 2.3, y: 1.42 }, { minX: -W + 0.1, maxX: -W + 0.5, minZ: 0.7, maxZ: 2.3, y: 0.92 }];
  guideSpot = { pos: new THREE.Vector3(-1.2, 0, 1.1), look: new THREE.Vector3(0, 1.4, -2.2) };
  /** actions with DOM twins (title.ts lists them in the room's HUD) */
  actions: { key: string; label: string; run: () => void }[] = [];
  private mats: FMats;
  private leds = new LedBank(80);
  private panes: Pane[] = [];
  private hemi = new THREE.HemisphereLight(0xb8bcc0, 0x3a3632, 0.6);
  private key = new THREE.SpotLight(0xcfe0ff, 0, 0, 0.95, 0.55, 2);
  private keyMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  private beacons: { g: THREE.Group; spin: THREE.Group; light: THREE.SpotLight; mat: THREE.MeshBasicMaterial; a: number }[] = [];
  private red = new THREE.PointLight(0xff2a1a, 0.6, 5, 2);
  private jarLight = new THREE.PointLight(0x7aff6a, 0.35, 2.4, 2);
  private cellFill = new THREE.PointLight(0x8aa8e8, 2.6, 6.5, 2);
  private bounce = new THREE.PointLight(0xffa040, 0, 3.5, 2);
  private redMat = new THREE.MeshBasicMaterial({ color: 0x400606, toneMapped: false });
  private alarmT = 0;
  private flash = 0;
  private puffs = new Puffs(40);
  // the creature
  private rig: Rig | null = null;
  private life: SpecimenLife | null = null;
  private def: any = null;
  private fc: any;
  private pos = HOME.clone(); private facing = 0; private goal: THREE.Vector3 | null = null; private mode: 'idle' | 'stalk' | 'watch' | 'slam' | 'dragged' | 'shush' = 'idle'; private modeT = 0;
  private taps: number[] = [];
  private chains: Chain[] = [];
  private anchors = [new THREE.Vector3(-1.3, 2.2, CELL + 0.12), new THREE.Vector3(1.3, 2.2, CELL + 0.12)];
  private slack = 1;
  private lever = new THREE.Group(); private leverA = 0; private leverT = 0;
  private button = new THREE.Group(); private btnW = new Wobble(600, 18);
  private jars: { g: THREE.Group; w: Wobble; base: number }[] = [];
  private grille = new THREE.Group();
  private camPos = new THREE.Vector3(0.32, 1.48, 1.6); private camLook = new THREE.Vector3(0, 1.3, -2.3);
  private ptr = new THREE.Vector2(); private ptrS = new THREE.Vector2();
  private shake = 0;
  private build = 0; private buildT = 0;
  private buildPos = new THREE.Vector3(0.3, 2.55, 3.2); private buildLook = new THREE.Vector3(0, 0.4, 0.4);
  private v = new THREE.Vector3(); private v2 = new THREE.Vector3();
  private t = 0;
  // the wing: where the camera stands along the row (0 = the Hush)
  wing: SpecimenWing;
  /** the stops along the corridor, left to right: the cells and the Hush (key 'hush') */
  stops: { key: string; x: number; cell: Cell | null }[] = [];
  focus = 0;
  private camX = 0; private dragX = 0;
  /** a stop was selected by a press (title.ts opens the specimen's file) */
  onInspect?: (key: string) => void;
  /** title.ts: the loadout and the Meridian file panels */
  onPanel?: (which: 'loadout' | 'file') => void;
  /** the focused stop changed */
  onFocus?: (key: string) => void;

  constructor(mats: FMats) {
    this.mats = mats;
    const S = this.scene;
    S.background = new THREE.Color(0x000000);
    S.add(this.shell(), this.cellProps(), this.corridorProps(), this.leds.mesh, this.puffs.mesh, this.deco);
    this.deco.name = 'deco';
    S.add(this.hemi, this.red, this.jarLight, this.cellFill, this.bounce);
    this.cellFill.position.set(0.4, 2.7, -1.6);
    this.bounce.position.set(0, 0.4, 0.9);
    this.red.position.set(-2.2, 2.6, 2.2);
    this.jarLight.position.set(-W + 0.4, 1.3, 1.5);
    this.feedCam.position.set(2.35, 2.75, 2.6); this.feedCam.lookAt(-0.1, 1.15, -2.0);
    this.buildCreature();
    // the specimen wing (built after the Hush so its hots come after the glass)
    wireMeta(); checkMilestones();
    this.wing = new SpecimenWing(mats, W);
    S.add(this.wing.group);
    this.hots.push(...this.wing.hots);
    this.wing.onSelect = (c) => { this.goTo(c.key); this.wing.poke(c); this.onInspect?.(c.key); };
    this.stops = [...this.wing.cells.map((c) => ({ key: c.key, x: c.x, cell: c as Cell | null })), { key: 'hush', x: 0, cell: null }].sort((a, b) => a.x - b.x);
    this.focus = this.stops.findIndex((q) => q.key === 'hush');
    this.cam.position.copy(this.camPos); this.cam.lookAt(this.camLook);
  }

  // ================================================================== walking the wing
  get focusKey() { return this.stops[this.focus]?.key ?? 'hush'; }
  /** one stop along the row; false at the end of it (title.ts then changes channel) */
  pan(d: -1 | 1): boolean {
    const n = this.focus + d;
    if (n < 0 || n >= this.stops.length) return false;
    this.setFocus(n);
    uiSound('servo', 0.35);
    return true;
  }
  goTo(key: string) { const i = this.stops.findIndex((q) => q.key === key); if (i >= 0) this.setFocus(i); }
  private setFocus(i: number) { if (i === this.focus) return; this.focus = i; this.dragX = 0; this.onFocus?.(this.focusKey); }
  /** a drag across the stage: dx in screen widths (positive = the picture follows the finger right) */
  drag(dx: number) { this.dragX -= dx * 4.2; }
  dragEnd() {
    const x = this.stops[this.focus].x + this.dragX;
    let best = this.focus, bd = Infinity;
    this.stops.forEach((q, i) => { const d = Math.abs(q.x - x); if (d < bd) { bd = d; best = i; } });
    this.dragX = 0;
    if (best !== this.focus) { this.setFocus(best); uiSound('servo', 0.35); }
  }
  /** re-read the Meridian file (after a purchase in the panel, or on entering) */
  refresh() { this.wing.refresh(); }
  enter() { this.refresh(); }

  // ================================================================== the shell
  private shell(): THREE.Group {
    const b = new FacetBuilder();
    const g = new THREE.Group();
    const PLATE = 0x7a807c, CONC = 0x8a8680;
    // corridor: grating floor over a dark pit, painted block walls, a low ceiling with pipes
    // the corridor runs the whole wing (rooms/wing.ts): XL..XR
    const nC = wingSpecies().length, XL = -(W + 0.2 + Math.floor(nC / 2) * PITCH), XR = W + 0.2 + Math.ceil(nC / 2) * PITCH;
    slab(b, 'floor', XL, XR, -0.1, 0, GZ, FRONT, 0x6a6c64);
    for (let z = GZ + 0.3; z < FRONT; z += 0.6) b.add('metal', cbox(XR - XL, 0.012, 0.03, 0.004), C.darker, at((XL + XR) / 2, 0.003, z));
    // the corridor's back wall: painted dado, concrete above, a stripe of programme yellow
    slab(b, 'paint', XL, XR, 0, 1.1, FRONT - 0.04, FRONT + 0.2, 0x4e5a4a, 0.004, 0.5);
    slab(b, 'hazard', XL, XR, 1.1, 1.18, FRONT - 0.05, FRONT, 0xffffff, 0.004, 0.24);
    for (const k of [XL, XR]) slab(b, 'concrete', k - 0.2, k, 0, H, CELL, FRONT + 0.2, CONC);
    slab(b, 'concrete', -W, W, H, H + 0.15, CELL - 0.2, GZ, 0x3e3e3a);
    slab(b, 'concrete', XL, XR, H, H + 0.15, GZ - 0.2, FRONT, 0x3e3e3a);
    slab(b, 'concrete', XL, XR, 1.18, H, FRONT, FRONT + 0.2, CONC);
    // the cell: steel plate on every face, a seam grid with rivets, a sump
    slab(b, 'metal', -W, W, -0.1, 0, CELL, GZ, 0x6a6e6a, 0.004, 0.8);
    slab(b, 'metal', -W, W, 0, H, CELL - 0.2, CELL, PLATE, 0.004, 0.9);
    for (const k of [-1, 1]) slab(b, 'metal', k * W, k * (W + 0.2), 0, H, CELL, GZ, PLATE, 0.004, 0.9);
    for (let x = -W + 0.9; x < W; x += 0.9) {
      b.add('metal', cbox(0.03, H, 0.02, 0.006), 0x4a4e4a, at(x, H / 2, CELL + 0.01));
      for (let y = 0.2; y < H; y += 0.3) b.add('metal', bolt(0.012, 0.008), C.steel, at(x + 0.04, y, CELL + 0.01, Math.PI / 2));
    }
    for (let y = 0.9; y < H; y += 0.9) b.add('metal', cbox(W * 2, 0.03, 0.02, 0.006), 0x4a4e4a, at(0, y, CELL + 0.01));
    for (const k of [-1, 1]) for (let z = CELL + 0.6; z < GZ; z += 0.9) b.add('metal', cbox(0.02, H, 0.03, 0.006), 0x4a4e4a, at(k * (W - 0.01), H / 2, z));
    // claw gouges raked through the plate
    const gouge = (x: number, y: number, z: number, ry: number, n = 4) => { for (let i = 0; i < n; i++) b.add('rubber', cbox(0.012, 0.42 + (i % 2) * 0.1, 0.008, 0.003), 0x1a1210, at(x + i * 0.04, y - i * 0.03, z, 0, ry, 0.25)); };
    gouge(-1.9, 1.7, CELL + 0.012, 0); gouge(0.9, 1.0, CELL + 0.012, 0, 3); gouge(W - 0.012, 1.4, -1.6, -Math.PI / 2); gouge(-W + 0.012, 2.0, -2.8, Math.PI / 2, 5);
    // the plinth: a raised hazard-edged square the specimen stands on
    b.add('metal', cbox(3.2, 0.08, 2.6, 0.012), 0x8a8e8a, at(0, 0.04, -2.5), { rep: 0.6 });
    for (const z of [-3.8, -1.2]) b.add('hazard', cbox(3.3, 0.06, 0.06, 0.01), 0xffffff, at(0, 0.05, z), { rep: 0.24 });
    for (const x of [-1.62, 1.62]) b.add('hazard', cbox(0.06, 0.06, 2.6, 0.01), 0xffffff, at(x, 0.05, -2.5), { rep: 0.24, grain: 'z' });
    b.add('rust', extrude([[-0.24, -0.24], [0.24, -0.24], [0.24, 0.24], [-0.24, 0.24]], 0.02, 0.004, [[[-0.2, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2]]]), 0xb0a090, at(0.8, 0.085, -1.7, Math.PI / 2));
    for (let i = 0; i < 6; i++) b.add('rust', cbox(0.4, 0.016, 0.02, 0.004), 0x9a8a7a, at(0.8, 0.085, -1.88 + i * 0.07));
    // wall rings for the chains
    for (const a of this.anchors) {
      b.add('metal', cbox(0.22, 0.22, 0.04, 0.012), C.dark, at(a.x, a.y, CELL + 0.02));
      for (const [dx, dy] of [[-0.08, -0.08], [0.08, -0.08], [-0.08, 0.08], [0.08, 0.08]]) b.add('metal', bolt(0.014, 0.01), C.steel, at(a.x + dx, a.y + dy, CELL + 0.04, Math.PI / 2));
      b.add('metal', prism(0.045, 0.03, 8), C.steel, at(a.x, a.y, CELL + 0.06, Math.PI / 2));
    }
    // the cage lamp housing in the cell ceiling; vents; a sprinkler head
    b.add('metal', cbox(0.6, 0.12, 0.6, 0.02), C.dark, at(0, H - 0.06, -2.2));
    for (let i = 0; i < 5; i++) b.add('metal', cbox(0.6, 0.012, 0.012, 0.003), 0x5a5e5a, at(0, H - 0.14, -2.44 + i * 0.12));
    b.add('metal', cbox(0.5, 0.3, 0.04, 0.01), C.darker, at(-1.8, H - 0.4, CELL + 0.03));
    for (let i = 0; i < 6; i++) b.add('metal', cbox(0.46, 0.012, 0.03, 0.003), 0x5a5e5a, at(-1.8, H - 0.52 + i * 0.045, CELL + 0.05));
    b.add('chrome', lathe([[0, 0], [0.03, 0], [0.04, -0.04], [0.012, -0.06], [0, -0.06]], 6), 0xffffff, at(1.2, H, -1.2));
    // the glass wall: a heavy frame, mullions, a sill with the stencil, bolts all round
    const PX = [-W, -0.82, 0.82, W];
    b.add('paint', cbox(W * 2, 0.5, 0.36, 0.02), 0x3e4636, at(0, 0.25, GZ), { rep: 0.5 });
    b.add('hazard', cbox(W * 2, 0.06, 0.38, 0.01), 0xffffff, at(0, 0.53, GZ), { rep: 0.24 });
    b.add('paint', cbox(W * 2, 0.36, 0.36, 0.02), 0x3e4636, at(0, H - 0.18, GZ), { rep: 0.5 });
    for (const x of PX) {
      b.add('paint', cbox(x === -W || x === W ? 0.3 : 0.16, H, 0.38, 0.02), 0x485240, at(x, H / 2, GZ), { rep: 0.5 });
      for (let y = 0.7; y < H - 0.3; y += 0.24) for (const dz of [-0.2, 0.2]) b.add('metal', bolt(0.014, 0.01), C.steel, at(x + (x < 0 ? 0.05 : -0.05) * (Math.abs(x) === W ? -1 : 0), y, GZ + dz, dz > 0 ? Math.PI / 2 : -Math.PI / 2));
    }
    for (let x = -W + 0.2; x < W; x += 0.22) for (const y of [0.56, H - 0.36]) b.add('metal', bolt(0.012, 0.008), C.steel, at(x, y, GZ + 0.19, Math.PI / 2));
    // corridor ceiling pipes and conduit
    b.add('paint', prism(0.06, FRONT - GZ, 8), 0x7a4a30, at(-1.6, H - 0.2, (FRONT + GZ) / 2, Math.PI / 2), { rep: 0.4 });
    b.add('paint', prism(0.04, FRONT - GZ, 8), 0x4a6a5a, at(-1.35, H - 0.16, (FRONT + GZ) / 2, Math.PI / 2), { rep: 0.4 });
    b.add('metal', prism(0.02, FRONT - GZ, 6), C.steel, at(1.8, H - 0.1, (FRONT + GZ) / 2, Math.PI / 2));
    g.add(b.build(this.mats));
    // the panes
    for (let i = 0; i < 3; i++) {
      const x0 = PX[i] + (i === 0 ? 0.15 : 0.08), x1 = PX[i + 1] - (i === 2 ? 0.15 : 0.08);
      const seed = 11 + i * 7, crack = i === 1 ? 0.15 : 0;
      const tex = new THREE.CanvasTexture(marksCanvas(seed, crack));
      tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
      const mat = new THREE.ShaderMaterial({
        vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG,
        uniforms: { tMarks: { value: tex }, uTint: { value: new THREE.Color(0x6aa8a0) }, uBeacon: { value: new THREE.Color(0) }, uTime: { value: 0 }, uTap: { value: new THREE.Vector3(0, -9, 0) }, uTapT: { value: -1 }, uFlash: { value: 0 } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, H - 0.36 - 0.56), mat);
      mesh.position.set((x0 + x1) / 2, (0.56 + H - 0.36) / 2, GZ + 0.02);
      mesh.renderOrder = 5;
      mesh.userData.noGlow = true;
      g.add(mesh);
      this.panes.push({ mesh, mat, tex, seed, crack, x0, x1 });
    }
    // the stencil on the sill
    const st = plate(this.mats, ['DO NOT TAP THE GLASS'], 1.1, 0.12, { bg: 0xc8a030 });
    st.position.set(0, 0.36, GZ + 0.185);
    g.add(st);
    const st2 = plate(this.mats, ['CELL C-1', 'RB-17 · HUSH · AUDITORY'], 0.9, 0.22, { bg: 0xc8c0a0 });
    st2.position.set(0, H - 0.18, GZ + 0.185);
    g.add(st2);
    const th = plate(this.mats, ['THREAT 4'], 0.36, 0.11, { bg: 0xc03a24, ink: 0x180404 });
    th.position.set(1.25, H - 0.18, GZ + 0.185);
    g.add(th);
    // cold light pooled under the lamp, a red wash in the corridor
    const pool = glowCard(2.4, 2.2, 0xa8c8ff, 0.16); pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.09, -2.4); g.add(pool);
    const wash = glowCard(2.6, 2.6, 0xff3020, 0.07); wash.rotation.x = -Math.PI / 2; wash.position.set(-1.6, 0.01, 2.0); g.add(wash);
    // the hard lamp in the cell
    this.key.position.set(0, H - 0.2, -2.2);
    this.key.target.position.set(0, 0, -2.5);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.camera.near = 0.1; this.key.shadow.camera.far = 6;
    this.key.shadow.bias = -0.0008; this.key.shadow.normalBias = 0.015;
    g.add(this.key, this.key.target);
    const lampGlass = new THREE.Mesh(cbox(0.5, 0.02, 0.5, 0.004), this.keyMat);
    lampGlass.position.set(0, H - 0.13, -2.2);
    g.add(lampGlass);
    return g;
  }

  // ================================================================== inside the cell
  private cellProps(): THREE.Group {
    const g = new THREE.Group();
    // the beacons: a faceted amber dome over a turning reflector, a cage
    for (const [x, z] of [[-W + 0.25, -0.5], [W - 0.25, -0.5]]) {
      const bg = new THREE.Group();
      const b = new FacetBuilder();
      b.add('metal', cbox(0.2, 0.06, 0.2, 0.01), C.dark, at(0, 0, 0));
      b.add('metal', band6(), C.darker, at(0, 0.1, 0));
      bg.add(b.build(this.mats, { cast: false }));
      const mat = new THREE.MeshBasicMaterial({ color: 0x402000, toneMapped: false, transparent: true, opacity: 0.85 });
      const dome = new THREE.Mesh(lathe([[0.08, 0.03], [0.085, 0.1], [0.07, 0.17], [0.03, 0.2], [0, 0.205]], 8), mat);
      dome.userData.noGlow = true;
      bg.add(dome);
      const spin = new THREE.Group();
      const rf = new THREE.Mesh(cbox(0.012, 0.1, 0.1, 0.004), new THREE.MeshBasicMaterial({ color: 0xffe0a0, toneMapped: false }));
      rf.position.set(0, 0.11, 0); spin.add(rf);
      bg.add(spin);
      const light = new THREE.SpotLight(0xffa020, 0, 7, 0.42, 0.5, 1.6);
      light.position.set(0, 0.12, 0);
      spin.add(light);
      const tgt = new THREE.Object3D(); tgt.position.set(3, -0.3, 0); spin.add(tgt); light.target = tgt;
      bg.position.set(x, H - 0.42, z);
      g.add(bg);
      this.beacons.push({ g: bg, spin, light, mat, a: Math.random() * 6 });
    }
    // the slop bowl, a hose coiled on a reel
    const b = new FacetBuilder();
    b.add('chrome', lathe([[0, 0], [0.16, 0], [0.2, 0.08], [0.18, 0.085], [0.14, 0.02], [0, 0.02]], 8), 0x9a9a9a, at(1.2, 0.08, -3.2));
    b.add('rubber', lathe([[0, 0.05], [0.15, 0.05], [0, 0.051]], 8), 0x3a1a14, at(1.2, 0.08, -3.2));
    b.add('paint', prism(0.22, 0.12, 10), 0xa83a2a, at(-W + 0.2, 1.1, -3.4, 0, 0, Math.PI / 2));
    for (let i = 0; i < 4; i++) b.add('rubber', prism(0.2 - i * 0.004, 0.025, 10), 0x2a2a2a, at(-W + 0.16 + i * 0.026, 1.1, -3.4, 0, 0, Math.PI / 2));
    g.add(b.build(this.mats));
    return g;
  }

  // ================================================================== the corridor
  private corridorProps(): THREE.Group {
    const g = new THREE.Group();
    // the restraint pedestal: a slanted steel desk on a column, the winch lever, the alarm mushroom, a gauge
    const b = new FacetBuilder();
    const PX = 1.55, PZ = 1.1;
    b.add('paint', cbox(0.34, 0.95, 0.34, 0.02), 0x4e5a46, at(PX, 0.475, PZ), { rep: 0.4 });
    b.add('paint', hull([[PX - 0.32, 0.95, PZ - 0.26], [PX + 0.32, 0.95, PZ - 0.26], [PX - 0.32, 0.95, PZ + 0.24], [PX + 0.32, 0.95, PZ + 0.24], [PX - 0.32, 1.12, PZ - 0.26], [PX + 0.32, 1.12, PZ - 0.26], [PX - 0.32, 1.0, PZ + 0.24], [PX + 0.32, 1.0, PZ + 0.24]]), 0x5e6a56, undefined, { rep: 0.4 });
    b.add('hazard', cbox(0.66, 0.02, 0.04, 0.005), 0xffffff, at(PX, 0.98, PZ + 0.25), { rep: 0.2 });
    b.add('metal', cbox(0.12, 0.1, 0.22, 0.012), C.dark, at(PX - 0.14, 1.12, PZ - 0.06, 0.32));
    // the gauge: a rectangular window, needle
    b.add('metal', cbox(0.14, 0.012, 0.1, 0.004), C.darker, at(PX + 0.16, 1.08, PZ - 0.04, 0.32));
    b.add('enamel', cbox(0.12, 0.004, 0.08, 0.002), 0xe8d8a0, at(PX + 0.16, 1.088, PZ - 0.04, 0.32));
    g.add(b.build(this.mats));
    // the lever (pivot on the box, swings toward the glass)
    const lb = new FacetBuilder();
    lb.add('metal', prism(0.03, 0.14, 6), C.dark, at(0, 0, 0, 0, 0, Math.PI / 2));
    lb.add('chrome', prism(0.012, 0.32, 6), 0xffffff, at(0, 0.16, 0));
    lb.add('paint', lathe([[0, 0], [0.026, 0], [0.03, 0.03], [0.026, 0.1], [0, 0.11]], 6), 0xb83a24, at(0, 0.31, 0));
    this.lever.add(lb.build(this.mats));
    this.lever.position.set(PX - 0.14, 1.17, PZ - 0.06);
    this.lever.rotation.x = 0.5;
    g.add(this.lever);
    // the alarm mushroom on a yellow collar
    const ab = new FacetBuilder();
    ab.add('paint', prism(0.05, 0.03, 8), 0xd8b030, at(0, 0.015, 0));
    ab.add('paint', lathe([[0, 0], [0.012, 0], [0.04, 0.02], [0.045, 0.035], [0.03, 0.05], [0, 0.052]], 8), 0xc8281a, at(0, 0.02, 0));
    this.button.add(ab.build(this.mats));
    this.button.position.set(PX + 0.14, 1.06, PZ + 0.08); this.button.rotation.x = 0.32;
    g.add(this.button);
    const pl = plate(this.mats, ['RESTRAINT'], 0.2, 0.05, { bg: 0xc8c0a0, px: 520 });
    pl.position.set(PX - 0.14, 1.06, PZ + 0.13); pl.rotation.x = -Math.PI / 2 + 0.32;
    g.add(pl);
    this.leds.add([PX + 0.06, 1.09, PZ + 0.1], 0x40ff60, { size: 0.01, level: 1 });
    this.leds.add([PX + 0.24, 1.09, PZ + 0.1], 0xffb030, { size: 0.01, pattern: blink(1.2) });
    // the jar shelf: a steel rack against the left wall, jars of samples
    const sb = new FacetBuilder();
    const SX = -W + 0.28;
    for (const z of [0.7, 2.3]) for (const dx of [-0.17, 0.17]) sb.add('metal', cbox(0.03, 1.8, 0.03, 0.006), C.dark, at(SX + dx, 0.9, z));
    for (const y of [0.42, 0.9, 1.4, 1.78]) sb.add('metal', cbox(0.4, 0.025, 1.65, 0.006), C.steel, at(SX, y, 1.5), { rep: 0.5 });
    g.add(sb.build(this.mats));
    const fluids = [0x6ad04a, 0xd0a040, 0x8a2a2a, 0x4ab0a0, 0xc8d070, 0x6ad04a, 0xa04ad0, 0xd06a3a];
    let n = 0;
    for (const y of [0.92, 1.42]) for (let i = 0; i < 4; i++) {
      const jg = new THREE.Group();
      const jb = new FacetBuilder();
      const r = 0.07 + ((i + n) % 3) * 0.012, hgt = 0.2 + ((i * 3 + n) % 3) * 0.04;
      jb.add('metal', lathe([[0, hgt], [r * 0.9, hgt], [r * 0.92, hgt + 0.02], [0, hgt + 0.025]], 8), [0x8a8e8a, 0xb08a3a, 0x5a5a5a][i % 3]);
      // the specimen floating inside (a curled, faceted lump)
      jb.add('leather', hull([[-r * 0.4, 0.04, -r * 0.3], [r * 0.4, 0.06, -r * 0.3], [0, hgt * 0.7, 0], [-r * 0.3, hgt * 0.5, r * 0.4], [r * 0.5, hgt * 0.3, r * 0.3], [0, 0.03, r * 0.2]]), [0xc8a090, 0x8a6a7a, 0xd8c0a0, 0x9a8a6a][(i + n) % 4]);
      jg.add(jb.build(this.mats));
      const fl = new THREE.Mesh(lathe([[0, 0.005], [r * 0.95, 0.005], [r * 0.98, hgt * 0.85], [0, hgt * 0.85]], 8), new THREE.MeshBasicMaterial({ color: fluids[n % fluids.length], transparent: true, opacity: 0.38, toneMapped: false, depthWrite: false }));
      fl.userData.noGlow = true;
      jg.add(fl);
      const gl = new THREE.Mesh(lathe([[0, 0], [r, 0], [r * 1.02, hgt], [r * 0.9, hgt + 0.005], [0, hgt + 0.005]], 8), new THREE.MeshBasicMaterial({ color: 0x405048, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      gl.userData.noGlow = true;
      jg.add(gl);
      jg.position.set(SX + (i % 2 ? 0.05 : -0.06), y + 0.0125, 0.85 + i * 0.4);
      g.add(jg);
      const w = new Wobble(300, 6);
      this.jars.push({ g: jg, w, base: jg.rotation.z });
      const ji = this.jars.length - 1;
      this.hots.push({ key: 'jar' + ji, objs: [jg], label: 'Sample jar', sub: ['RB-17 · finger', 'RB-17 · horn fold', 'unknown · tissue', 'grinhound · tongue', 'specimen · eye', 'RB-17 · skin', 'unknown · spore', 'tithe · coin gut'][ji % 8], press: () => { w.kick(4 + Math.random() * 3); uiSound('tink', 0.9); this.bubble(jg.position); } });
      n++;
    }
    // the intercom grille on the glass frame, a red emergency lamp cage in the corridor
    const ib = new FacetBuilder();
    ib.add('metal', cbox(0.2, 0.26, 0.04, 0.01), C.dark, at(0, 0, 0));
    for (let i = 0; i < 7; i++) ib.add('metal', cbox(0.15, 0.012, 0.012, 0.003), C.darker, at(0, -0.09 + i * 0.03, 0.022));
    ib.add('bakelite', cbox(0.05, 0.03, 0.02, 0.006), 0xffffff, at(0, -0.15, 0.02));
    this.grille.add(ib.build(this.mats));
    this.grille.position.set(-0.82, 1.4, GZ + 0.21);
    g.add(this.grille);
    const rb = new FacetBuilder();
    rb.add('metal', cbox(0.14, 0.04, 0.1, 0.008), C.dark, at(0, 0, 0));
    for (let i = 0; i < 4; i++) rb.add('metal', cbox(0.006, 0.1, 0.006, 0.002), C.darker, at(-0.05 + i * 0.033, -0.06, 0.04));
    const rg = rb.build(this.mats, { cast: false });
    rg.position.set(-2.2, 2.62, 2.2);
    g.add(rg);
    const redBulb = new THREE.Mesh(gem(0.04, 6, 0.05), this.redMat);
    redBulb.position.set(-2.2, 2.56, 2.2); redBulb.rotation.x = Math.PI;
    g.add(redBulb);
    // signs and a clipboard on the corridor wall
    const s1 = plate(this.mats, ['SPECIMEN STORE', 'DO NOT OPEN'], 0.42, 0.14, { bg: 0xc8c0a0 });
    s1.position.set(-W + 0.012, 2.05, 1.5); s1.rotation.y = Math.PI / 2;
    g.add(s1);
    const clip = paper(['FEEDING', '~', '~', 'NONE', '~', '~'], 0.21, 0.28, { seed: 41, stamp: 'C-1' });
    clip.position.set(W - 0.012, 1.4, 1.9); clip.rotation.y = -Math.PI / 2;
    g.add(clip);
    // hots
    this.hots.push({ key: 'lever', objs: [this.lever], label: 'Restraints', sub: 'wind the chains in', press: () => this.restrain() });
    this.hots.push({ key: 'alarm', objs: [this.button], label: 'Alarm', sub: 'the klaxon and the beacons', press: () => this.alarm() });
    this.hots.push({ key: 'intercom', objs: [this.grille], label: 'Intercom', sub: 'talk into the cell', press: () => this.hear(new THREE.Vector3(-0.82, 1.4, GZ), true) });
    // the Hush's own actions walk back to its cell first
    const home = (fn: () => void) => () => { if (this.focusKey !== 'hush') this.goTo('hush'); fn(); };
    this.actions = [
      { key: 'inspect', label: 'Inspect', run: () => this.onInspect?.(this.focusKey) },
      { key: 'loadout', label: 'Loadout', run: () => this.onPanel?.('loadout') },
      { key: 'file', label: 'Meridian file', run: () => this.onPanel?.('file') },
      { key: 'tap', label: 'Tap the glass', run: home(() => this.tap(new THREE.Vector3((Math.random() - 0.5) * 1.2, 1.3 + Math.random() * 0.4, GZ + 0.02))) },
      { key: 'lever', label: 'Restraints', run: home(() => this.restrain()) },
      { key: 'alarm', label: 'Alarm', run: home(() => this.alarm()) },
      { key: 'intercom', label: 'Intercom', run: home(() => this.hear(new THREE.Vector3(-0.82, 1.4, GZ), true)) },
    ];
    return g;
  }

  // ================================================================== the specimen
  private buildCreature() {
    const def = species('hush') as any;
    if (!def) return;
    this.def = def;
    try {
      const rig: Rig = def.build();
      this.rig = rig;
      rig.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      // the display specimen's anatomy and wet skin, its breathing and twitches (specimenDetail.ts)
      try { const d = dressSpecimen(rig, def); this.life = new SpecimenLife(rig, d.breathe, d.profile); } catch (e) { console.warn('hush detail', e); }
      this.scene.add(rig.root);
      this.fc = { id: 'menu-hush-17', x: 0, z: 0, y: 0, facing: 0, speed: 0, state: 'idle', mem: { netMem: { cock: 0, fx: 0, fk: '' } }, attackPhase: 0, hp: 65, hitFlash: 0, dead: false, deathT: 0, targetId: null, tamedBy: null, phase: 0, observed: false, stateT: 0, zoneKey: 'menu', attackT: 0, sp: def, noiseCooldown: 5 };
      for (let i = 0; i < 2; i++) { const ch = new Chain(this.mats, 44); ch.mesh.scale.setScalar(1.8); this.chains.push(ch); this.scene.add(ch.mesh); }
    } catch (e) { console.warn('containment creature', e); this.rig = null; }
    // the glass panes take the pointer: tap where you click
    for (const p of this.panes) this.hots.push({ key: 'glass' + this.panes.indexOf(p), objs: [p.mesh], glow: [], label: 'Reinforced glass', sub: 'it hunts sound', press: (pt) => this.tap(pt) });
  }
  private fxFire(key: string) { const n = this.fc?.mem.netMem; if (n) { n.fx = (n.fx + 1) % 1000; n.fk = key; } }

  /** a knuckle on the glass */
  tap(p: THREE.Vector3) {
    const pane = this.panes.find((q) => p.x >= q.x0 - 0.1 && p.x <= q.x1 + 0.1) ?? this.panes[1];
    pane.mat.uniforms.uTap.value.copy(p); pane.mat.uniforms.uTapT.value = 0;
    uiSound('tink', 1); setTimeout(() => uiSound('tink', 0.7), 110);
    const now = this.t;
    this.taps = this.taps.filter((x) => now - x < 4);
    this.taps.push(now);
    if (this.taps.length >= 3 && this.mode !== 'dragged') { this.taps = []; this.slam(pane); return; }
    this.hear(p, false);
  }
  /** a sound it can place: it turns, then stalks up to the glass in front of it */
  hear(p: THREE.Vector3, speaker: boolean) {
    if (!this.rig || this.mode === 'dragged' || this.mode === 'slam') return;
    this.fxFire('hear');
    gameSound('hush_inhale', 0.5);
    this.goal = new THREE.Vector3(Math.max(-0.75, Math.min(0.75, p.x)), 0, -0.55);
    this.mode = speaker ? 'shush' : 'stalk'; this.modeT = 0;
    if (speaker) { uiSound('buzz', 0.4); setTimeout(() => gameSound('hush_shh', 0.6), 700); }
  }
  /** the intercom from the monitor room: it hears the speaker */
  fromMonitor() { this.hear(new THREE.Vector3(-0.82, 1.4, GZ), true); }
  private slam(pane: { mat: THREE.ShaderMaterial; tex: THREE.CanvasTexture; seed: number; crack: number; mesh: THREE.Mesh }) {
    if (!this.rig) return;
    this.mode = 'slam'; this.modeT = 0;
    this.goal = new THREE.Vector3(Math.max(-0.75, Math.min(0.75, pane.mesh.position.x)), 0, -0.4);
    this.fxFire('shriek');
    gameSound('hush_shriek', 0.7);
    setTimeout(() => {
      pane.crack = Math.min(1, pane.crack + 0.3);
      const cv = marksCanvas(pane.seed, pane.crack);
      (pane.tex.image as HTMLCanvasElement).getContext('2d')!.clearRect(0, 0, 256, 256);
      (pane.tex.image as HTMLCanvasElement).getContext('2d')!.drawImage(cv, 0, 0);
      pane.tex.needsUpdate = true;
      this.shake = 1; this.flash = 1;
      uiSound('slam', 1);
      menuEvent('slam');
      this.alarm(true);
    }, 520);
  }
  restrain() {
    this.leverT = this.leverT > 0.5 ? 0 : 1;
    uiSound('lever', 1);
    if (this.leverT > 0.5) {
      uiSound('ratchet', 0.8); uiSound('chain', 0.8);
      if (this.rig) { this.mode = 'dragged'; this.modeT = 0; this.goal = HOME.clone(); this.fxFire('hear'); gameSound('hush_shriek', 0.35, 0.8); }
    } else if (this.mode === 'dragged') { this.mode = 'idle'; this.modeT = 0; uiSound('chain', 0.6); }
  }
  alarm(quiet = false) {
    this.alarmT = 6;
    this.btnW.kick(-3);
    if (!quiet) { uiSound('klaxon', 0.5); menuEvent('alarm'); }
  }
  private bubble(p: THREE.Vector3) {
    for (let i = 0; i < 6; i++) this.puffs.emit(this.v.set(p.x + (Math.random() - 0.5) * 0.05, p.y + 0.05 + Math.random() * 0.1, p.z + (Math.random() - 0.5) * 0.05), new THREE.Vector3(0, 0.12, 0), { life: 0.8, s0: 0.004, s1: 0.012, color: 0x9aff8a, rise: 0.1 });
  }
  pointer(nx: number, ny: number) { this.ptr.set(nx, ny); }
  /** the decorator's build mode: up and back, looking down on the corridor floor */
  setBuild(on: boolean) { this.buildT = on ? 1 : 0; if (on) this.goTo('hush'); }

  // ================================================================== frame
  frame(aspect: number, portrait: boolean) {
    const c = this.cam;
    c.aspect = aspect;
    c.fov = portrait ? Math.min(86, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(30)) / aspect)) * 0.85) : 52;
    c.updateProjectionMatrix();
    const e = c.projectionMatrix.elements;
    e[9] = portrait ? -0.1 : 0;
    c.projectionMatrixInverse.copy(c.projectionMatrix).invert();
  }
  feedFrame() { /* the CCTV angle is fixed */ }

  update(dt: number, t: number, full: boolean) {
    this.t = t;
    // ---- beacons: turning when the alarm runs, a slow idle sweep otherwise
    this.alarmT = Math.max(0, this.alarmT - dt);
    const al = this.alarmT > 0 ? 1 : 0;
    let bcol = 0;
    for (const b of this.beacons) {
      b.a += dt * (al ? 7 : 0.9);
      b.spin.rotation.y = b.a;
      const k = al ? 1 : 0.25 + 0.15 * Math.max(0, Math.sin(t * 0.7 + b.a));
      b.light.intensity = 9 * k;
      b.mat.color.setRGB(0.25 + k * 2.2, 0.1 + k * 1.1, 0.0);
      bcol += k * Math.max(0, Math.cos(b.a * 1.0)) * 0.5;
    }
    this.red.intensity = 0.7 + al * 2.5 * Math.max(0, Math.sin(t * 8));
    this.bounce.intensity = bcol * 0.9;
    this.redMat.color.setRGB(0.3 + al * 2 * Math.max(0, Math.sin(t * 8)) + 0.4, 0.04, 0.03);
    this.btnW.update(dt); this.button.position.y = 1.06 + this.btnW.x * 0.004;
    // the cell lamp: hard, with a buzz and a rare dropout
    const drop = Math.random() < 0.004 ? 0.2 : 1;
    this.key.intensity = 30 * (0.96 + Math.random() * 0.04) * drop;
    this.keyMat.color.setScalar(1.5 * drop + 0.3);
    // ---- the glass
    this.flash = Math.max(0, this.flash - dt * 1.5);
    for (const p of this.panes) {
      const u = p.mat.uniforms;
      u.uTime.value = t;
      if (u.uTapT.value >= 0) { u.uTapT.value += dt; if (u.uTapT.value > 1) u.uTapT.value = -1; }
      u.uBeacon.value.setRGB(1.0 * bcol, 0.55 * bcol, 0.1 * bcol);
      u.uFlash.value = this.flash;
    }
    this.leds.update(t);
    // ---- the lever and the jars
    this.leverA = damp(this.leverA, this.leverT, 8, dt);
    this.lever.rotation.x = 0.5 - this.leverA * 1.1;
    for (const j of this.jars) { const x = j.w.update(dt); j.g.rotation.z = j.base + x * 0.05; j.g.rotation.x = x * 0.02; }
    // ---- the specimen, and the wing near the camera
    this.updateCreature(dt, t);
    this.camX = damp(this.camX, (this.stops[this.focus]?.x ?? 0) + this.dragX, 4.5, dt);
    this.wing.update(dt, t, full ? this.camX : 0, full);
    if (full) this.puffs.update(dt, this.cam, () => 0.8);
    if (!full) return;
    // ---- camera: the corridor, a little parallax, the slam's shake
    this.ptrS.x = damp(this.ptrS.x, this.ptr.x, 3, dt); this.ptrS.y = damp(this.ptrS.y, this.ptr.y, 3, dt);
    this.shake = Math.max(0, this.shake - dt * 2);
    const sh = this.shake * this.shake;
    this.build = damp(this.build, this.buildT, 3, dt);
    if (this.build > 0.002) {
      const k = this.build;
      this.cam.position.lerpVectors(this.camPos, this.buildPos, k);
      this.cam.lookAt(this.v.lerpVectors(this.camLook, this.buildLook, k));
      return;
    }
    // along the wing the camera backs off the glass a little and looks into the small cells
    const ax = Math.abs(this.camX), w = Math.min(1, Math.max(0, (ax - 0.4) / 2.2)), ws = w * w * (3 - 2 * w);
    const cz = this.camPos.z + (2.75 - this.camPos.z) * ws, cy = this.camPos.y + (1.45 - this.camPos.y) * ws;
    const lx = this.camX + this.camLook.x * (1 - ws), ly = this.camLook.y + (1.28 - this.camLook.y) * ws, lz = this.camLook.z + (-1.3 - this.camLook.z) * ws;
    this.cam.position.set(this.camX + this.camPos.x * (1 - ws) - this.ptrS.x * 0.18 + (Math.random() - 0.5) * sh * 0.06 + Math.sin(t * 0.3) * 0.01, cy + this.ptrS.y * 0.06 + (Math.random() - 0.5) * sh * 0.05, cz);
    this.cam.lookAt(this.v.set(lx + this.ptrS.x * 0.25, ly - this.ptrS.y * 0.1, lz));
  }

  private updateCreature(dt: number, t: number) {
    const rig = this.rig, fc = this.fc;
    if (!rig || !fc) return;
    this.modeT += dt;
    // where it wants to be
    let speed = 0;
    const target = this.goal ?? HOME;
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z, d = Math.hypot(dx, dz);
    const drag = this.mode === 'dragged';
    if (d > 0.05) {
      const sp = drag ? 0.8 : this.mode === 'slam' ? 2.6 : this.mode === 'stalk' || this.mode === 'shush' ? 0.75 : 0.5;
      const step = Math.min(d, sp * dt);
      this.pos.x += (dx / d) * step; this.pos.z += (dz / d) * step;
      speed = step / Math.max(1e-4, dt);
    }
    // facing: toward the goal while walking, toward the glass when there, a slow drift back when idle
    const wantFace = drag ? Math.PI * 0 : d > 0.08 ? Math.atan2(dx, dz) : this.mode === 'idle' ? Math.sin(t * 0.13) * 0.4 : Math.atan2(-this.pos.x * 0.2, 1);
    let df = wantFace - this.facing; df = Math.atan2(Math.sin(df), Math.cos(df));
    this.facing += df * Math.min(1, dt * (this.mode === 'slam' ? 8 : 3));
    // states
    if ((this.mode === 'stalk' || this.mode === 'shush') && d < 0.06) { this.mode = 'watch'; this.modeT = 0; if (Math.random() < 0.7) { this.fxFire('shh'); gameSound('hush_shh', 0.45); } }
    if (this.mode === 'watch' && this.modeT > 6) { this.mode = 'idle'; this.modeT = 0; this.goal = HOME.clone(); }
    if (this.mode === 'slam' && this.modeT > 2.2) { this.mode = 'watch'; this.modeT = 0; }
    if (this.mode === 'dragged' && this.modeT > 7) { this.mode = 'idle'; this.leverT = 0; this.goal = null; uiSound('chain', 0.6); }
    if (this.mode === 'idle' && !this.goal) { /* home */ }
    fc.state = this.mode === 'idle' ? 'idle' : this.mode === 'slam' ? 'chase' : d > 0.06 ? 'investigate' : 'watch';
    fc.speed = speed;
    fc.phase = (fc.phase ?? 0) + speed * dt * 4;
    fc.attackPhase = this.mode === 'slam' && this.modeT > 0.35 && this.modeT < 0.9 ? 0.25 : 0;
    fc.mem.netMem.cock = this.mode === 'watch' || this.mode === 'stalk' ? 1 : 0;
    fc.stateT += dt;
    fc.x = this.pos.x; fc.z = this.pos.z; fc.facing = this.facing;
    this.life?.before();
    try { this.def.animate(rig, fc, t, dt); } catch { /* the creature's own code should never take the menu down */ }
    this.life?.after(dt, t);
    rig.root.position.set(this.pos.x, 0.08, this.pos.z);
    rig.root.rotation.y = this.facing + (drag ? Math.sin(t * 9) * 0.06 : 0);
    if (drag) rig.root.rotation.x = -0.12;
    else rig.root.rotation.x = 0;
    // the chains: wall ring to wrist, slack while it walks, taut when dragged
    rig.root.updateMatrixWorld(true);
    const hands = ['handL', 'handR'];
    this.slack = damp(this.slack, drag ? 0.02 : 1, 3, dt);
    for (let i = 0; i < 2; i++) {
      const hp = rig.parts[hands[i]] ?? rig.parts[['foreL', 'foreR'][i]];
      if (!hp) continue;
      hp.getWorldPosition(this.v);
      const a = this.anchors[i];
      const L = a.distanceTo(this.v);
      const sag = Math.max(0.02, (3.6 - L) * 0.35) * this.slack + 0.02;
      this.chains[i].update(this.v2.copy(a).divideScalar(1.8), this.v.clone().divideScalar(1.8), sag / 1.8);
    }
  }
}

function band6(): THREE.BufferGeometry {
  // a cage of four bars round the dome
  const parts: number[] = [];
  const g = new THREE.BufferGeometry();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const bar = cbox(0.012, 0.2, 0.012, 0.003);
    bar.translate(Math.cos(a) * 0.095, 0.0, Math.sin(a) * 0.095);
    const p = bar.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) parts.push(p.getX(k), p.getY(k), p.getZ(k));
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(parts, 3));
  g.computeVertexNormals();
  return g;
}
