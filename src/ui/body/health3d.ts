// THE HEALTH CHECK (round 20). Click the body console's front (top left) and
// the unit stands on the Institute's examination turntable in a bright tiled
// bay: its own HumanRig body stripped to its underwear, lit like an intake
// room, with every injury on the skin where it is (bruises, split knuckles,
// cuts, the bandages and splints already on it: the rig's own paint pipeline,
// src/entities/gg/paint.ts) and fresh blood dripping off whatever is still
// bleeding onto the rubber mat. Drag anywhere to turn the turntable (it coasts);
// hover a wound and only then does its name float up beside it. Click a wound
// and the instrument trolley beside the unit sets out what could treat it (the
// body console's own treatments, ./treat.ts, and its tool models, ./models.ts;
// what you do not carry stands there as a glass ghost): click one, or pick it
// up and drop it on the wound, and the unit does it (the medical timed actions).
// On the wall: two brass dials for health and blood, and a lamp that lights
// while a treatment is under way. Esc, or a click on the empty bay, closes it.
import * as THREE from 'three';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Player } from '../../entities/player';
import { createPreviewRig, type HumanRig, type Outfit, type RigCondition, type Pose } from '../../entities/humanRig';
import { overlay } from '../../game/cutPose';
import { fpGroup, fpClaim, fpRelease, fpOwner, fpCamera } from '../../fp/fp';
import type { Injury } from '../../survival/body';
import { INJURY_INFO, PART_NAMES } from '../../survival/body';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { worldMaterial } from '../../gfx/materials';
import { addTextureModule, atlas, makeRamp, mixHex, bayer, ph, tileFbm, type PixelCanvas } from '../../content/furniture/a_lib';
import { treatOptions, bestTreatment, needsCare, type TreatOpt } from './treat';
import { toolModel, type ToolKey } from './models';
import type { BodyStage } from './stage';
import { isTouchMode } from '../touch/mode';
import './health3d.css';

// ---------------------------------------------------------------- textures (the game's atlas, 32 px a metre)
const K = 0x0c0b09;
function fill(pc: PixelCanvas, ramp: number[], seed: number, amp = 0.3, cells = 4, x0 = 0, y0 = 0, w = pc.w, h = pc.h) {
  const n = ramp.length;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    let v = 0.5 + (tileFbm(x, y, pc.w, pc.h, cells, 3, seed) - 0.5) * amp * 2.4;
    v = v < 0 ? 0 : v > 1 ? 1 : v;
    const f = v * (n - 1); let i = Math.floor(f);
    if (f - i > bayer(x, y)) i++;
    pc.set(x, y, ramp[Math.min(n - 1, i)]);
  }
}
addTextureModule(() => {
  const A = atlas();
  // glazed celadon wall tiles: a cushion highlight on each tile, grey grout, a chip or a hairline crack now and then
  A.add('hv_tile', 32, 32, (pc, rng) => {
    const R = makeRamp(0xb8d4bc, 6, { spread: 0.22 });
    for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
      const x0 = tx * 8, y0 = ty * 8, tone = (ph(tx, ty, 41) - 0.5) * 0.12;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const edge = x === 0 || y === 0;
        if (edge) { pc.set(x0 + x, y0 + y, (x + y) % 3 ? 0x7e8a80 : 0x6e786e); continue; }
        let v = 0.55 + tone + (y === 1 || x === 1 ? 0.25 : 0) - (y === 7 || x === 7 ? 0.2 : 0) + (ph(x0 + x, y0 + y, 43) - 0.5) * 0.12;
        v = Math.max(0, Math.min(1, v));
        const f = v * 5; let i = Math.floor(f); if (f - i > bayer(x, y)) i++;
        pc.set(x0 + x, y0 + y, R[Math.min(5, i)]);
      }
      if (ph(tx, ty, 47) < 0.12) { pc.set(x0 + 6, y0 + 2, 0xeaf6ec); pc.set(x0 + 5, y0 + 2, 0xeaf6ec); }
    }
    for (let i = 0; i < 3; i++) { const x = rng.int(1, 30), y = rng.int(1, 30); pc.set(x, y, 0x8a9a8c); pc.set(x + 1, y, 0x6a7a6c); }
    // a hairline crack across two tiles
    let cx = rng.int(4, 26), cy = rng.int(4, 26);
    for (let i = 0; i < 9; i++) { pc.blend(cx, cy, 0x4a544a, 0.6); cx += rng.int(0, 1); cy += 1; }
  });
  // olive enamel on steel (the body console's own): chipped to dark metal, rubbed bright on the edges
  A.add('hv_olive', 32, 32, (pc, rng) => {
    fill(pc, makeRamp(0x5c6440, 6, { spread: 0.3 }), 8811, 0.24);
    for (let i = 0; i < 9; i++) { const x = rng.int(0, 30), y = rng.int(0, 30); pc.set(x, y, 0x2c2e24); if (rng.next() < 0.6) pc.set(x + 1, y, 0x3a3c2e); }
    for (let i = 0; i < 6; i++) { const x = rng.int(0, 31), y = rng.int(0, 31); pc.blend(x, y, 0x9aa47a, 0.5); }
    pc.grime(0x2a2c1e, 0.7, 3, 8812, 0.6);
  });
  // brass: warm, streaked, dark in the creases
  A.add('hv_brass', 16, 16, (pc) => {
    const R = makeRamp(0xc89a3a, 6, { spread: 0.4 });
    for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
      let v = 0.55 + Math.sin(x * 0.9 + y * 0.2) * 0.12 + (ph(x, y >> 2, 8813) - 0.5) * 0.3;
      v = Math.max(0, Math.min(1, v)); const f = v * 5; let i = Math.floor(f); if (f - i > bayer(x, y)) i++;
      pc.set(x, y, R[Math.min(5, i)]);
    }
    for (let x = 0; x < 16; x++) { pc.set(x, 0, 0xf2d488); pc.set(x, 15, 0x6a4a18); }
  });
  // ribbed black rubber mat
  A.add('hv_mat', 32, 32, (pc) => {
    fill(pc, makeRamp(0x2a2a28, 5, { spread: 0.3 }), 8814, 0.25);
    for (let y = 0; y < 32; y += 4) for (let x = 0; x < 32; x++) { pc.set(x, y, 0x4a4a46); pc.set(x, y + 1, 0x3a3a36); pc.set(x, y + 3, 0x141412); }
  });
  // hazard band
  A.add('hv_haz', 32, 8, (pc) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 32; x++) pc.set(x, y, (x + y) % 8 < 4 ? (ph(x, y, 8815) < 0.15 ? 0xa8801a : 0xe0b42a) : 0x181610);
    for (let x = 0; x < 32; x++) { pc.set(x, 0, 0x0c0b09); pc.set(x, 7, 0x0c0b09); }
    pc.grime(0x2a2418, 0.6, 3, 8816, 0.6);
  });
  // brushed stainless (the trolley)
  A.add('hv_steel', 32, 32, (pc) => {
    const R = makeRamp(0xb4b8bc, 6, { spread: 0.3 });
    for (let x = 0; x < 32; x++) {
      const col = ph(x, 0, 8817) - 0.5;
      for (let y = 0; y < 32; y++) {
        let v = 0.55 + col * 0.35 + (ph(x, y >> 3, 8818) - 0.5) * 0.12;
        v = Math.max(0, Math.min(1, v)); const f = v * 5; let i = Math.floor(f); if (f - i > bayer(x, y)) i++;
        pc.set(x, y, R[Math.min(5, i)]);
      }
    }
    pc.stain(22, 20, 3, 0x9a9c98, 0x7a7c78, 4);
  });
  // worn lino: green and cream squares, scuffed paths
  A.add('hv_lino', 32, 32, (pc) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const sq = ((x >> 4) + (y >> 4)) % 2 === 0;
      const base = sq ? 0xd8d0b0 : 0x6a8a6a;
      const v = (tileFbm(x, y, 32, 32, 4, 3, 8819) - 0.5) * 0.18;
      pc.set(x, y, mixHex(base, v > 0 ? 0xffffff : 0x000000, Math.abs(v)));
    }
    for (let i = 0; i < 32; i++) { pc.set(i, 0, 0x8a8a76); pc.set(0, i, 0x8a8a76); }
    pc.grime(0x5a5440, 0.7, 4, 8820, 0.55);
  });
  // white enamel with a blue rim (the kidney dish)
  A.add('hv_enamel', 16, 16, (pc) => {
    fill(pc, makeRamp(0xece8dc, 4, { spread: 0.15 }), 8821, 0.15);
    for (let x = 0; x < 16; x++) { pc.set(x, 0, 0x2a4a8a); pc.set(x, 1, 0x3a5aa0); }
    pc.set(5, 9, 0x3a3a3a); pc.set(6, 9, 0x5a5a5a);
  });
  // the exam lamp's glass (emissive)
  A.add('hv_glass', 16, 16, (pc) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5) / 8; pc.set(x, y, mixHex(0xfffbe8, 0xe8dcb0, Math.min(1, d * d + (ph(x, y, 8822) - 0.5) * 0.1))); }
  });
  // gauze
  A.add('hv_gauze', 16, 16, (pc) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) pc.set(x, y, (x % 3 === 0 || y % 3 === 0) ? 0xe2dccc : 0xf6f2e6);
  });
  // a measuring rule: ticks only
  A.add('hv_rule', 8, 32, (pc) => {
    fill(pc, makeRamp(0xc89a3a, 5, { spread: 0.35 }), 8823, 0.25);
    for (let y = 0; y < 32; y += 2) { const l = y % 16 === 0 ? 7 : y % 8 === 0 ? 5 : 3; for (let x = 0; x < l; x++) pc.set(x, y, K); }
  });
});

