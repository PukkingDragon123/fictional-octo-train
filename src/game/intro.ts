// The opening of a new contract run: intake, in first person.
//
// A cinematic through the debtor's own eyes, drawn on the renderer's overlay
// stage (src/fp/fp.ts, set built by src/game/introSet.ts) with a perspective
// camera at eye height, still in the low-res pixel look:
//   drag   hauled backwards by the wrists down the processing wing, heels
//          scraping, ceiling tubes sliding away overhead, your mugshot on the
//          monitors, figures behind the glass; the head lolls back and you see
//          the gloves on your wrists
//   throw  swung round and let go: the floor comes up
//   beat   on your back by the drain, arms up, two officers and their batons
//          (hitstop, shake, blood on the lens, the picture doubling and
//          blurring, real bruises and cuts on the body)
//   haul   dragged into the press room: a giant Remittance Press slamming down
//          on what is left of somebody, blood everywhere
//   fit    on your knees, your left arm pulled out, the BAILIFF band bolted
//          through the wrist; look down at it bleed and boot
//   tape   stood up, walked to a door-shaped section of wall taped off in
//          hazard tape, shoved: the wall turns liquid, black surface tension
//          closes round you, you go through
//   land   black, then the Lobby (back to the isometric camera): you get up
//          in front of the Seam, the band shows a signal, and Staff Sergeant
//          Voss (src/game/handler.ts) projects out of it and explains the job
//          (put goods on a press, pull the lever: they go to the other side)
// Then flag 'contract:intake' and bus 'introDone'; the contract takes over.
//
// Shown once per new contract run (src/game/session.ts decides: not for
// loaded saves, co-op clients or free survival). Esc, the fast-forward in the
// corner, or a tap then a tap on it skips at any moment. ?quick skips it,
// ?intro forces it. While it plays the survivor waits, hidden, in the local
// 'reality' zone; nothing that happens there reaches the op log or co-op.
import * as THREE from 'three';
import { G } from './G';
import type { Game, GameSystem } from './game';
import type { Player } from '../entities/player';
import type { Action } from '../core/input';
import type { PickTarget } from './picking';
import { bus } from '../core/events';
import { U } from '../gfx/materials';
import { opLog } from './ops';
import type { Zone, TileObject } from '../world/zone';
import { createItem } from '../items/factory';
import { hasItemDef, itemDef, type BodyPart, type Item } from '../items/item';
import type { InjuryType } from '../survival/body';
import { synth } from '../audio/sounds';
import '../audio/sounds_intro';
import '../audio/sounds_remit';
import '../audio/sounds_press';
import { INTRO_ZONE, type RealityLayout } from '../world/gen/z_reality';
import { seamFaceOf } from '../world/gen/seam_kit';
import { Guard } from './guards';
import { animSupported, fallbackPose, overlay, reachArm, palm, ease, lerp, clamp01 } from './cutPose';
import { readTime, type LineStyle } from './lines';
import { paintMugshot } from '../content/furniture/zp_processing';
import { rigNumber } from '../content/items/prisoner';
import { ModelBuilder } from '../gfx/modelBuilder';
import { createPreviewRig, type HumanRig, type Pose } from '../entities/humanRig';
import { fpGroup, fpClaim, fpRelease, fpCamera } from '../fp/fp';
import { hitstop } from '../gfx/juice';
import { IntroSet, IX, STAGE } from './introSet';
import { worldMaterial } from '../gfx/materials';
import { crtScreen, phosphorText, fontsReady, type CrtScreen } from '../gfx/crt';
import type { SeamFx } from './seam';
import './intro.css';

export { INTRO_ZONE };

type Phase = 'drag' | 'throw' | 'beat' | 'haul' | 'fit' | 'tape' | 'through' | 'land' | 'voss' | 'done';

/** actions that make no sense while being processed */
const BLOCK = new Set<Action>(['scanner', 'map', 'flashlight', 'craft', 'sleep', 'grab', 'hot1', 'hot2', 'hot3', 'hot4', 'hot5', 'inventory', 'attack', 'shove', 'shout', 'interact'] as Action[]);
const DEG = Math.PI / 180;
const noop = () => { /* scripted: the intro drives the survivor */ };
const STAGE_NAME = 'intro';

/** Should a session that is about to start a fresh world play the intro? */
export function introWanted(mode: 'solo' | 'host' | 'client'): boolean {
  if (mode === 'client') return false;
  const q = new URLSearchParams(location.search);
  if (q.has('intro')) return q.get('intro') !== '0';
  return !q.has('quick');
}

/** Start the intro for a brand-new world; it ends with the survivor in the Lobby in front of the Seam. */
export function startIntro(g: Game, p: Player, spawn: [number, number]): Intro {
  const intro = new Intro(g, p, spawn);
  g.addSystem(intro);
  if (import.meta.env.DEV) (window as unknown as { __intro: Intro }).__intro = intro;
  return intro;
}

// ------------------------------------------------------------------ the beating
interface Strike { t: number; who: 0 | 1; kind: 'chop' | 'kick'; part: BodyPart; inj: InjuryType; sev: number; done?: boolean; swung?: boolean }
const STRIKES: Omit<Strike, 'done' | 'swung'>[] = [
  { t: 0.9, who: 0, kind: 'chop', part: 'uarm_l', inj: 'bruise', sev: 0.4 },
  { t: 1.75, who: 1, kind: 'chop', part: 'farm_r', inj: 'bruise', sev: 0.35 },
  { t: 2.55, who: 0, kind: 'chop', part: 'head', inj: 'laceration', sev: 0.16 },
  { t: 3.3, who: 1, kind: 'kick', part: 'torso_l', inj: 'bruise', sev: 0.45 },
  { t: 4.1, who: 0, kind: 'chop', part: 'torso_u', inj: 'bruise', sev: 0.4 },
  { t: 4.85, who: 1, kind: 'chop', part: 'head', inj: 'laceration', sev: 0.12 },
  { t: 5.6, who: 0, kind: 'chop', part: 'thigh_l', inj: 'bruise', sev: 0.4 },
  { t: 6.4, who: 1, kind: 'kick', part: 'torso_l', inj: 'bruise', sev: 0.35 },
];
const BEAT_END = 7.6;
const WARM = ['guard_bark', 'baton_hit', 'body_thud', 'debtor_grunt', 'debtor_scream', 'debtor_gasp', 'remit_pierce', 'remit_chirp', 'bone_crunch', 'seam_ripple', 'seam_through', 'seam_seal',
  'whoosh', 'holo_on', 'press_slam', 'press_crunch', 'press_hiss', 'press_lever', 'press_klaxon', 'ix_heart', 'ix_ring', 'ix_boot', 'ix_liquid', 'intro_land'];

// ------------------------------------------------------------------ your own body, posed for the camera
const P = (o: Record<string, unknown>): Pose => o as Pose;
/** the first-person body's poses (on top of its idle animation) */
function fpPose(name: string, t: number, k = 9): Pose | null {
  const j = Math.exp(-k * 9) * (k < 0.6 ? 1 : 0);
  switch (name) {
    case 'drag': {
      // on the back, hauled head-first by the wrists, shoulders off the floor, chin on the chest
      const sw = Math.sin(t * 5.4), bob = Math.sin(t * 2.7);
      return P({
        bodyPitch: -1.22 + bob * 0.03, bodyY: 0.16, bodyRoll: sw * 0.05,
        uarmL: [-2.9, 0, 0.25], farmL: [-0.1, 0, 0], uarmR: [-2.9, 0, -0.25], farmR: [-0.1, 0, 0],
        chest: [-0.05, 0, 0], neck: [0.3, 0, 0], head: [0.55, 0, 0],
        thighL: [-0.1 - Math.max(0, sw) * 0.12, 0, 0.12], shinL: [0.25 + Math.max(0, sw) * 0.2, 0, 0], footL: [0.55, 0, 0],
        thighR: [-0.18 - Math.max(0, -sw) * 0.12, 0, -0.08], shinR: [0.35 + Math.max(0, -sw) * 0.2, 0, 0], footR: [0.6, 0, 0],
        gripL: 0.4, gripR: 0.4,
      });
    }
    case 'cover': {
      // flat on the back, forearms up over the face, knees pulled up; each blow jolts it
      const tr = Math.sin(t * 31) * 0.03;
      return P({
        bodyPitch: -1.5708, bodyY: 0.15,
        uarmL: [-1.25 - j * 0.3, 0.1, 0.45 + tr], farmL: [-1.75, -0.6, 0], handL: [0.3, 0, 0.4],
        uarmR: [-1.3 - j * 0.3, -0.1, -0.4 - tr], farmR: [-1.7, 0.6, 0], handR: [0.3, 0, -0.4],
        chest: [0.15 + j * 0.2, 0, 0], neck: [0.25, 0, 0], head: [0.2 + j * 0.2, 0, 0],
        thighL: [-1.0 - j * 0.3, 0, 0.12], shinL: [1.5, 0, 0], thighR: [-0.75 - j * 0.3, 0, -0.1], shinR: [1.3, 0, 0],
        gripL: 0.9, gripR: 0.9,
      });
    }
    case 'limp': {
      // the arms have given up: flopped out on the floor, the body jerks with each blow
      return P({
        bodyPitch: -1.5708, bodyY: 0.15, bodyRoll: j * 0.12,
        uarmL: [-0.35, 0, 1.15], farmL: [-0.4, 0, 0], uarmR: [-0.2, 0, -1.0], farmR: [-0.6, 0, 0],
        chest: [j * 0.25, 0, 0], neck: [0.15, 0, 0], head: [0.1 + j * 0.25, 0.3, 0],
        thighL: [-0.6, 0, 0.1], shinL: [0.9, 0, 0], thighR: [-0.1, 0, -0.1], shinR: [0.3, 0, 0],
        gripL: 0.3, gripR: 0.3,
      });
    }
    case 'kneel': {
      const br = Math.sin(t * 3.4) * 0.03;
      return P({
        bodyPitch: 0, bodyY: 0, rootY: -0.5,
        thighL: [-0.15, 0, 0.1], shinL: [1.55, 0, 0], footL: [0.6, 0, 0], thighR: [-0.1, 0, -0.1], shinR: [1.5, 0, 0], footR: [0.6, 0, 0],
        spine: [0.28 + br, 0, 0], chest: [0.15, 0, 0], neck: [0.2, 0, 0], head: [0.35, 0, 0],
        uarmR: [0.05, 0, -0.15], farmR: [-0.3, 0, 0], gripR: 0.6, gripL: 0.3,
      });
    }
    case 'stand': {
      const br = Math.sin(t * 3) * 0.02;
      return P({ bodyPitch: 0, bodyY: 0, spine: [0.16 + br, 0, 0], chest: [0.08, 0, 0], head: [0.25, 0, 0], uarmR: [0.05, 0, -0.12], farmR: [-0.35, 0, 0], uarmL: [0.0, 0, 0.12], farmL: [-0.5, 0, 0] });
    }
  }
  return null;
}

