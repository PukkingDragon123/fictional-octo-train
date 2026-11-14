// Pool water (round 18): a real water surface over every pool in the zone.
//
// A height-field wave sim (three cells per metre, semi-implicit wave equation with the
// local shallow-water wave speed sqrt(g * depth), so ripples slow and bunch up as they run
// onto a beach) covers the water tiles. Ripples spread, reflect off the pool walls (the
// dry cells are a mirror boundary), interfere and die away. Anything in the water drives
// it: the unit wading or swimming, inhabitants, items thrown in, the Gulper's strikes and
// hauls (src/creatures/species/pl_pool.ts), drips from the skylights and the mushroom
// fountain's falling ring. Splashes throw droplets that arc and land (and ripple where
// they land), foam rings spread from them, swimmers leave foam wakes, noodles and life
// rings ride the waves, light floating items bob.
//
// The field goes to the GPU as one small RGBA texture (height, slope x, slope z, foam):
// the surface mesh displaces and shades from it, the floor's caustics (src/gfx/materials.ts)
// focus and drift with its curvature, and the wet-floor reflections (src/gfx/postfx.ts)
// take its normals. Purely visual and local: every peer simulates what it sees.
import * as THREE from 'three';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { U } from '../../gfx/materials';
import type { Zone } from '../zone';
import { floorItems, type WorldItem } from '../../items/worldItems';
import { itemDef } from '../../items/item';

const RES = 3;                 // sim cells per metre
const DX = 1 / RES;
const STEP = 1 / 30;           // fixed sim step
const WIN = 30;                // simulated window round the local unit (metres)
const HS = 400, SS = 110;      // texture encodings: height (byte per metre), slope
const FLOATERS = new Set(['pl_noodle', 'float_ring']);

interface Sim {
  zone: Zone;
  tx0: number; ty0: number; tw: number; th: number;   // tile bbox of the water
  W: number; H: number;                                 // cells
  h: Float32Array; v: Float32Array; foam: Float32Array;
  k: Float32Array;            // c^2 / dx^2 per cell (0 = dry)
  surf: Float32Array;         // surface height per tile (NaN = not water)
  tex: THREE.DataTexture; data: Uint8Array;
  mesh: THREE.Mesh;
  fountains: [number, number, number][];
  idle: number;
}

