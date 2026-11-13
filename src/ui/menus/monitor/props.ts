// Shared faceted props for the menu's rooms (the monitor room, the research lab):
// CRT housings for the monitor bank, toggle switches, banks of pilot lamps
// (one instanced draw for every LED in a room), stencilled plates, sound.
// Everything is built with the subject room's kit (scene/facet.ts on the
// pixel textures of scene/pixtex.ts) so the rooms read as one place.
import * as THREE from 'three';
import { FacetBuilder, at, cbox, prism, lathe, extrude, ngon, gem, bolt, hull, tube } from '../scene/facet';
import type { FMats } from '../scene/pixtex';
import { plateTex } from '../scene/pixtex';
import { sfx, type Sfx } from '../sfx';
import { bitText, bitMeasure } from '../../../gfx/bitfont';

export type V3 = [number, number, number];
export { FacetBuilder, at, cbox, prism, lathe, extrude, ngon, gem, bolt, hull, tube };

export const C = {
  steel: 0x8e9294, dark: 0x3e4244, darker: 0x26292a, olive: 0x6e7a4a, oliveDark: 0x4a5434, beige: 0xcfc4a6, cream: 0xe0d6bc,
  green: 0x4e6a48, teal: 0x4a6e6a, red: 0xa8382a, rubber: 0xffffff, wood: 0xb8a894, paper: 0xe8e2d0,
};

// ---------------------------------------------------------------- sound
let audioRef: { flat?: (k: string, b: 'sfx' | 'ui' | 'amb', vol?: number, rate?: number) => unknown } | null = null;
/** the game's audio engine (title.ts hands it over), for the creature voices */
export function setRoomAudio(a: unknown) { audioRef = a as typeof audioRef; }
/** a game sound by key (creature calls etc.), flat in the mix */
export function gameSound(key: string, vol = 0.7, rate = 1) { try { audioRef?.flat?.(key, 'sfx', vol, rate); } catch { /* no audio yet */ } }
export function uiSound(k: Sfx, vol = 1) { sfx(k, vol); }

// ---------------------------------------------------------------- CRT housing
export interface CrtSpot { m: THREE.Matrix4; sw: number; sh: number; center: THREE.Vector3 }
/**
 * A bulky enamel CRT set (screen facing +Z) added to a builder. w/h are the
 * housing's front; the screen is 4:3 inside a recessed bezel. Returns where
 * the glass goes.
 */
