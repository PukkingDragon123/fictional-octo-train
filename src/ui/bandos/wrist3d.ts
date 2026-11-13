// THE WRIST UNIT'S BODY (./bandos.ts): the operator band as a heavy field instrument strapped on the
// left forearm, drawn once by the machine renderer (src/ui/machine/core.ts) like every housing:
//
//   the case      an olive enamel slab, chamfered, riveted, worn through at the edges, a hazard
//                 strip along its foot, a brass maker's plate over the tube
//   the tube      a deep steel bezel and a sun visor round the CRT window (the screen itself is
//                 DOM, laid into the window by the shell)
//   the left      a punched speaker grille, the status lamps, and the SELECT dial's plate
//   the right     the brightness knob, the phosphor toggle, a vent
//   the foot      three push keys (RESUME, SAVE, QUIT) sit in the strip under the tube
//   the arm       the forearm in its jumpsuit sleeve (src/fp/hands.ts, the same 3D arm every
//                 close-up uses), the case on two webbing straps with steel buckles
//
// The moving parts (the dial, the knob, the toggle, the keys, a lamp that blinks) are separate
// sprites from the machine kit laid over this picture; their places are in the layout.
// Two layouts: 'wide' (a desktop: the arm across the picture, the case big in the middle) and
// 'tall' (a phone held upright: the case fills the screen, no arm).
import * as THREE from 'three';
import { mxOk, shoot, sheet, animate, disposeTree, mxMat, type ShotOpts } from '../machine/core';
import { housing, meshOf, bolt, rivet, knobPart, R90 } from '../machine/parts';
import { Mold, M, STEEL, CHROME, PAINT, CLOTH, RUBBER } from '../touch/stage3d';
import { fbox, fcyl, plate, clipRect } from '../touch/facet';
import { TONES, paintFace, canvasTex, type Rect } from '../machine/paint';
import { sfx } from '../menus/sfx';
import { fpArm } from '../../fp/hands';

export interface WristLayout {
  kind: 'wide' | 'tall';
  /** the case (design px) */
  W: number; H: number;
  /** the CRT window */
  scr: Rect;
  /** the SELECT dial's plate (top-left, size), the brightness knob, the phosphor toggle */
  dial: { x: number; y: number; s: number };
  knob: { x: number; y: number; s: number };
  tog: { x: number; y: number };
  /** RESUME, SAVE, QUIT */
  keys: Rect[];
  /** the message lamp (centre) */
  msg: { x: number; y: number };
  /** the picture: its top-left relative to the case's top-left (negative: the arm reaches past), its size */
  ox: number; oy: number; cw: number; ch: number;
}

export const WIDE: WristLayout = {
  kind: 'wide', W: 860, H: 520,
  scr: { x: 158, y: 50, w: 544, h: 376 },
  dial: { x: 20, y: 246, s: 116 },
  knob: { x: 750, y: 58, s: 58 },
  tog: { x: 764, y: 168 },
  keys: [{ x: 214, y: 450, w: 124, h: 50 }, { x: 368, y: 450, w: 124, h: 50 }, { x: 522, y: 450, w: 124, h: 50 }],
  msg: { x: 112, y: 34 },
  ox: -300, oy: -40, cw: 1500, ch: 640,
};
export const TALL: WristLayout = {
  kind: 'tall', W: 390, H: 844,
  scr: { x: 16, y: 50, w: 358, h: 574 },
  dial: { x: 16, y: 660, s: 128 },
  knob: { x: 160, y: 650, s: 56 },
  tog: { x: 172, y: 734 },
  keys: [{ x: 238, y: 652, w: 136, h: 50 }, { x: 238, y: 710, w: 136, h: 50 }, { x: 238, y: 768, w: 136, h: 50 }],
  msg: { x: 76, y: 26 },
  ox: -16, oy: -16, cw: 422, ch: 876,
};

const SHOT: ShotOpts = { shear: [-0.14, -0.24], shadow: [3, 4], shadowA: 0.5, edge: 2.2 };
const cache = new Map<string, HTMLCanvasElement>();

