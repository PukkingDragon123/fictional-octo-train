// Enamel sign faces: every 'vx_sign' in the zone on view gets its lettering
// painted onto a canvas in a real sign face (Oswald, via src/ui/fonts.css):
// enamel colour with a little bloom of age, a pinstripe border, letters with
// a stamped edge, chips at the corners. The face is a plane on each side of
// the plate, lit by the light where the sign stands (dimmed out of sight),
// with an enamel sheen at grazing angles. Floor and dimension names live on
// these (src/world/gen/z_floors, z_chess, z_meadow, z_moon).
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import type { GameSystem } from '../game/game';
import type { Zone, TileObject } from '../world/zone';
import { objDef } from '../world/objects';
import { objectMatrix } from '../world/chunkMesher';
import { signDims } from '../content/furniture/zx_dimensions';
import { fontsReady } from '../gfx/crt';

const VERT = /* glsl */`
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const FRAG = /* glsl */`
layout(location = 1) out highp vec4 gNormal;
uniform sampler2D uTex;
uniform float uLight;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 t = texture(uTex, vUv);
  vec3 n = normalize(vN);
  float fres = pow(1.0 - clamp(abs(dot(n, normalize(vV))), 0.0, 1.0), 4.0);
  vec3 col = t.rgb * uLight + vec3(0.92, 0.95, 1.0) * fres * 0.22 * uLight;
  gl_FragColor = vec4(col, 1.0);
  gNormal = vec4(n * 0.5 + 0.5, 0.5);
}`;

const hex = (c: number) => '#' + (c >>> 0).toString(16).padStart(6, '0');

function paintFace(text: string, plate: number, ink: number): HTMLCanvasElement {
  const { lines, W, H, lh } = signDims(text);
  const PPM = 220;
  const cw = Math.min(1024, Math.round(W * PPM)), ch = Math.round(H * PPM * (cw / Math.round(W * PPM)));
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const g = c.getContext('2d')!;
  const s = cw / W; // px per metre
  // enamel with an uneven bloom of age
  g.fillStyle = hex(plate); g.fillRect(0, 0, cw, ch);
  const bloom = g.createRadialGradient(cw * 0.35, ch * 0.3, 4, cw * 0.5, ch * 0.5, cw * 0.7);
  bloom.addColorStop(0, 'rgba(255,255,255,0.10)'); bloom.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = bloom; g.fillRect(0, 0, cw, ch);
  // grime settling at the bottom edge
  const grime = g.createLinearGradient(0, ch * 0.7, 0, ch);
  grime.addColorStop(0, 'rgba(40,30,20,0)'); grime.addColorStop(1, 'rgba(40,30,20,0.28)');
  g.fillStyle = grime; g.fillRect(0, 0, cw, ch);
  // pinstripe border
  g.strokeStyle = hex(ink); g.globalAlpha = 0.85; g.lineWidth = Math.max(2, s * 0.012);
  const m = s * 0.045; g.strokeRect(m, m, cw - 2 * m, ch - 2 * m); g.globalAlpha = 1;
  // the lettering, stamped: a dark lower edge, a light upper edge, then the ink
  const total = lh.reduce((a, b) => a + b, 0);
  let y = (H - total) / 2 * s;
  lines.forEach((l, k) => {
    const size = lh[k] * s * 0.82;
    g.font = `${k === 0 ? 600 : 500} ${size.toFixed(1)}px 'Oswald', 'Arial Narrow', sans-serif`;
    (g as any).letterSpacing = (k === 0 ? 0.06 : 0.12) * size + 'px';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const cy = y + lh[k] * s * 0.5;
    const fit = Math.min(1, (cw - m * 4) / Math.max(1, g.measureText(l).width));
    g.save(); g.translate(cw / 2, cy); g.scale(fit, 1);
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillText(l, 1.5, 2);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillText(l, -1, -1);
    g.fillStyle = hex(ink); g.fillText(l, 0, 0);
    g.restore();
    y += lh[k] * s;
  });
  // enamel chipped at the corners and round the bolts: dark iron showing through
  let h = (plate ^ ink ^ text.length * 7919) >>> 0;
  const rnd = () => { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; };
  for (let i = 0; i < 14; i++) {
    const corner = i % 4, cx = corner % 2 ? cw - rnd() * cw * 0.12 : rnd() * cw * 0.12, cy = corner < 2 ? rnd() * ch * 0.2 : ch - rnd() * ch * 0.2;
    g.fillStyle = 'rgba(30,24,20,0.85)'; g.beginPath(); g.ellipse(cx, cy, 2 + rnd() * s * 0.02, 2 + rnd() * s * 0.014, rnd() * 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(120,70,30,0.35)'; g.beginPath(); g.ellipse(cx + 2, cy + 3, 3 + rnd() * 4, 1.5, 1.2, 0, Math.PI * 2); g.fill();
  }
  return c;
}

interface SignView { uid: number; meshes: THREE.Mesh[]; mat: THREE.ShaderMaterial; x: number; z: number }

export class SignSystem implements GameSystem {
  name = 'signs';
  private root = new THREE.Group();
  private views: SignView[] = [];
  private tex = new Map<string, THREE.CanvasTexture>();
  private zone: Zone | null = null;
  private checkT = 0;
  private fontsIn = false;

  constructor() {
    G.pr.scene.add(this.root);
    bus.on('zoneView', (z: Zone) => this.build(z));
    fontsReady().then(() => { this.fontsIn = true; for (const [k, t] of this.tex) { const [text, c, ink] = k.split('§'); t.image = paintFace(text, Number(c), Number(ink)); t.needsUpdate = true; } }).catch(() => {});
  }

  private texture(text: string, plate: number, ink: number): THREE.CanvasTexture {
    const key = `${text}§${plate}§${ink}`;
    let t = this.tex.get(key);
    if (!t) {
      t = new THREE.CanvasTexture(paintFace(text, plate, ink));
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      this.tex.set(key, t);
    }
    return t;
  }

  private build(z: Zone) {
    for (const v of this.views) { for (const m of v.meshes) { this.root.remove(m); m.geometry.dispose(); } v.mat.dispose(); }
    this.views = [];
    this.zone = z;
    for (const o of z.objects.values()) if (o.key === 'vx_sign') this.add(z, o);
  }

  private add(z: Zone, o: TileObject) {
    const d = objDef(o.key); if (!d) return;
    const text = String(o.state?.text || 'SIGN');
    const plate = Number(o.state?.c ?? 0x1e4a3a), ink = Number(o.state?.ink ?? 0xf0e8d0);
    const { W, H, yc } = signDims(text);
    const mat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG, toneMapped: false, uniforms: { uTex: { value: this.texture(text, plate, ink) }, uLight: { value: 1 } } });
    const M = objectMatrix(z, o, d);
    const meshes: THREE.Mesh[] = [];
    for (const side of [1, -1]) {
      const g = new THREE.PlaneGeometry(W, H);
      if (side < 0) g.rotateY(Math.PI);
      g.translate(0, yc, 0.0265 * side);
      const mesh = new THREE.Mesh(g, mat);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(M);
      mesh.matrixWorldNeedsUpdate = true;
      this.root.add(mesh);
      meshes.push(mesh);
    }
    const e = M.elements;
    this.views.push({ uid: o.uid, meshes, mat, x: e[12], z: e[14] });
  }

  update(dt: number) {
    const z = this.zone;
    if (!z || !G.view || G.view.zone !== z) return;
    this.checkT -= dt;
    // a sign knocked down takes its face with it
    if (this.checkT <= 0) {
      this.checkT = 1;
      for (const v of [...this.views]) if (!z.objects.has(v.uid)) { for (const m of v.meshes) { this.root.remove(m); m.geometry.dispose(); } v.mat.dispose(); this.views.splice(this.views.indexOf(v), 1); }
    }
    for (const v of this.views) {
      const seen = G.view.vis.isVisible(Math.floor(v.x), Math.floor(v.z));
      const l = Math.max(0.2, Math.min(1.25, 0.2 + G.lightLevelAt(v.x, v.z) * 0.9)) * (seen ? 1 : 0.35);
      const u = v.mat.uniforms.uLight;
      u.value += (l - u.value) * Math.min(1, dt * 4);
    }
    void this.fontsIn;
  }
}