/** the BAILIFF band as bolted on: a chunky 1970s wrist unit. A riveted steel housing on a hinged steel cuff,
 *  a round amber-phosphor CRT the size of a coin, a signal needle in a little window, an amber lamp, the bolt head. */
interface Band { g: THREE.Group; crt: CrtScreen; needle: THREE.Object3D; lamp: THREE.Mesh; lampMat: THREE.MeshBasicMaterial }
function bandMesh(): Band {
  const mb = new ModelBuilder();
  // the cuff round the wrist (hand-local: the arm runs along y), two hinge knuckles, the bolt through it
  mb.cylinder(0, -0.04, 0, 0.05, 0.062, 10, 'metal_grey', { color: 0x8a8e90, caps: true });
  for (const y of [-0.036, 0.012]) mb.cylinder(0, y, 0, 0.053, 0.008, 10, 'metal_dark');
  mb.cylinder(-0.052, -0.02, 0.0, 0.011, 0.024, 6, 'chrome');
  mb.box(-0.06, -0.016, 0, 0.012, 0.016, 0.016, 'metal_brass');
  // the housing on the back of the wrist: steel box, rivets, a hazard-striped tag
  mb.box(0, -0.05, 0.044, 0.078, 0.074, 0.03, 'metal_dark', { color: 0x6a6e70 });
  for (const [x, y] of [[-0.033, -0.046], [0.033, -0.046], [-0.033, 0.019], [0.033, 0.019]]) mb.box(x, y, 0.0595, 0.005, 0.005, 0.003, 'chrome');
  mb.box(0, -0.049, 0.0592, 0.05, 0.007, 0.002, 'zd_hazard');
  // the tube's bezel: black bakelite round a small screen, the needle window, the lamp collar
  mb.box(-0.008, -0.03, 0.0598, 0.044, 0.038, 0.004, 'plastic_black');
  mb.box(0.026, -0.03, 0.0598, 0.016, 0.026, 0.003, 'plastic_black');
  mb.push().translate(0.026, 0.009, 0.06).rotateX(Math.PI / 2); mb.cylinder(0, 0, 0, 0.007, 0.006, 8, 'chrome'); mb.pop();
  const g = new THREE.Group();
  const body = new THREE.Mesh(mb.build(), worldMaterial(STAGE));
  // the screen: a real little tube (curved glass, scanlines, bloom, a power-on collapse), amber phosphor
  const crt = crtScreen(0.036, 0.03, { tint: 0xffc070, res: [128, 104], curvature: 0.3, glow: 1.3, scan: 0.75, noise: 0.05, flicker: 0.6, reflect: 0.8 });
  crt.mesh.position.set(-0.008, -0.011, 0.0622);
  crt.power(false, true);
  // the needle in its window
  const nb = new ModelBuilder(); nb.box(0, 0, 0, 0.0015, 0.018, 0.001, 'white', { color: 0xd02010 });
  const needle = new THREE.Mesh(nb.build(), worldMaterial(STAGE));
  needle.position.set(0.026, -0.042, 0.0618);
  const wb = new ModelBuilder(); wb.box(0.026, -0.042, 0.0615, 0.013, 0.022, 0.0005, 'white', { color: 0xe8dcc0 });
  const win = new THREE.Mesh(wb.build(), worldMaterial(STAGE));
  const lampMat = new THREE.MeshBasicMaterial({ color: 0x3a2008 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 8, 6), lampMat);
  lamp.position.set(0.026, 0.009, 0.066);
  g.add(body, crt.mesh, win, needle, lamp);
  return { g, crt, needle, lamp, lampMat };
}
let fontsOk = false;
void fontsReady().then(() => { fontsOk = true; });
/** what the tube shows: the raster warming up, BAILIFF, then the link and a signal trace */
function drawCrt(c: CrtScreen, t: number, mode: 'boot' | 'link' | 'signal', fill: number) {
  const x = c.ctx, W = c.canvas.width, H = c.canvas.height;
  const A = '#ffb347';
  x.fillStyle = '#090502'; x.fillRect(0, 0, W, H);
  if (mode === 'boot' && t < 0.6) {
    x.fillStyle = '#ffe2b0'; const w = 8 + t * 220; x.fillRect(W / 2 - w / 2, H / 2 - 1, w, 2);
  } else if (mode === 'boot') {
    if (fontsOk) phosphorText(x, 'BAILIFF', W / 2, 20, { size: 22, color: A, align: 'center', glow: 8 });
    if (fontsOk) phosphorText(x, 'REMITTANCE', W / 2, 46, { size: 11, color: '#c88a3a', align: 'center', glow: 4 });
    x.fillStyle = A; x.fillRect(16, 72, (W - 32) * fill, 7);
    x.strokeStyle = '#7a4a1a'; x.strokeRect(15.5, 71.5, W - 31, 8);
  } else {
    if (fontsOk) phosphorText(x, mode === 'signal' ? 'SIGNAL' : 'LINKED', W / 2, 10, { size: 18, color: A, align: 'center', glow: 7 });
    x.strokeStyle = A; x.lineWidth = 2; x.shadowColor = A; x.shadowBlur = 6;
    x.beginPath();
    for (let i = 0; i <= 48; i++) { const px = 10 + i * (W - 20) / 48, py = 66 + Math.sin(i * 0.55 + t * 9) * (mode === 'signal' ? 14 : 3) * (mode === 'signal' ? Math.sin(i * 0.13 + 0.4) : 1); if (i) x.lineTo(px, py); else x.moveTo(px, py); }
    x.stroke(); x.shadowBlur = 0;
    if (mode === 'signal' && Math.sin(t * 7) > 0 && fontsOk) phosphorText(x, 'VOSS', W / 2, 84, { size: 12, color: '#ffe0a0', align: 'center', glow: 5 });
  }
  c.flush();
}

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
const qa = new THREE.Quaternion(), eu = new THREE.Euler(0, 0, 0, 'YXZ');

export class Intro implements GameSystem {
  name = 'intro';
  phase: Phase = 'drag';
  /** seconds in the current phase / since the start */
  t = 0; T = 0;
  L: RealityLayout;
  z: Zone;
  set: IntroSet;
  me: HumanRig;
  A: Guard; B: Guard;
  private fired = new Set<number>();
  private staged = true;
  // the first-person camera: scripted look (yaw, pitch, roll) + a handheld wobble + trauma shake
  private look = { yaw: Math.PI, pitch: -0.3, roll: 0 };
  private goal = { yaw: Math.PI, pitch: -0.3, roll: 0, rate: 3 };
  private trauma = 0;
  private camSave: { fov: number; near: number; far: number } | null = null;
  private eye = new THREE.Vector3();
  private mouse = { x: 0, y: 0 };
  // the body double
  private pose = 'drag'; private poseK = 9; private poseW = 1;
  private bodyAt = new THREE.Vector3(); private bodyYaw = 0;
  private path: { pts: [number, number][]; s: number; len: number; speed: number } | null = null;
  private armL: { p: THREE.Vector3; w: number } | null = null;
  private band: Band | null = null;
  private bandT = -1; private crtT = 0;
  // guards' grips: which of my wrists each one holds
  private gripA = 0; private gripB = 0;
  private strikes: Strike[] = [];
  private beaten = false; private pierced = false; private fitted = false; private sealed = false;
  // world state to restore
  private missions: any = null;
  private missionsAt = -1;
  private offs: (() => void)[] = [];
  private origClick: ((t: PickTarget, b: number) => void) | undefined;
  private origKey: (() => void) | undefined;
  private hiddenLights: THREE.Object3D[] = [];
  private canvas: HTMLCanvasElement;
  // the lobby end
  private seamL: TileObject | null = null;
  private pp: { name: string; t: number; dur: number; anim: boolean } | null = null;
  private vossStarted = false; private vossShort = false;
  private signalled = false;
  // dom
  private root!: HTMLDivElement; private shade!: HTMLDivElement; private flashEl!: HTMLDivElement; private hurtEl!: HTMLDivElement;
  private lidT!: HTMLDivElement; private lidB!: HTMLDivElement; private wrapEl!: HTMLDivElement;
  private skipBtn!: HTMLButtonElement;
  private svgOff!: SVGFEOffsetElement;
  private shadeA = 1; private flashA = 0; private hurtA = 0; private lid = 1; private lidGoal = 1; private lidHit = 0; private wrapA = 0;
  private dbl = 0; private blur = 0; private desat = 0;
  private skipping = -1; private skipHot = 0;
  private touch = false;
  private warmQ = [...WARM];
  private num: string;
  private pack: Item | null = null;
  private heartT = 0;
  private stepT = 0;

