// Set dressing for the first-person scenes: black ink outlines (inverted hulls,
// so a silhouette over another object still gets its line), pixel contact
// shadows under things set down, a practical work lamp that throws real
// shadows, faceted smoke / steam / heat-shimmer cards for fires and stoves,
// string between a tag and what it is tied to. Everything is cheap: merged
// geometry, a handful of cards, one shadow-casting spot per scene.
import * as THREE from 'three';
import { hull } from '../ui/touch/facet';

// ---------------------------------------------------------------- ink
const INK = new THREE.MeshBasicMaterial({ color: 0x060403, side: THREE.BackSide });
INK.name = 'fpInk';
/** a black inverted hull for one geometry (w = line width in scene units) */
export function inkMesh(geo: THREE.BufferGeometry, w = 0.003): THREE.Mesh {
  const m = new THREE.Mesh(hull(geo, w), INK);
  m.name = 'ink';
  m.raycast = () => {};
  m.castShadow = false; m.receiveShadow = false;
  return m;
}
/** outline every mesh under root (skips glowing / transparent / already inked parts) */
export function ink(root: THREE.Object3D, w = 0.003): THREE.Object3D {
  const list: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.name === 'ink' || m.userData.noInk) return;
    const mat = m.material as THREE.Material;
    if ((mat as THREE.Material).transparent || (mat as THREE.MeshBasicMaterial).isMeshBasicMaterial) return;
    if (!m.geometry.getAttribute('normal')) return;
    list.push(m);
  });
  for (const m of list) m.add(inkMesh(m.geometry, w / Math.max(1e-6, m.scale.x)));
  return root;
}

// ---------------------------------------------------------------- contact shadows
let blobTex: THREE.CanvasTexture | null = null;
/** a soft pixel shadow (dithered rings, crisp) */
function shadowTex() {
  if (blobTex) return blobTex;
  const N = 32, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d')!, img = x.createImageData(N, N);
  const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const dx = (i + 0.5) / N * 2 - 1, dy = (j + 0.5) / N * 2 - 1, d = Math.sqrt(dx * dx + dy * dy);
    const a = Math.max(0, 1 - d) ** 0.8;
    const q = Math.floor(a * 4 + (B[(j & 3) * 4 + (i & 3)] + 0.5) / 16) / 4;
    const k = (j * N + i) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = 0; img.data[k + 3] = Math.round(Math.min(1, q) * 255);
  }
  x.putImageData(img, 0, 0);
  blobTex = new THREE.CanvasTexture(c);
  blobTex.magFilter = blobTex.minFilter = THREE.NearestFilter; blobTex.generateMipmaps = false;
  return blobTex;
}
/** a contact shadow lying in the XZ plane (sits on whatever surface you add it to) */
export function shadowBlob(w: number, d: number, strength = 0.55): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, opacity: strength, depthWrite: false, color: 0x000000, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.0015;
  m.renderOrder = 2;
  m.raycast = () => {};
  m.name = 'shadow';
  return m;
}

// ---------------------------------------------------------------- the work lamp
/**
 * A practical lamp: a warm spot that casts real shadows from `at` toward
 * `aim`, a little point for the halo round the shade, and a flicker.
 */
export class WorkLamp {
  readonly spot: THREE.SpotLight;
  readonly halo: THREE.PointLight;
  private base: number;
  private t = Math.random() * 10;
  constructor(parent: THREE.Object3D, at: THREE.Vector3, aim: THREE.Vector3, o: { color?: number; intensity?: number; angle?: number; dist?: number; shadow?: boolean; mapSize?: number } = {}) {
    this.base = o.intensity ?? 6;
    this.spot = new THREE.SpotLight(o.color ?? 0xffd9a0, this.base, o.dist ?? 3, o.angle ?? 0.85, 0.55, 1.4);
    this.spot.position.copy(at);
    this.spot.target.position.copy(aim);
    if (o.shadow !== false) {
      this.spot.castShadow = true;
      this.spot.shadow.mapSize.set(o.mapSize ?? 512, o.mapSize ?? 512);
      this.spot.shadow.bias = -0.0015; this.spot.shadow.normalBias = 0.01;
      this.spot.shadow.camera.near = 0.05; this.spot.shadow.camera.far = o.dist ?? 3;
    }
    this.halo = new THREE.PointLight(o.color ?? 0xffd9a0, this.base * 0.08, 0.6, 2);
    this.halo.position.copy(at);
    parent.add(this.spot, this.spot.target, this.halo);
  }
  update(dt: number, flicker = 0.04) {
    this.t += dt;
    const f = 1 - flicker * (0.5 + 0.5 * Math.sin(this.t * 37)) * (Math.sin(this.t * 3.1) > 0.7 ? 1 : 0.2) - (Math.random() < 0.006 ? 0.35 : 0);
    this.spot.intensity = this.base * f;
    this.halo.intensity = this.base * 0.08 * f;
  }
}

