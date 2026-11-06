// SET DRESSING for the lab rooms (the control room, the codex archive, the
// unit room): the same faceted low-poly kit as the menu's own rooms
// (scene/facet.ts, monitor/props.ts), pixel textures, merged per material.
// A Dresser places props on a wall or a surface by a transform whose local
// +Z faces out into the room; everything static goes into one FacetBuilder,
// the few moving bits (gauge needles, clock hands, swinging tags) are kept
// and turned in update(t).
//   gauges     a riveted panel of round dials (cream faces, red zones, live needles), pilot lamps, a toggle row
//   fuseBox    a grey breaker box, its door ajar, conduit up to the ceiling, a warning plate
//   filing     a four-drawer steel cabinet, handles, card slots with labels, dents, a box on top
//   tray       a ladder cable tray on drop rods with bundled cables, a few sagging loose between rungs
//   droop      a cable hung between two points (a catenary)
//   clock      the institute clock: cage, face, hands set to the real time, a second hand ticking
//   extinguisher  a red bottle on its bracket with the pull pin and the tag
//   clutter    a working surface's leavings: paper stacks, a binder, a mug with a ring, an ashtray, pens, floppies, a coffee tin
//   boxes      a stack of archive boxes with lids, labels, string
//   vent       a louvred grille with dust streaks under it
//   streaks    rust drips down a wall (a multiplied pixel card)
//   puddle     a dark specular patch on the floor (picks up the tubes)
import * as THREE from 'three';
import type { FMats } from '../scene/pixtex';
import { FacetBuilder, at, cbox, prism, lathe, extrude, tube, bolt, C, LedBank, plate, paper, blink, type V3 } from '../monitor/props';

const T = (m: THREE.Matrix4, l: THREE.Matrix4) => m.clone().multiply(l);
let seedN = 9001;
const rng = (s: number) => () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);

/** a nearest-filtered canvas texture */
function pixTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** a dial face: cream enamel, ticks, a red zone, a maker's word; 40px */
const faceCache = new Map<string, THREE.Texture>();
function dialFace(kind: 'psi' | 'volt' | 'temp' | 'hum' | 'clock'): THREE.Texture {
  let t = faceCache.get(kind);
  if (t) return t;
  const S = kind === 'clock' ? 48 : 40;
  t = pixTex(S, S, (c) => {
    const r = S / 2;
    c.fillStyle = '#16181a'; c.fillRect(0, 0, S, S);
    c.fillStyle = kind === 'clock' ? '#e8e2cc' : '#ded4b4';
    c.beginPath(); c.arc(r, r, r - 1, 0, Math.PI * 2); c.fill();
    // ageing: a yellowed crescent and specks
    c.fillStyle = 'rgba(150,110,40,0.18)'; c.beginPath(); c.arc(r + 3, r + 4, r - 3, 0, Math.PI * 2); c.fill();
    const R = rng(S * 7 + kind.length);
    for (let i = 0; i < 16; i++) { c.fillStyle = 'rgba(60,40,20,0.35)'; c.fillRect(Math.floor(R() * S), Math.floor(R() * S), 1, 1); }
    const a0 = kind === 'clock' ? -Math.PI / 2 : Math.PI * 0.75, span = kind === 'clock' ? Math.PI * 2 : Math.PI * 1.5, n = kind === 'clock' ? 60 : 20;
    if (kind !== 'clock') {
      // the red zone over the last fifth
      c.strokeStyle = '#b82a1e'; c.lineWidth = 3; c.beginPath(); c.arc(r, r, r - 5, a0 + span * 0.78, a0 + span); c.stroke();
      c.strokeStyle = '#3a8a4a'; c.beginPath(); c.arc(r, r, r - 5, a0 + span * 0.3, a0 + span * 0.6); c.stroke();
    }
    c.fillStyle = '#1a1a1e';
    for (let i = 0; i <= n; i++) {
      if (kind === 'clock' && i === n) break;
      const a = a0 + (span * i) / n, big = kind === 'clock' ? i % 5 === 0 : i % 5 === 0;
      const r0 = r - (big ? 7 : 4), r1 = r - 2;
      for (let k = r0; k <= r1; k += 0.7) c.fillRect(Math.round(r + Math.cos(a) * k), Math.round(r + Math.sin(a) * k), 1, 1);
    }
    // a maker's word (pixel scribble) and the hub
    c.fillStyle = '#4a4436';
    for (let x = r - 6; x < r + 6; x += 2) c.fillRect(x, r + (kind === 'clock' ? 9 : 7), 1, 2);
    c.fillStyle = '#1a1a1e'; c.fillRect(r - 1, r - 1, 3, 3);
  });
  faceCache.set(kind, t);
  return t;
}

