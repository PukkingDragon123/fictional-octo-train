// THE LAB HUB'S CORNER KEYS AS 3D MODELS (round 18): high-resolution machine-kit renders (src/ui/machine/core.ts),
// each just the object floating with its soft dropped shadow: no plate, no frame, no label (the name shows under
// the pointer in small type). A filing drawer with tabbed folders (the codex), a miniature research-lattice rig
// with glowing nodes (the skill tree), a vending machine with lit buttons (the commissary), a jukebox with neon
// (the emotes), a blueprint roll with a pencil (decorate). Rendered at the device pixel ratio, so they stay sharp
// on a phone. They sway a little at rest; under the pointer they lift and light up; a click presses them down.
import * as THREE from 'three';
import { sheet, mxOk, mxMat } from '../../machine/core';
import { Mold, M, STEEL, CHROME, BRASS, RUBBER, PLASTIC, PAINT, GLASS, PAPER } from '../../touch/stage3d';
import { fcyl, fbox, fdome, fring, frod, plate, clipRect } from '../../touch/facet';
import { meshOf, R90 } from '../../machine/parts';

export type HubKind = 'codex' | 'tree' | 'shop' | 'jukebox' | 'blueprint';
const FRAMES = 16;
const PAD = 6;

/** a mesh that burns with its own light (neon, lamps, lit buttons): the machine material's glow at `col` x `k` */
function lit(m: Mold, col: number, k: number, parent: THREE.Object3D) {
  const mat = mxMat({ wear: 0, seed: 3 });
  const c = new THREE.Color(col);
  mat.uniforms.uGlow.value.set(c.r * k, c.g * k, c.b * k);
  meshOf(m, mat, parent);
}

