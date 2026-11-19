// THE FAB KIT (round 20): what the filament maker and the printer share, in the lab's fab bay
// (./bay.ts, the control room) and at a camp (./camp.ts, a small stage of its own):
//   FabCtx      the host: the pixel materials, the hot list, a world-space parent for vapour, the pointer's ray,
//               the subtitle line, the unit whose pack feeds a camp hopper, the sounds (recorded CC0 samples)
//   gauge()     a round dial with a needle (ticks and coloured bands, no words)
//   spoolModel  a spool: two flanges, a hub, the wound filament (its radius follows the kilos on it)
//   pilot()     a small lamp that blinks by the control that is next
import * as THREE from 'three';
import type { FMats } from '../scene/pixtex';
import type { Hot } from '../monitor/stage';
import { FacetBuilder, at, cbox, lathe, prism, bolt, C } from '../monitor/props';
import { band } from '../scene/facet';
import type { Player } from '../../../entities/player';
import { emblemCanvas } from '../../brand/logo';

export type Pose = { pos: THREE.Vector3; look: THREE.Vector3; fov: number };
export interface Hum { stop(): void; rate(r: number): void }
export interface FabCtx {
  mats: FMats;
  hots: Hot[];
  /** a world-space parent for vapour and loose parts */
  world: THREE.Object3D;
  rayAt(x: number, y: number): THREE.Ray | null;
  /** the client point of a world point (null behind the camera) */
  project(p: THREE.Vector3): { x: number; y: number } | null;
  /** a line on the subtitle strip (Dr. Calder in the lab, the unit's own thought at a camp) */
  say(t: string): void;
  /** at a camp: the unit whose pack feeds the hopper */
  who(): Player | null;
  sound(key: string, vol?: number, rate?: number): void;
  /** a recorded loop (motors, water, heat); null when the sample is not ready yet */
  loop(key: string, vol?: number, rate?: number): Hum | null;
  /** where the prints go: the lab sends them down the chute, a camp drops them by the machine */
  deliver(keys: string[]): void;
  /** is it the lab (true) or a camp */
  lab: boolean;
}

/** an audio engine's flat() as a looped hum (the source keeps playing until stopped) */
export function humFrom(flat: ((key: string, b: 'sfx', vol?: number, rate?: number) => AudioBufferSourceNode | null) | undefined, key: string, vol = 0.5, rate = 1): Hum | null {
  if (!flat) return null;
  let src: AudioBufferSourceNode | null = null;
  try { src = flat(key, 'sfx', vol, rate); } catch { src = null; }
  if (!src) return null;
  src.loop = true;
  const base = src.playbackRate.value / Math.max(0.01, rate);
  return {
    stop: () => { try { src!.stop(); } catch { /* stopped */ } },
    rate: (r: number) => { try { src!.playbackRate.value = base * Math.max(0.2, r); } catch { /* gone */ } },
  };
}

export const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const ease = (t: number) => { t = clamp01(t); return t * t * (3 - 2 * t); };

/** is o (a hit mesh) inside g */
export const under = (o: THREE.Object3D | null, g: THREE.Object3D) => { for (let x = o; x; x = x.parent) if (x === g) return true; return false; };
const ray = new THREE.Raycaster();
/** the nearest hit among some groups along a ray */
export function hitAny(r: THREE.Ray, objs: THREE.Object3D[]): THREE.Intersection | null {
  ray.ray.copy(r);
  let best: THREE.Intersection | null = null;
  for (const o of objs) { if (!o.visible) continue; const h = ray.intersectObject(o, true)[0]; if (h && (!best || h.distance < best.distance)) best = h; }
  return best;
}