/** a moving part: rotated about its local Z each frame */
interface Spin { o: THREE.Object3D; f: (t: number) => number }

export class Dresser {
  readonly b = new FacetBuilder();
  readonly group = new THREE.Group();
  private spins: Spin[] = [];
  private swings: { o: THREE.Object3D; ph: number }[] = [];
  constructor(readonly mats: FMats, readonly leds?: LedBank) { this.group.name = 'dressing'; }

  /** a round dial at m (local +Z out), radius r; returns its needle */
  dial(m: THREE.Matrix4, r: number, kind: 'psi' | 'volt' | 'temp' | 'hum', f: (t: number) => number) {
    const b = this.b;
    b.add('brass', lathe([[0, 0], [r * 1.12, 0], [r * 1.16, r * 0.25], [r * 1.05, r * 0.32], [r * 0.98, r * 0.3], [0, r * 0.3]], 12), 0xffffff, T(m, at(0, 0, 0, Math.PI / 2)));
    b.add('metal', cbox(r * 0.4, r * 0.5, r * 0.4, r * 0.06), C.darker, T(m, at(0, -r * 1.1, -r * 0.1)));
    const face = new THREE.Mesh(new THREE.CircleGeometry(r, 16), new THREE.MeshStandardMaterial({ map: dialFace(kind), roughness: 0.35, metalness: 0 }));
    face.applyMatrix4(T(m, at(0, 0, r * 0.3 + 0.001)));
    face.receiveShadow = true;
    this.group.add(face);
    const nd = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.08, r * 0.82).translate(0, r * 0.32, 0), new THREE.MeshBasicMaterial({ color: 0x1a0a08 }));
    const hub = new THREE.Group(); hub.applyMatrix4(T(m, at(0, 0, r * 0.3 + 0.003))); hub.add(nd); this.group.add(hub);
    // glass: a faint sheen card
    const gl = new THREE.Mesh(new THREE.CircleGeometry(r * 0.98, 12), new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.05, metalness: 1, transparent: true, opacity: 0.18, depthWrite: false }));
    gl.applyMatrix4(T(m, at(0, 0, r * 0.3 + 0.006))); gl.userData.noGlow = true; this.group.add(gl);
    this.spins.push({ o: nd, f: (t) => Math.PI * 0.75 - f(t) * Math.PI * 1.5 });
  }

  /** a riveted panel of dials, lamps and toggles: cols x rows dials */
  gauges(m: THREE.Matrix4, cols = 3, rows = 1, o: { color?: number; labels?: string[]; seed?: number } = {}) {
    const b = this.b, R = rng(o.seed ?? seedN++);
    const dr = 0.075, gx = 0.2, w = cols * gx + 0.08, h = rows * 0.22 + 0.16;
    b.add('paint', cbox(w, h, 0.04, 0.008), o.color ?? 0x4a5a52, T(m, at(0, 0, 0.02)), { rep: 0.3 });
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add('metal', bolt(0.008), C.steel, T(m, at(sx * (w / 2 - 0.02), sy * (h / 2 - 0.02), 0.04, Math.PI / 2)));
    const kinds = ['psi', 'volt', 'temp', 'hum'] as const;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = -w / 2 + 0.04 + gx * (i + 0.5), y = h / 2 - 0.06 - j * 0.22 - 0.06;
      const base = 0.3 + R() * 0.4, amp = 0.02 + R() * 0.06, hz = 0.3 + R() * 1.5, ph = R() * 9, k = kinds[Math.floor(R() * 4)];
      this.dial(T(m, at(x, y, 0.04)), dr, k, (t) => base + Math.sin(t * hz + ph) * amp + (Math.sin(t * 17 + ph) > 0.97 ? 0.05 : 0));
      // a little stencilled plate under each
      b.add('metal', cbox(0.11, 0.022, 0.006, 0.002), 0xc8c0a0, T(m, at(x, y - dr - 0.035, 0.044)));
    }
    // a strip of pilot lamps and toggles along the bottom
    const by = -h / 2 + 0.045;
    for (let i = 0; i < cols * 2; i++) {
      const x = -w / 2 + 0.06 + (i * (w - 0.12)) / Math.max(1, cols * 2 - 1);
      if (i % 2) {
        b.add('metal', cbox(0.03, 0.04, 0.01, 0.003), C.darker, T(m, at(x, by, 0.044)));
        b.add('chrome', prism(0.0045, 0.035, 5), 0xffffff, T(m, at(x, by + 0.008, 0.06, 0.6 * (R() < 0.5 ? 1 : -1))));
      } else if (this.leds && this.leds.leds.length < this.leds.mesh.instanceMatrix.count - 1) {
        const p = new THREE.Vector3(x, by, 0.05).applyMatrix4(m);
        b.add('metal', prism(0.012, 0.012, 6), C.darker, T(m, at(x, by, 0.044, Math.PI / 2)));
        this.leds.add(p, [0x6aff6a, 0xffb43c, 0xff4a2a][Math.floor(R() * 3)], { size: 0.008, pattern: R() < 0.35 ? blink(0.4 + R() * 2, 0.5, R()) : undefined, level: 0.9 });
      }
    }
    if (o.labels?.length) this.label(T(m, at(0, h / 2 + 0.05, 0.01)), o.labels, Math.min(w, 0.5), 0.07);
  }

  /** a grey breaker box with its door ajar, a conduit up to `toY` (world height), a warning plate */
  fuseBox(m: THREE.Matrix4, toY?: number, o: { w?: number; h?: number; color?: number } = {}) {
    const b = this.b, w = o.w ?? 0.36, h = o.h ?? 0.48, col = o.color ?? 0x8a8e84;
    b.add('paint', cbox(w, h, 0.14, 0.012), col, T(m, at(0, 0, 0.07)), { rep: 0.3 });
    // the door, hinged on the left and swung out a little
    const door = T(m, at(-w / 2, 0, 0.145, 0, -0.5));
    b.add('paint', cbox(w - 0.01, h - 0.01, 0.014, 0.004), col, T(door, at(w / 2, 0, 0)), { rep: 0.3 });
    b.add('chrome', cbox(0.016, 0.06, 0.016, 0.004), 0xffffff, T(door, at(w - 0.04, 0, 0.012)));
    // the breakers behind it (two rows of black throws, one tripped)
    for (let j = 0; j < 2; j++) for (let i = 0; i < 6; i++) {
      const x = -w / 2 + 0.05 + i * ((w - 0.1) / 5), y = 0.08 - j * 0.16;
      b.add('bakelite', cbox(0.036, 0.07, 0.03, 0.006), 0x1a1a1a, T(m, at(x, y, 0.14)));
      b.add('bakelite', cbox(0.012, 0.024, 0.014, 0.003), i === 3 && j === 1 ? 0xc83a2a : 0x2a2a2a, T(m, at(x, y + (i === 3 && j === 1 ? -0.018 : 0.018), 0.16)));
    }
    if (toY !== undefined) {
      const top = new THREE.Vector3(0, h / 2, 0.05).applyMatrix4(m);
      const len = toY - top.y;
      if (len > 0.05) {
        b.add('metal', prism(0.022, len, 7), 0x9a9e98, at(top.x, top.y + len / 2, top.z), { rep: 0.3 });
        for (let y = 0.25; y < len; y += 0.6) b.add('metal', cbox(0.07, 0.025, 0.05, 0.006), C.dark, at(top.x, top.y + y, top.z - 0.02));
      }
    }
    this.label(T(m, at(0, -h / 2 - 0.06, 0.01)), ['DANGER', '415 V'], 0.2, 0.08, 0xd8a030, 0x1a1208);
  }

  /** a four-drawer steel filing cabinet standing at m (floor level, front +Z) */
  filing(m: THREE.Matrix4, o: { color?: number; drawers?: number; open?: number; labels?: string[]; seed?: number } = {}) {
    const b = this.b, n = o.drawers ?? 4, col = o.color ?? 0x6e7a6a, R = rng(o.seed ?? seedN++);
    const w = 0.46, d = 0.62, dh = 0.31, H = n * dh + 0.06;
    b.add('paint', cbox(w, H, d, 0.012), col, T(m, at(0, H / 2, 0)), { rep: 0.35 });
    b.add('rubber', cbox(w - 0.02, 0.04, d - 0.04, 0.006), 0x1a1a1a, T(m, at(0, 0.02, 0)));
    for (let i = 0; i < n; i++) {
      const y = 0.06 + dh * (i + 0.5), out = i === (o.open ?? -1) ? 0.22 : R() < 0.15 ? 0.02 : 0;
      const f = T(m, at(0, y, d / 2 + out));
      b.add('paint', cbox(w - 0.03, dh - 0.02, 0.022, 0.006), col, T(f, at(0, 0, 0.004)), { rep: 0.35 });
      if (out > 0.05) {
        b.add('paint', cbox(w - 0.05, dh - 0.06, out, 0.004), col, T(f, at(0, -0.01, -out / 2)));
        for (let k = 0; k < 8; k++) b.add('wood', cbox(w - 0.08, 0.2 + R() * 0.04, 0.008, 0.002), [0xd8c89a, 0xc8b888, 0xe0d4b0][k % 3], T(f, at(0, 0.0, -0.03 - k * 0.022, -0.1 + R() * 0.2)));
      }
      // the pull and the card slot
      b.add('chrome', cbox(0.12, 0.022, 0.03, 0.006), 0xffffff, T(f, at(0, -0.04, 0.026)));
      b.add('metal', cbox(0.09, 0.05, 0.008, 0.002), C.steel, T(f, at(0, 0.07, 0.018)));
      const card = paper([o.labels?.[i] ?? ['A–F', 'G–L', 'M–R', 'S–Z', 'MISC', 'VOID'][(i + Math.floor(R() * 6)) % 6]], 0.075, 0.034, { seed: Math.floor(R() * 999), ppm: 420 });
      card.applyMatrix4(T(f, at(0, 0.07, 0.024)));
      this.group.add(card);
    }
  }

  /** a ladder cable tray from a to b (world, along x or z), on drop rods up to ceilY, with bundled cables */
  tray(a: V3, z: V3, ceilY: number, o: { w?: number; cables?: number; seed?: number } = {}) {
    const b = this.b, w = o.w ?? 0.3, R = rng(o.seed ?? seedN++);
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...z), L = A.distanceTo(B);
    const ry = Math.atan2(B.x - A.x, B.z - A.z);
    const M = at((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2, 0, ry);
    for (const s of [-1, 1]) b.add('metal', cbox(0.01, 0.05, L, 0.003), 0x9aa09a, T(M, at(s * w / 2, 0, 0)));
    for (let k = -L / 2 + 0.1; k < L / 2; k += 0.25) b.add('metal', cbox(w, 0.008, 0.02, 0.002), 0x8a908a, T(M, at(0, -0.02, k)));
    for (let k = -L / 2 + 0.3; k < L / 2; k += 1.1) for (const s of [-1, 1]) b.add('metal', prism(0.005, ceilY - A.y, 4), C.dark, T(M, at(s * (w / 2 + 0.012), (ceilY - A.y) / 2, k)));
    const n = o.cables ?? 7, cols = [0x1a1a1a, 0x2a2a2a, 0x8a2a1a, 0x2a4a8a, 0x1a1a1a, 0x5a5a3a, 0xd8c8a0];
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + 0.03 + (i * (w - 0.06)) / Math.max(1, n - 1), r = 0.008 + R() * 0.008;
      b.add('rubber', prism(r, L, 5), cols[i % cols.length], T(M, at(x, -0.01 + r, 0, Math.PI / 2)));
    }
    // a couple of loose cables sag out of the tray between rungs
    for (let i = 0; i < 2; i++) {
      const k0 = -L / 2 + 0.3 + R() * (L - 1.2), k1 = k0 + 0.5 + R() * 0.5, x = (R() - 0.5) * w * 0.6;
      const p0 = new THREE.Vector3(x, -0.02, k0).applyMatrix4(M), p1 = new THREE.Vector3(x, -0.02, k1).applyMatrix4(M);
      this.droop(p0.toArray() as V3, p1.toArray() as V3, 0.12 + R() * 0.12, 0.007, cols[(i * 3) % cols.length]);
    }
  }

  /** a cable hung between two points, sagging by `sag` metres */
  droop(a: V3, z: V3, sag: number, r = 0.008, color = 0x1a1a1a) {
    const pts: V3[] = [];
    for (let i = 0; i <= 6; i++) { const k = i / 6; pts.push([a[0] + (z[0] - a[0]) * k, a[1] + (z[1] - a[1]) * k - Math.sin(k * Math.PI) * sag, a[2] + (z[2] - a[2]) * k]); }
    this.b.add('rubber', tube(pts, r, 12, 4), color);
  }

  /** the institute wall clock: real time, a ticking second hand */
  clock(m: THREE.Matrix4, r = 0.15) {
    const b = this.b;
    b.add('bakelite', lathe([[0, 0], [r * 1.14, 0], [r * 1.18, r * 0.2], [r * 1.08, r * 0.3], [0, r * 0.3]], 14), 0x1a1a1a, T(m, at(0, 0, 0, Math.PI / 2)));
    // the wire cage over the face
    for (let i = 0; i < 4; i++) b.add('metal', cbox(r * 2.1, 0.006, 0.006, 0.002), C.steel, T(m, at(0, 0, r * 0.42, 0, 0, (i * Math.PI) / 4)));
    const face = new THREE.Mesh(new THREE.CircleGeometry(r, 18), new THREE.MeshStandardMaterial({ map: dialFace('clock'), roughness: 0.4 }));
    face.applyMatrix4(T(m, at(0, 0, r * 0.3 + 0.001))); face.receiveShadow = true; this.group.add(face);
    const hand = (len: number, wd: number, color: number, z: number, f: (t: number) => number) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(wd, len).translate(0, len * 0.42, 0), new THREE.MeshBasicMaterial({ color }));
      const g = new THREE.Group(); g.applyMatrix4(T(m, at(0, 0, r * 0.3 + z))); g.add(p); this.group.add(g);
      this.spins.push({ o: p, f });
    };
    const now = () => { const d = new Date(); return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000; };
    hand(r * 0.6, r * 0.09, 0x141414, 0.003, () => -(now() / 43200) * Math.PI * 2);
    hand(r * 0.9, r * 0.06, 0x141414, 0.005, () => -(now() / 3600) * Math.PI * 2);
    hand(r * 0.92, r * 0.025, 0xb82a1e, 0.007, () => -Math.floor(now() % 60) / 60 * Math.PI * 2);
  }

  /** a red extinguisher on its wall bracket (m at the bracket, floor below) */
  extinguisher(m: THREE.Matrix4) {
    const b = this.b;
    b.add('paint', lathe([[0, 0], [0.075, 0], [0.08, 0.02], [0.08, 0.42], [0.06, 0.48], [0.022, 0.5], [0, 0.5]], 10), 0xc8281e, T(m, at(0, -0.3, 0.1)), { rep: 0.3 });
    b.add('chrome', lathe([[0, 0], [0.024, 0], [0.024, 0.05], [0.012, 0.07], [0, 0.07]], 6), 0xffffff, T(m, at(0, 0.2, 0.1)));
    b.add('metal', cbox(0.12, 0.012, 0.03, 0.003), C.dark, T(m, at(0.03, 0.27, 0.1, 0, 0, -0.2)));
    b.add('rubber', tube([[0.02, 0.24, 0.1], [0.09, 0.2, 0.12], [0.1, 0.0, 0.15], [0.08, -0.12, 0.17]], 0.009, 8, 4), 0x1a1a1a, m.clone());
    b.add('metal', cbox(0.2, 0.06, 0.04, 0.006), C.dark, T(m, at(0, 0, 0.02)));
    b.add('metal', cbox(0.17, 0.02, 0.18, 0.005), C.dark, T(m, at(0, -0.3, 0.1)));
    const tag = paper(['INSP', '~'], 0.05, 0.07, { seed: seedN++, bg: '#e8d870', ppm: 300 });
    const tg = new THREE.Group(); tg.applyMatrix4(T(m, at(-0.05, 0.16, 0.19))); tag.position.y = -0.035; tg.add(tag); this.group.add(tg);
    this.swings.push({ o: tg, ph: Math.random() * 9 });
    this.label(T(m, at(0, 0.42, 0)), ['FIRE'], 0.16, 0.07, 0xc8281e, 0xf8f0e0);
  }

  /** the leavings of a night shift on a working surface (m at the surface, +Y up), w x d metres */
  clutter(m: THREE.Matrix4, w: number, d: number, o: { seed?: number; ashtray?: boolean; mug?: boolean; binder?: boolean; floppies?: boolean } = {}) {
    const b = this.b, R = rng(o.seed ?? seedN++);
    const spot = () => [(R() - 0.5) * w * 0.8, (R() - 0.5) * d * 0.8] as const;
    // paper stacks (slightly fanned) and a loose sheet
    for (let s = 0; s < 2; s++) {
      const [x, z] = spot(); let y = 0;
      for (let k = 0; k < 3 + Math.floor(R() * 5); k++) { b.add('wood', cbox(0.21, 0.004, 0.29, 0.001), [0xe8e2d0, 0xded6c0, 0xf0ead8, 0xd8ccb0][k % 4], T(m, at(x, y + 0.002, z, 0, (R() - 0.5) * 0.2))); y += 0.004; }
      const sh = paper(['~', '~', '~', '~', '~'], 0.21, 0.29, { seed: Math.floor(R() * 9999), stamp: R() < 0.4 ? 'VOID' : undefined, rule: R() < 0.4 });
      sh.applyMatrix4(T(m, at(x + 0.01, y + 0.002, z, -Math.PI / 2, 0, (R() - 0.5) * 0.5))); this.group.add(sh);
    }
    if (o.binder !== false) {
      const [x, z] = spot(), col = [0x2a4a8a, 0x8a2a1a, 0x2a5a3a, 0x1a1a1a][Math.floor(R() * 4)];
      b.add('leather', cbox(0.24, 0.05, 0.3, 0.008), col, T(m, at(x, 0.025, z, 0, (R() - 0.5) * 0.6)));
      b.add('chrome', cbox(0.03, 0.03, 0.2, 0.006), 0xffffff, T(m, at(x, 0.03, z, 0, (R() - 0.5) * 0.1)));
    }
    if (o.mug !== false) {
      const [x, z] = spot();
      b.add('enamel', lathe([[0, 0], [0.038, 0], [0.042, 0.09], [0.036, 0.09], [0.034, 0.012], [0, 0.012]], 9), [0xe8e2d0, 0x3a6a8a, 0xc8a040][Math.floor(R() * 3)], T(m, at(x, 0, z)));
      b.add('enamel', tube([[0.04, 0.07, 0], [0.065, 0.06, 0], [0.065, 0.03, 0], [0.04, 0.02, 0]], 0.007, 6, 4), 0xe8e2d0, T(m, at(x, 0, z, 0, R() * 6)));
      b.add('wood', prism(0.034, 0.004, 9), 0x2a1408, T(m, at(x, 0.075, z)));
      b.add('wood', band(0.045), 0x6a4a2a, T(m, at(x + 0.09, 0.001, z + 0.03)));
    }
    if (o.ashtray !== false) {
      const [x, z] = spot();
      b.add('glass', lathe([[0, 0], [0.06, 0], [0.065, 0.02], [0.05, 0.022], [0.045, 0.01], [0, 0.01]], 8), 0x8a9a8a, T(m, at(x, 0, z)));
      for (let k = 0; k < 4; k++) b.add('wood', prism(0.005, 0.035, 5), k % 2 ? 0xe8e0d0 : 0xc89a5a, T(m, at(x + (R() - 0.5) * 0.06, 0.016, z + (R() - 0.5) * 0.06, Math.PI / 2, R() * 6, 0)));
      b.add('concrete', prism(0.03, 0.004, 7), 0x5a5a5a, T(m, at(x, 0.012, z)));
    }
    // pens and pencils, a pencil stub
    for (let k = 0; k < 3; k++) { const [x, z] = spot(); b.add('bakelite', prism(0.004, 0.14, 6), [0x1a1a8a, 0xd8b030, 0x1a1a1a][k], T(m, at(x, 0.004, z, Math.PI / 2, 0, R() * 6))); }
    if (o.floppies) for (let k = 0; k < 3; k++) { const [x, z] = spot(); b.add('bakelite', cbox(0.09, 0.004, 0.094, 0.001), [0x1a1a1a, 0x2a3a8a, 0x8a2a2a][k], T(m, at(x, 0.003 + k * 0.004, z, 0, R() * 0.5))); }
  }

  /** a stack of archive boxes (m on the floor); n boxes, string ties, labels */
  boxes(m: THREE.Matrix4, n = 3, o: { seed?: number } = {}) {
    const b = this.b, R = rng(o.seed ?? seedN++);
    let y = 0;
    for (let i = 0; i < n; i++) {
      const w = 0.4 + R() * 0.06, h = 0.26 + R() * 0.04, d = 0.3, ry = (R() - 0.5) * 0.25, ox = (R() - 0.5) * 0.05;
      const M = T(m, at(ox, y, 0, 0, ry));
      b.add('wood', cbox(w, h, d, 0.006), [0xb89a6a, 0xa88a5a, 0xc8aa7a][i % 3], T(M, at(0, h / 2, 0)), { rep: 0.3 });
      b.add('wood', cbox(w + 0.012, 0.05, d + 0.012, 0.004), 0xc8b088, T(M, at(0, h - 0.02, 0)), { rep: 0.3 });
      b.add('rubber', cbox(0.008, 0.008, d + 0.016, 0.002), 0xe8e0c8, T(M, at(w * 0.2, h + 0.004, 0)));
      // a crushed corner on some
      if (R() < 0.4) b.add('wood', cbox(0.06, 0.06, 0.06, 0.01), 0x8a6a4a, T(M, at(w / 2 - 0.02, 0.03, d / 2 - 0.02, 0.4, 0.3, 0)));
      const lab = paper([['1987', 'A-1', 'VOID', 'C-1', 'UNIT', '4'][Math.floor(R() * 6)], '~'], 0.12, 0.08, { seed: Math.floor(R() * 999), ppm: 300 });
      lab.applyMatrix4(T(M, at(-w * 0.15, h * 0.5, d / 2 + 0.002))); this.group.add(lab);
      y += h + 0.002;
    }
  }

  /** a louvred grille (m on the wall) with dust streaks under it */
  vent(m: THREE.Matrix4, w = 0.5, h = 0.3) {
    const b = this.b;
    b.add('metal', extrude([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], 0.03, 0.006, [[[-w / 2 + 0.03, -h / 2 + 0.03], [w / 2 - 0.03, -h / 2 + 0.03], [w / 2 - 0.03, h / 2 - 0.03], [-w / 2 + 0.03, h / 2 - 0.03]]]), 0x9a9e98, T(m, at(0, 0, 0.015)));
    b.add('rubber', cbox(w - 0.05, h - 0.05, 0.01, 0.002), 0x0a0a0a, T(m, at(0, 0, 0.002)));
    for (let y = -h / 2 + 0.05; y < h / 2 - 0.03; y += 0.035) b.add('metal', cbox(w - 0.06, 0.006, 0.03, 0.002), 0x8a8e88, T(m, at(0, y, 0.016, -0.6)));
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add('metal', bolt(0.006), C.steel, T(m, at(sx * (w / 2 - 0.015), sy * (h / 2 - 0.015), 0.03, Math.PI / 2)));
    const s = streaks(w * 1.1, 0.7, seedN++, 0.35); s.applyMatrix4(T(m, at(0, -h / 2 - 0.34, 0.004))); this.group.add(s);
  }

  /** a stencilled plate on the wall */
  label(m: THREE.Matrix4, lines: string[], w: number, h: number, bg = 0xc8c0a0, ink?: number) {
    const p = plate(this.mats, lines, w, h, { bg, ink });
    p.applyMatrix4(m);
    this.group.add(p);
  }

  /** a dark specular patch on the floor that picks up the lamps (x, z world; w, d metres) */
  puddle(x: number, z: number, w: number, d: number, y = 0.006) {
    this.group.add(puddle(x, z, w, d, y));
  }

  /** rust or water streaks down a wall at m */
  streaks(m: THREE.Matrix4, w: number, h: number, k = 0.4) {
    const s = streaks(w, h, seedN++, k); s.applyMatrix4(m); this.group.add(s);
  }

  /** merge the static props; call once after placing */
  done(): THREE.Group {
    if (!this.b.empty) this.group.add(this.b.build(this.mats));
    return this.group;
  }
  update(t: number) {
    for (const s of this.spins) s.o.rotation.z = s.f(t);
    for (const s of this.swings) s.o.rotation.z = Math.sin(t * 1.3 + s.ph) * 0.06;
  }
}