function model(kind: HubKind, S: number, sway: number, hot: boolean): THREE.Object3D {
  const root = new THREE.Group();
  const tt = new THREE.Group();
  tt.position.set(S / 2, -S / 2, 0);
  tt.rotation.set(0.32, -0.5 + sway, 0);
  root.add(tt);
  const g = new THREE.Group();
  tt.add(g);
  const u = S / 24;
  const m = new Mold(), L = new Mold();
  const glowK = hot ? 1.25 : 0.75;
  switch (kind) {
    case 'codex': {
      // an olive filing cabinet, its top drawer pulled out: manila folders with coloured tabs standing in it
      m.add(fbox(16 * u, 15 * u, 12 * u, 0.06), M(0, -4 * u, -3 * u), (_x, _y, z) => (z > 2.5 * u ? 0x6e7a48 : 0x56603a), PAINT);
      m.add(fbox(14 * u, 0.5 * u, 0.4 * u, 0), M(0, -4.5 * u, 3.1 * u), 0x3a4026, PAINT);
      m.add(fbox(4 * u, 1 * u, 1 * u, 0.2), M(0, -7.5 * u, 3.4 * u), 0xc89a3a, BRASS);
      m.add(fbox(4 * u, 1.6 * u, 0.3 * u, 0), M(0, -9.5 * u, 3.2 * u), 0xe8e0c8, PAPER);
      // the drawer: sides, a front with its pull and label
      m.add(fbox(15 * u, 5 * u, 11 * u, 0.06), M(0, 4 * u, 4 * u), (_x, y) => (y > 6 * u ? 0x2a2a20 : 0x6e7a48), PAINT);
      m.add(fbox(15.4 * u, 5.4 * u, 1 * u, 0.1), M(0, 4 * u, 9.6 * u), 0x7c8856, PAINT);
      m.add(fbox(4.5 * u, 1.1 * u, 1.1 * u, 0.25), M(0, 3.3 * u, 10.4 * u), 0xd8aa48, BRASS);
      m.add(fbox(3.6 * u, 1.4 * u, 0.3 * u, 0), M(0, 5.3 * u, 10.2 * u), 0xf0ead8, PAPER);
      const tabs = [0xd84a32, 0x4a86d0, 0xe8c050, 0x5ae07a, 0xd8ccac, 0xb070d0];
      for (let i = 0; i < 6; i++) {
        const z = -0.5 * u + i * 1.6 * u;
        m.add(fbox(13 * u, 6 * u, 0.35 * u, 0), M(0, 8 * u, z, -0.08 + i * 0.03), 0xe6c47e, PAPER);
        m.add(fbox(3 * u, 1.4 * u, 0.4 * u, 0.1), M((-4.5 + (i % 3) * 4.5) * u, 11.4 * u, z), tabs[i], PLASTIC);
      }
      m.add(fbox(10 * u, 4 * u, 0.3 * u, 0), M(1 * u, 9.5 * u, 4.5 * u, -0.35), 0xf6f2e8, PAPER);
      break;
    }
    case 'tree': {
      // the research lattice in miniature: a steel base, a glass pane in a frame, nodes linked by rods, the lit ones green
      m.add(fbox(18 * u, 2 * u, 8 * u, 0.15), M(0, -10 * u, 0), 0x5a6060, STEEL);
      m.add(fbox(16 * u, 0.6 * u, 6 * u, 0.1), M(0, -8.8 * u, 0), 0x2a2e2c, RUBBER);
      for (const x of [-8.5, 8.5]) m.add(fbox(1.2 * u, 19 * u, 1.2 * u, 0.15), M(x * u, 0.5 * u, -1 * u), 0x9aa29e, CHROME);
      m.add(fbox(18 * u, 1.2 * u, 1.2 * u, 0.15), M(0, 10 * u, -1 * u), 0x9aa29e, CHROME);
      m.add(fbox(16 * u, 18 * u, 0.3 * u, 0), M(0, 0.5 * u, -1.6 * u), 0x0e1a14, GLASS);
      const nodes: [number, number, number][] = [[0, 7, 2], [-5, 2.5, 2], [5, 2.5, 1], [-6.5, -3.5, 2], [-1.5, -3.5, 2], [3.5, -3.5, 1], [7, -4, 0]];
      const links: [number, number][] = [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [2, 6], [4, 5]];
      for (const [a, b] of links) {
        const A = nodes[a], B = nodes[b];
        const on = A[2] === 2 && B[2] === 2;
        (on ? L : m).add(frod([A[0] * u, A[1] * u, 0], [B[0] * u, B[1] * u, 0], 0.35 * u, 5), null, on ? 0x5ae07a : 0x3a4a40, on ? PLASTIC : STEEL);
      }
      for (const [x, y, s] of nodes) {
        m.add(fcyl(1.6 * u, 0.8 * u, 8, 1.6 * u, 0.3), M(x * u, y * u, -0.3 * u, R90), 0x8a9290, CHROME);
        if (s === 0) m.add(fdome(1.1 * u, 8, 3), M(x * u, y * u, 0.2 * u, R90), 0x2a3a30, GLASS);
        else L.add(fdome(1.15 * u, 8, 3), M(x * u, y * u, 0.2 * u, R90), s === 2 ? 0x7aff9a : 0xffc040, GLASS);
      }
      lit(L, 0x5aff8a, glowK, g);
      break;
    }
    case 'shop': {
      // the commissary's vending machine: red enamel, the lit marquee, goods on spiral rows behind glass, keypad lamps
      m.add(fbox(15 * u, 22 * u, 9 * u, 0.06), M(0, 0, -1 * u), (_x, _y, z) => (z > 3 * u ? 0xb8301e : 0x8a2416), PAINT);
      m.add(fbox(10 * u, 15 * u, 0.4 * u, 0), M(-2 * u, 0.5 * u, 3.1 * u), 0x24384a, GLASS);
      const goods = [0xe2b21e, 0x6ad0c0, 0xd8402a, 0xe8e0d0, 0x8a5a30, 0x6a8ad0, 0x9ae070, 0xd870c0, 0xf0a040];
      for (let r = 0; r < 4; r++) {
        m.add(fbox(9.6 * u, 0.4 * u, 1.6 * u, 0), M(-2 * u, (5.5 - r * 3.8) * u, 3.8 * u), 0x8a9290, STEEL);
        for (let c = 0; c < 3; c++) m.add(fbox(2 * u, 2.6 * u, 1.6 * u, 0.2), M((-5 + c * 3) * u, (7 - r * 3.8) * u, 3.9 * u), goods[(r * 3 + c) % goods.length], PLASTIC);
      }
      m.add(fbox(3 * u, 10 * u, 0.6 * u, 0.1), M(5.2 * u, 2 * u, 3.6 * u), 0x9aa29e, CHROME);
      m.add(fbox(11 * u, 3 * u, 0.8 * u, 0.1), M(0, -8.5 * u, 3.6 * u), 0x1a1612, RUBBER);
      L.add(fbox(13 * u, 2.4 * u, 0.6 * u, 0.1), M(0, 9.6 * u, 3.7 * u), 0xfff0c0, GLASS);
      for (let i = 0; i < 4; i++) L.add(fbox(1.2 * u, 0.9 * u, 0.4 * u, 0.2), M(5.2 * u, (5.5 - i * 1.8) * u, 4.1 * u), [0x7aff9a, 0xffc040, 0xff6a4a, 0x7ab8ff][i], PLASTIC);
      lit(L, 0xffe0a0, glowK, g);
      break;
    }
    case 'jukebox': {
      // an arched jukebox: walnut cabinet, chrome trim, neon tubes round the arch, a record behind the glass, a grille
      m.add(fbox(16 * u, 14 * u, 8 * u, 0.08), M(0, -4 * u, -1 * u), (_x, _y, z) => (z > 2 * u ? 0x8a5428 : 0x6a3e1c), PAINT);
      m.add(fcyl(8 * u, 8 * u, 16, 8 * u, 0.1), M(0, 3 * u, -1 * u, R90), 0x7a4a22, PAINT);
      m.add(fbox(16 * u, 7 * u, 8 * u, 0), M(0, -0.5 * u, -1 * u), 0x7a4a22, PAINT);
      m.add(fcyl(5.6 * u, 0.4 * u, 16, 5.6 * u, 0), M(0, 4 * u, 3.2 * u, R90), 0x0e0c0a, GLASS);
      m.add(fcyl(4 * u, 0.3 * u, 16, 4 * u, 0), M(0, 4 * u, 3.4 * u, R90), 0x16161a, RUBBER);
      m.add(fcyl(1.4 * u, 0.4 * u, 10, 1.4 * u, 0), M(0, 4 * u, 3.6 * u, R90), 0xd84a32, PAPER);
      m.add(fbox(11 * u, 6 * u, 0.4 * u, 0), M(0, -6.5 * u, 3.2 * u), 0xb8862c, BRASS);
      for (let i = -4; i <= 4; i++) m.add(fbox(0.5 * u, 5 * u, 0.4 * u, 0), M(i * 1.2 * u, -6.5 * u, 3.5 * u), 0xe8c050, BRASS);
      m.add(fbox(12 * u, 1.6 * u, 0.6 * u, 0.1), M(0, -2.2 * u, 3.3 * u), 0xe8e0c8, PAPER);
      L.add(fring(7.2 * u, 0.5 * u, 18, 5, Math.PI), M(0, 3 * u, 3.4 * u), 0xff5ac8, GLASS);
      L.add(fring(6.3 * u, 0.4 * u, 18, 5, Math.PI), M(0, 3 * u, 3.6 * u), 0x5ae0ff, GLASS);
      for (const x of [-7.2, 7.2]) L.add(fbox(1 * u, 13 * u, 1 * u, 0.2), M(x * u, -4.5 * u, 3.2 * u), x < 0 ? 0xffb040 : 0x7aff9a, GLASS);
      lit(L, 0xff9ad8, glowK * 1.1, g);
      break;
    }
    case 'blueprint': {
      // a blueprint half unrolled (the grid, a plan in white), the roll with its spiral ends and a red band, a pencil
      m.add(plate(clipRect(17 * u, 12 * u, 0.4 * u), 0.4 * u, 0), M(1.5 * u, -2 * u, -1 * u, -0.9), (x, y) => (Math.abs(((x / u) % 2.4)) < 0.3 || Math.abs(((y / u) % 2.4)) < 0.3 ? 0x8ab8f0 : 0x245aa8), PAINT);
      for (const [a, b] of [[[-5, -6], [7, -6]], [[7, -6], [7, 3]], [[-5, -6], [-5, 3]], [[-5, 3], [7, 3]], [[1, -6], [1, 0]], [[1, 0], [7, 0]]] as [number, number][][]) {
        m.add(frod([(a[0] + 1.5) * u, (a[1] - 2) * u * 0.62 - 1 * u, 0], [(b[0] + 1.5) * u, (b[1] - 2) * u * 0.62 - 1 * u, 0], 0.22 * u, 4), M(0, 0, 0, -0.9), 0xf0f6ff, PAPER);
      }
      m.add(fcyl(3.2 * u, 19 * u, 12, 3.2 * u, 0.15), M(-8 * u, 2 * u, 1 * u, 0, 0, 0.12), (_x, y, z) => (Math.abs(y) < 0.4 * u && z > 0 ? 0xc8e0ff : 0x3a6aaa), PAINT);
      m.add(fring(3.35 * u, 0.5 * u, 12, 4), M(-8 * u, 4 * u, 1 * u, R90, 0, 0.12), 0xc8281c, RUBBER);
      for (const y of [-7.5, 11.5]) m.add(fring(2 * u, 0.35 * u, 10, 4), M(-8 * u + y * 0.12 * u, y * u, 1 * u, R90, 0, 0.12), 0xd8e8ff, PAPER);
      // the pencil across the sheet
      m.add(fcyl(0.8 * u, 14 * u, 6, 0.8 * u, 0.1), M(4 * u, -1 * u, 3 * u, 0, 0, 0.9), 0xe8b020, PAINT);
      m.add(fcyl(0.05 * u, 2 * u, 6, 0.8 * u, 0), M(-1.5 * u, -5.7 * u, 3 * u, 0, 0, 0.9 + Math.PI), 0xe8c890, PAPER);
      m.add(fcyl(0.85 * u, 1.4 * u, 6, 0.85 * u, 0.1), M(9.3 * u, 3.6 * u, 3 * u, 0, 0, 0.9), 0xb8bcb4, CHROME);
      m.add(fcyl(0.85 * u, 1.2 * u, 6, 0.85 * u, 0.2), M(10.2 * u, 4.4 * u, 3 * u, 0, 0, 0.9), 0xe07a7a, RUBBER);
      break;
    }
  }
  meshOf(m, mxMat({ wear: 0.35, seed: kind.length * 7 }), g);
  return root;
}

