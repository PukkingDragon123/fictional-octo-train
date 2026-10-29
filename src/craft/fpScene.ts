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
interface Puff { m: THREE.Mesh; life: number; max: number; vx: number; vy: number; vz: number; spin: number; grow: number; size: number; c0: THREE.Color }
/**
 * Pixel-art smoke and steam: solid faceted puffs (the overlay inks their edge like
 * everything else, so they are drawn opaque, never as a soft smear) that swell as
 * they leave the fire, drift, turn, lighten and shrink away to nothing.
 */
export class Puffs {
  readonly g = new THREE.Group();
  private list: Puff[] = [];
  private next = 0;
  private geo = new THREE.IcosahedronGeometry(0.5, 1);
  constructor(n = 28) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.geo, new THREE.MeshLambertMaterial({ color: 0x888888, flatShading: true, emissive: 0x2a2a2c }));
      m.visible = false; m.raycast = () => {};
      this.g.add(m);
      this.list.push({ m, life: 0, max: 1, vx: 0, vy: 0, vz: 0, spin: 0, grow: 1, size: 0.05, c0: new THREE.Color() });
    }
  }
  emit(x: number, y: number, z: number, color: number, size = 0.05, life = 1.6, rise = 0.12, spread = 0.02) {
    const p = this.list[this.next]; this.next = (this.next + 1) % this.list.length;
    p.m.position.set(x + (Math.random() - 0.5) * spread, y, z + (Math.random() - 0.5) * spread);
    p.size = size * (0.7 + Math.random() * 0.6);
    p.c0.setHex(color);
    p.life = p.max = life * (0.75 + Math.random() * 0.5);
    p.vx = (Math.random() - 0.5) * 0.03; p.vy = rise * (0.7 + Math.random() * 0.6); p.vz = (Math.random() - 0.5) * 0.02;
    p.spin = (Math.random() - 0.5) * 3; p.grow = 1.6 + Math.random();
    p.m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    p.m.visible = true;
  }
  update(dt: number) {
    for (const p of this.list) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.m.visible = false; continue; }
      const k = 1 - p.life / p.max;
      p.m.position.x += p.vx * dt + Math.sin(p.life * 3 + p.spin) * dt * 0.01; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      // swell out of the fire, then shrink away
      p.m.scale.setScalar(p.size * (0.4 + k * p.grow) * Math.min(1, (1 - k) * 3));
      p.m.rotation.y += p.spin * dt; p.m.rotation.x += p.spin * dt * 0.5;
      const mt = p.m.material as THREE.MeshLambertMaterial;
      mt.color.copy(p.c0).lerp(_grey, k * 0.6); mt.emissive.copy(mt.color).multiplyScalar(0.45);
    }
  }
}
const _grey = new THREE.Color(0xa8a8ae);

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
      // additive colour, the target's alpha left alone: it wavers over the coals and the iron, never inks a halo onto the room
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending });
      mat.blendSrc = THREE.SrcAlphaFactor; mat.blendDst = THREE.OneFactor; mat.blendSrcAlpha = THREE.ZeroFactor; mat.blendDstAlpha = THREE.OneFactor;
      const m = new THREE.Mesh(geo, mat);
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
      (r.m.material as THREE.MeshBasicMaterial).opacity = 0.16 * heat * (0.7 + 0.3 * Math.sin(t * 4 + r.ph));
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

// ---------------------------------------------------------------- stencil paint
/**
 * Spray-stencilled lettering on a surface (crate sides, drums, walls): bold
 * caps with the stencil bridges cut through, overspray and patchy coverage.
 * A lit plane `w` wide facing +z; lines stack downward.
 */
export function stencil(lines: string[], w: number, color = 0x1a1612, fontFamily = "'Space Grotesk', Arial, sans-serif"): THREE.Mesh {
  const W = 512, LH = 92, H = LH * lines.length + 24;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const draw = () => {
    const x = c.getContext('2d')!;
    x.clearRect(0, 0, W, H);
    const col = '#' + color.toString(16).padStart(6, '0');
    x.fillStyle = col; x.textBaseline = 'top';
    lines.forEach((l, i) => {
      let size = 78;
      x.font = `700 ${size}px ${fontFamily}`;
      while (x.measureText(l).width > W - 24 && size > 20) { size -= 4; x.font = `700 ${size}px ${fontFamily}`; }
      x.globalAlpha = 0.18; x.fillText(l, 14, 14 + i * LH);
      x.globalAlpha = 1; x.fillText(l, 12, 12 + i * LH);
      // the stencil bridges: thin gaps cut down through every letter
      x.save(); x.globalCompositeOperation = 'destination-out';
      const tw = x.measureText(l).width;
      for (let k = 0; k < l.length; k++) x.fillRect(12 + (k + 0.5) * tw / l.length, 12 + i * LH + size * 0.42, 3, size * 0.14);
      x.restore();
    });
    // patchy paint: knock pixels out
    x.save(); x.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 900; k++) { x.globalAlpha = Math.random() * 0.8; x.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 5, 2 + Math.random() * 3); }
    x.restore();
    tex.needsUpdate = true;
  };
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  draw();
  void (document as Document & { fonts?: FontFaceSet }).fonts?.ready.then(draw);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * H / W), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.25, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.raycast = () => {};
  m.name = 'shadow';
  return m;
}

// ---------------------------------------------------------------- dial faces (never round)
/** an octagonal dial face on a square canvas: cream enamel, ticks over 270 degrees, a red zone, a label */
export function octDial(g: CanvasRenderingContext2D, W: number, label: string, red: 'low' | 'high' | 'none' = 'low', font = "'Space Grotesk', Arial, sans-serif") {
  const cx = W / 2, cy = W / 2, r = W / 2 - 2;
  const oct = (rr: number) => { g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i / 8) * Math.PI * 2; g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); };
  g.fillStyle = '#141414'; g.fillRect(0, 0, W, W);
  g.fillStyle = '#e8dcbc'; oct(r); g.fill();
  g.fillStyle = 'rgba(120,90,40,0.18)'; oct(r * 0.96); g.fill(); g.fillStyle = '#efe4c6'; oct(r * 0.86); g.fill();
  g.strokeStyle = '#2a2622'; g.lineWidth = Math.max(1, W / 48); oct(r - 1); g.stroke();
  if (red !== 'none') {
    g.strokeStyle = '#b8302a'; g.lineWidth = r * 0.12; g.beginPath();
    const a0 = red === 'low' ? Math.PI * 0.75 : Math.PI * 2.05, a1 = red === 'low' ? Math.PI * 0.95 : Math.PI * 2.25;
    for (let i = 0; i <= 4; i++) { const a = a0 + (a1 - a0) * i / 4; g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78); }
    g.stroke();
  }
  g.strokeStyle = '#2a2622';
  for (let i = 0; i <= 20; i++) {
    const a = Math.PI * (0.75 + i * 0.075), long = i % 5 === 0, r0 = long ? r * 0.62 : r * 0.72;
    g.lineWidth = long ? Math.max(1.5, W / 40) : Math.max(1, W / 80);
    g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r * 0.84, cy + Math.sin(a) * r * 0.84); g.stroke();
  }
  g.fillStyle = '#2a2622'; g.font = `600 ${Math.round(r * 0.34)}px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, cx, cy + r * 0.32);
}