export function crtSet(b: FacetBuilder, x: number, y: number, z: number, w: number, h: number, o: { color?: number; bezel?: number; depth?: number; knobs?: boolean; ry?: number; seed?: number } = {}): CrtSpot {
  const col = o.color ?? C.beige, bez = o.bezel ?? C.darker, d = o.depth ?? w * 0.62;
  const R = at(x, y, z, 0, o.ry ?? 0);
  const M = (m: THREE.Matrix4) => R.clone().multiply(m);
  // the box and the bell behind it
  b.add('paint', cbox(w, h, d * 0.45, Math.min(w, h) * 0.07), col, M(at(0, 0, -d * 0.225)), { rep: 0.35, seed: o.seed });
  b.add('paint', hull([[-w * 0.44, -h * 0.42, -d * 0.44], [w * 0.44, -h * 0.42, -d * 0.44], [-w * 0.44, h * 0.42, -d * 0.44], [w * 0.44, h * 0.42, -d * 0.44],
    [-w * 0.22, -h * 0.22, -d], [w * 0.22, -h * 0.22, -d], [-w * 0.22, h * 0.24, -d], [w * 0.22, h * 0.24, -d]]), col, M(at(0, 0, 0)), { rep: 0.35 });
  // the face: a bezel plate with the tube's opening (4:3), lips
  const sw = Math.min(w * 0.76, (h * 0.78) * 4 / 3), sh = sw * 0.75;
  const ox = -w * 0.06;
  b.add('paint', extrude([[-w / 2 + 0.012, -h / 2 + 0.012], [w / 2 - 0.012, -h / 2 + 0.012], [w / 2 - 0.012, h / 2 - 0.012], [-w / 2 + 0.012, h / 2 - 0.012]], 0.03, 0.008,
    [[[ox - sw / 2, -sh / 2 + h * 0.03], [ox + sw / 2, -sh / 2 + h * 0.03], [ox + sw / 2, sh / 2 + h * 0.03], [ox - sw / 2, sh / 2 + h * 0.03]]]), bez, M(at(0, 0, 0.012)), { rep: 0.3 });
  // a deep black funnel into the tube
  b.add('rubber', extrude([[ox - sw / 2 - 0.004, -sh / 2 - 0.004 + h * 0.03], [ox + sw / 2 + 0.004, -sh / 2 - 0.004 + h * 0.03], [ox + sw / 2 + 0.004, sh / 2 + 0.004 + h * 0.03], [ox - sw / 2 - 0.004, sh / 2 + 0.004 + h * 0.03]], 0.04, 0.0), 0x101010, M(at(0, 0, -0.012)));
  // the control strip down the right: knobs as faceted bakelite, a speaker grille
  if (o.knobs !== false) {
    const kx = w / 2 - w * 0.075;
    for (let i = 0; i < 2; i++) b.add('bakelite', lathe([[0, 0], [w * 0.035, 0], [w * 0.038, 0.012], [w * 0.026, 0.026], [0, 0.028]], 6), 0xffffff, M(at(kx, h * 0.22 - i * h * 0.2, 0.026, Math.PI / 2)));
    for (let i = 0; i < 5; i++) b.add('metal', cbox(w * 0.08, 0.006, 0.01, 0.002), C.darker, M(at(kx, -h * 0.12 - i * 0.022, 0.03)));
  }
  // feet and a vent
  for (const k of [-1, 1]) b.add('rubber', cbox(w * 0.12, 0.02, d * 0.3, 0.006), 0x6a6a6a, M(at(k * w * 0.36, -h / 2 - 0.01, -d * 0.2)));
  for (let i = 0; i < 4; i++) b.add('metal', cbox(w * 0.5, 0.006, 0.01, 0.002), C.darker, M(at(0, h / 2 - 0.0, -d * 0.12 - i * 0.03, Math.PI / 2)));
  const m = M(at(ox, h * 0.03, 0.006));
  const center = new THREE.Vector3().setFromMatrixPosition(m);
  return { m, sw: sw * 0.98, sh: sh * 0.98, center };
}

// ---------------------------------------------------------------- switches
/** a bat-handle toggle on a small plate; flip(on) throws it */
export class Toggle {
  group = new THREE.Group();
  lever = new THREE.Group();
  on = false;
  private a = -0.45; private target = -0.45;
  constructor(mats: FMats, o: { color?: number; cap?: number } = {}) {
    const b = new FacetBuilder();
    b.add('metal', cbox(0.05, 0.008, 0.07, 0.003), C.dark, at(0, 0.004, 0));
    b.add('metal', bolt(0.012, 0.012), C.steel, at(0, 0.008, 0));
    for (const z of [-0.026, 0.026]) b.add('metal', bolt(0.004, 0.003), C.steel, at(0.018, 0.008, z));
    this.group.add(b.build(mats, { cast: false }));
    const lb = new FacetBuilder();
    lb.add('chrome', prism(0.0035, 0.045, 5, { rTop: 0.005 }), 0xffffff, at(0, 0.024, 0));
    lb.add(o.cap ? 'paint' : 'bakelite', gem(0.007, 5, 0.008), o.cap ?? 0xffffff, at(0, 0.048, 0));
    this.lever.add(lb.build(mats, { cast: false }));
    this.lever.position.y = 0.012;
    this.lever.rotation.x = this.a;
    this.group.add(this.lever);
  }
  flip(on = !this.on) { this.on = on; this.target = on ? 0.45 : -0.45; return on; }
  update(dt: number) { this.a += (this.target - this.a) * Math.min(1, dt * 26); this.lever.rotation.x = this.a; }
}