const SHOT = { shear: [0, 0] as [number, number], shadow: [3, 5] as [number, number], shadowA: 0.32 };
const dpr = () => Math.max(1, Math.min(3, window.devicePixelRatio || 1));

export interface HubIcon { cv: HTMLCanvasElement; hot(on: boolean): void; size: number }
/** a corner key's model: a canvas `size` CSS px square (plus a little pad), drawn at the device pixel ratio */
export function hubIcon(kind: HubKind, size: number): HubIcon | null {
  if (!mxOk()) return null;
  const k = dpr();
  const sh = (hot: boolean) => sheet(`hub|${kind}|${size}|${k}|${hot ? 1 : 0}`, size, size, PAD, FRAMES, (f) => model(kind, size, Math.sin((f / FRAMES) * Math.PI * 2) * 0.22, hot), { ...SHOT, k });
  const rest = sh(false), hotS = sh(true);
  if (!rest || !hotS) return null;
  const fw = Math.round((size + PAD * 2) * k), fh = fw;
  const cv = document.createElement('canvas');
  cv.width = fw; cv.height = fh;
  cv.className = 'dk-3dm';
  cv.style.width = cv.style.height = size + PAD * 2 + 'px';
  const c = cv.getContext('2d')!;
  let ph = Math.random() * FRAMES, on = false, cur = -1, curHot = false;
  const draw = () => {
    const f = Math.floor(ph) % FRAMES;
    if (f === cur && on === curHot) return;
    cur = f; curHot = on;
    c.clearRect(0, 0, fw, fh);
    c.drawImage(on ? hotS : rest, 0, f * fh, fw, fh, 0, 0, fw, fh);
  };
  let last = performance.now();
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!cv.isConnected) return;
    ph = (ph + dt * (on ? 9 : 3)) % FRAMES;
    draw();
  };
  draw();
  requestAnimationFrame(loop);
  return { cv, size, hot: (v) => { on = v; draw(); } };
}