// ------------------------------------------------------------------ a round gauge: face (canvas), bezel, needle
const faces = new Map<string, THREE.CanvasTexture>();
/** bands: [from, to, colour] over 0..1 of the sweep */
function faceTex(key: string, bands: [number, number, string][]): THREE.CanvasTexture {
  const hit = faces.get(key);
  if (hit) return hit;
  const N = 96, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d')!;
  const cx = N / 2, cy = N / 2;
  g.fillStyle = '#e8e0c8'; g.beginPath(); g.arc(cx, cy, N / 2, 0, Math.PI * 2); g.fill();
  // paper grain and a yellowed rim
  for (let i = 0; i < 500; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(120,96,60,0.10)' : 'rgba(255,255,240,0.2)'; g.fillRect(Math.floor(Math.random() * N), Math.floor(Math.random() * N), 1, 1); }
  g.strokeStyle = 'rgba(150,120,60,0.35)'; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, N / 2 - 2, 0, Math.PI * 2); g.stroke();
  const A0 = Math.PI * 0.75, SW = Math.PI * 1.5;
  for (const [a, b, c] of bands) { g.strokeStyle = c; g.lineWidth = 9; g.beginPath(); g.arc(cx, cy, N * 0.36, A0 + SW * a, A0 + SW * b); g.stroke(); }
  g.fillStyle = '#1a1a14';
  for (let i = 0; i <= 20; i++) {
    const a = A0 + SW * (i / 20), big = i % 5 === 0, r0 = N * (big ? 0.27 : 0.31), r1 = N * 0.42;
    g.save(); g.translate(cx, cy); g.rotate(a); g.fillRect(r0, big ? -1.5 : -0.75, r1 - r0, big ? 3 : 1.5); g.restore();
  }
  // a maker's mark in the lower half: three pips (no words)
  for (let i = 0; i < 3; i++) g.fillRect(cx - 7 + i * 6, cy + N * 0.2, 3, 3);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  faces.set(key, t);
  return t;
}
export interface Gauge { group: THREE.Group; needle: THREE.Group; set(k: number): void; v: number }
/** a dial facing +Z, radius r: bands as fractions of the sweep. set(k) moves the needle (0..1, damped by the caller) */
export function gauge(mats: FMats, r: number, key: string, bands: [number, number, string][]): Gauge {
  const group = new THREE.Group();
  const b = new FacetBuilder();
  b.add('chrome', lathe([[0, -0.02], [r * 1.18, -0.02], [r * 1.22, 0.0], [r * 1.14, 0.012], [r * 1.02, 0.008], [0, 0.008]], 16), 0xd8dcd8, at(0, 0, 0, Math.PI / 2));
  b.add('metal', prism(r * 1.1, 0.04, 16), C.dark, at(0, 0, -0.03, Math.PI / 2));
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; b.add('chrome', bolt(0.006, 0.004), 0xc8ccc8, at(Math.cos(a) * r * 1.12, Math.sin(a) * r * 1.12, 0.01, Math.PI / 2)); }
  group.add(b.build(mats));
  const face = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshStandardMaterial({ map: faceTex(key, bands), roughness: 0.85, metalness: 0, color: 0xd8d2c0 }));
  face.position.z = 0.009; face.receiveShadow = true;
  group.add(face);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(r * 1.02, 20), mats.glass);
  glass.position.z = 0.018; glass.userData.noGlow = true;
  group.add(glass);
  const needle = new THREE.Group();
  const nb = new FacetBuilder();
  nb.add('paint', cbox(0.004, r * 0.86, 0.003, 0.001), 0xb8281c, at(0, r * 0.4, 0));
  nb.add('metal', prism(r * 0.12, 0.008, 8), C.darker, at(0, 0, 0.002, Math.PI / 2));
  needle.add(nb.build(mats, { cast: false }));
  needle.position.z = 0.013;
  group.add(needle);
  const A0 = Math.PI * 0.75, SW = Math.PI * 1.5;
  const g: Gauge = {
    group, needle, v: 0,
    // the face's angle runs clockwise in canvas space (y down); in the scene +rotation.z is anticlockwise
    set(k: number) { g.v = k; needle.rotation.z = -(A0 + SW * Math.max(-0.02, Math.min(1.03, k))) - Math.PI / 2; },
  };
  g.set(0);
  return g;
}

// ------------------------------------------------------------------ a spool (axle along Z, faces front)
export interface SpoolModel { group: THREE.Group; wound: THREE.Mesh; setFill(k: number): void; setColor(c: number): void }
const R_HUB = 0.034, R_FL = 0.1, W_SP = 0.064;
export const SPOOL = { hub: R_HUB, flange: R_FL, width: W_SP };
export function spoolModel(mats: FMats, color: number, fill = 1, scale = 1): SpoolModel {
  const group = new THREE.Group();
  const b = new FacetBuilder();
  // two moulded flanges, open: a rim, three wide spokes, a boss (the wound filament shows between the spokes)
  for (const s of [-1, 1]) {
    b.add('bakelite', band(R_FL - 0.007, R_FL - 0.007, 0.006, 0.014, 18), 0x2a2a2a, at(0, 0, s * W_SP / 2, Math.PI / 2));
    for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3 + 0.3; b.add('bakelite', cbox(0.022, R_FL - R_HUB, 0.006, 0.002), 0x2a2a2a, at(Math.cos(a) * (R_FL + R_HUB) / 2, Math.sin(a) * (R_FL + R_HUB) / 2, s * W_SP / 2, 0, 0, a - Math.PI / 2)); }
    b.add('bakelite', prism(R_HUB + 0.01, 0.007, 12), 0x2a2a2a, at(0, 0, s * W_SP / 2, Math.PI / 2));
  }
  b.add('enamel', prism(R_HUB, W_SP, 12), 0xd8d4c4, at(0, 0, 0, Math.PI / 2));
  b.add('metal', prism(0.012, W_SP + 0.02, 8), C.dark, at(0, 0, 0, Math.PI / 2));
  group.add(b.build(mats));
  const wmat = new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.05, flatShading: true });
  const wound = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, W_SP - 0.004, 20, 3), wmat);
  wound.rotation.x = Math.PI / 2;
  wound.castShadow = true; wound.receiveShadow = true;
  group.add(wound);
  // the windings: faint rings so a full spool reads as wound strand, not a solid drum
  const lines = new THREE.Mesh(new THREE.CylinderGeometry(1.002, 1.002, W_SP - 0.004, 20, 6, true), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, wireframe: true, depthWrite: false }));
  lines.userData.noGlow = true;
  wound.add(lines);
  group.scale.setScalar(scale);
  const m: SpoolModel = {
    group, wound,
    setFill(k: number) { const r = R_HUB + (R_FL - 0.008 - R_HUB) * clamp01(k); wound.scale.set(r, 1, r); wound.visible = k > 0.01; },
    setColor(c: number) { wmat.color.setHex(c); },
  };
  m.setFill(fill);
  return m;
}