/** the case (and on 'wide' the arm) as one picture; null without WebGL */
export function wristArt(L: WristLayout, skin = 0xe8b98f, sleeve = 0xeeb415): HTMLCanvasElement | null {
  if (!mxOk()) return null;
  const key = `${L.kind}|${skin}|${sleeve}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = L.cw; cv.height = L.ch;
  const c = cv.getContext('2d')!;
  const root = new THREE.Group();
  // shoot() maps the scene's (0, 0) to the picture's top-left: the case's top-left sits at (-ox, oy) in scene units
  const caseG = buildCase(L);
  caseG.position.set(-L.ox, L.oy, 0);
  root.add(caseG);
  const arm = L.kind === 'wide' ? buildArm(L, skin, sleeve) : null;
  if (arm) { arm.g.position.x -= L.ox; arm.g.position.y += L.oy; root.add(arm.g); }
  try { shoot(root, L.cw, L.ch, 0, c, 0, 0, SHOT); } catch (e) { console.warn('wrist art', e); }
  root.remove(caseG);
  disposeTree(caseG);
  arm?.dispose();
  cache.set(key, cv);
  return cv;
}

function buildCase(L: WristLayout): THREE.Group {
  const g = new THREE.Group();
  const { W, H, scr } = L, wide = L.kind === 'wide';
  const T = TONES.olive, D = TONES.dark;
  const grille: Rect = wide ? { x: 28, y: 62, w: 104, h: 128 } : { x: 300, y: 14, w: 70, h: 24 };
  const hs = housing({
    w: W, h: H, seed: 23, tone: 'olive', depth: 22, wear: 0.62, cut: wide ? 30 : 22,
    win: { ...scr, cut: 12, lip: 7, lipTone: 'dark', back: true },
    plates: [wide
      ? { x: W / 2 - 120, y: 12, w: 240, h: 26, text: 'MERIDIAN  MI-7 FIELD BAND', ground: 'brass', px: 12 }
      : { x: 100, y: 12, w: 188, h: 26, text: 'MERIDIAN  MI-7', ground: 'brass', px: 12 }],
    lamps: wide ? [{ x: 40, y: 34, col: 'green', on: true, r: 3.4 }, { x: 76, y: 34, col: 'amber', on: true, r: 3.4 }] : [{ x: 24, y: 26, col: 'green', on: true, r: 3 }, { x: 50, y: 26, col: 'amber', on: true, r: 3 }],
    grilles: [grille],
    vents: wide ? [{ x: 738, y: 262, w: 96, h: 64 }] : [],
    hazPaint: wide ? [{ x: 30, y: H - 16, w: W - 60, h: 8 }] : [{ x: 24, y: H - 14, w: W - 48, h: 7 }],
    stencils: wide ? [
      { text: 'SELECT', x: 78, y: 386, px: 14, align: 'center' },
      { text: 'BRIGHT', x: 779, y: 136, px: 12, align: 'center' },
      { text: 'PHOS', x: 781, y: 236, px: 12, align: 'center' },
      { text: 'MI-7', x: 784, y: 360, px: 22, align: 'center', alpha: 0.7 },
      { text: 'PWR', x: 40, y: 54, px: 9, align: 'center' }, { text: 'LINK', x: 76, y: 54, px: 9, align: 'center' }, { text: 'MSG', x: 112, y: 54, px: 9, align: 'center' },
    ] : [
      { text: 'SELECT', x: 80, y: 804, px: 13, align: 'center' },
      { text: 'BRIGHT', x: 188, y: 722, px: 11, align: 'center' },
      { text: 'PHOS', x: 189, y: 808, px: 11, align: 'center' },
    ],
    seamsY: wide ? [440] : [638],
    rivets: true, guards: true,
  });
  g.add(hs.root);
  // the tube: a deep steel bezel round the window, and a sun visor over its top edge
  const m = new Mold();
  const bz = 14, cx = scr.x + scr.w / 2, cy = -(scr.y + scr.h / 2);
  m.add(plate(clipRect(scr.w + bz * 2, scr.h + bz * 2, 16), 11, 2.2, [clipRect(scr.w + 2, scr.h + 2, 12)]), M(cx, cy, 0), (_x, _y, _z, _nx, ny, nz) => (nz > 0.6 ? D[3] : ny > 0.3 ? D[4] : D[1]), STEEL);
  if (wide) {
    m.add(fbox(scr.w + bz * 2 + 12, 8, 34, 0.25), M(cx, -(scr.y - bz) + 2, 24, -0.55), (_x, _y, _z, _nx, ny) => (ny > 0.4 ? T[4] : T[2]), PAINT);
    // the visor's cheeks
    for (const s of [-1, 1]) m.add(fbox(6, 30, 30, 0.2), M(cx + s * (scr.w / 2 + bz + 3), -(scr.y - bz) - 10, 16, 0, 0, 0), T[1], PAINT);
  }
  // screws in the bezel's corners
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) bolt(m, cx + sx * (scr.w / 2 + bz * 0.55), -cy + sy * (scr.h / 2 + bz * 0.55), 11, 2.4, 0xa8b0aa, 5);
  // the dial's and the key strip's wells
  m.add(plate(clipRect(L.dial.s + 14, L.dial.s + 14, 10), 4, 1.2, [clipRect(L.dial.s + 2, L.dial.s + 2, 8)]), M(L.dial.x + L.dial.s / 2, -(L.dial.y + L.dial.s / 2), 0), D[2], STEEL);
  const k0 = L.keys[0], k2 = L.keys[L.keys.length - 1];
  const kb: Rect = { x: Math.min(k0.x, k2.x) - 10, y: k0.y - 8, w: Math.max(k0.x + k0.w, k2.x + k2.w) - Math.min(k0.x, k2.x) + 20, h: k2.y + k2.h - k0.y + 16 };
  m.add(plate(clipRect(kb.w, kb.h, 8), 3, 1, [clipRect(kb.w - 8, kb.h - 8, 6)]), M(kb.x + kb.w / 2, -(kb.y + kb.h / 2), 0), D[2], STEEL);
  // the message lamp's empty socket (its glass is a sprite over it)
  m.add(fcyl(6.4, 1.6, 12, 6.8, 0.3), M(L.msg.x, -L.msg.y, 0.8, R90), 0x3a3f38, STEEL);
  // mounting lugs at the ends and their rivets
  if (wide) for (const s of [0, 1]) {
    const x = s ? W + 10 : -10;
    m.add(fbox(30, 150, 18, 0.3), M(x, -H * 0.56, -6), T[1], PAINT);
    for (const y of [-H * 0.56 - 56, -H * 0.56 + 56]) rivet(m, x, -y, 3, 2.2, T[3]);
  }
  meshOf(m, mxMat({ wear: 0.5, seed: 29 }), g);
  return g;
}

/** the left forearm under the case (the hand out to the right), and two webbing straps round it.
 *  The arm is the close-ups' 3D arm (src/fp/hands.ts), posed, then baked into one machine-shaded mesh so it is
 *  lit, inked and dithered like the case. */
function buildArm(L: WristLayout, skin: number, sleeve: number): { g: THREE.Group; dispose(): void } {
  const g = new THREE.Group();
  const SC = 4300;
  const arm = fpArm('left', { skin, sleeve, sleeveStyle: 'long' });
  arm.reach = null;
  arm.pose('relaxed', true);
  arm.update(0);
  // the forearm runs along +x (elbow left, hand right), the back of the hand toward the camera
  const holder = new THREE.Group();
  holder.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1)));
  holder.scale.setScalar(SC);
  const ay = -L.H * 0.5 + 56, az = -235, elbowX = -220;
  holder.position.set(elbowX, ay, az);
  holder.add(arm.root);
  holder.updateMatrixWorld(true);
  const body = new Mold(true);
  arm.root.traverse((o) => {
    const me = o as THREE.Mesh;
    if (!me.isMesh || !me.visible) return;
    let vis = true; for (let q: THREE.Object3D | null = me; q; q = q.parent) if (!q.visible) vis = false;
    if (!vis) return;
    const mt = me.material as THREE.MeshStandardMaterial;
    const hex = mt.color ? mt.color.getHex() : 0xc0a080;
    const cloth = hex === new THREE.Color(sleeve).getHex();
    body.add(me.geometry.clone(), me.matrixWorld.clone(), hex, cloth ? CLOTH : SKIN);
  });
  holder.remove(arm.root);
  arm.dispose();
  // the sleeve carries on past the elbow, out of the picture
  body.add(fcyl(226, 560, 14, 236, 0.2), M(elbowX - 270, ay, az, 0, 0, R90), sleeve, CLOTH);
  // the straps: khaki webbing round the arm either side of the case, a steel buckle on each
  const st = new Mold();
  for (const [x, d] of [[-34, 468], [L.W + 30, 388]]) {
    st.add(fbox(22, d, d, 0.1), M(x, ay, az), 0x6a6440, CLOTH);
    st.add(fbox(30, 46, 10, 0.3), M(x, ay + 20, az + d / 2 + 3), 0xb0b8b4, CHROME);
    st.add(fbox(18, 30, 5, 0.2), M(x, ay + 20, az + d / 2 + 7), 0x2a2e2c, RUBBER);
    st.add(fbox(6, 36, 6, 0.2), M(x, ay + 20, az + d / 2 + 10), 0xd0d8d4, CHROME);
  }
  const mats = [mxMat({ wear: 0.12, seed: 41 }), mxMat({ wear: 0.4, seed: 43 })];
  meshOf(body, mats[0], g);
  meshOf(st, mats[1], g);
  return {
    g,
    dispose: () => { for (const o of [...g.children]) if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); for (const mt of mats) mt.dispose(); },
  };
}
/** skin: a little sheen, no rust, takes grime */
const SKIN: [number, number, number, number] = [0.14, 0, 0.8, 0];

// ---------------------------------------------------------------- the SELECT dial
/** H (home) and the nine apps round 270 degrees of a dark plate */
export const DIAL_POS = 10;
const DIAL_F = (DIAL_POS - 1) * 3 + 1;
function dialScale(s: number): HTMLCanvasElement {
  const cv = paintFace({ w: s, h: s, tone: 'dark', seed: 12, cut: 6, wear: 0.45 });
  const c = cv.getContext('2d')!;
  const cx = s / 2, cy = s / 2;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `${Math.round(s * 0.085)}px Alagard, monospace`;
  for (let p = 0; p < DIAL_POS; p++) {
    const a = -1.25 * Math.PI + 1.5 * Math.PI * (p / (DIAL_POS - 1));
    const r0 = s * 0.37, r1 = s * 0.405, rl = s * 0.455;
    c.strokeStyle = p === 0 ? '#e8642a' : '#e8c440'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); c.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); c.stroke();
    c.fillStyle = p === 0 ? '#ff8a4a' : '#f0d878';
    c.fillText(p === 0 ? 'H' : String(p), Math.round(cx + Math.cos(a) * rl), Math.round(cy + Math.sin(a) * rl) + 1);
  }
  return cv;
}
/** the big rotary selector: to(p) turns it to a position, a ratchet click at every detent it passes */
export function wristDial(s: number): { cv: HTMLCanvasElement; to(p: number, quiet?: boolean): void; readonly pos: number } | null {
  if (!mxOk()) return null;
  const pad = 5, fw = s + pad * 2;
  let tex: THREE.Texture | null = null;
  const sh = () => sheet(`wdial|${s}`, s, s, pad, DIAL_F, (f) => { tex ??= canvasTex(dialScale(s)); (tex as any)._keep = true; return knobPart(s, f / (DIAL_F - 1), 4, tex); }, { shadow: [2, 3] });
  const cv = document.createElement('canvas'); cv.className = 'wt-dial-cv';
  cv.width = fw; cv.height = fw;
  let f = 0, goal = 0, cur = -1, run = false;
  const draw = () => {
    const fi = Math.round(f);
    if (fi === cur) return;
    if (cur >= 0 && fi % 3 === 0 && fi !== cur) sfx('ratchet', 0.32);
    cur = fi;
    const S = sh(); if (!S) return;
    const c = cv.getContext('2d')!;
    c.clearRect(0, 0, fw, fw);
    c.drawImage(S, 0, fi * fw, fw, fw, 0, 0, fw, fw);
  };
  draw();
  const api = {
    cv,
    get pos() { return Math.round(goal / 3); },
    to(p: number, quiet = false) {
      goal = Math.max(0, Math.min(DIAL_POS - 1, p)) * 3;
      if (quiet) { f = goal; cur = -1; draw(); return; }
      if (run) return;
      run = true;
      animate({ step: (dt) => { const sp = dt * 40; f = f < goal ? Math.min(goal, f + sp) : Math.max(goal, f - sp); draw(); if (f === goal) { run = false; return false; } return true; } });
    },
  };
  return api;
}