// ---------------------------------------------------------------- the dials (canvas faces, pixel art)
function dialFace(icon: 'heart' | 'drop'): { tex: THREE.CanvasTexture } {
  const S = 48, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const cx = S / 2, cy = S / 2;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d > S / 2) continue;
    const t = 0.82 + (ph(x, y, 8830) - 0.5) * 0.06 - d / S * 0.12;
    g.fillStyle = `rgb(${Math.round(236 * t)},${Math.round(226 * t)},${Math.round(196 * t)})`;
    g.fillRect(x, y, 1, 1);
  }
  // the scale: a 270-degree arc, red at the low end through amber to green
  for (let i = 0; i <= 20; i++) {
    const a = Math.PI * 0.75 + (i / 20) * Math.PI * 1.5, big = i % 5 === 0;
    const col = i < 5 ? '#b8281e' : i < 9 ? '#d8901e' : '#3a8a3a';
    for (let r = big ? 14 : 16; r <= 19; r++) { g.fillStyle = col; g.fillRect(Math.round(cx + Math.cos(a) * r - 0.5), Math.round(cy + Math.sin(a) * r - 0.5), 1, 1); }
  }
  // the icon under the pivot
  const px = (x: number, y: number, col: string) => { g.fillStyle = col; g.fillRect(cx - 4 + x, cy + 8 + y, 1, 1); };
  const art = icon === 'heart'
    ? ['.rr.rr..', 'rwrrrrr.', 'rrrrrrr.', '.rrrrr..', '..rrr...', '...r....']
    : ['...r....', '..rrr...', '.rrwrr..', '.rrrrr..', '.rrrrr..', '..rrr...'];
  art.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'r') px(x, y, '#a01818'); else if (ch === 'w') px(x, y, '#ffb0a0'); }));
  g.strokeStyle = '#2a2016'; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, S / 2 - 0.5, 0, Math.PI * 2); g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex };
}

interface Dial { root: THREE.Group; needle: THREE.Object3D; v: number; vv: number }
interface Mark { root: THREE.Group; bead: THREE.Mesh; ring: THREE.Mesh; part: string; inj: Injury; w: number; scr: THREE.Vector2; pos: THREE.Vector3 }
interface Tool { root: THREE.Group; mesh: THREE.Mesh | null; hit: THREE.Mesh; opt: TreatOpt | null; lift: number; home: THREE.Vector3; key: string }
interface Drop { p: THREE.Vector3; v: THREE.Vector3; t: number }

const D = 2.4;
const BAY_Z = -1.3;
const TRAY_Y = 0.86;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();
/** the exam stance: arms a little out from the sides so the hands and the flanks show */
const EXAM: Pose = { uarmL: [0.05, 0, 0.26], uarmR: [0.05, 0, -0.26], farmL: [-0.12, 0, 0.05], farmR: [-0.12, 0, -0.05] };
/** a hand picked: the unit holds it up in front of its chest, back of the hand to the eye, half a fist (the knuckles stand out) */
const PRESENT: Record<'l' | 'r', Pose> = {
  l: { uarmL: [-0.55, 0, 0.22], farmL: [-1.55, Math.PI / 2, 0], gripL: 0.8 },
  r: { uarmR: [-0.55, 0, -0.22], farmR: [-1.55, -Math.PI / 2, 0], gripR: 0.8 },
};

export class HealthView {
  open = false;
  private built = false;
  private g!: THREE.Group;
  private set = new THREE.Group();
  private pivot = new THREE.Group();
  private turn = new THREE.Group();
  private rig: HumanRig | null = null;
  private outfitSig = '';
  private dials: Dial[] = [];
  private lamp!: THREE.Mesh;
  private lampLight!: THREE.PointLight;
  private marks: Mark[] = [];
  private markGeo!: { bead: THREE.BufferGeometry; ring: THREE.BufferGeometry };
  private tools: Tool[] = [];
  private trolley = new THREE.Group();
  private drops: Drop[] = [];
  private dropMesh!: THREE.InstancedMesh;
  private splats: THREE.Mesh[] = []; private splatI = 0;
  /** the picked body part (its wounds are what the trolley sets out for) */
  private sel: string | null = null;
  /** the push in on the picked wound (0..1) and the focus it settles on */
  private zk = 0; private focus = new THREE.Vector3(); private zoom = 1;
  /** how far the picked hand is held up (0..1), and the trolley rolling in beside the unit */
  private present = 0; private presentSide: 'l' | 'r' = 'r'; private cartX = 1; private cartV = 0; private cartTilt = 0; private cartTiltV = 0;
  private hoverMark: Mark | null = null; private hoverTool = -1;
  private show = 0; private t = 0; private closing = false;
  private yaw = 0.35; private yawV = 0;
  /** a picked wound turns the table to face it (until a hand turns it again) */
  private yawGoal: number | null = null;
  private ptr: { id: number; x0: number; y0: number; x: number; y: number; lx: number; lt: number; moved: number; mode: 'turn' | 'tool' | 'none'; tool: number } | null = null;
  private drag: { i: number; pos: THREE.Vector3; vel: THREE.Vector3 } | null = null;
  private applying: { tool: THREE.Object3D; part: string; t: number } | null = null;
  /** a marker for the other overlays (quest tracker, key hints): a first-person view is up */
  private busyEl: HTMLDivElement;
  private rc = new THREE.Raycaster();
  private tag: HTMLDivElement;
  private tagKey = '';
  private dripT = 0;
  private sigT = 0;
  private wide = true;
  /** tests: try another presenting pose */
  poseOverride: Pose | null = null;

  constructor() {
    (G as any).healthView = this;
    this.tag = document.createElement('div');
    this.tag.className = 'hv-tag';
    document.body.appendChild(this.tag);
    this.busyEl = document.createElement('div');
    this.busyEl.className = 'fpk hv-busy';
    this.busyEl.style.display = 'none';
    document.body.appendChild(this.busyEl);
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    window.addEventListener('pointerdown', (e) => this.onDown(e), true);
    window.addEventListener('pointermove', (e) => this.onMove(e), true);
    window.addEventListener('pointerup', (e) => this.onUp(e), true);
    window.addEventListener('pointercancel', (e) => this.onUp(e, true), true);
    window.addEventListener('contextmenu', (e) => { if (this.open) { e.preventDefault(); e.stopPropagation(); } }, true);
    bus.on('fpLost', (n: string) => { if (n === 'health' && this.open) this.close(true); });
    G.addSystem({ name: 'healthView', update: (dt: number) => this.frame(dt) });
  }