// ------------------------------------------------------------------ a pilot lamp (blinks by the next control)
export interface Pilot { mesh: THREE.Mesh; on: boolean; tick(t: number): void }
export function pilot(color = 0xffb020): Pilot {
  const mat = new THREE.MeshBasicMaterial({ color: 0x201810, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), mat);
  mesh.userData.noGlow = true;
  const lit = new THREE.Color(color).multiplyScalar(2.2), off = new THREE.Color(0x2a2214);
  const p: Pilot = { mesh, on: false, tick(t: number) { mat.color.copy(p.on && Math.sin(t * 7) > -0.2 ? lit : off); } };
  return p;
}

/** a plain emissive-able standard material (heater bands, molten glow) */
export const glowMat = (color: number, rough = 0.5, metal = 0.4) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive: new THREE.Color(0x000000), flatShading: true });

// ------------------------------------------------------------------ the maker's plate (brass, the Institute's emblem)
let emblemTex: THREE.CanvasTexture | null = null;
/** a riveted brass plate carrying the emblem, facing +Z, h tall */
export function makerPlate(mats: FMats, h: number): THREE.Group {
  const g = new THREE.Group();
  const b = new FacetBuilder();
  b.add('brass', cbox(h * 1.5, h, 0.006, 0.002), 0xffffff, at(0, 0, 0));
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) b.add('chrome', bolt(0.004, 0.003), 0xe8e0c0, at(sx * h * 0.64, sy * h * 0.38, 0.003, Math.PI / 2));
  g.add(b.build(mats, { cast: false }));
  if (!emblemTex) {
    const cv = emblemCanvas(32);
    emblemTex = new THREE.CanvasTexture(cv); emblemTex.magFilter = THREE.NearestFilter; emblemTex.minFilter = THREE.NearestFilter; emblemTex.generateMipmaps = false; emblemTex.colorSpace = THREE.SRGBColorSpace;
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(h * 0.78, h * 0.78), new THREE.MeshStandardMaterial({ map: emblemTex, transparent: true, alphaTest: 0.5, roughness: 0.4, metalness: 0.5 }));
  m.position.z = 0.0042; m.userData.noGlow = true;
  g.add(m);
  return g;
}

// ------------------------------------------------------------------ warning pictograms (no words): a yellow triangle, a black glyph
const pictos = new Map<string, THREE.CanvasTexture>();
const GLYPH: Record<'hand' | 'hot' | 'shock', string[]> = {
  hand: ['....##....', '...#.##...', '...#.#.#..', '.#.#.#.#..', '#.##.#.#..', '#..#...#..', '.#.....#..', '.#....#...', '..#...#...', '..#####...'],
  hot: ['...#......', '...##.....', '..#.#..#..', '..#..#.##.', '.#...###.#', '.#....#..#', '.#.......#', '..#.....#.', '...#####..', '..........'],
  shock: ['.....##...', '....##....', '...##.....', '..######..', '.....##...', '....##....', '...##.....', '..##......', '.#........', '..........'],
};
function pictoTex(kind: 'hand' | 'hot' | 'shock'): THREE.CanvasTexture {
  const hit = pictos.get(kind); if (hit) return hit;
  const N = 32, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d')!;
  // the triangle: a black edge, yellow inside, a lit top edge
  for (let y = 2; y < N - 2; y++) {
    const half = Math.round(((y - 2) / (N - 5)) * (N / 2 - 2));
    for (let x = N / 2 - half; x <= N / 2 + half; x++) {
      const edge = x <= N / 2 - half + 1 || x >= N / 2 + half - 1 || y >= N - 4;
      g.fillStyle = edge ? '#141008' : y < 8 ? '#ffe070' : '#e8b828';
      g.fillRect(x, y, 1, 1);
    }
  }
  g.fillStyle = '#141008';
  GLYPH[kind].forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') g.fillRect(11 + x, 14 + y, 1, 1); }));
  const t = new THREE.CanvasTexture(cv); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  pictos.set(kind, t);
  return t;
}
/** a small enamel warning plate facing +Z */
export function picto(kind: 'hand' | 'hot' | 'shock', h: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(h, h), new THREE.MeshStandardMaterial({ map: pictoTex(kind), transparent: true, alphaTest: 0.5, roughness: 0.5, metalness: 0.1 }));
  m.userData.noGlow = true;
  return m;
}