// ---------------------------------------------------------------- pilot lamps
export interface Led { p: THREE.Vector3; color: THREE.Color; level: number; pattern?: (t: number) => number; size: number }
/** every pilot lamp / LED of a room in one instanced draw; set level or a pattern */
export class LedBank {
  mesh: THREE.InstancedMesh;
  leds: Led[] = [];
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private s = new THREE.Vector3(); private c = new THREE.Color();
  constructor(max = 96) {
    const g = gem(1, 6, 0.8, 0.35);
    g.rotateX(Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), max);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.userData.noGlow = true;
  }
  add(p: THREE.Vector3 | V3, color: number, o: { size?: number; level?: number; pattern?: (t: number) => number; facing?: THREE.Euler } = {}): Led {
    const led: Led = { p: Array.isArray(p) ? new THREE.Vector3(...p) : p.clone(), color: new THREE.Color(color), level: o.level ?? 1, pattern: o.pattern, size: o.size ?? 0.008 };
    const i = this.leds.length;
    this.leds.push(led);
    if (o.facing) this.q.setFromEuler(o.facing); else this.q.identity();
    this.m.compose(led.p, this.q, this.s.setScalar(led.size));
    this.mesh.setMatrixAt(i, this.m);
    this.mesh.count = this.leds.length;
    return led;
  }
  update(t: number) {
    for (let i = 0; i < this.leds.length; i++) {
      const L = this.leds[i];
      const v = L.pattern ? L.pattern(t) : L.level;
      // dark glass when off, overdriven when on
      this.c.copy(L.color).multiplyScalar(0.07 + Math.max(0, v) * 2.6);
      this.mesh.setColorAt(i, this.c);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
/** blink patterns */
export const blink = (hz: number, duty = 0.5, ph = 0) => (t: number) => ((t * hz + ph) % 1 < duty ? 1 : 0);
export const flicker = (seed: number) => (t: number) => (Math.sin(t * 13.1 + seed * 7) + Math.sin(t * 5.3 + seed * 3) > 1.2 ? 0.2 : 1);
export const busy = (seed: number, rate = 6) => (t: number) => { const k = Math.floor(t * rate + seed * 17); const h = Math.sin(k * 12.9898 + seed * 78.233) * 43758.5453; return h - Math.floor(h) > 0.55 ? 1 : 0.05; };

// ---------------------------------------------------------------- plates
/** a stencilled plate (Alagard, thresholded pixels) on a riveted dark backing, facing +Z */
export function plate(mats: FMats, lines: string[], w: number, h: number, o: { bg?: number; ink?: number; px?: number; emissive?: boolean } = {}): THREE.Group {
  const g = new THREE.Group();
  const b = new FacetBuilder();
  b.add('metal', cbox(w + 0.016, h + 0.016, 0.01, 0.003), C.darker, at(0, 0, -0.005));
  g.add(b.build(mats, { cast: false }));
  const ppm = o.px ?? 380;
  const tex = plateTex(lines, { w: Math.max(16, Math.round(w * ppm)), h: Math.max(10, Math.round(h * ppm)), bg: o.bg, ink: o.ink });
  const mat = o.emissive ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }) : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.1 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.z = 0.0012;
  m.receiveShadow = !o.emissive;
  g.add(m);
  return g;
}