  constructor(public g: Game, public p: Player, public spawn: [number, number]) {
    const z = this.z = g.getZone(INTRO_ZONE);
    this.L = z.meta.intro as RealityLayout;
    this.num = (p as unknown as { prisonerNo?: string }).prisonerNo || rigNumber(p.rig);
    (p as unknown as { prisonerNo: string }).prisonerNo = this.num;
    paintMugshot({ skin: p.app.skin, hair: p.app.hair, hairStyle: p.app.hairStyle, number: this.num });
    this.dress();
    // directives wait until the contract starts (no radio chatter in the processing wing)
    const m = g.missions;
    if (m) {
      this.missions = m;
      m.notified?.add?.('blurb:' + INTRO_ZONE);
      this.missionsAt = g.systems.indexOf(m);
      if (this.missionsAt >= 0) g.systems.splice(this.missionsAt, 1);
    }
    // the survivor waits out of sight in the stage zone; the world is not drawn while the stage owns the screen
    const [sx, sy] = this.L.start;
    g.placePlayer(p, INTRO_ZONE, sx, sy, 0);
    this.canvas = g.pr.renderer.domElement;
    // the stage
    const root = fpGroup(STAGE_NAME);
    this.set = new IntroSet(root);
    this.set.onSlam = (d) => this.pressSlam(d);
    this.me = createPreviewRig(p.app, p.computeOutfit());
    (this.me.bones as Record<string, THREE.Object3D>).head.scale.setScalar(0.001);
    root.add(this.me.root);
    this.A = new Guard('A', 3, root);
    this.B = new Guard('B', 7, root);
    this.A.setHeld('baton'); this.B.setHeld('baton');
    this.touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    if (G.handler) G.handler.scripted = true;
    (g as any).touch?.setHidden?.(true);
    document.body.classList.add('noclip-cine');
    this.claimStage();
    this.hookInput();
    this.hookBody();
    this.buildDom();
    g.attract = noop;
    this.startDrag(IX.drag1, 1.32);
    this.placeGuardsForDrag(true);
  }

  /** prisoners don't keep their own clothes: the jumpsuit goes on, everything over it comes off */
  private dress() {
    const p = this.p;
    if (!hasItemDef('prison_jumpsuit')) return;
    let suit = p.allItems().find((i) => i.key === 'prison_jumpsuit');
    if (!suit) { suit = createItem('prison_jumpsuit', undefined, { pristine: true }); suit.cond = 0.62; p.inv.add(suit); }
    for (const [slot, it] of [...p.worn]) {
      const part = itemDef(it.key).clothing?.look?.part;
      if (it !== suit && (part === 'torso' || part === 'legs') && slot !== 'back') p.unwear(it);
    }
    if (!p.isWorn(suit)) p.wear(suit);
    // the issue pack is handed out after processing
    const pack = p.worn.get('back');
    if (pack) { p.removeItem(pack); this.pack = pack; }
    p.outfitDirty = true;
    bus.emit('inventoryChanged', p);
  }

  // ================================================================== the stage
  private claimStage() {
    fpClaim(STAGE_NAME, 100);
    const cam = fpCamera();
    this.camSave = { fov: cam.fov, near: cam.near, far: cam.far };
    cam.fov = 64; cam.near = 0.035; cam.far = 60; cam.updateProjectionMatrix();
    // other owners' lights in the overlay scene (the held devices) would flatten the set: off while we own it
    const mine = fpGroup(STAGE_NAME);
    for (const o of this.g.pr.overlayScene.children) if (o !== mine && (o as THREE.Light).isLight && o.visible) { o.visible = false; this.hiddenLights.push(o); }
    this.g.pr.scene.visible = false;
  }
  private releaseStage() {
    if (!this.staged) return;
    this.staged = false;
    fpRelease(STAGE_NAME);
    const cam = fpCamera();
    if (this.camSave) { cam.fov = this.camSave.fov; cam.near = this.camSave.near; cam.far = this.camSave.far; cam.position.set(0, 0, 0); cam.quaternion.identity(); cam.updateProjectionMatrix(); }
    for (const o of this.hiddenLights.splice(0)) o.visible = true;
    this.g.pr.scene.visible = true;
    this.A.dispose(); this.B.dispose();
    this.me.root.removeFromParent();
    this.me.dispose();
    this.band = null;
    this.set.dispose();
    this.canvas.style.filter = '';
    G.audio?.positionalLoop?.('ix_drag', null); G.audio?.positionalLoop?.('ix_fluoro', null); G.audio?.positionalLoop?.('ix_drone', null);
  }

  // ================================================================== hooks
  private hookInput() {
    const g = this.g, inp = g.input as any;
    const orig = inp.hit.bind(inp) as (a: Action) => boolean;
    inp.hit = (a: Action) => {
      if (a === 'pause') {
        const v = orig(a);
        const ui = g.ui;
        if (v && !(ui?.menuEl || ui?.readerEl || ui?.modal || ui?.inventory?.open)) { this.skip(); return false; }
        return v;
      }
      if (this.phase === 'voss' || this.phase === 'done') return orig(a);
      if (BLOCK.has(a)) return false;
      return a === 'camLeft' || a === 'camRight' ? orig(a) : false;
    };
    this.offs.push(() => { delete inp.hit; });
    const ui = g.ui;
    if (ui) {
      this.origClick = ui.onWorldClick; this.origKey = ui.onInteractKey;
      ui.onWorldClick = (t: PickTarget, b: number) => { if (this.phase === 'voss') this.origClick?.(t, b); };
      ui.onInteractKey = () => { if (this.phase === 'voss') this.origKey?.(); };
      this.offs.push(() => { ui.onWorldClick = this.origClick; ui.onInteractKey = this.origKey; });
    }
    // a tap brings the fast-forward up; a tap on it skips
    const tap = (e: PointerEvent) => {
      if (this.phase === 'done' || this.skipBtn.contains(e.target as Node)) return;
      if (this.phase !== 'voss' || e.pointerType !== 'touch') this.hotSkip();
    };
    window.addEventListener('pointerdown', tap, true);
    this.offs.push(() => window.removeEventListener('pointerdown', tap, true));
    const mv = (e: PointerEvent) => { if (e.pointerType === 'mouse') { this.mouse.x = (e.clientX / innerWidth) * 2 - 1; this.mouse.y = (e.clientY / innerHeight) * 2 - 1; } };
    window.addEventListener('pointermove', mv, { passive: true });
    this.offs.push(() => window.removeEventListener('pointermove', mv));
  }

  /** the survivor's own rig in the Lobby: poses on top of the animator (getting up) */
  private hookBody() {
    const p = this.p as any;
    const orig = p.updateVisual.bind(p) as (dt: number) => void;
    p.updateVisual = (dt: number) => {
      orig(dt);
      try {
        const s = this.pp;
        if (s && !s.anim) { s.t += dt; const ps = fallbackPose(s.name, clamp01(s.t / s.dur), this.T); if (ps) overlay(this.p.rig, ps, Math.min(1, s.t * 6)); }
        if (s && s.t >= s.dur + 0.05 && s.name !== 'prone') this.clearPose();
      } catch (e) { console.error('intro pose', e); }
    };
    this.offs.push(() => { delete p.updateVisual; });
  }
  private playPose(name: string, dur = 1) {
    const p = this.p as any;
    const anim = animSupported(name);
    this.pp = { name, t: 0, dur, anim };
    if (anim) { if (typeof p.playAnim === 'function') p.playAnim(name, dur); else { p.actionAnim = name; p.actionT = 0; p.actionDur = dur; } }
  }
  private clearPose() {
    const p = this.p as any;
    if (this.pp?.anim) { p.stopAnim?.(this.pp.name); if (p.actionAnim === this.pp.name) p.actionAnim = ''; }
    this.pp = null;
  }