/** a thin torus for rings (a mug's coffee ring, clamps) */
function band(r: number): THREE.BufferGeometry { const g = new THREE.TorusGeometry(r, 0.004, 3, 12); g.rotateX(Math.PI / 2); return g; }

/** rust / water streaks: dark multiplied pixel drips from the top edge down */
export function streaks(w: number, h: number, seed: number, k: number): THREE.Mesh {
  const W = Math.max(8, Math.round(w * 32)), H = Math.max(8, Math.round(h * 32));
  const R = rng(seed);
  const tex = pixTex(W, H, (c) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < W * 0.7; i++) {
      const x = Math.floor(R() * W), len = Math.floor(H * (0.2 + R() * 0.8)), v = 1 - k * (0.3 + R() * 0.7);
      const rust = R() < 0.6;
      for (let y = 0; y < len; y++) {
        const f = v + (1 - v) * (y / len);
        c.fillStyle = `rgb(${Math.round(255 * f)},${Math.round(255 * f * (rust ? 0.9 : 0.98))},${Math.round(255 * f * (rust ? 0.72 : 0.95))})`;
        c.fillRect(x + (R() < 0.08 ? 1 : 0), y, R() < 0.2 ? 2 : 1, 1);
      }
    }
    // the top band where the water sits
    for (let x = 0; x < W; x++) { const f = 1 - k * 0.5 * R(); c.fillStyle = `rgb(${Math.round(255 * f)},${Math.round(240 * f)},${Math.round(210 * f)})`; c.fillRect(x, 0, 1, 1 + Math.floor(R() * 3)); }
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true, depthWrite: false }));
  m.userData.noGlow = true; m.renderOrder = 1;
  return m;
}

/** a wet patch: an irregular dark, near-mirror polygon that catches the lamps' highlights */
export function puddle(x: number, z: number, w: number, d: number, y = 0.006): THREE.Mesh {
  const R = rng(Math.round(x * 97 + z * 31) + 7);
  const pts: [number, number][] = [];
  const n = 11;
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, r = 0.5 * (0.7 + R() * 0.45); pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([px, py]) => new THREE.Vector2(px, py))));
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x080a0a, roughness: 0.03, metalness: 0.7, transparent: true, opacity: 0.55, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.scale.set(w, d, 1); m.position.set(x, y, z);
  m.renderOrder = 2; m.receiveShadow = true; m.userData.noGlow = true;
  return m;
}