/** shadows on: everything under root casts and receives (except ink and decals) */
export function shade(root: THREE.Object3D, cast = true, receive = true) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.name === 'ink' || m.name === 'shadow') return;
    m.castShadow = cast; m.receiveShadow = receive;
  });
}

// ---------------------------------------------------------------- smoke, steam, heat
interface Puff { m: THREE.Mesh; life: number; max: number; vx: number; vy: number; vz: number; spin: number; grow: number }
const puffGeo = (() => { const g = new THREE.CircleGeometry(0.5, 6); return g; })();
/**
 * Faceted billboard puffs rising (smoke, steam): each is a hexagonal card
 * facing the camera, growing, drifting, turning and thinning out.
 */
export class Puffs {
  readonly g = new THREE.Group();
  private list: Puff[] = [];
  private next = 0;
  constructor(n = 28, private additive = false) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
      m.visible = false; m.renderOrder = 30; m.raycast = () => {};
      this.g.add(m);
      this.list.push({ m, life: 0, max: 1, vx: 0, vy: 0, vz: 0, spin: 0, grow: 1 });
    }
  }
  emit(x: number, y: number, z: number, color: number, size = 0.05, life = 1.6, rise = 0.12, spread = 0.02) {
    const p = this.list[this.next]; this.next = (this.next + 1) % this.list.length;
    p.m.position.set(x + (Math.random() - 0.5) * spread, y, z + (Math.random() - 0.5) * spread);
    p.m.scale.setScalar(size);
    (p.m.material as THREE.MeshBasicMaterial).color.setHex(color);
    p.life = p.max = life * (0.75 + Math.random() * 0.5);
    p.vx = (Math.random() - 0.5) * 0.03; p.vy = rise * (0.7 + Math.random() * 0.6); p.vz = (Math.random() - 0.5) * 0.02;
    p.spin = (Math.random() - 0.5) * 1.5; p.grow = 1.6 + Math.random();
    p.m.visible = true;
  }
  update(dt: number, cam: THREE.Camera, peak = 0.5) {
    for (const p of this.list) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.m.visible = false; continue; }
      const k = 1 - p.life / p.max;
      p.m.position.x += p.vx * dt + Math.sin(p.life * 3 + p.spin) * dt * 0.01; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      p.m.scale.multiplyScalar(1 + dt * p.grow * 0.5);
      p.m.quaternion.copy(cam.quaternion);
      p.m.rotateZ(p.spin * k * 2);
      (p.m.material as THREE.MeshBasicMaterial).opacity = peak * Math.min(1, k * 5) * (1 - k) * (this.additive ? 0.8 : 1);
    }
  }
}

/**
 * Heat over a fire: a few tall faceted ribbons of warm air, waving, barely
 * there (the overlay cannot bend the picture behind it, so the air itself
 * shimmers with a faint glow).
 */
export class Shimmer {
  readonly g = new THREE.Group();
  private ribbons: { m: THREE.Mesh; base: Float32Array; ph: number }[] = [];
  constructor(n: number, w: number, h: number, color = 0xffb060) {
    for (let i = 0; i < n; i++) {
      const geo = new THREE.PlaneGeometry(w, h, 1, 8);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.06, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      m.position.set((i - (n - 1) / 2) * w * 0.9, h / 2, (Math.random() - 0.5) * w);
      m.rotation.y = Math.random() * Math.PI;
      m.renderOrder = 29; m.raycast = () => {};
      this.g.add(m);
      this.ribbons.push({ m, base: Float32Array.from(geo.getAttribute('position').array as Float32Array), ph: Math.random() * 6 });
    }
  }
  update(t: number, heat: number) {
    this.g.visible = heat > 0.05;
    for (const r of this.ribbons) {
      const P = r.m.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < P.count; i++) {
        const y = r.base[i * 3 + 1];
        P.setX(i, r.base[i * 3] + Math.sin(t * 6 + y * 40 + r.ph) * 0.012 * (y + 0.1) * 6);
      }
      P.needsUpdate = true;
      (r.m.material as THREE.MeshBasicMaterial).opacity = 0.05 * heat * (0.7 + 0.3 * Math.sin(t * 4 + r.ph));
    }
  }
}

// ---------------------------------------------------------------- string
/** a sagging string from a to b (camera / parent space), redrawn with set() */
export class Twine {
  readonly line: THREE.Line;
  private pos: Float32Array;
  constructor(color = 0x8a7a5a, private n = 8) {
    this.pos = new Float32Array((n + 1) * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.line = new THREE.Line(g, new THREE.LineBasicMaterial({ color }));
    this.line.frustumCulled = false;
    this.line.raycast = () => {};
  }
  set(a: THREE.Vector3, b: THREE.Vector3, sag = 0.02) {
    for (let i = 0; i <= this.n; i++) {
      const t = i / this.n;
      this.pos[i * 3] = a.x + (b.x - a.x) * t;
      this.pos[i * 3 + 1] = a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * sag;
      this.pos[i * 3 + 2] = a.z + (b.z - a.z) * t;
    }
    (this.line.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}