/** a hand-written note / sheet: a pixel canvas texture on a slightly curled card */
export function paper(lines: string[], w: number, h: number, o: { bg?: string; ink?: string; ppm?: number; seed?: number; stamp?: string; rule?: boolean } = {}): THREE.Mesh {
  const ppm = o.ppm ?? 300;
  const W = Math.max(8, Math.round(w * ppm)), H = Math.max(8, Math.round(h * ppm));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  let s = o.seed ?? 7;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  c.fillStyle = o.bg ?? '#e6dfca'; c.fillRect(0, 0, W, H);
  // fibres and stains
  for (let i = 0; i < W * H * 0.06; i++) { c.fillStyle = rnd() < 0.5 ? 'rgba(120,100,70,0.12)' : 'rgba(255,255,240,0.18)'; c.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * H), 1, 1); }
  if (o.rule) { c.fillStyle = 'rgba(90,120,170,0.35)'; for (let y = 10; y < H; y += 6) c.fillRect(2, y, W - 4, 1); }
  // scribbled lines (pixel squiggles: handwriting at a distance) and real words when they fit
  c.fillStyle = o.ink ?? '#2a2a3a';
  let y = 4;
  for (const ln of lines) {
    if (ln === '~') { let x = 4; const len = W - 8 - Math.floor(rnd() * W * 0.3); while (x < len) { const wl = 2 + Math.floor(rnd() * 6); for (let i = 0; i < wl; i++) c.fillRect(x + i, y + (rnd() < 0.3 ? 1 : 0) + (rnd() < 0.2 ? -1 : 0), 1, 1 + (rnd() < 0.3 ? 1 : 0)); x += wl + 2; } y += 5; continue; }
    bitText(c, ln, 4, y - 2, { color: o.ink ?? '#2a2a3a', outline: null });
    y += 14;
  }
  // threshold the text to hard pixels
  const id = c.getImageData(0, 0, W, H); const D = id.data;
  for (let i = 0; i < D.length; i += 4) { const lum = D[i] + D[i + 1] + D[i + 2]; if (lum < 330) { D[i] = 30; D[i + 1] = 30; D[i + 2] = 46; } }
  c.putImageData(id, 0, 0);
  // a flat printed tab at the foot of the sheet (no rubber stamp)
  if (o.stamp) { const sw = bitMeasure(o.stamp) + 8; c.fillStyle = '#8a2a1e'; c.fillRect(W - sw - 4, H - 22, sw, 18); bitText(c, o.stamp, W - sw, H - 21, { color: '#f4e6d8', outline: null }); }
  c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(0, H - 1, W, 1); c.fillRect(W - 1, 0, 1, H);
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.PlaneGeometry(w, h, 2, 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) if (Math.abs(p.getY(i)) > h * 0.4 || Math.abs(p.getX(i)) > w * 0.4) p.setZ(i, (rnd() - 0.3) * 0.006);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0, side: THREE.DoubleSide, flatShading: true }));
  mesh.receiveShadow = true;
  return mesh;
}

/** a world-space slab for walls / floors (UVs follow the world so seams line up) */
export function slab(b: FacetBuilder, key: Parameters<FacetBuilder['add']>[0], x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: number, c = 0.004, rep?: number) {
  const g = cbox(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), c);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  b.add(key, g, color, undefined, { uv0: [0, 0], tone: 0.04, seed: 1, rep });
}

/** a soft pool of light on a surface: an additive faceted card (fake bounce, cheap) */
export function glowCard(w: number, h: number, color: number, k = 0.5): THREE.Mesh {
  const g = new THREE.PlaneGeometry(w, h, 4, 4);
  const p = g.attributes.position as THREE.BufferAttribute, col = new Float32Array(p.count * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) / (w / 2), y = p.getY(i) / (h / 2); const f = Math.max(0, 1 - Math.sqrt(x * x + y * y)) * k; col[i * 3] = c.r * f; col[i * 3 + 1] = c.g * f; col[i * 3 + 2] = c.b * f; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  m.userData.noGlow = true;
  m.renderOrder = 2;
  return m;
}

/** spring-damped scalar (props that wobble when poked) */
export class Wobble {
  x = 0; v = 0;
  constructor(public k = 220, public c = 9) {}
  kick(v: number) { this.v += v; }
  update(dt: number) { for (let r = dt; r > 1e-5; r -= 1 / 120) { const h = Math.min(r, 1 / 120); this.v += (-this.x * this.k - this.v * this.c) * h; this.x += this.v * h; } return this.x; }
}
