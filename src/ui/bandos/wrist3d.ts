// THE WRIST UNIT'S BODY (./bandos.ts): the operator band as a heavy field instrument strapped on the left
// forearm. Its face is drawn once by the machine renderer (src/ui/machine/core.ts) like every housing:
//
//   the case      an olive enamel slab, chamfered, riveted, worn through at the edges, a hazard
//                 strip along its foot, a brass maker's plate over the tube
//   the tube      a deep steel bezel and a sun visor round the CRT window (the screen itself is
//                 DOM, laid into the window by the shell)
//   the left      a punched speaker grille, the status lamps, and the SELECT dial's plate
//   the right     the brightness knob, the phosphor toggle, a vent
//   the foot      three push keys (RESUME, SAVE, QUIT) sit in the strip under the tube
//
// In first person (./bandos.ts) that face is laid onto the front of watchBody(): the case's 3D body, webbing
// straps round the forearm, the light; the forearm itself is the close-ups' arm (src/craft/fpKit.ts makeArm).
// The moving parts (the dial, the knob, the toggle, the keys, a lamp that blinks) are separate sprites from the
// machine kit laid over the face; their places are in the layout.
// Two layouts: 'wide' (a desktop: the unit across the forearm) and 'tall' (a phone held upright).
import * as THREE from 'three';
import { mxOk, shoot, sheet, animate, disposeTree, mxMat, type ShotOpts } from '../machine/core';
import { housing, meshOf, bolt, rivet, knobPart, R90 } from '../machine/parts';
import { Mold, M, STEEL, PAINT } from '../touch/stage3d';
import { fbox, fcyl, plate, clipRect } from '../touch/facet';
import { TONES, paintFace, canvasTex, type Rect } from '../machine/paint';
import { sfx } from '../menus/sfx';
import { fpLightRig } from '../../fp/hands';

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
  ox: -24, oy: -24, cw: 908, ch: 568,
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
export function wristArt(L: WristLayout): HTMLCanvasElement | null {
  if (!mxOk()) return null;
  const key = L.kind;
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
  try { shoot(root, L.cw, L.ch, 0, c, 0, 0, SHOT); } catch (e) { console.warn('wrist art', e); }
  root.remove(caseG);
  disposeTree(caseG);
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

// ---------------------------------------------------------------- the unit in first person
/** the unit's body as a 3D object (metres) for the first-person view: the case behind its painted face (the face
 *  itself is the DOM picture laid onto the plane z = 0), a back plate, webbing straps with steel buckles round the
 *  forearm, a light rig. `k` is metres per design pixel. */
export function watchBody(L: WristLayout, k: number): THREE.Group {
  const g = new THREE.Group();
  const W = L.W * k, H = L.H * k;
  const olive = new THREE.MeshStandardMaterial({ color: 0x4e5836, roughness: 0.72, metalness: 0.12 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23271a, roughness: 0.8, metalness: 0.2 });
  const web = new THREE.MeshStandardMaterial({ color: 0x5e5a38, roughness: 0.95 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb8c0bc, roughness: 0.3, metalness: 0.85 });
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => { const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.set(x, y, z); g.add(me); return me; };
  box(W * 0.985, H * 0.985, 0.022, olive, 0, 0, -0.0115);
  box(W * 0.9, H * 0.9, 0.012, dark, 0, 0, -0.028);
  const A = watchArm(L, k);
  const ax = A.wrist.clone().sub(A.elbow).normalize();
  const wide = L.kind === 'wide';
  for (const t of wide ? [-(W / 2 + 0.012), W / 2 + 0.01] : [-(H / 2 + 0.012), H / 2 + 0.01]) {
    // a strap round the forearm where it leaves the case, its buckle on the camera side
    const c = wide ? new THREE.Vector3(t, A.elbow.y + (A.wrist.y - A.elbow.y) * ((t - A.elbow.x) / (A.wrist.x - A.elbow.x)), A.wrist.z) : new THREE.Vector3(A.elbow.x + (A.wrist.x - A.elbow.x) * ((t - A.elbow.y) / (A.wrist.y - A.elbow.y)), t, A.wrist.z);
    const s = box(0.022, 0.1, 0.1, web, c.x, c.y, c.z);
    s.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), ax);
    const b = box(0.026, 0.034, 0.008, steel, c.x, c.y, c.z + 0.051);
    b.quaternion.copy(s.quaternion);
  }
  g.add(fpLightRig());
  return g;
}
/** where the forearm runs under the case (case-local metres): from the elbow (off the picture) to the wrist */
export function watchArm(L: WristLayout, k: number): { elbow: THREE.Vector3; wrist: THREE.Vector3 } {
  const W = L.W * k, H = L.H * k;
  return L.kind === 'wide'
    ? { elbow: new THREE.Vector3(-W / 2 - 0.2, -H * 0.42, -0.05), wrist: new THREE.Vector3(W / 2 + 0.035, -H * 0.04, -0.045) }
    : { elbow: new THREE.Vector3(W * 0.05, -H / 2 - 0.2, -0.05), wrist: new THREE.Vector3(-W * 0.02, H / 2 + 0.03, -0.045) };
}

// ---------------------------------------------------------------- the SELECT dial
/** H (home) and the nine apps round 270 degrees of a dark plate */
export const DIAL_POS = 9;
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
