// Real metal for the close-ups: physically based iron, steel and brass with
// procedural maps — mill scale and grime mottling in the colour, fine
// scratches and handling wear in the roughness, rust blooms — lit by a small
// prefiltered room environment so speculars and edges read as metal.
// Materials are cached; each map is drawn once.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { G } from '../game/G';

export type MetalKind = 'iron' | 'steel' | 'brass' | 'rust' | 'chrome' | 'bakelite' | 'enamel' | 'wood' | 'plastic';

let env: THREE.Texture | null = null;
/** a small prefiltered workshop: soft overhead panels and a warm wall (overlay materials only) */
export function metalEnv(): THREE.Texture | null {
  if (env) return env;
  const r: THREE.WebGLRenderer | undefined = (G as any)?.pr?.renderer;
  if (!r) return null;
  try {
    const pm = new THREE.PMREMGenerator(r);
    const room = new RoomEnvironment();
    env = pm.fromScene(room, 0.04).texture;
    pm.dispose();
  } catch (e) { console.warn('metal env', e); env = null; }
  return env;
}

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

interface Maps { color: THREE.CanvasTexture; rough: THREE.CanvasTexture }
const mapCache = new Map<string, Maps>();

/** colour + roughness maps for a metal: mottling, grime, scratches, rust */
function maps(kind: MetalKind): Maps {
  const hit = mapCache.get(kind);
  if (hit) return hit;
  seed = kind.length * 977 + 13;
  const N = 256;
  const mk = () => { const c = document.createElement('canvas'); c.width = N; c.height = N; return c; };
  const cc = mk(), rc = mk();
  const cx = cc.getContext('2d')!, rx = rc.getContext('2d')!;
  const base: Record<MetalKind, [string, number]> = {
    wood: ['#a87848', 0.78], plastic: ['#e8e4dc', 0.5],
    iron: ['#4a4e52', 0.46], steel: ['#7e868c', 0.4], brass: ['#a8823a', 0.36], rust: ['#4e3222', 0.88], chrome: ['#d8dde2', 0.14], bakelite: ['#3a2216', 0.42], enamel: ['#2e5a4a', 0.3],
  };
  const [col, rough] = base[kind];
  cx.fillStyle = col; cx.fillRect(0, 0, N, N);
  rx.fillStyle = `rgb(${Math.round(rough * 255)},${Math.round(rough * 255)},${Math.round(rough * 255)})`; rx.fillRect(0, 0, N, N);
  // mottling: mill scale, grime, uneven oxide
  for (let i = 0; i < 260; i++) {
    const x = rnd() * N, y = rnd() * N, r = 4 + rnd() * 26;
    const dark = rnd() < 0.6;
    const g = cx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, dark ? 'rgba(20,18,16,0.16)' : 'rgba(255,250,235,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    cx.fillStyle = g; cx.fillRect(x - r, y - r, r * 2, r * 2);
    const gr = rx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    rx.fillStyle = gr; rx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // wood: long grain streaks and a knot or two
  if (kind === 'wood') {
    for (let i = 0; i < 90; i++) {
      const y = rnd() * N, a = (rnd() - 0.5) * 0.06;
      cx.strokeStyle = rnd() < 0.5 ? 'rgba(70,40,18,0.25)' : 'rgba(220,170,110,0.18)'; cx.lineWidth = 0.6 + rnd() * 1.4;
      cx.beginPath(); cx.moveTo(0, y); cx.bezierCurveTo(N * 0.3, y + a * N + rnd() * 6, N * 0.7, y - a * N + rnd() * 6, N, y); cx.stroke();
    }
    for (let i = 0; i < 3; i++) { const x = rnd() * N, y = rnd() * N; cx.strokeStyle = 'rgba(60,34,14,0.45)'; cx.lineWidth = 1.2; for (let r = 2; r < 9; r += 2.5) { cx.beginPath(); cx.ellipse(x, y, r * 1.8, r, 0, 0, Math.PI * 2); cx.stroke(); } }
  }
  // scratches: bright in colour (bare metal), smooth in roughness
  const scratches = kind === 'bakelite' || kind === 'enamel' || kind === 'plastic' ? 60 : kind === 'wood' ? 30 : kind === 'chrome' ? 40 : 180;
  for (let i = 0; i < scratches; i++) {
    const x = rnd() * N, y = rnd() * N, a = (rnd() < 0.7 ? 0.2 : 1.4) + (rnd() - 0.5) * 0.5, l = 6 + rnd() * 48;
    const x1 = x + Math.cos(a) * l, y1 = y + Math.sin(a) * l;
    cx.strokeStyle = `rgba(200,200,190,${0.03 + rnd() * 0.07})`; cx.lineWidth = rnd() < 0.85 ? 0.5 : 1.0;
    cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x1, y1); cx.stroke();
    rx.strokeStyle = `rgba(0,0,0,${0.15 + rnd() * 0.3})`; rx.lineWidth = 0.8;
    rx.beginPath(); rx.moveTo(x, y); rx.lineTo(x1, y1); rx.stroke();
  }
  // rust blooms and streaks (iron and rust only)
  if (kind === 'iron' || kind === 'rust') {
    for (let i = 0; i < (kind === 'rust' ? 70 : 22); i++) {
      const x = rnd() * N, y = rnd() * N, r = 2 + rnd() * (kind === 'rust' ? 18 : 9);
      const g = cx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(110,52,22,0.5)'); g.addColorStop(0.6, 'rgba(80,40,20,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = g; cx.fillRect(x - r, y - r, r * 2, r * 2);
      rx.fillStyle = 'rgba(255,255,255,0.3)'; rx.beginPath(); rx.arc(x, y, r * 0.6, 0, Math.PI * 2); rx.fill();
      if (rnd() < 0.5) { cx.fillStyle = 'rgba(120,58,24,0.18)'; cx.fillRect(x - 0.8, y, 1.6, r * 3 + rnd() * 20); }
    }
  }
  const color = new THREE.CanvasTexture(cc), roughT = new THREE.CanvasTexture(rc);
  for (const t of [color, roughT]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
  color.colorSpace = THREE.SRGBColorSpace;
  const m = { color, rough: roughT };
  mapCache.set(kind, m);
  return m;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();
/**
 * A PBR metal (or bakelite / enamel) for overlay models. Geometry from the
 * ModelBuilder carries world-scaled uv repeats and per-vertex tints, so one
 * material dresses a whole riveted shell; `repeat` sets the map's scale.
 */
export function metalMat(kind: MetalKind, repeat = 1): THREE.MeshStandardMaterial {
  const key = kind + ':' + repeat;
  const hit = matCache.get(key);
  if (hit) return hit;
  const mp = maps(kind);
  const metal = kind === 'bakelite' || kind === 'enamel' || kind === 'wood' || kind === 'plastic' ? 0.02 : kind === 'rust' ? 0.35 : 0.88;
  const m = new THREE.MeshStandardMaterial({
    map: mp.color, roughnessMap: mp.rough, roughness: 1, metalness: metal,
    vertexColors: true, envMap: metalEnv(), envMapIntensity: kind === 'chrome' ? 1.4 : 0.9,
  });
  if (repeat !== 1) {
    m.map = mp.color.clone(); m.map.repeat.set(repeat, repeat); m.map.needsUpdate = true;
    m.roughnessMap = mp.rough.clone(); m.roughnessMap.repeat.set(repeat, repeat); m.roughnessMap.needsUpdate = true;
  }
  matCache.set(key, m);
  return m;
}

/** materials made before the renderer existed get their reflections late */
export function ensureMetalEnv() {
  const e = metalEnv();
  if (!e) return;
  for (const m of matCache.values()) if (!m.envMap) { m.envMap = e; m.needsUpdate = true; }
}