  toggle(v?: boolean) { const want = v ?? !this.open; if (want) this.openUp(); else this.close(); }

  private openUp() {
    if (this.open) return;
    const p = G.local, g: any = G;
    if (!p || p.body.dead || g.intro?.running) return;
    if (fpOwner() && fpOwner() !== 'health') return;
    this.build();
    if (!fpClaim('health', 4, { cinematic: 'none' })) return;
    this.open = true; this.closing = false; this.show = 0; this.t = 0;
    this.outfitSig = ''; this.sel = null; this.hoverMark = null; this.hoverTool = -1;
    this.yaw = 0.35; this.yawV = 1.4; this.yawGoal = null; this.zk = 0; this.zoom = 1; this.present = 0;
    for (const s of this.splats) s.visible = false;
    this.drops.length = 0;
    this.setTools(null);
    G.hudBody?.setHidden?.('health', true);
    this.busyEl.classList.add('on');
    if (G.input) G.input.pointerOverUI = true;
    G.audio?.ui?.('bh_squelch', 0.3);
    G.audio?.ui?.('cube_clunk', 0.35);
  }
  close(lost = false) {
    if (!this.open) return;
    this.open = false; this.closing = !lost;
    this.drag = null; this.ptr = null;
    this.setTag('', 0, 0);
    G.hudBody?.setHidden?.('health', false);
    this.busyEl.classList.remove('on');
    if (G.input) G.input.pointerOverUI = false;
    document.body.style.cursor = '';
    G.audio?.ui?.('cube_shut', 0.3);
    if (lost) { this.closing = false; this.show = 0; if (this.g) this.g.visible = false; }
  }