  // ================================================================== dom
  private buildDom() {
    const root = this.root = document.createElement('div');
    root.className = 'ix-root letterbox' + (this.touch ? ' touch' : '');
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = '') => { const e = document.createElement(tag); e.className = cls; e.innerHTML = html; return e; };
    const vig = el('div', 'ix-vig');
    this.hurtEl = el('div', 'ix-hurt');
    this.wrapEl = el('div', 'ix-wrap');
    this.flashEl = el('div', 'ix-flash');
    this.lidT = el('div', 'ix-lid top'); this.lidB = el('div', 'ix-lid bot');
    this.shade = el('div', 'ix-shade');
    const top = el('div', 'ix-bar top'), bot = el('div', 'ix-bar bot');
    const b = this.skipBtn = el('button', 'ix-skip nc-free-text', '<b>▸▸</b> skip' + (this.touch ? '' : ' <small>esc</small>'));
    b.type = 'button';
    b.setAttribute('aria-label', 'Skip the intro');
    b.addEventListener('click', (e) => { e.stopPropagation(); this.skip(); });
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.addEventListener('mouseenter', () => { G.input.pointerOverUI = true; });
    b.addEventListener('mouseleave', () => { G.input.pointerOverUI = false; });
    // double vision: the picture plus a copy of itself, offset (dx driven per frame)
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ix-svg');
    svg.innerHTML = '<defs><filter id="ix-dbl" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feOffset in="SourceGraphic" dx="0" dy="0" result="o"/><feComposite in="SourceGraphic" in2="o" operator="arithmetic" k1="0" k2="0.58" k3="0.42" k4="0"/></filter></defs>';
    this.svgOff = svg.querySelector('feOffset') as SVGFEOffsetElement;
    root.append(svg, vig, this.hurtEl, this.wrapEl, this.flashEl, this.lidT, this.lidB, this.shade, top, bot, b);
    document.body.appendChild(root);
  }
  private hotSkip() { this.skipHot = 2.6; this.skipBtn.classList.add('hot'); }
  private letterbox(on: boolean) { this.root.classList.toggle('letterbox', on); }
  /** a spoken line: bus 'subtitle' (the speech renderer draws it as free floating text, with a voice) */
  private say(who: string, text: string, style: LineStyle = 'guard', sound = true) {
    bus.emit('subtitle', { who: who === 'self' ? this.p.name : who, text, dur: readTime(text), style, ...(style === 'self' ? { pid: this.p.id } : {}) });
    if (sound && style === 'guard') G.audio?.flat?.('guard_bark', 'sfx', 0.7);
  }
  private paintDom(dt: number) {
    this.shade.style.opacity = String(clamp01(this.shadeA));
    if (this.skipHot > 0) { this.skipHot -= dt; if (this.skipHot <= 0) this.skipBtn.classList.remove('hot'); }
    this.flashA = Math.max(0, this.flashA - dt * 3.2);
    this.flashEl.style.opacity = String(this.flashA);
    this.hurtA = Math.max(0, this.hurtA - dt * 0.9);
    this.hurtEl.style.opacity = String(clamp01(this.hurtA));
    this.lidHit = Math.max(0, this.lidHit - dt * 1.8);
    const lg = Math.max(this.lidGoal, this.lidHit);
    this.lid += (lg - this.lid) * Math.min(1, dt * (lg > this.lid ? 18 : 6));
    const lp = (this.lid * 50).toFixed(2) + '%';
    this.lidT.style.height = lp; this.lidB.style.height = lp;
    this.wrapEl.style.opacity = String(clamp01(this.wrapA));
    this.wrapEl.style.transform = `scale(${(2.4 - this.wrapA * 1.6).toFixed(3)})`;
    // the picture itself: doubling, blur, the colour draining out
    this.dbl = Math.max(0, this.dbl - dt * 0.35);
    this.blur = Math.max(0, this.blur - dt * 0.8);
    const d = this.dbl, bl = this.blur;
    if (this.staged && (d > 0.01 || bl > 0.02 || this.desat > 0.01)) {
      this.svgOff.setAttribute('dx', (Math.sin(this.T * 1.7) * 14 * d + 6 * d).toFixed(1));
      this.svgOff.setAttribute('dy', (Math.sin(this.T * 2.3) * 4 * d).toFixed(1));
      this.canvas.style.filter = `${d > 0.01 ? 'url(#ix-dbl) ' : ''}blur(${(bl * 3).toFixed(2)}px) saturate(${(1 - this.desat * 0.7).toFixed(2)}) contrast(${(1 + d * 0.15).toFixed(2)})`;
    } else if (this.canvas.style.filter) this.canvas.style.filter = '';
  }

  // ================================================================== helpers
  private at(t: number, id: number, fn: () => void) { if (this.t >= t && !this.fired.has(id)) { this.fired.add(id); fn(); } }
  private go(ph: Phase) { this.phase = ph; this.t = 0; this.fired.clear(); }
  private sfx(key: string, vol = 1) { G.audio?.flat?.(key, 'sfx', vol); }
  private aim(yaw: number, pitch: number, roll = 0, rate = 3) { this.goal.yaw = yaw; this.goal.pitch = pitch; this.goal.roll = roll; this.goal.rate = rate; }
  private get seamFx(): SeamFx | null { return (G as unknown as { seamFx?: SeamFx }).seamFx ?? null; }
  private wrist(side: 'L' | 'R', out: THREE.Vector3) { return palm(this.me, side, out); }

  /** a blow, a slam, a bolt: freeze a beat, shake the head, flash, blood on the lens */
  private hit(power: number, side = 0, flash = 0.5) {
    hitstop(50 + power * 70);
    this.trauma = Math.min(1.2, this.trauma + power);
    this.flashA = Math.max(this.flashA, flash);
    this.hurtA = Math.min(1.2, this.hurtA + power * 0.8);
    this.dbl = Math.min(1, this.dbl + power * 0.55);
    this.blur = Math.min(1.2, this.blur + power * 0.6);
    this.desat = Math.min(0.8, this.desat + power * 0.08);
    if ((G.sandbox.gore ?? 2) > 0) G.gore?.lens?.splash?.(0.35 + power * 0.5, side);
  }

  // ================================================================== the body double and the guards
  private startDrag(pts: [number, number][], speed: number) {
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    this.path = { pts, s: 0, len, speed };
    this.pose = 'drag'; this.bodyYaw = 0;
    this.bodyAt.set(pts[0][0], 0, pts[0][1]);
    G.audio?.positionalLoop?.('ix_drag', 'drag_scrape', this.p.x, this.p.z, 0.7);
  }
  /** a point along the drag path; the body's root (its feet) trails the head by ~1.5 m */
  private along(s: number, out: THREE.Vector3) {
    const pts = this.path!.pts;
    let rem = s;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
      const l = Math.hypot(bx - ax, bz - az);
      if (rem <= l || i === pts.length - 1) { const k = clamp01(rem / (l || 1)); return out.set(ax + (bx - ax) * k, 0, az + (bz - az) * k); }
      rem -= l;
    }
    return out.set(pts[pts.length - 1][0], 0, pts[pts.length - 1][1]);
  }
  private updDrag(dt: number): boolean {
    const P2 = this.path;
    if (!P2) return true;
    // the officers pull in tugs: two steps, a heave
    const tug = 0.75 + 0.45 * Math.max(0, Math.sin(this.T * Math.PI * 1.9));
    P2.s = Math.min(P2.len, P2.s + P2.speed * tug * dt);
    this.along(P2.s, this.bodyAt);
    this.stepT -= dt;
    if (this.stepT <= 0) { this.stepT = 0.52; this.sfx('ix_boot', 0.35); this.trauma = Math.max(this.trauma, 0.08); }
    G.audio?.positionalLoop?.('ix_drag', 'drag_scrape', this.p.x, this.p.z, 0.45 + tug * 0.35, 0.9 + tug * 0.2);
    return P2.s >= P2.len - 0.01;
  }
  /** the officers walk ahead, each with one of my wrists */
  private placeGuardsForDrag(snap = false, dt = 0.016) {
    const head = this.me.j.head.getWorldPosition(v1);
    for (const [gd, side] of [[this.A, 1], [this.B, -1]] as [Guard, number][]) {
      const tx = head.x + side * 0.42, tz = head.z - 0.85;
      if (snap) { gd.x = tx; gd.z = tz; gd.facing = -Math.PI / 2; }
      else { gd.walkTo(tx, tz, 3, dt, 0.03, false); gd.facing += (((-Math.PI / 2 - gd.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 6); }
    }
  }

  /** pose and place my own body, then the officers' hands on it */
  private updBody(dt: number) {
    const me = this.me, A = this.A, B = this.B;
    me.root.position.copy(this.bodyAt);
    me.root.rotation.y = this.bodyYaw;
    me.animate(dt, { speed: 0, stance: 'stand', full: '', action: '' as never, actionT: 0, actionDur: 1, twoHanded: false, limp: 0, tired: 0.6, panic: 0.8, cold: 0, aimPitch: 0, holdingLight: false, holding: false, lookYaw: 0, fidget: false });
    this.poseK += dt;
    const ps = fpPose(this.pose, this.T, this.poseK);
    if (ps) overlay(me, ps, this.poseW);
    me.root.updateMatrixWorld(true);
    if (this.armL) { reachArm(me, 'L', this.armL.p, this.armL.w, v4.set(0.6, -1, 0.1)); me.root.updateMatrixWorld(true); }
    // the officers' grips
    if (this.gripA > 0.01) A.reachR = { p: this.wrist('L', A.reachR?.p ?? new THREE.Vector3()), w: this.gripA, pole: POLE_A }; else if (A.reachR) A.reachR = null;
    if (this.gripB > 0.01) B.reachL = { p: this.wrist('R', B.reachL?.p ?? new THREE.Vector3()), w: this.gripB, pole: POLE_B }; else B.reachL = null;
    A.update(dt); B.update(dt);
    // the band on the wrist (and its little screen)
    if (this.band) this.updBand(dt);
  }

  // ================================================================== the camera
  private updCamera(dt: number) {
    const cam = fpCamera();
    const head = this.me.j.head;
    head.getWorldPosition(this.eye);
    head.getWorldQuaternion(qa);
    this.eye.add(v2.set(0, 0.07, 0.085).applyQuaternion(qa));
    const L = this.look, Gl = this.goal;
    const k = Math.min(1, dt * Gl.rate);
    L.yaw += wrapA(Gl.yaw - L.yaw) * k; L.pitch += (Gl.pitch - L.pitch) * k; L.roll += (Gl.roll - L.roll) * k;
    // handheld: breathing, the pulse, a slow drift; trauma shake on top (squared)
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma, t = this.T;
    const n = (f: number, o: number) => Math.sin(t * f + o) * 0.6 + Math.sin(t * f * 2.31 + o * 1.7) * 0.4;
    const mx = this.touch ? 0 : this.mouse.x, my = this.touch ? 0 : this.mouse.y;
    eu.set(
      L.pitch + n(1.3, 1) * 0.012 + n(17, 2) * s * 0.09 - my * 0.1,
      L.yaw + n(0.9, 3) * 0.015 + n(15, 4) * s * 0.11 - mx * 0.16,
      L.roll + n(0.7, 5) * 0.01 + n(19, 6) * s * 0.08, 'YXZ');
    cam.quaternion.setFromEuler(eu);
    cam.position.copy(this.eye);
    cam.position.y += n(13, 7) * s * 0.02;
    cam.updateMatrixWorld(true);
  }

  // ================================================================== the band (first person)
  private fitBandMesh() {
    if (this.band) return;
    const b = this.band = bandMesh();
    b.g.position.set(0, 0.075, 0);
    this.me.j.handL.add(b.g);
    this.bandT = 0;
  }
  private updBand(dt: number) {
    const b = this.band!;
    this.bandT += dt;
    const t = this.bandT;
    // repaint the tube a dozen times a second (it is a CRT, not a phone)
    this.crtT -= dt;
    if (t > 0.05 && b.crt.mat.crt.target === 0) b.crt.power(true);
    if (this.crtT <= 0) { this.crtT = 0.06; drawCrt(b.crt, t, t < 2.2 ? 'boot' : this.signalled ? 'signal' : 'link', clamp01((t - 0.9) / 1.2)); }
    // the needle twitches on the boot, swings hard on a signal; the lamp blinks
    const want = t < 0.6 ? Math.sin(t * 30) * 0.5 : t < 2.2 ? -0.6 + (t - 0.6) * 0.5 : this.signalled ? 0.7 + Math.sin(t * 9) * 0.15 : 0.1 + Math.sin(t * 2) * 0.05;
    b.needle.rotation.z += (want - b.needle.rotation.z) * Math.min(1, dt * 10);
    const lit = t > 0.6 && (this.signalled ? Math.sin(t * 9) > 0 : t < 2.2 ? Math.sin(t * 16) > 0.4 : Math.sin(t * 1.5) > 0.9);
    b.lampMat.color.setHex(lit ? 0xffb040 : 0x3a2008);
  }

  // ================================================================== the script
  update(dt: number) {
    this.t += dt; this.T += dt;
    if (this.phase === 'done') return;
    if (this.warmQ.length && this.T > 0.2) synth(this.warmQ.shift()!);
    if (this.skipping >= 0) {
      this.skipping += dt;
      this.shadeA = Math.max(this.shadeA, this.skipping / 0.3);
      if (this.skipping >= 0.35) { this.skipping = -1; this.toEnd(); }
      this.paintDom(dt);
      return;
    }
    const p = this.p;
    p.vx *= 0.8; p.vz *= 0.8;
    switch (this.phase) {
      case 'drag': this.updDragPhase(dt); break;
      case 'throw': this.updThrow(dt); break;
      case 'beat': this.updBeat(dt); break;
      case 'haul': this.updHaul(dt); break;
      case 'fit': this.updFit(dt); break;
      case 'tape': this.updTape(dt); break;
      case 'through': this.updThrough(dt); break;
      case 'land': this.updLand(dt); break;
      case 'voss': this.updVoss(dt); break;
    }
    if (this.staged) {
      this.updBody(dt);
      this.set.update(dt, this.eye);
      this.updCamera(dt);
      // your heart, louder the worse it gets
      this.heartT -= dt;
      if (this.heartT <= 0 && this.phase !== 'drag') { this.heartT = 0.62 - Math.min(0.25, this.hurtA * 0.2); this.sfx('ix_heart', 0.25 + this.hurtA * 0.3); }
    }
    this.paintDom(dt);
  }

  // ------------------------------------------------------------------ 1. the wing
  private updDragPhase(dt: number) {
    const t = this.t;
    this.at(0.1, 1, () => { this.skipBtn.classList.add('on'); G.audio?.positionalLoop?.('ix_fluoro', 'ix_fluoro', this.p.x, this.p.z, 0.4); });
    this.at(0.7, 2, () => { this.lidGoal = 0.35; });
    this.at(1.0, 3, () => { this.lidGoal = 0.9; });
    this.at(1.35, 4, () => { this.lidGoal = 0.12; });
    this.shadeA = Math.max(0, 1 - Math.max(0, t - 0.5) / 1.4);
    this.at(2.4, 6, () => this.say('OFFICER', 'Keep its feet off the paint.'));
    this.at(5.4, 7, () => this.say('OFFICER', 'This one\'s light.'));
    this.at(8.9, 8, () => this.say('self', '...where are you taking me...', 'self'));
    this.at(10.6, 9, () => this.say('OFFICER', 'Orientation.'));
    // where the head looks: down the body at the heels, over at the glass, back up at the gloves on your wrists
    if (t < 3.4) this.aim(Math.PI + Math.sin(t * 0.8) * 0.06, 0.2, Math.sin(t * 1.3) * 0.05, 2);
    else if (t < 5.6) this.aim(Math.PI - 0.95, -0.12, -0.1, 1.6);
    else if (t < 7.0) this.aim(Math.PI + 0.1, -0.38, 0.06, 2);
    else if (t < 8.8) this.aim(0.15, 0.95, 0.0, 1.8);
    else this.aim(Math.PI - 0.2, -0.4, 0.05, 2.2);
    this.gripA = this.gripB = 1;
    this.lidGoal = t > 8.8 && t < 9.6 ? 0.55 : this.lidGoal;
    if (t > 9.6 && t < 9.7) this.lidGoal = 0.1;
    const done = this.updDrag(dt);
    this.placeGuardsForDrag(false, dt);
    if (done || t > 13) this.startThrow();
  }

  // ------------------------------------------------------------------ 2. swung round, let go
  private throwFrom = new THREE.Vector3();
  private startThrow() {
    this.go('throw');
    this.say('OFFICER', 'Down.');
    this.throwFrom.copy(this.bodyAt);
    G.audio?.positionalLoop?.('ix_drag', null);
    this.sfx('whoosh', 0.7);
  }
  private updThrow(dt: number) {
    const t = this.t, A = this.A, B = this.B;
    // they heave and let go: the body sails a metre, the view tumbles
    const k = clamp01(t / 0.55);
    if (k < 1) {
      this.gripA = this.gripB = Math.max(0, 1 - k * 2);
      this.bodyAt.set(lerp(this.throwFrom.x, IX.drain[0] + 0.1, ease(k)), 0, lerp(this.throwFrom.z, IX.drain[1] + 1.3, ease(k)));
      this.aim(Math.PI + k * 2.4, 0.4 + k * 0.6, k * 1.4, 9);
    }
    this.at(0.55, 1, () => {
      this.pose = 'cover'; this.poseK = 9;
      this.bodyYaw = 0;
      this.sfx('body_thud', 1); this.sfx('debtor_gasp', 0.9);
      this.hit(0.9, 0, 0.25);
      this.lidHit = 0.9;
      this.look.roll = 0.5;
      this.aim(Math.PI, 1.18, 0.3, 6);
    });
    this.at(0.95, 2, () => { this.lidGoal = 0.1; this.aim(Math.PI, 1.2, 0.05, 2); });
    // the officers step round to either side
    const bx = this.bodyAt.x, bz = this.bodyAt.z - 1.0;
    if (A.walkTo(bx - 0.78, bz + 0.1, 2.2, dt, 0.05)) A.turnTo(bx, bz, dt, 10);
    if (B.walkTo(bx + 0.8, bz - 0.25, 2.2, dt, 0.05)) B.turnTo(bx, bz, dt, 10);
    if (t > 1.5) this.startBeat();
  }

  // ------------------------------------------------------------------ 3. the beating
  private startBeat() {
    this.go('beat');
    this.strikes = STRIKES.map((s) => ({ ...s }));
  }
  private updBeat(dt: number) {
    const A = this.A, B = this.B, t = this.t;
    const bx = this.bodyAt.x, bz = this.bodyAt.z - 1.0;
    if (A.walkTo(bx - 0.78, bz + 0.1, 2.2, dt, 0.05)) A.turnTo(bx, bz, dt, 10);
    if (B.walkTo(bx + 0.8, bz - 0.25, 2.2, dt, 0.05)) B.turnTo(bx, bz, dt, 10);
    let next: Strike | null = null;
    for (const s of this.strikes) {
      const gd = s.who === 0 ? A : B;
      if (!s.swung && t >= s.t - 0.42) {
        s.swung = true;
        if (s.kind === 'kick') gd.play('kick_low', 0.7);
        else { gd.play('baton_chop', 0.72); gd.act!.k = 0; }
        this.sfx('whoosh', 0.45);
      }
      if (gd.act && gd.act.name === 'baton_chop') gd.act.k = clamp01(gd.act.t / gd.act.dur);
      if (!s.done && t >= s.t) { s.done = true; this.impact(s); }
      if (!s.done && !next) next = s;
    }
    // the head turns to the one about to swing, flinches away on the blow
    if (next) {
      const gd = next.who === 0 ? A : B;
      const dx = gd.x - this.eye.x, dz = gd.z - this.eye.z;
      const yawTo = Math.atan2(-dx, -dz);
      this.aim(lerp(Math.PI, yawTo, 0.45), 0.95, next.who === 0 ? 0.18 : -0.18, 3);
    } else this.aim(Math.PI + 0.3, 1.1, 0.25, 1.2);
    if (t > 4.4 && this.pose === 'cover') { this.pose = 'limp'; this.poseK = 9; }
    this.at(0.35, 1, () => this.say('OFFICER', 'This is the orientation.'));
    this.at(2.9, 2, () => this.say('OFFICER', 'Nothing personal. It\'s itemised.'));
    this.at(4.3, 3, () => this.say('self', 'Stop - please - STOP-', 'self'));
    this.at(6.9, 4, () => this.say('OFFICER', 'Arms. Get its arms.'));
    this.lidGoal = 0.08 + this.trauma * 0.12;
    if (t > BEAT_END) { this.beaten = true; this.startHaul(); }
  }
  /** a blow lands: sound, blood in the air and on the lens, a wound that stays */
  private impact(s: Strike) {
    const p = this.p, b = p.body, gd = s.who === 0 ? this.A : this.B;
    this.sfx(s.kind === 'kick' ? 'body_thud' : 'baton_hit', 1);
    this.sfx('debtor_grunt', 0.8);
    if (s.part === 'head') { this.sfx('ix_ring', 0.5); this.lidHit = 0.75; }
    const dmg = s.kind === 'kick' ? 9 : 11;
    const inj = b.addInjury(s.part, s.inj, s.sev);
    if (s.inj === 'laceration') inj.bleed = Math.min(inj.bleed, 0.05);
    if (s.inj === 'bruise' && G.sandbox.gore > 0) bus.emit('bloodied', p, s.part, 0.25);
    if (s.inj !== 'bruise') bus.emit('playerHit', p, s.part, 'blunt', { dmg, from: [p.x + 1, p.z], knock: 0.25, by: 'custody' });
    else (p as any).registerHit?.(p.x + 1, p.z, s.part, 0.5);
    // blood from where it landed, flicked up toward the camera
    const at = s.part === 'head' ? this.eye : this.wrist(s.part.endsWith('_r') ? 'R' : 'L', v1);
    const dx = Math.sign(this.eye.x - gd.x) || 1;
    if (G.sandbox.gore > 0) this.set.bleed(at.x, Math.max(0.15, at.y - 0.05), at.z, dx * 0.6, 1.0, 0.2, s.inj === 'laceration' ? 22 : 10, 2.4, s.inj === 'laceration' ? 0.45 : 0.25);
    const power = s.part === 'head' ? 1 : s.kind === 'kick' ? 0.75 : 0.6;
    this.hit(power, dx, s.part === 'head' ? 0.7 : 0.35);
    // the head snaps away from the blow
    this.look.yaw += dx * 0.35; this.look.roll += dx * 0.25; this.look.pitch -= 0.15;
    this.poseK = 0;
  }

  // ------------------------------------------------------------------ 4. into the press room
  private startHaul() {
    this.go('haul');
    this.pose = 'drag'; this.poseK = 9;
    this.startDrag(IX.drag2, 1.25);
    this.set.startPress(3.4);
  }
  private updHaul(dt: number) {
    const t = this.t;
    this.gripA = this.gripB = Math.min(1, t * 3);
    const done = this.updDrag(dt);
    this.placeGuardsForDrag(false, dt);
    // looking back at where you were, then the head rolls toward the noise
    const z = this.eye.z;
    if (z > -16.5) this.aim(Math.PI + 0.05, -0.3, 0.05, 2);
    else {
      const px = IX.press.x, pz = IX.press.z;
      const yawTo = Math.atan2(-(px - this.eye.x), -(pz - this.eye.z));
      this.aim(yawTo, 0.05, -0.12, 1.8);
    }
    this.at(1.6, 1, () => this.say('OFFICER', 'Mind the press.'));
    this.at(6.2, 2, () => this.say('self', '...oh god. oh god.', 'self'));
    this.at(7.8, 3, () => this.say('OFFICER', 'That was Tuesday\'s.'));
    this.lidGoal = 0.12;
    if (done && t > 6) this.startFit();
  }
  /** the giant press comes down (called by the set) */
  private pressSlam(d: number) {
    const k = Math.max(0, 1 - d / 12);
    this.sfx('press_slam', 0.5 + k * 0.5);
    this.sfx('press_crunch', 0.3 + k * 0.6);
    setTimeout(() => this.sfx('press_hiss', 0.5 * (0.4 + k)), (CYCLE_RISE) * 1000);
    if (k > 0.05) { hitstop(30 + 60 * k); this.trauma = Math.min(1, this.trauma + k * 0.7); this.dbl = Math.max(this.dbl, k * 0.25); }
    if (k > 0.55 && (G.sandbox.gore ?? 2) > 0) G.gore?.lens?.splash?.(k * 0.5, 1);
  }

  // ------------------------------------------------------------------ 5. the band
  private fitFrom = new THREE.Vector3(); private fitTo = new THREE.Vector3();
  private startFit() {
    this.go('fit');
    this.fitFrom.copy(this.bodyAt);
    this.me.j.head.getWorldPosition(this.fitTo); this.fitTo.y = 0; this.fitTo.x += 0.15;
    G.audio?.positionalLoop?.('ix_drag', null);
    this.say('OFFICER', 'Up. On your knees.');
  }
  private updFit(dt: number) {
    const t = this.t, A = this.A, B = this.B;
    // hauled up onto the knees, turned to face the press
    const up = ease(clamp01(t / 1.2));
    if (t < 1.25) {
      this.pose = up < 0.5 ? 'drag' : 'kneel';
      this.poseW = up < 0.5 ? 1 - up : up;
      this.bodyAt.lerpVectors(this.fitFrom, this.fitTo, up);
      this.bodyYaw = lerp(0, -Math.PI / 2, up);
      this.gripA = this.gripB = 1 - up;
    } else { this.pose = 'kneel'; this.poseW = 1; this.bodyYaw = -Math.PI / 2; }
    this.aim(Math.PI / 2 + 0.6, -0.05, 0, 2.5);
    // A takes the left wrist and pulls the arm out in front; B comes in with the fitting gun
    this.at(1.3, 1, () => { A.setHeld(null); B.setHeld('gun'); this.say('OFFICER', 'Left arm.'); });
    const eye = this.eye, fwdX = -1, fwdZ = 0;
    const tgt = v2.set(eye.x + fwdX * 0.46, eye.y - 0.32, eye.z + fwdZ * 0.46 + 0.1);
    if (t > 1.4) {
      const w = ease(clamp01((t - 1.4) / 0.7)) * (t > 7.2 ? Math.max(0, 1 - (t - 7.2) / 0.6) : 1);
      if (!this.armL) this.armL = { p: new THREE.Vector3(), w: 0 };
      this.armL.p.copy(tgt); this.armL.w = w;
      // the arm is held: it shakes in the grip
      this.armL.p.x += Math.sin(this.T * 23) * 0.004 * w; this.armL.p.y += Math.sin(this.T * 19) * 0.004 * w;
      this.gripA = w;
      A.walkTo(tgt.x - 0.35, tgt.z + 0.45, 2, dt, 0.04); A.face(tgt.x, tgt.z);
      this.aim(Math.PI / 2 + 0.2, -0.62, 0.05, 2.2);
    } else A.walkTo(eye.x - 0.8, eye.z + 0.6, 2, dt, 0.05);
    if (t > 2.2) {
      const w = ease(clamp01((t - 2.2) / 1.2)) * (t > 4.9 ? Math.max(0, 1 - (t - 4.9) / 0.6) : 1);
      B.walkTo(tgt.x - 0.2, tgt.z - 0.55, 1.6, dt, 0.04); B.face(tgt.x, tgt.z);
      B.reachR = { p: (B.reachR?.p ?? new THREE.Vector3()).copy(this.wrist('L', v3)).add(v4.set(0, 0.07, -0.02)), w, pole: POLE_GUN };
    } else B.walkTo(eye.x - 0.6, eye.z - 1.1, 1.8, dt, 0.05);
    this.at(2.6, 2, () => this.say('OFFICER', 'Hold still. It only goes in once.'));
    this.at(3.9, 3, () => this.say('self', 'no - no no no-', 'self'));
    this.at(4.3, 4, () => this.pierce());
    this.at(5.3, 5, () => { this.sfx('remit_chirp', 0.9); this.say('OFFICER', 'Fitted.'); });
    // look at it: the camera narrows on the wrist
    if (t > 4.6 && t < 7.0) { const cam = fpCamera(); cam.fov += (50 - cam.fov) * Math.min(1, dt * 2); cam.updateProjectionMatrix(); }
    else if (t >= 7.0) { const cam = fpCamera(); cam.fov += (64 - cam.fov) * Math.min(1, dt * 3); cam.updateProjectionMatrix(); }
    this.at(7.1, 6, () => { this.say('OFFICER', 'Up.'); B.setHeld('baton'); });
    if (t > 7.9) { this.armL = null; this.startTape(); }
  }
  /** the band goes through the wrist */
  private pierce() {
    if (this.pierced) return;
    this.pierced = true;
    const p = this.p;
    this.sfx('remit_pierce', 1); this.sfx('bone_crunch', 1);
    setTimeout(() => this.sfx('debtor_scream', 1), 110);
    this.fitBandMesh();
    const w = this.wrist('L', v1);
    if ((G.sandbox.gore ?? 2) > 0) {
      this.set.bleed(w.x, w.y, w.z, 0.1, 0.8, 0.9, 26, 2.8, 0.6);
      this.set.bleed(w.x, w.y, w.z, 0.2, 0.3, -0.9, 16, 2.0, 0.4);
      bus.emit('bloodied', p, 'hand_l', 1); bus.emit('bloodied', p, 'farm_l', 0.7);
    }
    const inj = p.body.addInjury('farm_l', 'deep', 0.2);
    inj.bleed = Math.min(inj.bleed, 0.06);
    p.body.panic = Math.max(p.body.panic, 80);
    bus.emit('playerHit', p, 'hand_l', 'deep', { dmg: 16, from: [p.x - 1, p.z], knock: 0.2, by: 'custody' });
    this.hit(1.1, -1, 1);
    this.trauma = 1.2;
    this.fitBand();
  }
  private fitBand() {
    if (this.fitted) return;
    this.fitted = true;
    const p = this.p;
    const band = G.band as any;
    if (band?.fit) { try { band.fit(p, { silent: true }); } catch (e) { console.warn('band.fit', e); } }
    else if (hasItemDef('bailiff_band') && !p.allItems().some((i) => i.key === 'bailiff_band')) {
      const it = createItem('bailiff_band', undefined, { pristine: true }); p.inv.add(it); p.wear(it); bus.emit('inventoryChanged', p);
    }
  }

  // ------------------------------------------------------------------ 6. the taped wall
  private tapeFrom = new THREE.Vector3();
  private startTape() {
    this.go('tape');
    this.tapeFrom.copy(this.bodyAt);
    this.pose = 'stand'; this.poseW = 0;
    G.audio?.positionalLoop?.('ix_drone', 'seam_drone', this.p.x, this.p.z, 0.2);
  }
  private updTape(dt: number) {
    const t = this.t, A = this.A, B = this.B;
    const { x: tx, z: tz } = IX.tape;
    const stop = new THREE.Vector3(tx, 0, tz + 1.35);
    // stood up and turned to the far wall
    const up = ease(clamp01(t / 1.0));
    this.poseW = up;
    this.bodyYaw = lerp(-Math.PI / 2, -Math.PI, up);
    if (t > 0.6 && t < 4.6) {
      // marched to it, stumbling, a hand in the back
      const k = ease(clamp01((t - 0.6) / 3.8));
      this.bodyAt.set(lerp(this.tapeFrom.x, stop.x, k), 0, lerp(this.tapeFrom.z, stop.z, k));
      this.stepT -= dt;
      if (this.stepT <= 0) { this.stepT = 0.48; this.trauma = Math.max(this.trauma, 0.22); this.sfx('ix_boot', 0.4); }
    }
    const behind = v2.set(this.bodyAt.x + 0.15, 0, this.bodyAt.z + 0.62);
    B.walkTo(behind.x, behind.z, 2.4, dt, 0.04); B.face(this.bodyAt.x, this.bodyAt.z - 2);
    A.walkTo(this.bodyAt.x - 0.95, this.bodyAt.z + 0.1, 2.4, dt, 0.04);
    if (t > 3.0) A.face(tx, tz); else A.face(this.bodyAt.x, this.bodyAt.z);
    this.aim(0.0 + Math.sin(t * 0.9) * 0.04, t < 3.6 ? -0.12 : 0.02, Math.sin(t * 1.7) * 0.04, 2);
    G.audio?.positionalLoop?.('ix_drone', 'seam_drone', this.p.x, this.p.z, Math.min(0.75, 0.2 + t * 0.12));
    this.at(1.6, 1, () => this.say('OFFICER', 'Through the door, debtor.'));
    this.at(3.4, 2, () => this.say('self', '...that\'s a wall.', 'self'));
    this.at(4.4, 3, () => { this.say('OFFICER', 'Not from the other side.'); this.set.liqU.uLiq.value = 0.06; this.set.liqU.uHit.value.set(0.05, 0.1); this.set.liqU.uHitT.value = 0; this.sfx('seam_ripple', 0.6); });
    this.at(5.5, 4, () => { B.play('shove2', 0.8); this.sfx('whoosh', 0.8); });
    this.set.liqU.uHitT.value += dt;
    if (t > 5.75) this.startThrough();
  }

  // ------------------------------------------------------------------ 7. through
  private startThrough() {
    this.go('through');
  }
  private updThrough(dt: number) {
    const t = this.t, u = this.set.liqU;
    const { x: tx, z: tz } = IX.tape;
    // shoved: the body pitches forward into it
    const k = clamp01(t / 0.32);
    const z0 = tz + 1.35;
    if (t < 0.32) { this.bodyAt.z = lerp(z0, tz + 0.2, k * k); this.aim(0.02, -0.05, 0.12, 8); }
    this.at(0.3, 1, () => {
      // contact: the wall turns
      const ex = this.eye.x - tx, ey = this.eye.y - IX.tape.h / 2;
      u.uHit.value.set(ex, ey); u.uHitT.value = 0;
      this.sfx('ix_liquid', 1); this.sfx('seam_ripple', 0.9);
      hitstop(70);
      this.trauma = Math.max(this.trauma, 0.6);
      this.flashA = 0.15;
    });
    if (t > 0.3) {
      u.uHitT.value += dt;
      u.uLiq.value = Math.min(1, 0.06 + (t - 0.3) * 1.6);
      // through it: the body keeps falling forward, the membrane dents round the face and closes
      const d = ease(clamp01((t - 0.35) / 1.2));
      this.bodyAt.z = lerp(tz + 0.2, tz - 0.3, d);
      const camLocal = fpCamera().position;
      const depth = Math.max(0, (tz + 0.02) - camLocal.z + 0.07);
      u.uPush.value.set(camLocal.x - tx, camLocal.y - IX.tape.h / 2, Math.min(0.9, depth));
      this.wrapA = clamp01((t - 0.45) / 0.8);
      u.uDark.value = clamp01((t - 0.9) / 0.6);
      this.aim(0.0, -0.08, 0.25 * d, 2);
    }
    this.at(0.7, 2, () => this.sfx('seam_through', 1));
    if (t > 1.25) this.shadeA = Math.min(1, (t - 1.25) / 0.25);
    this.at(1.6, 3, () => { this.toLobby(); });
    if (t > 3.0) this.startLand();
  }

  // ------------------------------------------------------------------ 8. the Lobby
  private lobbySeam(z: Zone): TileObject | null {
    for (const o of z.objects.values()) if (o.key === 'seam_door') return o;
    return null;
  }
  /** off the stage, into the world: the survivor is lying in front of the Lobby's Seam */
  private toLobby() {
    const g = this.g, p = this.p;
    this.releaseStage();
    this.wrapA = 0;
    const lz = g.getZone('lobby');
    this.seamL = this.lobbySeam(lz);
    let x = this.spawn[0], y = this.spawn[1], face = Math.PI * 0.75;
    if (this.seamL) {
      const f = seamFaceOf(this.seamL);
      [x, y] = g.nearestWalkable(lz, Math.floor(f.x + f.nx * 1.6), Math.floor(f.z + f.nz * 1.6));
      face = Math.atan2(f.nz, f.nx);
    }
    g.placePlayer(p, 'lobby', x, y, face);
    g.net?.onLocalTravel?.('lobby');
    if (g.view) g.view.vis.enabled = true;
    p.vx = p.vz = 0; p.speed = 0;
    this.returnPack();
    g.camera.setPhotoRig(45 * DEG, g.camera.rig.pitchGoal);
    g.pr.yaw = 45 * DEG;
    g.camera.pushIn(0.55, 0.05, -4);
    this.playPose('prone', 9);
  }
  private startLand() {
    this.go('land');
    this.letterbox(false);
    this.root.classList.add('world');
    this.skipBtn.classList.add('on');
    this.g.camera.pushIn(0, 3.2);
    if (this.seamL) this.seamFx?.ripple(this.seamL, undefined, 1.6, false);
    this.sfx('intro_land', 0.8);
  }
  private updLand(dt: number) {
    const t = this.t;
    this.shadeA = Math.max(0, 1 - t / 1.4);
    this.lidGoal = t < 0.5 ? 0.6 : 0;
    this.at(0.3, 1, () => { this.sfx('debtor_gasp', 0.8); });
    this.at(0.9, 2, () => { this.clearPose(); this.playPose('get_up', 1.6); });
    this.at(1.6, 3, () => this.say('self', '...where...', 'self'));
    this.at(2.4, 4, () => this.signal());
    this.at(3.4, 5, () => { if (this.seamL && !this.sealed) { this.sealed = true; this.seamFx?.setState(this.seamL, true); this.sfx('seam_seal', 0.8); } });
    if (t > 3.2) this.startVoss();
    void dt;
  }
  /** the band shows a signal: the handler is calling */
  private signal() {
    if (this.signalled) return;
    this.signalled = true;
    this.sfx('remit_chirp', 0.9);
    try { (G.holo as any)?.boot?.(); } catch (e) { console.warn('holo.boot', e); }
    try { (G as any).watch?.signal?.({ from: 'VOSS', kind: 'handler', text: 'INCOMING' }); } catch (e) { console.warn('watch.signal', e); }
    bus.emit('watchSignal', { from: 'VOSS', kind: 'handler', text: 'INCOMING' });
  }

  // ------------------------------------------------------------------ 9. Voss
  private startVoss() {
    this.go('voss');
    const p = this.p;
    this.letterbox(false);
    (this.g as any).touch?.setHidden?.(false);
    document.body.classList.remove('noclip-cine');
    this.g.attract = null;
    p.body.panic = Math.min(p.body.panic, 45);
    this.vossLines(false);
  }
  private vossLines(short: boolean) {
    if (this.vossStarted) return;
    this.vossStarted = true; this.vossShort = short;
    const h = G.handler as any;
    if (!h) return;
    h.scripted = true;
    h.appear?.('band');
    const D = G.debt as any;
    const owed = Math.round(D?.on && D.remaining > 0 ? D.remaining : Number(G.sandbox.debt) || 25000);
    const owedS = owed.toLocaleString('en-GB');
    const press = h.nearestHopper?.();
    if (short) {
      h.say(`You slept through orientation, ${this.num}. Bold. You owe the Institute ${owedS} scrip. Find what's worth something, put it on a press, pull the lever. It goes to the other side. Don't try to leave.`, { gesture: 'jab_finger' });
      if (press) h.guide?.(press);
      return;
    }
    h.say(`Signal's good. Debtor ${this.num}, this is Staff Sergeant Voss, Remittance Programme. I'm your handler. You're my problem.`, { gesture: 'salute2' });
    h.say(`You owe the Institute ${owedS} scrip. Interest compounds. So does my patience. That one's a lie.`);
    h.say('Your job is transport. This place is full of goods nobody is using. You find them, you get them to the other side.', { gesture: 'dismiss' });
    h.say('There\'s a press down the hall. Put the goods on the plate, step off, pull the lever. The ram comes down and they go through. You get credited.', press ? { point: press } : {});
    h.say('Anything still on that plate when it comes down goes through too. Including you. And debtor? Don\'t try to leave. The band takes it personally.', { gesture: 'jab_finger' });
  }
  private updVoss(dt: number) {
    const h = G.handler as any, t = this.t;
    this.shadeA = Math.max(0, this.shadeA - dt * 2);
    if (h && t > 13 && !this.fired.has(1)) {
      // the press line: light the way
      const hp = h.nearestHopper?.();
      this.fired.add(1);
      if (hp) h.guide?.(hp);
    }
    const busy = !!h?.busy;
    if ((!busy && t > (this.vossShort ? 2 : 4)) || t > 60) this.finish();
  }

  // ================================================================== skipping & cleanup
  skip() {
    if (this.phase === 'done' || this.skipping >= 0) return;
    if (this.phase === 'voss') { (G.handler as any)?.hush?.(); this.finish(); return; }
    this.skipping = 0;
    this.skipBtn.classList.remove('on', 'hot');
    G.audio?.flat?.('static_burst', 'sfx', 0.3);
  }

  /** jump to where the script ends: in the Lobby, beaten, banded, the Seam shut, Voss talking */
  private toEnd() {
    const p = this.p;
    if (this.staged || p.zoneKey !== 'lobby') this.toLobby();
    this.clearPose();
    p.full = '';
    p.vx = p.vz = 0; p.speed = 0;
    if (!this.beaten) {
      this.beaten = true;
      for (const s of STRIKES) { const inj = p.body.addInjury(s.part, s.inj, s.sev * 0.8); if (s.inj === 'laceration') inj.bleed = Math.min(inj.bleed, 0.05); }
      p.body.panic = Math.max(p.body.panic, 60);
    }
    if (!this.pierced) { this.pierced = true; const inj = p.body.addInjury('farm_l', 'deep', 0.22); inj.bleed = Math.min(inj.bleed, 0.05); }
    this.fitBand();
    this.returnPack();
    if (this.seamL && !this.sealed) { this.sealed = true; this.seamFx?.setState(this.seamL, true); }
    const g = this.g;
    g.camera.pushIn(0, 0.5);
    g.pr.setZoomLevel(g.camZoom);
    this.letterbox(false);
    this.lidGoal = 0; this.lid = 0; this.wrapA = 0; this.dbl = 0; this.blur = 0; this.desat = 0;
    this.signal();
    this.go('voss');
    (g as any).touch?.setHidden?.(false);
    document.body.classList.remove('noclip-cine');
    g.attract = null;
    this.vossLines(true);
  }

  private returnPack() {
    const p = this.p, k = this.pack;
    this.pack = null;
    if (!k) return;
    if (!p.allItems().includes(k)) p.inv.add(k);
    if (!p.worn.get('back')) p.wear(k);
    bus.emit('inventoryChanged', p);
  }

  finish() {
    if (this.phase === 'done') return;
    const g = this.g, p = this.p;
    if (p.zoneKey === INTRO_ZONE || this.staged) this.toEnd();
    this.phase = 'done';
    (g as any).touch?.setHidden?.(false);
    document.body.classList.remove('noclip-cine');
    g.attract = null;
    this.clearPose(); p.full = '';
    this.returnPack();
    p.y = g.getZone(p.zoneKey).heightAt(p.tileX(), p.tileY());
    for (const off of this.offs.splice(0)) { try { off(); } catch (e) { console.error(e); } }
    G.input.pointerOverUI = false;
    const fx = g.pr.fx;
    fx.corruptFlash = 0; fx.glitch = 0; fx.dream = 0;
    U.uCollapse.value = 0;
    if (this.seamL && !this.sealed) { this.sealed = true; this.seamFx?.setState(this.seamL, true); }
    this.canvas.style.filter = '';
    this.root.remove();
    // nothing that happened on the stage belongs in the world's history or in co-op
    for (let i = opLog.length - 1; i >= 0; i--) {
      const r = opLog[i];
      if (r.includes(`"z":"${INTRO_ZONE}"`) || r.includes(`:${INTRO_ZONE}"`) || r.includes(`:${INTRO_ZONE}:`)) opLog.splice(i, 1);
    }
    const m = this.missions;
    if (m?.flags) for (const f of [...m.flags] as string[]) if (f.endsWith(':' + INTRO_ZONE) || f.includes(':' + INTRO_ZONE + ':')) m.flags.delete(f);
    // the systems list is being iterated right now: hand the directives back (and drop ourselves) after this frame
    queueMicrotask(() => {
      const i = g.systems.indexOf(this);
      if (i >= 0) g.systems.splice(i, 1);
      if (m && !g.systems.includes(m)) g.systems.splice(Math.max(0, Math.min(this.missionsAt, g.systems.length)), 0, m);
      if (g.view?.zone.key !== INTRO_ZONE) g.zones.delete(INTRO_ZONE);
    });
    m?.set?.('contract:intake');
    const h = G.handler as any;
    if (h) { h.scripted = false; h.begin?.(); }
    bus.emit('introDone', p);
    if (import.meta.env.DEV) (window as unknown as { __intro: Intro | null }).__intro = null;
  }

  // ================================================================== dev: jump around the script (screenshots)
  debugJump(phase: Phase, t = 0) {
    const run = (n: number) => { for (let i = 0; i < n; i++) this.update(0.05); };
    this.shadeA = 0; this.lidGoal = 0; this.lid = 0;
    const at = (pts: [number, number][], end = false) => { this.startDrag(pts, 1.3); if (end) { this.path!.s = this.path!.len; this.along(this.path!.s, this.bodyAt); } this.updBody(0.016); this.placeGuardsForDrag(true); };
    switch (phase) {
      case 'drag': break;
      case 'throw': at(IX.drag1, true); this.startThrow(); break;
      case 'beat': at(IX.drag1, true); this.startThrow(); run(31); break;
      case 'haul': at(IX.drag1); this.beaten = true; this.startHaul(); break;
      case 'fit': at(IX.drag2, true); this.beaten = true; this.set.startPress(0.5); this.startFit(); break;
      case 'tape': this.debugJump('fit', 8); return void (t && run(Math.ceil(t / 0.05)));
      case 'through': this.debugJump('tape', 5.8); return void (t && run(Math.ceil(t / 0.05)));
      case 'land': this.debugJump('through', 1.7); run(30); return void (t && run(Math.ceil(t / 0.05)));
      case 'voss': this.toEnd(); break;
      case 'done': this.finish(); return;
    }
    if (t) run(Math.ceil(t / 0.05));
  }
}
const CYCLE_RISE = 0.62;
const POLE_A = new THREE.Vector3(0.3, -1, 0.4), POLE_B = new THREE.Vector3(-0.3, -1, 0.4), POLE_GUN = new THREE.Vector3(0.4, -1, -0.5);
const wrapA = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