// ---------------------------------------------------------------- the surface material
const VERT = /* glsl */`
uniform sampler2D uWaveTex;
uniform vec4 uWaveInfo;
varying vec3 vW;
varying vec2 vUv;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vUv = (wp.xz - uWaveInfo.xy) * uWaveInfo.zw;
  vec4 w = texture2D(uWaveTex, vUv);
  wp.y += (w.r - 0.502) * ${(255 / HS).toFixed(4)};
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const FRAG = /* glsl */`
layout(location = 1) out highp vec4 gNormal;
uniform sampler2D uWaveTex;
uniform vec4 uWaveInfo;
uniform vec2 uWaveTexel;
uniform sampler2D uLightTex;
uniform vec4 uLightInfo;
uniform sampler2D uVisTex;
uniform vec4 uVisInfo;
uniform float uVisOn;
uniform vec2 uCamFwd;
uniform float uGridScale;
uniform float uSpecOff;
uniform float uTime;
uniform vec3 uTint;
varying vec3 vW;
varying vec2 vUv;
float hsh(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec4 w = texture2D(uWaveTex, vUv);
  vec2 sl = (w.gb - 0.502) * ${(255 / SS).toFixed(4)};
  // fine capillary chop on top of the simulated waves, stronger where the water is moving
  vec2 cp = vW.xz * 9.0;
  float act = clamp(length(sl) * 6.0, 0.0, 1.0);
  sl += vec2(sin(cp.x + uTime * 3.1 + sin(cp.y * 0.7)), cos(cp.y * 1.1 - uTime * 2.7 + sin(cp.x * 0.6))) * (0.015 + 0.05 * act);
  vec3 n = normalize(vec3(-sl.x, 1.0, -sl.y));
  vec2 luv = (vW.xz - uLightInfo.xy) * uLightInfo.zw;
  vec3 gt = texture2D(uLightTex, luv).rgb;
  vec3 grid = gt * gt * uGridScale;
  // the fixtures and skylights mirrored in it: the light grid read where the reflected ray meets the ceiling,
  // thrown about by the slope of the water
  vec2 sp = vW.xz + uCamFwd * uSpecOff + n.xz * 7.0;
  vec3 st = texture2D(uLightTex, (sp - uLightInfo.xy) * uLightInfo.zw).rgb;
  float slope = length(sl);
  vec3 spec = st * st * st * uGridScale;
  float fres = 0.1 + clamp(slope * 2.2, 0.0, 0.5);
  // the water dims and cools what is under it a little and adds its own light on top (premultiplied:
  // the colour is added, the alpha is how much of the picture underneath it takes away)
  float crest = clamp(slope * 5.0, 0.0, 1.0);
  float a = clamp(0.1 + fres * 0.4 + crest * 0.22, 0.0, 0.7);
  vec3 col = uTint * grid * 0.4 * a + spec * (0.22 + slope * 5.0) + grid * crest * 0.12;
  // foam: broken white, in clumps
  float fn = hsh(floor(vW.xz * 12.0)) * 0.6 + hsh(floor(vW.xz * 5.0 + 3.1)) * 0.4;
  float foam = smoothstep(0.3, 1.0, w.a * (0.5 + fn * 0.8)) * 0.85;
  col = mix(col, grid * 0.95 + vec3(0.04), foam);
  a = max(a, foam * 0.92);
  if (uVisOn > 0.5) {
    vec2 vis = texture2D(uVisTex, (vW.xz - uVisInfo.xy) * uVisInfo.zw).rg;
    float vk = mix(vis.g * 0.35, 1.0, smoothstep(0.08, 0.92, vis.r));
    a *= vk; col *= vk;
  }
  gl_FragColor = vec4(col, a);
  gNormal = vec4(0.0);
}`;

let mat: THREE.ShaderMaterial | null = null;
function surfaceMat(): THREE.ShaderMaterial {
  if (mat) return mat;
  mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: {
      uWaveTex: U.uWaveTex, uWaveInfo: U.uWaveInfo, uWaveTexel: U.uWaveTexel,
      uLightTex: U.uLightTex, uLightInfo: U.uLightInfo, uVisTex: U.uVisTex, uVisInfo: U.uVisInfo, uVisOn: U.uVisOn,
      uCamFwd: U.uCamFwd, uGridScale: U.uGridScale, uSpecOff: U.uSpecOff, uTime: U.uTime,
      uTint: { value: new THREE.Color(0xbfe6f0) },
    },
    transparent: true, depthWrite: false, depthTest: true, fog: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  return mat;
}

// ---------------------------------------------------------------- droplets and foam rings
/** the normal buffer left as it was (alpha 0 blends away), as every effect in the main pass does */
function mrt<T extends THREE.Material>(m: T, k: string): T {
  m.onBeforeCompile = (sh) => { sh.fragmentShader = 'layout(location = 1) out highp vec4 gNormal;\n' + sh.fragmentShader.replace(/\}\s*$/, '  gNormal = vec4(0.0);\n}\n'); };
  m.customProgramCacheKey = () => 'water-mrt-' + k;
  return m;
}
const DROPS = 420, RINGS = 40;
interface Drop { x: number; y: number; z: number; vx: number; vy: number; vz: number; s: number; on: boolean }
interface Ring { x: number; y: number; z: number; t: number; life: number; r0: number; sp: number; on: boolean }

class PoolWater {
  sim: Sim | null = null;
  root = new THREE.Group();
  drops: Drop[] = [];
  rings: Ring[] = [];
  dropMesh: THREE.InstancedMesh;
  ringMesh: THREE.InstancedMesh;
  private acc = 0;
  private dripT = 0;
  private prevIn = new Map<string, number>();
  private itemPrev = new WeakMap<WorldItem, number>();
  private floatV = new Map<number, { vx: number; vz: number; w: number }>();
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private sv = new THREE.Vector3();
  private pv = new THREE.Vector3();
  private dirtyFrame = false;

  constructor() {
    this.root.name = 'poolWater';
    const dg = new THREE.OctahedronGeometry(1, 0);
    this.dropMesh = new THREE.InstancedMesh(dg, mrt(new THREE.MeshBasicMaterial({ color: 0xe6f6ff, transparent: true, opacity: 0.85, depthWrite: false }), 'drop'), DROPS);
    this.dropMesh.frustumCulled = false; this.dropMesh.count = 0;
    const rg = new THREE.RingGeometry(0.86, 1, 28, 1); rg.rotateX(-Math.PI / 2);
    this.ringMesh = new THREE.InstancedMesh(rg, mrt(new THREE.MeshBasicMaterial({ color: 0xf4fbff, transparent: true, opacity: 0.55, depthWrite: false }), 'ring'), RINGS);
    this.ringMesh.frustumCulled = false; this.ringMesh.count = 0;
    this.ringMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(RINGS * 3), 3);
    this.root.add(this.dropMesh, this.ringMesh);
    for (let i = 0; i < DROPS; i++) this.drops.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0, on: false });
    for (let i = 0; i < RINGS; i++) this.rings.push({ x: 0, y: 0, z: 0, t: 0, life: 1, r0: 0, sp: 1, on: false });
  }

  // ---------------------------------------------------------------- setup per zone
  build(z: Zone | null) {
    if (this.sim) { this.root.remove(this.sim.mesh); this.sim.mesh.geometry.dispose(); this.sim.tex.dispose(); this.sim = null; }
    for (const d of this.drops) d.on = false;
    for (const r of this.rings) r.on = false;
    this.prevIn.clear(); this.floatV.clear();
    U.uWaveOn.value = 0;
    if (!z) return;
    const wet = (x: number, y: number) => !!z.floorAt(x, y)?.water;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < z.H; y++) for (let x = 0; x < z.W; x++) if (wet(x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    if (x1 < 0) return;
    x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(z.W - 1, x1 + 1); y1 = Math.min(z.H - 1, y1 + 1);
    const tw = x1 - x0 + 1, th = y1 - y0 + 1, W = tw * RES, H = th * RES;
    // the surface of each body of water: just under the lowest rim round it
    const surf = new Float32Array(tw * th).fill(NaN);
    const comp = new Int32Array(tw * th).fill(-1);
    let nc = 0;
    for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
      if (comp[ty * tw + tx] >= 0 || !wet(tx + x0, ty + y0)) continue;
      const stack = [ty * tw + tx], tiles: number[] = [];
      comp[ty * tw + tx] = nc;
      let rim = -1e9;
      while (stack.length) {
        const i = stack.pop()!; tiles.push(i);
        const ix = i % tw, iy = (i / tw) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = ix + dx, ny = iy + dy, wx = nx + x0, wy = ny + y0;
          if (!z.inb(wx, wy)) continue;
          if (nx >= 0 && ny >= 0 && nx < tw && ny < th && wet(wx, wy)) { const j = ny * tw + nx; if (comp[j] < 0) { comp[j] = nc; stack.push(j); } }
          else if (z.floor[z.idx(wx, wy)]) rim = Math.max(rim, z.heightAt(wx, wy));
        }
      }
      const sy = (rim > -1e8 ? Math.min(rim, 0.3) : 0) - 0.06;
      for (const i of tiles) surf[i] = sy;
      nc++;
    }
    const k = new Float32Array(W * H);
    for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) {
      const ti = ((cy / RES) | 0) * tw + ((cx / RES) | 0);
      const s = surf[ti];
      if (Number.isNaN(s)) continue;
      const depth = s - z.heightAt(x0 + ((cx / RES) | 0), y0 + ((cy / RES) | 0));
      if (depth <= 0.005) continue;
      const c = Math.min(2.0, Math.max(0.45, Math.sqrt(9.8 * depth) * 0.55));
      k[cy * W + cx] = (c * c) / (DX * DX);
    }
    const data = new Uint8Array(W * H * 4);
    for (let i = 0; i < W * H; i++) { data[i * 4] = 128; data[i * 4 + 1] = 128; data[i * 4 + 2] = 128; data[i * 4 + 3] = 0; }
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.flipY = false; tex.needsUpdate = true;
    U.uWaveTex.value = tex;
    U.uWaveInfo.value.set(x0, y0, 1 / tw, 1 / th);
    U.uWaveTexel.value.set(1 / W, 1 / H);
    U.uWaveOn.value = 1;
    // the surface mesh: a grid of cell corners, quads only over the water
    const VW = W + 1, VH = H + 1;
    const pos = new Float32Array(VW * VH * 3);
    for (let vy = 0; vy < VH; vy++) for (let vx = 0; vx < VW; vx++) {
      let y = 0;
      for (const [dx, dy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
        const tx = Math.floor((vx + dx) / RES), ty = Math.floor((vy + dy) / RES);
        if (tx >= 0 && ty >= 0 && tx < tw && ty < th && !Number.isNaN(surf[ty * tw + tx])) { y = surf[ty * tw + tx]; break; }
      }
      const i = (vy * VW + vx) * 3;
      pos[i] = x0 + vx * DX; pos[i + 1] = y; pos[i + 2] = y0 + vy * DX;
    }
    const idx: number[] = [];
    for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) {
      if (Number.isNaN(surf[((cy / RES) | 0) * tw + ((cx / RES) | 0)])) continue;
      const a = cy * VW + cx, b = a + 1, c = a + VW, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, surfaceMat());
    mesh.name = 'poolSurface'; mesh.renderOrder = 2; mesh.frustumCulled = false;
    this.root.add(mesh);
    const fountains: [number, number, number][] = [];
    for (const o of z.objects.values()) if (o.key === 'pl_mushroom') fountains.push([o.x + 1, o.y + 1, 1.05]);
    this.sim = { zone: z, tx0: x0, ty0: y0, tw, th, W, H, h: new Float32Array(W * H), v: new Float32Array(W * H), foam: new Float32Array(W * H), k, surf, tex, data, mesh, fountains, idle: 0 };
  }

  // ---------------------------------------------------------------- queries
  /** the water surface height at a world point (still level + the waves), or null on dry ground */
  surfaceAt(x: number, z: number): number | null {
    const s = this.sim; if (!s) return null;
    const tx = Math.floor(x) - s.tx0, ty = Math.floor(z) - s.ty0;
    if (tx < 0 || ty < 0 || tx >= s.tw || ty >= s.th) return null;
    const sy = s.surf[ty * s.tw + tx];
    if (Number.isNaN(sy)) return null;
    return sy + this.waveAt(x, z);
  }
  /** the still level of the water at a point (null on dry ground) */
  levelAt(x: number, z: number): number | null {
    const s = this.sim; if (!s) return null;
    const tx = Math.floor(x) - s.tx0, ty = Math.floor(z) - s.ty0;
    if (tx < 0 || ty < 0 || tx >= s.tw || ty >= s.th) return null;
    const sy = s.surf[ty * s.tw + tx];
    return Number.isNaN(sy) ? null : sy;
  }
  waveAt(x: number, z: number): number {
    const s = this.sim; if (!s) return 0;
    const cx = Math.floor((x - s.tx0) * RES), cy = Math.floor((z - s.ty0) * RES);
    if (cx < 0 || cy < 0 || cx >= s.W || cy >= s.H) return 0;
    return s.h[cy * s.W + cx];
  }
  slopeAt(x: number, z: number): [number, number] {
    const s = this.sim; if (!s) return [0, 0];
    const cx = Math.floor((x - s.tx0) * RES), cy = Math.floor((z - s.ty0) * RES);
    if (cx < 1 || cy < 1 || cx >= s.W - 1 || cy >= s.H - 1) return [0, 0];
    const i = cy * s.W + cx;
    return [(s.h[i + 1] - s.h[i - 1]) / (2 * DX), (s.h[i + s.W] - s.h[i - s.W]) / (2 * DX)];
  }

  // ---------------------------------------------------------------- driving it
  /** push the water at a point: amount is a vertical velocity (m/s, + lifts), r the radius in metres */
  disturb(x: number, z: number, amount: number, r = 0.4, foam = 0) {
    const s = this.sim; if (!s) return;
    const cx = (x - s.tx0) * RES, cy = (z - s.ty0) * RES, R = Math.max(1, r * RES);
    const xa = Math.max(1, Math.floor(cx - R)), xb = Math.min(s.W - 2, Math.ceil(cx + R));
    const ya = Math.max(1, Math.floor(cy - R)), yb = Math.min(s.H - 2, Math.ceil(cy + R));
    for (let yy = ya; yy <= yb; yy++) for (let xx = xa; xx <= xb; xx++) {
      const i = yy * s.W + xx;
      if (!s.k[i]) continue;
      const d = Math.hypot(xx + 0.5 - cx, yy + 0.5 - cy) / R;
      if (d >= 1) continue;
      const f = 0.5 + 0.5 * Math.cos(d * Math.PI);
      s.v[i] += amount * f;
      if (foam) s.foam[i] = Math.min(1.4, s.foam[i] + foam * f);
    }
    s.idle = 0;
  }
  /** a ring of push (an expanding rim: a body dropping in, a strike) */
  ringPush(x: number, z: number, amount: number, r: number) {
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; this.disturb(x + Math.cos(a) * r, z + Math.sin(a) * r, amount, Math.max(0.25, r * 0.4)); }
  }
  /** a splash: the water knocked down, droplets thrown up in a crown, a foam ring spreading */
  splash(x: number, z: number, power = 1, sound = true) {
    const lv = this.levelAt(x, z);
    if (lv === null) return;
    const p = Math.max(0.1, Math.min(3, power));
    this.disturb(x, z, -0.9 * p, 0.3 + p * 0.25, 0.25 + p * 0.2);
    const n = Math.round(5 + p * 16);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, out = (0.6 + Math.random() * 1.6) * Math.sqrt(p);
      const up = (1.6 + Math.random() * 2.4) * Math.sqrt(p);
      this.drop(x + Math.cos(a) * 0.15 * p, lv + 0.04, z + Math.sin(a) * 0.15 * p, Math.cos(a) * out, up, Math.sin(a) * out, 0.022 + Math.random() * 0.03 * Math.min(1.5, p));
    }
    this.ring(x, z, lv, 0.15 * p, 1.1 + p * 0.3, 1.3 + p * 0.4);
    if (p > 0.6) this.ring(x, z, lv, 0.05, 0.7 + p * 0.2, 1.0 + p * 0.3);
    if (sound && G.audio) G.audio.play(p > 0.9 ? 'lifeguard_splash' : 'step_water', x, z, { vol: Math.min(1, 0.25 + p * 0.35), rate: 1.25 - Math.min(0.5, p * 0.15), range: 18 + p * 8 });
  }
  /** a droplet (it falls, and ripples the water where it lands) */
  drop(x: number, y: number, z: number, vx: number, vy: number, vz: number, s = 0.03) {
    let d = this.drops.find((q) => !q.on);
    if (!d) d = this.drops[(Math.random() * DROPS) | 0];
    d.x = x; d.y = y; d.z = z; d.vx = vx; d.vy = vy; d.vz = vz; d.s = s; d.on = true;
  }
  /** water running off a body that has just come up out of it */
  pour(x: number, y: number, z: number, r: number, n: number) {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * r; this.drop(x + Math.cos(a) * rr, y - Math.random() * 0.2, z + Math.sin(a) * rr, Math.cos(a) * 0.3, -0.2 - Math.random() * 0.6, Math.sin(a) * 0.3, 0.018 + Math.random() * 0.02); }
  }
  ring(x: number, z: number, y: number, r0: number, sp: number, life: number) {
    let r = this.rings.find((q) => !q.on);
    if (!r) r = this.rings.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b));
    r.x = x; r.z = z; r.y = y; r.r0 = r0; r.sp = sp; r.life = life; r.t = 0; r.on = true;
  }

  // ---------------------------------------------------------------- per frame
  update(dt: number) {
    const s = this.sim;
    if (!s || !G.view || G.view.zone !== s.zone) return;
    dt = Math.min(dt, 0.1);
    const me = G.local;
    this.movers(dt);
    this.ambient(dt);
    this.floaters(dt);
    this.particles(dt);
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 3) { this.acc -= STEP; steps++; if (s.idle < 6) this.step(me ? me.x : s.tx0 + s.tw / 2, me ? me.z : s.ty0 + s.th / 2); }
    if (this.acc > STEP * 3) this.acc = 0;
    if (steps && (s.idle < 6 || this.dirtyFrame)) { this.encode(me ? me.x : 0, me ? me.z : 0); this.dirtyFrame = s.idle < 6; }
  }

  private step(px: number, pz: number) {
    const s = this.sim!;
    const { W, H, h, v, k, foam } = s;
    const cx = (px - s.tx0) * RES, cy = (pz - s.ty0) * RES, R = WIN * RES;
    const xa = Math.max(1, Math.floor(cx - R)), xb = Math.min(W - 2, Math.ceil(cx + R));
    const ya = Math.max(1, Math.floor(cy - R)), yb = Math.min(H - 2, Math.ceil(cy + R));
    const dt = STEP, damp = 1 - 0.55 * dt, relax = 1 - 0.08 * dt;
    let energy = 0;
    for (let y = ya; y <= yb; y++) {
      let i = y * W + xa;
      for (let x = xa; x <= xb; x++, i++) {
        const kk = k[i];
        if (!kk) continue;
        const hc = h[i];
        // a dry neighbour mirrors this cell: the wave reflects off the pool wall
        const hl = k[i - 1] ? h[i - 1] : hc, hr = k[i + 1] ? h[i + 1] : hc, hu = k[i - W] ? h[i - W] : hc, hd = k[i + W] ? h[i + W] : hc;
        const lap = hl + hr + hu + hd - 4 * hc;
        v[i] = (v[i] + kk * lap * dt) * damp;
      }
    }
    for (let y = ya; y <= yb; y++) {
      let i = y * W + xa;
      for (let x = xa; x <= xb; x++, i++) {
        if (!k[i]) continue;
        const nh = (h[i] + v[i] * dt) * relax;
        h[i] = nh > 0.3 ? 0.3 : nh < -0.3 ? -0.3 : nh;
        energy += Math.abs(v[i]) + Math.abs(nh) * 4;
        // foam fades; steep breaking crests whip some up
        if (foam[i] > 0) foam[i] = Math.max(0, foam[i] - dt * (0.6 + foam[i] * 0.6));
        if (v[i] > 1.1) foam[i] = Math.min(1, foam[i] + (v[i] - 1.1) * dt * 2);
      }
    }
    s.idle = energy < 0.02 ? s.idle + 1 : 0;
  }

  private encode(px: number, pz: number) {
    const s = this.sim!;
    const { W, H, h, foam, k, data } = s;
    const cx = (px - s.tx0) * RES, cy = (pz - s.ty0) * RES, R = (WIN + 2) * RES;
    const xa = Math.max(1, Math.floor(cx - R)), xb = Math.min(W - 2, Math.ceil(cx + R));
    const ya = Math.max(1, Math.floor(cy - R)), yb = Math.min(H - 2, Math.ceil(cy + R));
    const cl = (n: number) => (n < 0 ? 0 : n > 255 ? 255 : n | 0);
    for (let y = ya; y <= yb; y++) {
      let i = y * W + xa;
      for (let x = xa; x <= xb; x++, i++) {
        const o = i * 4;
        if (!k[i]) { data[o] = 128; data[o + 1] = 128; data[o + 2] = 128; data[o + 3] = 0; continue; }
        const hc = h[i];
        const hl = k[i - 1] ? h[i - 1] : hc, hr = k[i + 1] ? h[i + 1] : hc, hu = k[i - W] ? h[i - W] : hc, hd = k[i + W] ? h[i + W] : hc;
        data[o] = cl(128 + hc * HS);
        data[o + 1] = cl(128 + ((hr - hl) / (2 * DX)) * SS);
        data[o + 2] = cl(128 + ((hd - hu) / (2 * DX)) * SS);
        data[o + 3] = cl(foam[i] * 255);
      }
    }
    void H;
    s.tex.needsUpdate = true;
  }

  /** everything that moves in the water pushes it: wading and swimming units, inhabitants */
  private movers(dt: number) {
    const s = this.sim!, zk = s.zone.key;
    const seen = new Set<string>();
    const one = (id: string, x: number, z: number, speed: number, size: number, heavy: number) => {
      seen.add(id);
      const lv = this.levelAt(x, z);
      const was = this.prevIn.get(id);
      if (lv === null) { if (was !== undefined) this.prevIn.delete(id); return; }
      // stepping or dropping in
      if (was === undefined) { this.prevIn.set(id, G.time); if (G.time > 2) this.splash(x, z, 0.5 + heavy * 0.6 + speed * 0.2); return; }
      const sp = Math.min(5, speed);
      if (sp > 0.15) {
        // the bow pushes the water up ahead, the hollow behind it sinks: a wake that runs off in a V
        this.disturb(x, z, -sp * 0.9 * size * dt * 6, 0.35 + size * 0.4, sp * 0.03 * dt * 6);
        if (Math.random() < dt * sp * 1.2) this.ring(x, z, lv, size * 0.6, 0.8, 1.0);
      } else if (Math.random() < dt * 0.4) this.disturb(x, z, -0.08 * size, 0.4);
    };
    for (const p of G.players.values()) {
      if (p.zoneKey !== zk || p.body?.dead) continue;
      const sp = Math.hypot(p.vx ?? 0, p.vz ?? 0) || p.speed || 0;
      one('p' + p.id, p.x, p.z, sp, p.stance === 'swim' ? 0.55 : 0.35, 0.6);
      // swimming strokes: the arms come over and slap down
      if (p.stance === 'swim' && sp > 0.2 && Math.random() < dt * 1.6) { const a = (p.facing ?? 0) + (Math.random() < 0.5 ? 0.9 : -0.9); this.splash(p.x + Math.cos(a) * 0.4, p.z + Math.sin(a) * 0.4, 0.25, false); }
    }
    const cs = (G as any).creatures?.creatures as Map<string, any> | undefined;
    if (cs) for (const c of cs.values()) {
      if (c.zoneKey !== zk || c.dead || c.sp?.flags?.flying || c.sp?.key === 'gulper') continue;
      if (G.local && Math.abs(c.x - G.local.x) > WIN + 4) continue;
      one('c' + c.id, c.x, c.z, Math.abs(c.speed ?? 0), Math.min(1.2, c.radius ?? 0.3), Math.min(1.5, (c.radius ?? 0.3) * 1.5));
    }
    for (const id of this.prevIn.keys()) if (!seen.has(id) && id[0] !== 'i') this.prevIn.delete(id);
    // items thrown or dropped in: a splash as they cross the surface; light floating things ride it
    const items = floorItems(s.zone);
    for (const wi of items.values()) {
      if (G.local && (Math.abs(wi.x - G.local.x) > WIN || Math.abs(wi.z - G.local.z) > WIN)) continue;
      const lv = this.levelAt(wi.x, wi.z);
      if (lv === null) continue;
      const py = this.itemPrev.get(wi);
      if (py !== undefined && py > lv && wi.y <= lv + 0.02 && wi.vy !== undefined) {
        const w = itemDef(wi.item.key).weight;
        this.splash(wi.x, wi.z, Math.min(1.6, 0.15 + Math.sqrt(w) * 0.5 + Math.abs(wi.vy) * 0.08));
      }
      this.itemPrev.set(wi, wi.y);
      if (wi.vy === undefined && this.floats(wi.item.key)) {
        const sy = lv + this.waveAt(wi.x, wi.z);
        wi.y = sy - 0.01;
        const [gx, gz] = this.slopeAt(wi.x, wi.z);
        const nx = wi.x - gx * dt * 2.5, nz = wi.z - gz * dt * 2.5;
        if (this.levelAt(nx, nz) !== null) { wi.x = nx; wi.z = nz; }
        wi.rot += (gx - gz) * dt * 3;
      }
    }
  }
  private floatCache = new Map<string, boolean>();
  private floats(key: string): boolean {
    let f = this.floatCache.get(key);
    if (f === undefined) {
      const d = itemDef(key), t = d.tags ?? [];
      f = d.weight < 0.6 && (t.includes('float') || t.includes('rubber') || t.includes('toy') || t.includes('plastic') || /duck|ball|balloon|foam|cork|noodle|latex/.test(key));
      this.floatCache.set(key, f);
    }
    return f;
  }

  /** drips from the skylights and the roof, and the mushroom fountain's falling ring */
  private ambient(dt: number) {
    const s = this.sim!, me = G.local;
    if (!me) return;
    this.dripT -= dt;
    if (this.dripT <= 0) {
      this.dripT = 0.7 + Math.random() * 2.2;
      for (let tries = 0; tries < 6; tries++) {
        const x = me.x + (Math.random() - 0.5) * 22, z = me.z + (Math.random() - 0.5) * 16;
        const lv = this.levelAt(x, z);
        if (lv === null) continue;
        this.drop(x, lv + 3.2 + Math.random() * 1.5, z, 0, -1, 0, 0.02);
        break;
      }
    }
    for (const [fx, fz, r] of s.fountains) {
      if (Math.abs(fx - me.x) > WIN || Math.abs(fz - me.z) > WIN) continue;
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2, rr = r + (Math.random() - 0.5) * 0.15;
        this.disturb(fx + Math.cos(a) * rr, fz + Math.sin(a) * rr, -0.35 * dt * 30 * (0.5 + Math.random()), 0.18, dt * 0.5);
      }
      if (Math.random() < dt * 6) { const a = Math.random() * Math.PI * 2; const lv = this.levelAt(fx + Math.cos(a) * r, fz + Math.sin(a) * r); if (lv !== null) this.drop(fx + Math.cos(a) * r, lv + 0.03, fz + Math.sin(a) * r, Math.cos(a) * 0.6, 1 + Math.random(), Math.sin(a) * 0.6, 0.02); }
    }
  }

  /** noodles and life rings on the water ride the waves, drift down the slopes and turn */
  private floaters(dt: number) {
    const s = this.sim!, z = s.zone, me = G.local;
    for (const o of z.objects.values()) {
      if (!FLOATERS.has(o.key)) continue;
      if (me && (Math.abs(o.x - me.x) > WIN || Math.abs(o.y - me.z) > WIN)) continue;
      const cx = o.x + 0.5 + (o.ox ?? 0), cz = o.y + 0.5 + (o.oz ?? 0);
      const lv = this.levelAt(cx, cz);
      if (lv === null) continue;
      let fv = this.floatV.get(o.uid);
      if (!fv) { fv = { vx: 0, vz: 0, w: 0 }; this.floatV.set(o.uid, fv); }
      const [gx, gz] = this.slopeAt(cx, cz);
      fv.vx = (fv.vx - gx * 9.8 * dt * 0.35) * (1 - dt * 0.8);
      fv.vz = (fv.vz - gz * 9.8 * dt * 0.35) * (1 - dt * 0.8);
      fv.w = (fv.w + (gx * 0.7 - gz * 0.5) * dt * 2) * (1 - dt * 0.5) + 0.004 * dt;
      // stays over its own tile (the tile it is on is what blocks and is searched)
      o.ox = Math.max(-0.42, Math.min(0.42, (o.ox ?? 0) + fv.vx * dt));
      o.oz = Math.max(-0.42, Math.min(0.42, (o.oz ?? 0) + fv.vz * dt));
      if (Math.abs(o.ox) >= 0.42) fv.vx *= -0.4;
      if (Math.abs(o.oz) >= 0.42) fv.vz *= -0.4;
      o.state = o.state || ({} as any);
      (o.state as any).y = lv + this.waveAt(cx, cz) - z.heightAt(o.x, o.y) - 0.04;
      (o.state as any).yaw = ((o.state as any).yaw ?? 0) + fv.w * dt;
    }
  }

  private particles(dt: number) {
    const s = this.sim!;
    let n = 0;
    for (const d of this.drops) {
      if (!d.on) continue;
      d.vy -= 9.8 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      d.vx *= 1 - dt * 0.4; d.vz *= 1 - dt * 0.4;
      const lv = this.levelAt(d.x, d.z);
      if (lv !== null && d.y <= lv + this.waveAt(d.x, d.z) && d.vy < 0) {
        // it lands: a little crater and a ring; a big one sends up a tiny crown of its own
        this.disturb(d.x, d.z, -Math.min(1.4, -d.vy * 0.18) * (d.s / 0.03), 0.2, 0.05);
        if (d.s > 0.018 && -d.vy > 4 && Math.random() < 0.5) { this.ring(d.x, d.z, lv, 0.02, 0.5, 0.8); if (G.local && Math.hypot(d.x - G.local.x, d.z - G.local.z) < 12 && Math.random() < 0.35) G.audio?.play('drip', d.x, d.z, { vol: 0.35, range: 14 }); }
        d.on = false; continue;
      }
      if (lv === null && d.y <= s.zone.heightAt(Math.floor(d.x), Math.floor(d.z))) { d.on = false; continue; }
      if (d.y < -4) { d.on = false; continue; }
      const sc = d.s * (1 + Math.min(1.5, Math.abs(d.vy) * 0.25));
      this.q.setFromUnitVectors(this.pv.set(0, 1, 0), this.sv.set(d.vx, d.vy, d.vz).normalize());
      this.m4.compose(this.pv.set(d.x, d.y, d.z), this.q, this.sv.set(d.s, sc, d.s));
      this.dropMesh.setMatrixAt(n++, this.m4);
      if (n >= DROPS) break;
    }
    this.dropMesh.count = n;
    this.dropMesh.instanceMatrix.needsUpdate = true;
    let m = 0;
    for (const r of this.rings) {
      if (!r.on) continue;
      r.t += dt;
      if (r.t >= r.life) { r.on = false; continue; }
      const k = r.t / r.life, rad = r.r0 + r.sp * r.t * (1 - k * 0.35);
      const y = r.y + this.waveAt(r.x, r.z) + 0.012;
      this.e.set(0, 0, 0);
      this.m4.compose(this.pv.set(r.x, y, r.z), this.q.setFromEuler(this.e), this.sv.set(rad, 1, rad));
      this.ringMesh.setMatrixAt(m, this.m4);
      const f = (1 - k) * (1 - k);
      this.ringMesh.instanceColor!.setXYZ(m, f, f, f);
      m++;
    }
    this.ringMesh.count = m;
    this.ringMesh.instanceMatrix.needsUpdate = true;
    this.ringMesh.instanceColor!.needsUpdate = true;
  }
}

export const poolWater = new PoolWater();
// the rings fade with their instance colour over an additive-ish white: tint by colour, keep the alpha
(poolWater.ringMesh.material as THREE.MeshBasicMaterial).blending = THREE.AdditiveBlending;

let installed = false;
function install() {
  if (installed || !G || !(G as any).addSystem || !G.pr?.scene) return;
  installed = true;
  G.pr.scene.add(poolWater.root);
  (G as any).water = poolWater;
  (G as any).addSystem({ name: 'poolWater', update: (dt: number) => { try { poolWater.update(dt); } catch (e) { console.error('poolWater', e); } }, onZoneChange: (z: Zone) => poolWater.build(z) });
  if (G.view) poolWater.build(G.view.zone);
}
bus.on('zoneView', (z: Zone) => { if (!installed) install(); else if (poolWater.sim?.zone !== z) poolWater.build(z); });
bus.on('enterZone', () => { if (!installed) install(); });