  // ================================================================ building
  private build() {
    if (this.built) return;
    this.built = true;
    const g = this.g = fpGroup('health');
    // bright exam-room light: a warm key from the lamp side, cool fill, a rim off the tiles
    g.add(new THREE.HemisphereLight(0xf6f8f2, 0x606a58, 1.3));
    const key = new THREE.DirectionalLight(0xfffaf0, 2.1); key.position.set(-1.4, 2.6, 2.2); g.add(key);
    const fill = new THREE.DirectionalLight(0xe4f0ff, 0.85); fill.position.set(2.2, 0.6, 1.6); g.add(fill);
    const rim = new THREE.DirectionalLight(0xc8f0d8, 1.1); rim.position.set(1.4, 1.8, -2.4); g.add(rim);
    this.lampLight = new THREE.PointLight(0xfff2d0, 0, 4, 1.5); g.add(this.lampLight);
    g.add(this.set);
    this.set.add(this.buildBay(), this.pivot, this.trolley);
    this.pivot.add(this.turn);
    this.turn.add(this.buildTurntable());
    this.buildTrolley();
    this.trolley.position.set(1.0, 0, 0.18);
    this.trolley.rotation.y = -0.38;
    // markers: a cut glass bead in a thin brass ring, always facing the eye
    this.markGeo = { bead: new THREE.IcosahedronGeometry(0.016, 0), ring: new THREE.TorusGeometry(0.03, 0.0045, 4, 16) };
    // blood: drops (stretched cubes) and the splats they leave on the mat
    this.dropMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x8a1012 }), 48);
    this.dropMesh.count = 0; this.dropMesh.frustumCulled = false;
    g.add(this.dropMesh);
    const sg = new THREE.CircleGeometry(1, 9); sg.rotateX(-Math.PI / 2);
    const sm = new THREE.MeshLambertMaterial({ color: 0x5e0a0c, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    for (let i = 0; i < 28; i++) { const s = new THREE.Mesh(sg, sm); s.visible = false; this.turn.add(s); this.splats.push(s); }
  }

  /** the tiled bay: lino floor, celadon tiles over an olive wainscot with a hazard band and a brass rail, the rule, the dials, the lamp */
  private buildBay(): THREE.Object3D {
    const mb = new ModelBuilder(), glow = new ModelBuilder();
    // floor and walls
    mb.box(0, -0.02, 2.6, 12, 0.02, 8.4, 'hv_lino', { ao: false, bevel: false });
    mb.box(0, 1.08, BAY_Z - 0.06, 12, 4.6, 0.1, 'hv_tile', { ao: false, bevel: false, uvScale: 1.6 });
    mb.box(0, 0, BAY_Z + 0.0, 12, 0.98, 0.06, 'hv_olive', { ao: false, bevel: false });
    mb.box(0, 0.98, BAY_Z + 0.02, 12, 0.08, 0.06, 'hv_haz', { ao: false, bevel: false, fit: { south: true } as any });
    mb.cylinderX(0, 1.13, BAY_Z + 0.07, 0.018, 12, 6, 'hv_brass', { ao: false });
    for (let x = -5.5; x <= 5.5; x += 0.8) mb.box(x, 1.105, BAY_Z + 0.035, 0.03, 0.05, 0.05, 'hv_brass', { ao: false });
    // a deep skirting shadow line and a floor drain by the turntable
    mb.box(0, 0, BAY_Z + 0.04, 12, 0.06, 0.04, 'hv_olive', { color: 0x5a5a50, ao: false, bevel: false });
    mb.cylinder(-0.75, -0.005, 0.55, 0.09, 0.008, 8, 'hv_steel', { color: 0x8a8a84 });
    for (let i = -2; i <= 2; i++) mb.box(-0.75 + i * 0.03, 0.004, 0.55, 0.012, 0.004, 0.14, 'hv_mat', { ao: false, bevel: false });
    // the height rule behind the unit, brass on two brackets
    mb.box(-0.6, 0.05, BAY_Z + 0.04, 0.05, 2.0, 0.012, 'hv_rule', { fit: { south: true } as any, ao: false, bevel: false });
    for (const y of [0.3, 1.8]) mb.box(-0.6, y, BAY_Z + 0.02, 0.07, 0.03, 0.04, 'hv_brass', { ao: false });
    // the wall box the dials sit in: olive enamel, rivets
    mb.box(-1.55, 1.25, BAY_Z + 0.06, 0.62, 0.36, 0.1, 'hv_olive', {});
    for (const [x, y] of [[-1.82, 1.29], [-1.28, 1.29], [-1.82, 1.57], [-1.28, 1.57]]) mb.cylinderZ(x, y, BAY_Z + 0.115, 0.009, 0.01, 6, 'hv_brass', {});
    // the conduit up to it and a junction box
    mb.box(-1.55, 1.61, BAY_Z + 0.04, 0.04, 2.4, 0.04, 'hv_steel', { color: 0xa0a49c });
    // the treatment lamp's caged housing on the wall
    mb.box(-1.55, 1.68, BAY_Z + 0.08, 0.12, 0.12, 0.08, 'hv_olive', {});
    glow.box(-1.55, 1.7, BAY_Z + 0.125, 0.07, 0.08, 0.01, 'hv_glass', { emissive: 1, ao: false, bevel: false });
    // the exam lamp: an arm off the wall, a green enamel dome, warm glass under it
    mb.box(1.6, 2.1, BAY_Z + 0.2, 0.05, 0.05, 0.4, 'hv_steel', {});
    mb.box(1.6, 2.1, BAY_Z + 0.4, 0.05, 0.05, 1.0, 'hv_steel', { color: 0xb0b4b0 });
    mb.cylinder(1.6, 1.98, BAY_Z + 1.25, 0.26, 0.16, 12, 'hv_olive', { rTop: 0.12 });
    mb.cylinder(1.6, 2.14, BAY_Z + 1.25, 0.05, 0.06, 8, 'hv_brass', {});
    glow.cylinder(1.6, 1.965, BAY_Z + 1.25, 0.23, 0.02, 12, 'hv_glass', { emissive: 1, ao: false });
    const mat = worldMaterial({ noVis: true, noFog: true, noGrid: true });
    const bay = new THREE.Group();
    const m = new THREE.Mesh(mb.build(), mat); m.frustumCulled = false; m.receiveShadow = false;
    const gm = new THREE.Mesh(glow.build(), worldMaterial({ noVis: true, noFog: true, noGrid: true, unlit: true }));
    gm.frustumCulled = false;
    bay.add(m, gm);
    this.lamp = new THREE.Mesh(new THREE.CircleGeometry(0.03, 10), new THREE.MeshBasicMaterial({ color: 0x3a3020 }));
    this.lamp.position.set(-1.55, 1.7, BAY_Z + 0.135);
    bay.add(this.lamp);
    // the two dials: health and blood
    const bez = new THREE.MeshLambertMaterial({ color: 0xd0a040 });
    for (const [x, icon] of [[-1.7, 'heart'], [-1.4, 'drop']] as [number, 'heart' | 'drop'][]) {
      const root = new THREE.Group(); root.position.set(x, 1.43, BAY_Z + 0.115);
      const rimM = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.016, 6, 20), bez);
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), new THREE.MeshLambertMaterial({ map: dialFace(icon).tex }));
      face.position.z = 0.002;
      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08 }));
      glass.position.z = 0.012;
      const needle = new THREE.Group(); needle.position.z = 0.008;
      const nm = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.08, 0.004), new THREE.MeshLambertMaterial({ color: 0x1a1410 }));
      nm.position.y = 0.032; needle.add(nm);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.02, 0.004), new THREE.MeshLambertMaterial({ color: 0xc82018 })); tip.position.y = 0.068; needle.add(tip);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.01, 8), bez); hub.rotation.x = Math.PI / 2; hub.position.z = 0.012;
      root.add(rimM, face, glass, needle, hub);
      bay.add(root);
      this.dials.push({ root, needle, v: 0, vv: 0 });
    }
    return bay;
  }

  /** the turntable: an olive drum on a hazard skirt, a brass band, the ribbed rubber top */
  private buildTurntable(): THREE.Object3D {
    const mb = new ModelBuilder();
    mb.cylinder(0, 0, 0, 0.5, 0.035, 18, 'hv_haz', { ao: false });
    mb.cylinder(0, 0.035, 0, 0.47, 0.03, 18, 'hv_olive', {});
    mb.cylinder(0, 0.065, 0, 0.475, 0.012, 18, 'hv_brass', {});
    mb.cylinder(0, 0.077, 0, 0.455, 0.012, 18, 'hv_mat', { ao: false });
    // rivets round the drum and the feet marks
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; mb.box(Math.cos(a) * 0.472, 0.045, Math.sin(a) * 0.472, 0.016, 0.016, 0.016, 'hv_brass', {}); }
    for (const sx of [-1, 1]) mb.box(sx * 0.085, 0.089, 0.02, 0.09, 0.003, 0.2, 'hv_olive', { color: 0xc8b060, ao: false, bevel: false });
    const m = new THREE.Mesh(mb.build(), worldMaterial({ noVis: true, noFog: true, noGrid: true }));
    m.frustumCulled = false;
    return m;
  }

  /** the instrument trolley: brushed steel on castors, two trays, a push bar; a kidney dish and gauze on top */
  private buildTrolley() {
    const mb = new ModelBuilder();
    const W = 0.62, Dd = 0.38;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      mb.cylinder(sx * (W / 2 - 0.02), 0.06, sz * (Dd / 2 - 0.02), 0.012, TRAY_Y - 0.06, 6, 'hv_steel', {});
      mb.cylinder(sx * (W / 2 - 0.02), 0.0, sz * (Dd / 2 - 0.02), 0.03, 0.03, 8, 'hv_mat', {});
      mb.box(sx * (W / 2 - 0.02), 0.03, sz * (Dd / 2 - 0.02), 0.02, 0.03, 0.04, 'hv_steel', {});
    }
    // the trays (a lip all round)
    for (const y of [0.28, TRAY_Y]) {
      mb.box(0, y, 0, W, 0.016, Dd, 'hv_steel', {});
      mb.box(0, y + 0.016, Dd / 2 - 0.008, W, 0.03, 0.016, 'hv_steel', {});
      mb.box(0, y + 0.016, -Dd / 2 + 0.008, W, 0.03, 0.016, 'hv_steel', {});
      mb.box(W / 2 - 0.008, y + 0.016, 0, 0.016, 0.03, Dd, 'hv_steel', {});
      mb.box(-W / 2 + 0.008, y + 0.016, 0, 0.016, 0.03, Dd, 'hv_steel', {});
    }
    // the push bar
    mb.cylinder(W / 2 + 0.02, TRAY_Y + 0.02, -0.12, 0.012, 0.12, 6, 'hv_steel', {});
    mb.cylinder(W / 2 + 0.02, TRAY_Y + 0.02, 0.12, 0.012, 0.12, 6, 'hv_steel', {});
    mb.cylinderZ(W / 2 + 0.02, TRAY_Y + 0.14, 0, 0.014, 0.28, 6, 'hv_mat', {});
    // on the lower shelf: a stack of folded towels and a brown bottle
    mb.box(-0.12, 0.296, 0, 0.2, 0.06, 0.16, 'hv_gauze', {});
    mb.cylinder(0.14, 0.296, 0.02, 0.035, 0.12, 8, 'hv_mat', { color: 0x8a4a1a });
    // on top: the kidney dish at the back corner, a pad of gauze
    mb.cylinder(-0.2, TRAY_Y + 0.016, -0.1, 0.07, 0.025, 10, 'hv_enamel', { rTop: 0.08 });
    mb.box(0.2, TRAY_Y + 0.016, -0.11, 0.1, 0.012, 0.08, 'hv_gauze', {});
    const m = new THREE.Mesh(mb.build(), worldMaterial({ noVis: true, noFog: true, noGrid: true }));
    m.frustumCulled = false;
    this.trolley.add(m);
    // six places on the top tray for what could treat the picked wound
    for (let i = 0; i < 6; i++) {
      const root = new THREE.Group();
      const home = new THREE.Vector3(-0.25 + i * 0.1, TRAY_Y + 0.05, 0.07 - (i % 2) * 0.06);
      root.position.copy(home);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.2, 0.09), new THREE.MeshBasicMaterial()); hit.visible = false; hit.position.y = 0.07;
      root.add(hit);
      this.trolley.add(root);
      this.tools.push({ root, mesh: null, hit, opt: null, lift: 0, home, key: '' });
    }
  }

  // ================================================================ the unit
  /** what the unit wears on the turntable: underwear (a band top on a feminine build) and the band on its wrist */
  private examOutfit(p: Player): Outfit {
    let o: Outfit = {};
    try { o = p.computeOutfit(); } catch { /* defaults */ }
    const fem = (p.app?.bodyShape ?? 0.3) > 0.55;
    const cond: RigCondition = { ...(o.cond || {}) };
    return {
      torso: fem ? { tex: 'c_bandeau', color: 0xd8d4c8, sleeve: 'none' } : { tex: 'c_bare', color: p.app?.skin ?? 0xe8b98f, sleeve: 'none' },
      legs: { tex: 'c_underwear', color: 0xd8d4c8 }, legsKind: 'shorts',
      wrist: o.wrist,
      cond,
    };
  }
  private ensureRig(p: Player) {
    const out = this.examOutfit(p);
    const sig = JSON.stringify(out);
    if (!this.rig) {
      try {
        this.rig = createPreviewRig(p.app, out, { outline: false });
        this.rig.root.traverse((o) => { o.castShadow = false; o.frustumCulled = false; });
        this.rig.root.position.y = 0.083;
        this.turn.add(this.rig.root);
        this.outfitSig = sig;
      } catch (e) { console.warn('health rig', e); return; }
    } else if (sig !== this.outfitSig) { this.outfitSig = sig; this.rig.setOutfit(out); }
  }

  // ================================================================ wounds
  /** the wounds worth a marker: one per part (the worst there), healed ones gone */
  private wounds(p: Player): Map<string, Injury> {
    const b = p.body, out = new Map<string, Injury>();
    for (const inj of b.allInjuries()) {
      if (inj.heal > 0.9 || b.isSevered(inj.part) && inj.type !== 'amputation') continue;
      const cur = out.get(inj.part);
      if (!cur || woundRank(b.injuryBleed(inj), inj) > woundRank(b.injuryBleed(cur), cur)) out.set(inj.part, inj);
    }
    return out;
  }
  private syncMarks(p: Player) {
    const want = this.wounds(p);
    // drop the gone, add the new
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const m = this.marks[i], w = want.get(m.part);
      if (!w) { this.g.remove(m.root); this.marks.splice(i, 1); if (this.hoverMark === m) this.hoverMark = null; continue; }
      m.inj = w; want.delete(m.part);
    }
    for (const [part, inj] of want) {
      const root = new THREE.Group();
      const bead = new THREE.Mesh(this.markGeo.bead, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false }));
      const ring = new THREE.Mesh(this.markGeo.ring, new THREE.MeshBasicMaterial({ color: 0xd8a848, transparent: true, depthTest: false }));
      bead.renderOrder = ring.renderOrder = 30;
      root.add(ring, bead);
      this.g.add(root);
      this.marks.push({ root, bead, ring, part, inj, w: 0, scr: new THREE.Vector2(-999, -999), pos: new THREE.Vector3() });
    }
    if (this.sel && !this.marks.some((m) => m.part === this.sel)) { this.sel = null; this.setTools(null); }
    else if (this.sel) this.setTools(this.sel);
  }

  // ================================================================ the trolley's instruments
  /** what the trolley sets out: every treatment the part's wounds still want (worst wound first), the best one to the fore */
  private setTools(part: string | null) {
    const p = G.local;
    const opts: TreatOpt[] = [];
    let best: TreatOpt | null = null;
    if (part && p) {
      const b = p.body;
      const injs = b.parts[part as keyof typeof b.parts]?.injuries.filter((i) => i.heal < 0.9).sort((a, c) => woundRank(b.injuryBleed(c), c) - woundRank(b.injuryBleed(a), a)) ?? [];
      for (const inj of injs) {
        const os = treatOptions(p, inj);
        if (!best) best = bestTreatment(inj, os);
        for (const o of os) if (opts.length < 6 && !opts.some((q) => q.key === o.key)) opts.push(o);
      }
    }
    const st: BodyStage | null = G.hudBody?.st ?? null;
    this.tools.forEach((s, i) => {
      const o = opts[i] ?? null;
      const key = o ? o.key + (o.missing ? '-' : '+') : '';
      s.opt = o;
      if (s.mesh) s.mesh.userData.best = !!o && !!best && o.key === best.key;
      if (key === s.key) return;
      s.key = key;
      if (s.mesh) { s.root.remove(s.mesh); s.mesh = null; }
      if (!o || !st) return;
      const ghost = !!o.missing;
      const m = new THREE.Mesh(toolGeo(o.key as ToolKey), ghost ? ghostMat(st) : solidMat(st));
      m.frustumCulled = false;
      m.scale.setScalar(0.016);
      m.userData.best = !!best && o.key === best.key;
      s.root.add(m); s.mesh = m;
      s.lift = -1;
    });
  }
  private runTool(i: number, at: THREE.Vector3 | null) {
    const s = this.tools[i], o = s.opt, part = this.sel;
    if (!o || !part) return;
    if (!o.run || o.missing) { G.audio?.ui?.('band_tick', 0.35); s.lift = -0.6; return; }
    o.run();
    G.audio?.ui?.(o.key === 'bandage' || o.key === 'rebandage' ? 'bh_tape' : 'bh_wrap', 0.45);
    // the instrument goes to the wound while the unit works on it
    if (s.mesh) {
      const t = s.mesh.clone();
      s.root.getWorldPosition(_v);
      t.position.copy(at ?? _v);
      this.g.add(t);
      this.applying = { tool: t, part, t: 0 };
    }
    this.setTools(part);
  }

  // ================================================================ input
  private ndc(x: number, y: number) { return new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1); }
  /** the instrument nearest the pointer on screen (within its own size) */
  private toolAt(x: number, y: number): number {
    const cam = fpCamera();
    let best = -1, bd = 1e9;
    this.tools.forEach((t, i) => {
      if (!t.opt || !t.mesh || !t.mesh.visible) return;
      t.root.getWorldPosition(_v); _v.y += 0.07 * this.set.scale.y;
      _w.copy(_v); _w.x += 0.05 * this.set.scale.x;
      _v.project(cam); _w.project(cam);
      const sx = (_v.x + 1) / 2 * window.innerWidth, sy = (1 - _v.y) / 2 * window.innerHeight;
      const r = Math.max(22, Math.abs(_w.x - _v.x) / 2 * window.innerWidth * 1.6);
      const d = Math.hypot(sx - x, (sy - y) * 0.7);
      if (d < r && d < bd) { bd = d; best = i; }
    });
    return best;
  }
  private markAt(x: number, y: number, r = 30): Mark | null {
    let best: Mark | null = null, bd = r;
    for (const m of this.marks) { if (m.w < 0.4) continue; const d = Math.hypot(m.scr.x - x, m.scr.y - y); if (d < bd) { bd = d; best = m; } }
    return best;
  }
  /** is the point on the unit, the turntable or the trolley (anything but the empty bay)? */
  private onSomething(x: number, y: number, onlyUnit = false): boolean {
    const cam = fpCamera();
    const box = new THREE.Box3();
    const inBox = (o: THREE.Object3D, pad: number) => {
      box.setFromObject(o);
      if (box.isEmpty()) return false;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let i = 0; i < 8; i++) {
        _v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(cam);
        const sx = (_v.x + 1) / 2 * window.innerWidth, sy = (1 - _v.y) / 2 * window.innerHeight;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
      return x >= x0 - pad && x <= x1 + pad && y >= y0 - pad && y <= y1 + pad;
    };
    return inBox(this.pivot, 6) || (!onlyUnit && inBox(this.trolley, 6));
  }

  private onKey(e: KeyboardEvent) {
    if (!this.open || G.input?.textFocus) return;
    if (/^F\d+$/.test(e.code)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    switch (e.code) {
      case 'Escape': if (!e.repeat) { if (this.sel) { this.sel = null; this.setTools(null); G.audio?.ui?.('band_tick', 0.25); } else this.close(); } break;
      case 'ArrowLeft': case 'KeyA': this.yawGoal = null; this.yawV -= 2.4; break;
      case 'ArrowRight': case 'KeyD': this.yawGoal = null; this.yawV += 2.4; break;
      case 'Tab': {
        if (e.repeat) break;
        const vis = this.marks.filter((m) => needsCare(m.inj) || m.inj.type === 'fracture');
        const list = vis.length ? vis : this.marks;
        if (!list.length) break;
        const i = list.findIndex((m) => m.part === this.sel);
        this.pick(list[(i + 1) % list.length]);
        break;
      }
    }
  }
  private pick(m: Mark) {
    this.sel = m.part;
    this.setTools(m.part);
    G.audio?.ui?.('bh_squelch', 0.3);
    // turn the unit so the wound faces the eye
    const P = this.rig?.partPoint(m.part, _w);
    if (P) {
      this.pivot.updateMatrixWorld(true);
      const loc = this.turn.worldToLocal(P.clone());
      // (a hand or a forearm three-quarters on, so the back of it and the knuckles face the eye)
      const limb = /^(farm|uarm)/.test(m.part);
      // (a hand is held up to the eye: face the eye, turned a little toward that side)
      const want = m.part.startsWith('hand') ? (m.part.endsWith('_r') ? 0.3 : -0.3) : -Math.atan2(loc.x, loc.z) * (limb ? 0.55 : 1) + (m.part.endsWith('_l') ? -0.2 : m.part.endsWith('_r') ? 0.2 : 0);
      let d = want - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yawGoal = this.yaw + d; this.yawV = 0;
    }
  }
  private onDown(e: PointerEvent) {
    if (!this.open) return;
    if ((e.target as Element | null)?.closest?.('.nc-btn')) return;
    e.preventDefault(); e.stopPropagation();
    if (this.ptr) return;
    const x = e.clientX, y = e.clientY;
    const base = { id: e.pointerId, x0: x, y0: y, x, y, lx: x, lt: performance.now(), moved: 0, tool: -1 };
    const ti = this.toolAt(x, y);
    if (ti >= 0) { this.ptr = { ...base, mode: 'tool', tool: ti }; return; }
    this.ptr = { ...base, mode: 'turn' };
  }
  private onMove(e: PointerEvent) {
    if (!this.open) return;
    const q = this.ptr;
    if (!q) {
      if (e.pointerType === 'touch' || isTouchMode()) return;
      this.hoverTool = this.toolAt(e.clientX, e.clientY);
      this.hoverMark = this.hoverTool >= 0 ? null : this.markAt(e.clientX, e.clientY);
      document.body.style.cursor = this.hoverTool >= 0 || this.hoverMark ? 'pointer' : 'grab';
      return;
    }
    if (e.pointerId !== q.id) return;
    e.preventDefault(); e.stopPropagation();
    q.x = e.clientX; q.y = e.clientY;
    q.moved = Math.max(q.moved, Math.hypot(q.x - q.x0, q.y - q.y0));
    if (q.mode === 'turn' && q.moved > 4) {
      const now = performance.now(), dx = q.x - q.lx, dts = Math.max(1, now - q.lt) / 1000;
      this.yaw += dx * 0.011;
      this.yawV = this.yawV * 0.6 + (dx * 0.011 / dts) * 0.4;
      q.lx = q.x; q.lt = now;
      document.body.style.cursor = 'grabbing';
    } else if (q.mode === 'tool' && q.moved > 7 && !this.drag) {
      const s = this.tools[q.tool];
      if (s.opt && s.mesh) {
        s.root.getWorldPosition(_v);
        this.drag = { i: q.tool, pos: _v.clone(), vel: new THREE.Vector3() };
        G.audio?.ui?.('bag_rot', 0.35);
      }
    }
    if (q.mode === 'tool') { this.hoverMark = this.markAt(q.x, q.y, 70); }
  }
  private onUp(e: PointerEvent, cancel = false) {
    if (!this.open) return;
    const q = this.ptr; if (!q || e.pointerId !== q.id) return;
    e.preventDefault(); e.stopPropagation();
    this.ptr = null;
    document.body.style.cursor = '';
    if (cancel) { this.drag = null; return; }
    if (q.mode === 'tool') {
      if (this.drag) {
        const m = this.markAt(q.x, q.y, 70);
        const dg = this.drag; this.drag = null;
        // dropped on the wound (or anywhere on the unit while a wound is picked): do it
        if (this.sel && ((m && m.part === this.sel) || (!m && this.onSomething(q.x, q.y, true)))) this.runTool(dg.i, dg.pos);
        else if (m && m.part !== this.sel) { this.pick(m); }
        else G.audio?.ui?.('bag_place', 0.3);
      } else if (q.moved < 7) this.runTool(q.tool, null);
      return;
    }
    if (q.moved >= 6) return;
    // a click: a wound picks it, the unit or the trolley does nothing, the empty bay closes
    const m = this.markAt(q.x, q.y, e.pointerType === 'touch' ? 40 : 30);
    if (m) { this.pick(m); return; }
    if (this.onSomething(q.x, q.y)) return;
    // the empty bay: first it lets go of the picked wound, then it closes
    if (this.sel) { this.sel = null; this.setTools(null); G.audio?.ui?.('band_tick', 0.25); return; }
    this.close();
  }

  // ================================================================ the floating name (no box: Alagard, raised)
  private setTag(html: string, x: number, y: number, right = true) {
    const T = this.tag;
    if (html !== this.tagKey) { this.tagKey = html; T.innerHTML = html; T.classList.toggle('on', !!html); }
    if (!html) return;
    const r = T.getBoundingClientRect();
    const px = right ? x + 22 : x - 22 - r.width;
    const cx = Math.max(8, Math.min(window.innerWidth - r.width - 8, px)), cy = Math.max(8, Math.min(window.innerHeight - r.height - 8, y - r.height / 2));
    T.style.transform = `translate(${Math.round(cx)}px, ${Math.round(cy)}px) perspective(420px) rotateY(${right ? -10 : 10}deg)`;
  }

  // ================================================================ frame
  private frame(dt: number) {
    if (!this.built || (!this.open && !this.closing && this.show <= 0)) return;
    const p = G.local;
    if (this.open && (!p || p.body.dead || fpOwner() !== 'health')) { this.close(true); return; }
    dt = Math.min(dt, 0.05);
    this.t += dt;
    this.show = Math.max(0, Math.min(1, this.show + (this.open ? dt / 0.32 : -dt / 0.22)));
    if (!this.open && this.show <= 0) { this.closing = false; fpRelease('health'); this.setTag('', 0, 0); for (const m of this.marks) this.g.remove(m.root); this.marks.length = 0; return; }
    if (!p) return;
    const e = this.show * this.show * (3 - 2 * this.show);
    const cam = fpCamera(), asp = cam.aspect;
    const hh = Math.tan((cam.fov * Math.PI) / 360) * D, hw = hh * asp;
    const wide = this.wide = asp >= 1.1;
    // the whole bay, scaled to the view; it opens like a tube warming up (a bright line that widens)
    const s = (wide ? 1.32 : 0.98) * hh / 1.8;
    const bx = wide ? -0.16 * hw : -0.1 * hw, fy = wide ? -0.64 * hh : -0.4 * hh;
    // a picked wound: push in on it, keeping it and the trolley's top both in frame
    this.zk += ((this.sel && this.rig ? 1 : 0) - this.zk) * Math.min(1, dt * 3.5);
    let px = bx, py = fy, sc = s;
    if (this.zk > 0.002 && this.rig) {
      if (this.sel) {
        this.set.updateMatrixWorld(true);
        const P = this.rig.partPoint(this.sel, _w);
        if (P) { const f = this.set.worldToLocal(P); if (this.zk < 0.05) this.focus.copy(f); else this.focus.lerp(f, 1 - Math.exp(-dt * 3)); }
      }
      const dy = Math.abs(this.focus.y - (TRAY_Y + 0.08));
      // as close as keeps the wound and the trolley's top both in frame (up and down, and across to the tools)
      const across = Math.max(0.3, this.cartX + 0.34 - this.focus.x);
      const tx0 = wide ? -0.3 * hw : -0.12 * hw;
      const want = THREE.MathUtils.clamp(Math.min((0.95 * hh) / Math.max(0.12, dy * s), (0.94 * hw - tx0) / (across * s)), 1, wide ? 3.0 : 2.4);
      this.zoom += (want - this.zoom) * Math.min(1, dt * 4);
      const Z = s * this.zoom, fyl = (this.focus.y + TRAY_Y + 0.08) / 2;
      const tx = wide ? -0.3 * hw : -0.12 * hw, ty = -0.04 * hh;
      const k = this.zk * this.zk * (3 - 2 * this.zk);
      px = THREE.MathUtils.lerp(bx, tx - Z * this.focus.x, k);
      py = THREE.MathUtils.lerp(fy, ty - Z * fyl, k);
      sc = THREE.MathUtils.lerp(s, Z, k);
      // (the depth stays: the bay grows toward the eye round the wound)
      this.set.position.set(px, py, -D - THREE.MathUtils.lerp(0, Z * this.focus.z, k));
    } else this.set.position.set(px, py, -D);
    this.set.scale.set(sc * (0.7 + 0.3 * e), sc * Math.max(0.02, e), sc);
    // the trolley: rolls in beside the unit when a wound is picked (castors, a lurch when it stops), back out after
    const cartGoal = (wide ? 1.0 : 0.62) - (this.sel ? (wide ? 0.24 : 0.12) : 0);
    const cartA = (cartGoal - this.cartX) * 26 - this.cartV * 8.5;
    this.cartV += cartA * dt; this.cartX += this.cartV * dt;
    this.cartTiltV += (-cartA * 0.012 - this.cartTilt * 90 - this.cartTiltV * 7) * dt; this.cartTilt += this.cartTiltV * dt;
    this.trolley.position.set(this.cartX, 0, wide ? 0.18 : 0.42);
    this.trolley.rotation.set(0, -0.38, THREE.MathUtils.clamp(this.cartTilt, -0.05, 0.05));
    this.trolley.scale.setScalar(wide ? 1 : 0.85);
    // the turntable coasts
    if (this.ptr?.mode === 'turn' && this.ptr.moved > 4) this.yawGoal = null;
    if (this.yawGoal !== null) { const d = this.yawGoal - this.yaw; this.yawV = d * 4; this.yaw += d * Math.min(1, dt * 4); if (Math.abs(d) < 0.002) this.yawGoal = null; }
    else if (!this.ptr || this.ptr.mode !== 'turn') { this.yaw += this.yawV * dt; this.yawV *= Math.exp(-dt * 2.6); }
    this.turn.rotation.y = this.yaw;
    // the unit: idle, arms a little out, its condition repainted when it changes
    this.sigT -= dt;
    if (this.sigT <= 0 || !this.rig) { this.sigT = 0.4; this.ensureRig(p); this.syncMarks(p); }
    const hand = this.sel === 'hand_l' || this.sel === 'hand_r';
    if (hand) this.presentSide = this.sel === 'hand_l' ? 'l' : 'r';
    this.present += ((hand ? 1 : 0) - this.present) * Math.min(1, dt * 3.2);
    if (this.rig) {
      this.rig.update(dt);
      overlay(this.rig, EXAM, 0.85);
      if (this.present > 0.01) { const pk = this.present * this.present * (3 - 2 * this.present); overlay(this.rig, this.poseOverride ?? PRESENT[this.presentSide], pk); grip(this.rig, this.presentSide === 'l' ? 'L' : 'R', 0.3 + 0.5 * pk); }
      this.rig.root.updateMatrixWorld(true);
    }
    // the dials and the lamp
    const b = p.body;
    const vals = [b.health / 100, b.blood / 100];
    this.dials.forEach((d, i) => {
      const goal = (Math.max(0, Math.min(1, vals[i])) - 0.5) * -Math.PI * 1.5;
      d.vv += ((goal - d.v) * 60 - d.vv * 9) * dt; d.v += d.vv * dt;
      d.needle.rotation.z = d.v + Math.sin(this.t * 23 + i) * 0.006;
    });
    const busy = !!p.actions?.current?.started;
    (this.lamp.material as THREE.MeshBasicMaterial).color.setHex(busy ? (Math.sin(this.t * 9) > 0 ? 0xffd060 : 0xb88a20) : b.bleedRate() > 0.05 ? 0xc02818 : 0x3a6a2a);
    this.set.updateMatrixWorld(true);
    _v.set(1.6, 1.85, BAY_Z + 1.25); this.set.localToWorld(_v); this.lampLight.position.copy(_v); this.lampLight.intensity = 2.2 * e;
    this.placeMarks(e);
    this.placeTools(dt, e);
    this.bleed(dt, p, this.set.scale.z);
    this.applyFx(dt);
    this.updateTag(p);
  }

  private placeMarks(e: number) {
    const rig = this.rig, cam = fpCamera();
    if (!rig) return;
    this.pivot.getWorldPosition(_w);
    cam.getWorldPosition(_v);
    const toCam = _v.clone().sub(_w).setY(0).normalize();
    const sc = this.set.scale.z;
    for (const m of this.marks) {
      const P = rig.partPoint(m.part, m.pos);
      if (!P) { m.root.visible = false; continue; }
      // facing: is the anchor on the eye's side of the body's axis?
      const off = _v.set(P.x - _w.x, 0, P.z - _w.z);
      const facing = off.length() < 1e-4 ? 1 : off.normalize().dot(toCam);
      const want = THREE.MathUtils.smoothstep(facing, -0.25, 0.25);
      m.w += (want - m.w) * 0.25;
      const hot = this.hoverMark === m, picked = this.sel === m.part;
      const inj = m.inj, bleed = G.local ? G.local.body.injuryBleed(inj) : 0;
      const col = bleed > 0.05 ? 0xff3a28 : inj.type === 'fracture' ? (inj.splinted ? 0x9adf7a : 0xffa030) : inj.infection > 0.15 ? 0xb87aff : needsCare(inj) ? 0xffc040 : 0x8ad870;
      (m.bead.material as THREE.MeshBasicMaterial).color.setHex(col);
      const pulse = 1 + Math.sin(this.t * (bleed > 0.05 ? 7 : 3.5) + m.part.length) * (needsCare(inj) ? 0.18 : 0.05);
      m.root.position.copy(P).addScaledVector(toCam, 0.06 * sc);
      m.root.quaternion.copy(cam.quaternion);
      m.root.scale.setScalar(sc * (hot || picked ? 1.45 : 1) * pulse * (0.5 + 0.5 * e));
      m.root.rotateZ(this.t * (picked ? 2.4 : 0.6));
      // the picked one steps out of the way once the eye is on it (the wound itself is what to look at)
      const clear = (picked ? Math.max(0, 1 - this.zk * 1.6) : 1) * (needsCare(inj) || inj.type === 'fracture' || hot ? 1 : 0.4);
      (m.bead.material as THREE.MeshBasicMaterial).opacity = m.w * e * clear;
      (m.ring.material as THREE.MeshBasicMaterial).opacity = m.w * e * (hot || picked ? 1 : 0.65) * clear;
      (m.ring.material as THREE.MeshBasicMaterial).color.setHex(picked ? 0xfff0b0 : 0xd8a848);
      m.root.visible = m.w > 0.03 && e > 0.3;
      _v.copy(m.root.position).project(cam);
      m.scr.set((_v.x + 1) / 2 * window.innerWidth, (1 - _v.y) / 2 * window.innerHeight);
    }
  }

  private placeTools(dt: number, e: number) {
    const sel = !!this.sel;
    this.tools.forEach((s, i) => {
      const m = s.mesh; if (!m) return;
      const dragging = this.drag?.i === i;
      const best = !!m.userData.best;
      const want = dragging ? 0 : i === this.hoverTool ? 1 : best ? 0.4 + Math.sin(this.t * 5) * 0.25 : 0;
      s.lift += (want - s.lift) * Math.min(1, dt * 12);
      m.visible = sel && e > 0.5 && !dragging;
      m.position.set(0, 0.035 + s.lift * 0.04, s.lift * 0.03);
      m.rotation.set(-0.3, Math.sin(this.t * 1.3 + i) * 0.25 + s.lift * 0.6, Math.sin(this.t * 2 + i) * 0.04);
    });
    // the instrument in the hand swings after the pointer
    const dg = this.drag;
    if (dg && this.ptr) {
      const cam = fpCamera();
      this.rc.setFromCamera(this.ndc(this.ptr.x, this.ptr.y), cam);
      const r = this.rc.ray, z = -D + 0.35;
      const goal = r.origin.clone().addScaledVector(r.direction, (z - r.origin.z) / r.direction.z);
      const prev = _w.copy(dg.pos);
      dg.pos.lerp(goal, 1 - Math.exp(-dt * 18));
      dg.vel.copy(dg.pos).sub(prev).divideScalar(Math.max(1e-3, dt));
      let ghost = this.g.getObjectByName('hv_drag') as THREE.Mesh | undefined;
      const src = this.tools[dg.i].mesh;
      if (!ghost && src) { ghost = src.clone(); ghost.name = 'hv_drag'; this.g.add(ghost); }
      if (ghost && src) {
        ghost.visible = true;
        ghost.position.copy(dg.pos);
        ghost.scale.setScalar(src.scale.x * this.set.scale.z * 1.15);
        ghost.rotation.set(THREE.MathUtils.clamp(dg.vel.y * 0.5, -0.6, 0.6), this.t * 1.5, THREE.MathUtils.clamp(-dg.vel.x * 0.5, -0.7, 0.7));
      }
    } else { const ghost = this.g.getObjectByName('hv_drag'); if (ghost) this.g.remove(ghost); }
  }

  /** the instrument at the wound while the unit works on it, then it is gone */
  private applyFx(dt: number) {
    const a = this.applying; if (!a) return;
    a.t += dt;
    const P = this.rig?.partPoint(a.part, _w);
    if (P) {
      a.tool.position.lerp(P, 1 - Math.exp(-dt * 6));
      a.tool.rotation.y += dt * 3;
    }
    const busy = !!G.local?.actions?.current?.started;
    const k = a.t < 0.6 ? 1 : busy ? 1 : Math.max(0, 1 - (a.t - 0.6) * 3);
    a.tool.scale.setScalar(0.016 * this.set.scale.z * k);
    if (k <= 0 || a.t > 30) { this.g.remove(a.tool); this.applying = null; }
  }

  /** fresh blood off the open wounds: drops that fall onto the mat and leave their mark (they turn with it) */
  private bleed(dt: number, p: Player, s: number) {
    const rig = this.rig; if (!rig) return;
    this.dripT -= dt;
    if (this.dripT <= 0 && this.show > 0.9) {
      this.dripT = 0.12;
      const b = p.body;
      for (const inj of b.allInjuries()) {
        const r = b.injuryBleed(inj);
        if (r < 0.03 || Math.random() > r * 1.6) continue;
        const P = rig.partPoint(inj.part, new THREE.Vector3());
        if (!P || this.drops.length >= 48) continue;
        this.drops.push({ p: P, v: new THREE.Vector3((Math.random() - 0.5) * 0.05, -0.05, (Math.random() - 0.5) * 0.05).multiplyScalar(s), t: 0 });
      }
    }
    // the mat's top in world space
    this.turn.updateMatrixWorld(true);
    const top = _w.set(0, 0.09, 0); this.turn.localToWorld(top);
    const floorY = top.y;
    const M = new THREE.Matrix4(), S = new THREE.Vector3();
    let n = 0;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t += dt;
      d.v.y -= 9.8 * s * 0.6 * dt;
      d.p.addScaledVector(d.v, dt);
      if (d.p.y <= floorY) {
        // a splat on the turning mat (in its own space so it rides round)
        const sp = this.splats[this.splatI++ % this.splats.length];
        const loc = this.turn.worldToLocal(d.p.clone());
        if (Math.hypot(loc.x, loc.z) < 0.44) {
          sp.position.set(loc.x, 0.0895 + (this.splatI % 7) * 0.0002, loc.z);
          sp.scale.setScalar(0.012 + Math.random() * 0.016);
          sp.visible = true;
          if (Math.random() < 0.3) G.audio?.ui?.('gore_drip', 0.12);
        }
        this.drops.splice(i, 1);
        continue;
      }
      const sp = Math.min(3, d.v.length() / s);
      M.compose(d.p, _q.identity(), S.set(0.008 * s, 0.008 * s * (1 + sp * 1.5), 0.008 * s));
      this.dropMesh.setMatrixAt(n++, M);
    }
    this.dropMesh.count = n;
    this.dropMesh.instanceMatrix.needsUpdate = true;
  }

  private updateTag(p: Player) {
    if (!this.open || this.show < 0.8) { this.setTag('', 0, 0); return; }
    const tool = this.hoverTool >= 0 ? this.tools[this.hoverTool] : null;
    if (tool?.opt && this.sel && !this.drag) {
      tool.root.getWorldPosition(_v).project(fpCamera());
      const x = (_v.x + 1) / 2 * window.innerWidth, y = (1 - _v.y) / 2 * window.innerHeight;
      const o = tool.opt;
      const sub = o.missing ? 'needs ' + o.missing : o.using && o.using.toLowerCase() !== o.label.toLowerCase() ? o.using : '';
      this.setTag(`<b>${esc(o.label)}</b>${sub ? `<i class="${o.missing ? 'bad' : ''}">${esc(sub)}</i>` : ''}`, x, y - 30, x < window.innerWidth * 0.7);
      return;
    }
    const m = this.hoverMark ?? (this.drag ? null : this.marks.find((q) => q.part === this.sel) ?? null);
    if (m && m.w > 0.4 && (this.hoverMark || isTouchMode() || (this.sel === m.part && this.zk > 0.6))) {
      const b = p.body, inj = m.inj, r = b.parts[m.part as keyof typeof b.parts].injuries.reduce((a, i) => a + b.injuryBleed(i), 0);
      const others = b.parts[m.part as keyof typeof b.parts].injuries.filter((i) => i !== inj && i.heal < 0.9).map((i) => woundName(i).toLowerCase());
      const state = r > 0.5 ? 'pouring' : r > 0.15 ? 'bleeding' : r > 0.02 ? 'oozing' : inj.infection > 0.15 ? 'infected' : inj.splinted ? 'splinted' : inj.bandage ? (inj.bandage.soak > 0.6 ? 'bandage soaked' : 'bandaged') : inj.stitched ? 'stitched' : inj.foreign ? 'something in it' : '';
      // the name floats on the far side of the wound from the body, never over it
      this.pivot.getWorldPosition(_v); _v.y = m.root.position.y; _v.project(fpCamera());
      const mid = (_v.x + 1) / 2 * window.innerWidth;
      const right = Math.abs(m.scr.x - mid) < 12 ? m.scr.x < window.innerWidth * 0.62 : m.scr.x > mid;
      const sub = [PART_NAMES[inj.part], ...[...new Set(others)].slice(0, 2), state].filter(Boolean).join(' · ');
      this.setTag(`<b>${esc(woundName(inj))}</b><i class="${r > 0.15 ? 'bad' : ''}">${esc(sub)}</i>`, m.scr.x, m.scr.y, right);
      return;
    }
    this.setTag('', 0, 0);
  }
}

/** curl a hand's fingers (0 open .. 1 a fist), as the rig's own pose does */
function grip(rig: HumanRig, side: 'L' | 'R', g: number) {
  const B = rig.bones as Record<string, THREE.Object3D | undefined>, k = side === 'L' ? 1 : -1;
  B['fing1' + side]?.rotation.set(0, 0, -k * g * 1.45);
  B['fing2' + side]?.rotation.set(0, 0, -k * g * 1.6);
  B['thumb' + side]?.rotation.set(g * 0.5, k * g * 0.6, -k * g * 0.55);
}
/** a wound's name as the unit would say it */
function woundName(inj: Injury): string {
  if ((inj as Injury & { cause?: string }).cause === 'knuckles') return 'Split Knuckles';
  if (inj.type === 'fracture') return inj.part.startsWith('hand') ? 'Broken Hand' : inj.part.startsWith('farm') ? 'Broken Wrist' : inj.part.startsWith('foot') ? 'Broken Foot' : 'Fracture';
  if (inj.type === 'bruise' && inj.part.startsWith('hand')) return 'Bruised Knuckles';
  return INJURY_INFO[inj.type].name;
}
function woundRank(bleed: number, i: Injury) { return bleed * 4 + (i.type === 'fracture' ? 2 : i.type === 'bruise' ? 0 : 1) + i.sev + i.infection * 2; }
const esc = (s: string) => s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));

// the instruments share geometry and two materials (the body console's own: solid, and a glass ghost)
const TOOL_GEO = new Map<string, THREE.BufferGeometry>();
function toolGeo(k: ToolKey): THREE.BufferGeometry { let g = TOOL_GEO.get(k); if (!g) { g = toolModel(k).build(); TOOL_GEO.set(k, g); } return g; }
let SOLID: THREE.Material | null = null, GHOST: THREE.Material | null = null;
function solidMat(st: BodyStage) { return SOLID ?? (SOLID = st.solid({ wear: 0.3 })); }
function ghostMat(st: BodyStage) { return GHOST ?? (GHOST = st.surf('glass', { alpha: 0.2, color: 0xa8b4b8 })); }

let view: HealthView | null = null;
/** the health check (built on first use) */
export function healthView(): HealthView { return view ?? (view = new HealthView()); }
