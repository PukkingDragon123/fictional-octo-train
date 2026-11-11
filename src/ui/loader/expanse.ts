// THE EXPANSE (round 15): the loading screen of everything, as a 3D scene.
// A yellow backrooms corridor at eye level under a tiled ceiling with its lamps
// on; walls rise out of the carpet around the camera, rooms unfold like a
// pop-up book (partitions hinge up off the floor), corridors run on segment by
// segment and the lamps come on room by room behind a spreading wavefront.
// The ceiling lifts away as the camera cranes up and back, turning a quarter
// turn, until it hangs straight over the level and the thick walls in the
// middle of it spell LIMBO / PHOBIA (src/ui/loader/word.ts), lit low from one
// side so the letters stand up in their own long shadows. Then it holds, and if
// the load is still running it dives back down to the other end of the corridor
// while the level folds back into the floor, and grows again (a seamless loop).
// Motion blur: the frame is rendered into an HDR target and accumulated with
// the frames before it (more when the camera moves fast), with a radial zoom
// blur on the pull-back; then ACES, a vignette and film grain. Rendered at
// about 540 lines and shown with crisp pixels (the game's light pixel filter).
// No UI of any kind. src/ui/loading.ts owns the overlay and the API.
import * as THREE from 'three';
import { WORD } from './word';

const CELL = 1.25, WH = 2.8, TH = 0.26, LAMP = CELL * 3;
const GROW = 7.6, HOLD = 2.6, DIVE = 3.4;
const ROWS = WORD.length, COLS = WORD[0].length;
const ZC = 0.5 * CELL; // the corridor's centre line (the middle row of the gap between the words)
const FOG = 0x120d06;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoother = (k: number) => { k = clamp01(k); return k * k * k * (k * (k * 6 - 15) + 10); };
const backOut = (k: number, s = 1.5) => { k = clamp01(k) - 1; return 1 + k * k * ((s + 1) * k + s); };
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296); }

/** a grid cell (column, row in the word's frame, may run outside it) to the world */
const cx = (c: number) => (c - Math.floor(COLS / 2) + 0.5) * CELL;
const cz = (r: number) => (r - Math.floor(ROWS / 2) + 0.5) * CELL;
const isLetter = (c: number, r: number) => r >= 0 && r < ROWS && c >= 0 && c < COLS && WORD[r][c] === '#';
function nearLetter(c: number, r: number, m: number) {
  for (let dr = -m; dr <= m; dr++) for (let dc = -m; dc <= m; dc++) if (isLetter(c + dc, r + dr)) return true;
  return false;
}

// ------------------------------------------------------------------ textures (painted per pixel, crisp)
function tex(w: number, h: number, paint: (c: CanvasRenderingContext2D, r: () => number) => void, seed: number, rep: [number, number] = [1, 1]) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!; paint(c, rng(seed));
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const dots = (c: CanvasRenderingContext2D, r: () => number, w: number, h: number, n: number, cols: string[]) => {
  for (let i = 0; i < n; i++) { c.fillStyle = cols[Math.floor(r() * cols.length)]; c.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1, 1); }
};
/** mono-yellow wallpaper for one 1.25 x 2.8 m face: paired stripes, a faint damask, damp blooms, a tide line, the baseboard */
const paintPaper = (c: CanvasRenderingContext2D, r: () => number) => {
  const W = 48, H = 108;
  c.fillStyle = '#cfb75e'; c.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 12) { c.fillStyle = '#bca34e'; c.fillRect(x, 0, 2, H); c.fillStyle = '#d9c36c'; c.fillRect(x + 2, 0, 1, H); c.fillStyle = '#c4ac55'; c.fillRect(x + 7, 0, 1, H); }
  for (let y = 6; y < H - 14; y += 14) for (let x = 6; x < W; x += 12) { c.fillStyle = 'rgba(150,120,50,0.28)'; c.fillRect(x - 1, y, 3, 1); c.fillRect(x, y - 1, 1, 3); c.fillRect(x - 2, y + 4, 1, 1); c.fillRect(x + 2, y + 4, 1, 1); }
  for (let i = 0; i < 4; i++) { const ex = r() * W, ey = 50 + r() * 44, rx = 3 + r() * 8, ry = 5 + r() * 12; c.fillStyle = 'rgba(112,86,30,0.20)'; c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, 7); c.fill(); c.strokeStyle = 'rgba(96,70,22,0.32)'; c.lineWidth = 1; c.stroke(); }
  c.fillStyle = 'rgba(96,72,26,0.30)'; c.fillRect(0, H - 22, W, 6);
  c.fillStyle = 'rgba(255,240,190,0.25)'; c.fillRect(0, 0, W, 2);
  dots(c, r, W, H, 160, ['rgba(80,58,20,0.35)', 'rgba(240,220,150,0.35)', 'rgba(70,50,18,0.2)']);
  // the baseboard: brown, a lit top edge, scuffs
  c.fillStyle = '#5a3f1f'; c.fillRect(0, H - 8, W, 8); c.fillStyle = '#7d5a2e'; c.fillRect(0, H - 8, W, 1); c.fillStyle = '#3a2812'; c.fillRect(0, H - 1, W, 1);
  dots(c, r, W, 6, 14, ['#2f2010', '#86643a']);
};
const paintCarpet = (c: CanvasRenderingContext2D, r: () => number) => {
  c.fillStyle = '#6b5a33'; c.fillRect(0, 0, 64, 64);
  dots(c, r, 64, 64, 900, ['#5b4b29', '#7a6940', '#655430', '#82714a', '#4e4024']);
  c.fillStyle = 'rgba(40,30,10,0.16)'; c.fillRect(22, 0, 20, 64); // a worn path
  for (let i = 0; i < 3; i++) { c.fillStyle = 'rgba(46,36,16,0.22)'; c.beginPath(); c.ellipse(r() * 64, r() * 64, 4 + r() * 7, 3 + r() * 5, r() * 3, 0, 7); c.fill(); }
};
const paintTile = (c: CanvasRenderingContext2D, r: () => number) => {
  c.fillStyle = '#ddd5b5'; c.fillRect(0, 0, 32, 32);
  dots(c, r, 32, 32, 160, ['#cfc6a4', '#e8e1c4', '#c6bc98']);
  c.fillStyle = '#9b9175'; c.fillRect(0, 0, 32, 1); c.fillRect(0, 0, 1, 32); c.fillStyle = '#f0ead2'; c.fillRect(1, 1, 31, 1); c.fillRect(1, 1, 1, 31);
  if (r() < 0.9) { c.fillStyle = 'rgba(150,118,52,0.32)'; c.beginPath(); c.ellipse(8 + r() * 16, 8 + r() * 16, 4 + r() * 5, 3 + r() * 4, r() * 3, 0, 7); c.fill(); }
};
/** the cut tops of the walls: plaster; the letters' run on seamlessly from cell to cell so each letter reads as one shape */
const paintTop = (base: string, dark: string, edged: boolean) => (c: CanvasRenderingContext2D, r: () => number) => {
  c.fillStyle = base; c.fillRect(0, 0, 16, 16); dots(c, r, 16, 16, 40, [dark, 'rgba(255,250,230,0.35)']);
  if (edged) { c.fillStyle = dark; c.fillRect(0, 0, 16, 1); c.fillRect(0, 15, 16, 1); c.fillRect(0, 0, 1, 16); c.fillRect(15, 0, 1, 16); }
};

// ------------------------------------------------------------------ the wavefront, in every material
type Uniforms = { uO: { value: THREE.Vector2 }; uR: { value: number }; uBand: { value: number }; uT: { value: number }; uPool: { value: number }; uEdge: { value: number } };
function wave(m: THREE.MeshStandardMaterial, U: Uniforms, pools = false) {
  m.customProgramCacheKey = () => 'lp-expanse-' + (pools ? 1 : 0);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLpW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
  vec4 lpW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    lpW = instanceMatrix * lpW;
  #endif
  vLpW = (modelMatrix * lpW).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vLpW;
uniform vec2 uO; uniform float uR, uBand, uT, uPool, uEdge;
float lpH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  float lpD = length(vLpW.xz - uO);
  float lpM = smoothstep(uR + 0.6, uR - uBand, lpD);
  diffuseColor.rgb *= lpM;
  totalEmissiveRadiance *= lpM;
  ${pools ? `{
    // the lamps of the cut-away ceiling: a pool of light under each, switched on room by room behind the front
    vec2 g = (vLpW.xz - ${(CELL / 2).toFixed(3)}) / ${LAMP.toFixed(3)} + 0.5;
    vec2 id = floor(g); vec2 f = fract(g) - 0.5;
    float cd = length(id * ${LAMP.toFixed(3)} + ${(CELL / 2).toFixed(3)} - uO);
    float on = smoothstep(uR - 0.5, uR - 3.5, cd);
    float age = (uR - cd) / max(uBand, 1.0);
    float hz = lpH(id);
    if (age < 1.6) on *= step(0.35, fract(sin(hz * 91.7 + uT * 23.0) * 437.5));
    if (hz < 0.06) on *= 0.35 + 0.65 * step(0.5, fract(sin(uT * 7.0 + hz * 50.0) * 91.3));
    float pool = exp(-dot(f, f) * 9.0) * 0.9 + exp(-dot(f, f) * 2.2) * 0.25;
    totalEmissiveRadiance += diffuseColor.rgb * pool * on * uPool * (hz < 0.12 ? 0.5 : 1.0);
    totalEmissiveRadiance += vec3(1.0, 0.72, 0.34) * exp(-pow((lpD - uR) / 0.7, 2.0)) * uEdge;
  }` : ''}`);
  };
  return m;
}

// ------------------------------------------------------------------ the camera's path
interface Pose { pos: THREE.Vector3; look: THREE.Vector3; fov: number; h: number }

export class Expanse {
  readonly canvas: HTMLCanvasElement;
  private r: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 900);
  private U: Uniforms = { uO: { value: new THREE.Vector2() }, uR: { value: 0 }, uBand: { value: 3 }, uT: { value: 0 }, uPool: { value: 1 }, uEdge: { value: 0.25 } };
  private rtScene!: THREE.WebGLRenderTarget; private rtA!: THREE.WebGLRenderTarget; private rtB!: THREE.WebGLRenderTarget;
  private quad: THREE.Mesh; private qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private accMat: THREE.ShaderMaterial; private outMat: THREE.ShaderMaterial;
  private sun = new THREE.DirectionalLight(0xffd8a0, 0);
  private hemi = new THREE.HemisphereLight(0xfff0cc, 0x4a3818, 0.9);
  private lamps: THREE.PointLight[] = [];
  private fog = new THREE.Fog(FOG, 6, 30);
  // instances: x, z, jitter, kind data; distance to the current origin
  private groups: { mesh: THREE.InstancedMesh; x: Float32Array; z: Float32Array; j: Float32Array; d: Float32Array; k: Float32Array; a: Float32Array; kind: 'letter' | 'segH' | 'segV' | 'prop'; base?: Float32Array }[] = [];
  private ceil: { mesh: THREE.InstancedMesh; x: Float32Array; z: Float32Array; j: Float32Array; ax: Float32Array }[] = [];
  private h1 = 90; private aspect = 16 / 9;
  private W = 2; private H = 2;
  private prevPos = new THREE.Vector3(); private prevH = 1; private fresh = true;
  // timeline
  private phase: 'grow' | 'hold' | 'dive' = 'grow';
  private pt = 0; private cyc = 0; private time = 0;
  private finishing = false; private finished = false;
  private origin = new THREE.Vector2(); private originCyc = -1;
  private maxD = 120;

  constructor(aspect = 16 / 9) {
    this.aspect = aspect;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'lp-gl';
    const r = this.r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    r.setPixelRatio(1);
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.3;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    r.setClearColor(FOG, 1);
    this.scene.background = new THREE.Color(FOG);
    this.scene.fog = this.fog;
    // the passes
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const vs = 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    this.accMat = new THREE.ShaderMaterial({
      uniforms: { tCur: { value: null }, tPrev: { value: null }, uKeep: { value: 0 }, uZoom: { value: 0 } },
      vertexShader: vs, depthTest: false, depthWrite: false, toneMapped: false,
      fragmentShader: `varying vec2 vUv; uniform sampler2D tCur, tPrev; uniform float uKeep, uZoom;
        void main() {
          vec2 d = (vUv - 0.5) * uZoom; vec3 c = vec3(0.0);
          for (int i = 0; i < 7; i++) { float k = float(i) / 6.0; c += texture2D(tCur, vUv - d * k).rgb * (1.0 - k * 0.5); }
          c /= 5.25;
          gl_FragColor = vec4(mix(c, texture2D(tPrev, vUv).rgb, uKeep), 1.0);
        }`,
    });
    this.outMat = new THREE.ShaderMaterial({
      uniforms: { tAcc: { value: null }, uFade: { value: 0 }, uT: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
      vertexShader: vs, depthTest: false, depthWrite: false, toneMapped: true,
      fragmentShader: `varying vec2 vUv; uniform sampler2D tAcc; uniform float uFade, uT; uniform vec2 uRes;
        #include <common>
        void main() {
          vec3 c = texture2D(tAcc, vUv).rgb;
          vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y * 0.75;
          c *= 1.0 - dot(q, q) * 1.15;
          gl_FragColor = vec4(c * uFade, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          float n = fract(sin(dot(floor(vUv * uRes) + fract(uT * 7.13) * 91.0, vec2(12.9898, 78.233))) * 43758.5453);
          gl_FragColor.rgb += (n - 0.5) * 0.045 * uFade;
        }`,
    });
    this.quad = new THREE.Mesh(tri, this.accMat); this.quad.frustumCulled = false;
    this.build();
  }

  // ---------------------------------------------------------------- the level
  private build() {
    const U = this.U, scene = this.scene, rnd = rng(1915);
    const paper = tex(48, 108, paintPaper, 11);
    const wallM = wave(new THREE.MeshStandardMaterial({ map: paper, roughness: 0.93 }), U);
    const letterTop = wave(new THREE.MeshStandardMaterial({ map: tex(16, 16, paintTop('#efe3bd', '#d8cba0', false), 3), roughness: 0.9, emissive: 0x3a3018, emissiveIntensity: 0.6 }), U);
    const partTop = wave(new THREE.MeshStandardMaterial({ map: tex(16, 16, paintTop('#b5a376', '#8f7f58', true), 4), roughness: 0.95 }), U);
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    const matsL = [wallM, wallM, letterTop, wallM, wallM, wallM], matsP = [wallM, wallM, partTop, wallM, wallM, wallM];

    // the letters
    const L: [number, number][] = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (isLetter(c, r)) L.push([cx(c), cz(r)]);
    this.addGroup('letter', new THREE.InstancedMesh(box, matsL, L.length), L.map(([x, z]) => ({ x, z })), rnd);

    // the region the end shot sees (from the aspect at build time), plus a margin
    const tanH = Math.tan(THREE.MathUtils.degToRad(21));
    const wordW = COLS * CELL, wordH = ROWS * CELL;
    this.h1 = Math.max((wordH * 1.6) / (2 * tanH), (wordW * 1.3) / (2 * tanH * this.aspect));
    const visH = 2 * this.h1 * tanH, visW = visH * this.aspect;
    const C0 = -Math.ceil((visW / 2 + 14) / CELL), C1 = -C0, R0 = -Math.ceil((visH / 2 + 12) / CELL), R1 = -R0;
    const c0 = C0 + Math.floor(COLS / 2), c1 = C1 + Math.floor(COLS / 2), r0 = R0 + Math.floor(ROWS / 2), r1 = R1 + Math.floor(ROWS / 2);
    const midR = Math.floor(ROWS / 2), corrA = midR - 2, corrB = midR + 2; // the corridor between the two words
    const corrC0 = -10, corrC1 = COLS + 10;
    const inCorr = (c: number, r: number) => r >= corrA && r <= corrB && c >= corrC0 && c <= corrC1;
    const segH: { x: number; z: number }[] = [], segV: { x: number; z: number }[] = [];
    const taken = new Set<string>();
    const put = (c: number, r: number, horiz: boolean, force = false) => {
      const key = c + ',' + r + (horiz ? 'h' : 'v');
      if (taken.has(key)) return;
      if (!force && (nearLetter(c, r, 2) || inCorr(c, r))) return;
      taken.add(key);
      (horiz ? segH : segV).push({ x: cx(c), z: cz(r) });
    };
    // the corridor's own two walls, doorways every so often
    for (let c = corrC0; c <= corrC1; c++) {
      if ((c + 400) % 11 > 1) put(c, corrA, true, true);
      if ((c + 405) % 13 > 1) put(c, corrB, true, true);
    }
    // an irregular room grid, each wall run broken by a doorway or left open
    const xs: number[] = []; for (let c = c0; c < c1; c += 4 + Math.floor(rnd() * 5)) xs.push(c);
    const zs: number[] = []; for (let r = r0; r < r1; r += 4 + Math.floor(rnd() * 4)) zs.push(r);
    for (const r of zs) for (let i = 0; i < xs.length - 1; i++) {
      if (rnd() < 0.3) continue;
      const a = xs[i], b = xs[i + 1], door = 1 + Math.floor(rnd() * 2), at = a + 1 + Math.floor(rnd() * Math.max(1, b - a - 2 - door));
      for (let c = a; c < b; c++) if (rnd() < 0.25 || c < at || c >= at + door) put(c, r, true);
    }
    for (const c of xs) for (let i = 0; i < zs.length - 1; i++) {
      if (rnd() < 0.3) continue;
      const a = zs[i], b = zs[i + 1], door = 1 + Math.floor(rnd() * 2), at = a + 1 + Math.floor(rnd() * Math.max(1, b - a - 2 - door));
      for (let r = a; r < b; r++) if (rnd() < 0.25 || r < at || r >= at + door) put(c, r, false);
    }
    this.addGroup('segH', new THREE.InstancedMesh(box, matsP, segH.length), segH, rnd);
    this.addGroup('segV', new THREE.InstancedMesh(box, matsP, segV.length), segV, rnd);

    // furniture through the rooms: desks, filing cabinets, boxes, fallen ceiling tiles, a few chairs
    const S = (c: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => wave(new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o }), U);
    const tileTex = tex(32, 32, paintTile, 5);
    const kinds: { m: THREE.Material; w: number; h: number; d: number; n: number; stack?: number }[] = [
      { m: S(0x8d6b40, { roughness: 0.7 }), w: 1.3, h: 0.76, d: 0.66, n: 70 },
      { m: S(0x8c8e82, { metalness: 0.45, roughness: 0.5 }), w: 0.47, h: 1.32, d: 0.6, n: 50 },
      { m: S(0xa47c48, { roughness: 0.95 }), w: 0.5, h: 0.4, d: 0.5, n: 90, stack: 3 },
      { m: wave(new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.9 }), U), w: 0.62, h: 0.03, d: 0.62, n: 90 },
      { m: S(0x2a2826, { roughness: 0.55 }), w: 0.5, h: 0.48, d: 0.5, n: 40 },
    ];
    for (const k of kinds) {
      const list: { x: number; z: number; y: number; ry: number }[] = [];
      let guard = 0;
      while (list.length < k.n && guard++ < k.n * 30) {
        const c = c0 + Math.floor(rnd() * (c1 - c0)), r = r0 + Math.floor(rnd() * (r1 - r0));
        if (nearLetter(c, r, 2) || (r >= corrA - 1 && r <= corrB + 1 && c >= corrC0 && c <= corrC1) || taken.has(c + ',' + r + 'h') || taken.has(c + ',' + r + 'v')) continue;
        const x = cx(c) + (rnd() - 0.5) * 0.6, z = cz(r) + (rnd() - 0.5) * 0.6, ry = rnd() < 0.7 ? Math.round(rnd() * 4) * Math.PI / 2 : rnd() * 6;
        const n = k.stack ? 1 + Math.floor(rnd() * k.stack) : 1;
        for (let s = 0; s < n; s++) list.push({ x: x + (rnd() - 0.5) * 0.08, z: z + (rnd() - 0.5) * 0.08, y: s * k.h, ry: ry + (k.stack ? (rnd() - 0.5) * 0.5 : 0) });
      }
      const mesh = new THREE.InstancedMesh(box, k.m, list.length);
      const base = new Float32Array(list.length * 16), mm = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      list.forEach((p, i) => { mm.compose(new THREE.Vector3(0, 0, 0), q.setFromAxisAngle(up, p.ry), new THREE.Vector3(k.w, k.h, k.d)); mm.toArray(base, i * 16); base[i * 16 + 13] = p.y; });
      this.addGroup('prop', mesh, list, rnd, base);
    }

    // the carpet over the whole region, lit in pools by the lamps of the ceiling that is not there
    const FW = (c1 - c0 + 30) * CELL, FD = (r1 - r0 + 30) * CELL;
    const carpet = tex(64, 64, paintCarpet, 7, [FW / 3.2, FD / 3.2]);
    const floorM = wave(new THREE.MeshStandardMaterial({ map: carpet, roughness: 1, emissive: 0x000000 }), U, true);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(FW, FD), floorM);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

    // the ceiling (only round the start of the run): tiles and lamp panels, lifted away on the crane up
    const tileM = wave(new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.9 }), U);
    const lampM = wave(new THREE.MeshStandardMaterial({ color: 0xfff6dc, emissive: 0xfff0cc, emissiveIntensity: 3.2, roughness: 0.4 }), U);
    const tilePos: [number, number][] = [], lampPos: [number, number][] = [];
    for (let r = -12; r <= 12; r++) for (let c = -12; c <= 12; c++) {
      if (r * r + c * c > 150) continue;
      ((((c % 3) + 3) % 3 === 0 && (((r % 3) + 3) % 3) === 0) ? lampPos : tilePos).push([c, r]);
    }
    for (const [list, m, sx] of [[tilePos, tileM, CELL], [lampPos, lampM, 0.6]] as const) {
      const mesh = new THREE.InstancedMesh(box, m, list.length);
      mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
      const n = list.length, x = new Float32Array(n), z = new Float32Array(n), j = new Float32Array(n), ax = new Float32Array(n);
      list.forEach(([c, r], i) => { x[i] = c * CELL; z[i] = r * CELL; j[i] = rnd(); ax[i] = rnd() * 6.28; });
      mesh.userData.sx = sx;
      this.ceil.push({ mesh, x, z, j, ax }); scene.add(mesh);
    }

    // light
    scene.add(this.hemi);
    const s = this.sun; s.castShadow = true; s.shadow.mapSize.set(1024, 1024); s.shadow.bias = -0.0005; s.shadow.normalBias = 0.04;
    scene.add(s, s.target);
    for (let i = 0; i < 2; i++) { const l = new THREE.PointLight(0xffecc4, 0, 16, 1.4); this.lamps.push(l); scene.add(l); }
  }

  private addGroup(kind: 'letter' | 'segH' | 'segV' | 'prop', mesh: THREE.InstancedMesh, list: { x: number; z: number }[], rnd: () => number, base?: Float32Array) {
    const n = list.length;
    const g = { mesh, kind, base, x: new Float32Array(n), z: new Float32Array(n), j: new Float32Array(n), d: new Float32Array(n), k: new Float32Array(n), a: new Float32Array(n).fill(-1) };
    list.forEach((p, i) => { g.x[i] = p.x; g.z[i] = p.z; g.j[i] = rnd(); g.k[i] = rnd() < 0.5 ? 1 : -1; });
    mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.groups.push(g); this.scene.add(mesh);
  }

  /** the start of a cycle: even cycles start at the west end of the corridor looking east, odd ones at the east end looking west */
  private startOf(cyc: number) {
    const dir = cyc % 2 === 0 ? 1 : -1;
    return { dir, yaw0: dir > 0 ? 0 : Math.PI, yaw1: dir > 0 ? -Math.PI / 2 : Math.PI * 1.5, cam: new THREE.Vector2(-dir * 33, ZC), origin: new THREE.Vector2(-dir * 28, ZC) };
  }

  private setOrigin(cyc: number) {
    if (this.originCyc === cyc) return;
    this.originCyc = cyc;
    const st = this.startOf(cyc);
    this.origin.copy(st.origin); this.U.uO.value.copy(st.origin);
    let maxD = 0;
    for (const g of this.groups) for (let i = 0; i < g.x.length; i++) {
      const d = Math.hypot(g.x[i] - st.origin.x, g.z[i] - st.origin.y);
      g.d[i] = d * (1 + 0.1 * g.j[i]) + g.j[i] * 1.6;
      if (d > maxD) maxD = d;
    }
    this.maxD = maxD * 1.36 + 4;
    // the ceiling sits over the start of the run, its lamps on the floor's pool grid
    const snap = (x: number) => Math.round((x - CELL / 2) / LAMP) * LAMP + CELL / 2;
    for (const c of this.ceil) c.mesh.position.set(snap(st.origin.x - st.dir * 4), 0, ZC);
    for (let i = 0; i < this.lamps.length; i++) this.lamps[i].position.set(snap(st.origin.x + st.dir * i * LAMP * 2), WH - 0.3, ZC);
  }

  /** the shot for grow progress e (0 = in the corridor, 1 = straight over the word) */
  private pose(e: number, cyc: number, out: Pose) {
    const st = this.startOf(cyc);
    const hE = smoother(clamp01((e - 0.04) / 0.86)), h0 = 1.62, h1 = this.h1;
    const h = h0 * Math.pow(h1 / h0, hE * hE * (3 - 2 * hE) * 0.4 + hE * 0.6);
    const pitch = THREE.MathUtils.lerp(0.06, 1.5, smoother(clamp01((e - 0.06) / 0.78)));
    const yaw = THREE.MathUtils.lerp(st.yaw0, st.yaw1, smoother(clamp01((e - 0.12) / 0.8)));
    const hx = Math.cos(yaw), hz = Math.sin(yaw);
    // where the shot looks on the floor: down the corridor at first, the word's centre at the end
    const gk = smoother(clamp01((e - 0.02) / 0.88));
    const lookX0 = st.cam.x + hx * 14, lookZ0 = st.cam.y + hz * 14;
    const tx = THREE.MathUtils.lerp(lookX0, 0, gk) + st.dir * 3.2 * clamp01(e * 3) * (1 - gk), tz = THREE.MathUtils.lerp(lookZ0, ZC * 0.5, gk);
    const back = (h - (1.0 * (1 - gk))) / Math.tan(pitch);
    out.h = h;
    out.look.set(tx, 1.0 * (1 - gk), tz);
    out.pos.set(tx - hx * back, h, tz - hz * back);
    out.fov = THREE.MathUtils.lerp(64, 42, smoother(clamp01((e - 0.1) / 0.75)));
  }

  /** render scale multiplier, lowered on a slow machine (frames over ~45 ms) */
  private q = 1; private slow = 0; private vw = 0; private vh = 0;
  resize(w: number, h: number) {
    this.vw = w; this.vh = h;
    this.aspect = w / Math.max(1, h);
    const k = Math.min(1, Math.max(0.36, 450 / Math.max(1, h))) * this.q;
    const W = Math.max(2, Math.round(w * k)), H = Math.max(2, Math.round(h * k));
    if (W === this.W && H === this.H) return;
    this.W = W; this.H = H;
    this.r.setSize(W, H, false);
    const o = { type: THREE.HalfFloatType, depthBuffer: false } as const;
    this.rtScene?.dispose(); this.rtA?.dispose(); this.rtB?.dispose();
    this.rtScene = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 2 });
    this.rtA = new THREE.WebGLRenderTarget(W, H, o); this.rtB = new THREE.WebGLRenderTarget(W, H, o);
    (this.outMat.uniforms.uRes.value as THREE.Vector2).set(W, H);
    this.cam.aspect = this.aspect; this.cam.updateProjectionMatrix();
    this.fresh = true;
  }

  /** start from the beginning (a new show) */
  restart() {
    this.phase = 'grow'; this.pt = 0; this.cyc = 0; this.finishing = false; this.finished = false; this.fresh = true; this.time = 0;
    this.originCyc = -1;
  }
  /** dev staging: jump the timeline (grow 0..7.6 s, then hold, then dive) */
  seek(t: number) {
    this.restart();
    const cyc = Math.floor(t / (GROW + HOLD + DIVE)); t -= cyc * (GROW + HOLD + DIVE); this.cyc = cyc;
    if (t < GROW) { this.phase = 'grow'; this.pt = t; } else if (t < GROW + HOLD) { this.phase = 'hold'; this.pt = t - GROW; } else { this.phase = 'dive'; this.pt = t - GROW - HOLD; }
    this.time = t;
  }
  /** play on to the word (faster), hold a beat, then report done() */
  finish() { this.finishing = true; }
  /** shown again before it finished: carry on looping from where it is */
  resume() { this.finishing = false; this.finished = false; }
  get done() { return this.finished; }
  /** how far the reveal is (0..1, 1 = the word is up) */
  get revealed() { return this.phase === 'hold' ? 1 : this.phase === 'grow' ? clamp01(this.pt / GROW) : clamp01(1 - this.pt / DIVE); }

  private P: Pose = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 60, h: 1 };
  frame(dtRaw: number, fade: number) {
    const dt = Math.min(0.3, Math.max(0, dtRaw));
    // keep it light: a run of slow frames drops the resolution a step (the pixels just get chunkier)
    if (dtRaw > 0.045) { if (++this.slow > 8 && this.q > 0.4) { this.q *= 0.75; this.slow = 0; this.resize(this.vw, this.vh); } } else this.slow = Math.max(0, this.slow - 1);
    this.time += dt;
    // ---- the timeline
    let e = 0, cyc = this.cyc;
    if (this.phase === 'grow') {
      const rate = this.finishing ? Math.max(2.6, ((GROW - this.pt) / 1.5)) : 1;
      this.pt += dt * rate;
      if (this.pt >= GROW) { this.phase = 'hold'; this.pt = 0; }
      e = this.phase === 'grow' ? this.pt / GROW : 1;
    } else if (this.phase === 'hold') {
      this.pt += dt; e = 1;
      if (this.finishing && this.pt > 0.55) this.finished = true;
      else if (!this.finishing && this.pt >= HOLD) { this.phase = 'dive'; this.pt = 0; }
    }
    if (this.phase === 'dive') {
      if (this.finishing) { this.pt -= dt * 2.8; if (this.pt <= 0) { this.pt = 0; this.phase = 'hold'; } }
      else { this.pt += dt; if (this.pt >= DIVE) { this.cyc++; this.phase = 'grow'; this.pt = 0; } }
      if (this.phase === 'dive') { cyc = this.cyc + 1; e = 1 - smoother(this.pt / DIVE); }
      else { cyc = this.cyc; e = this.phase === 'hold' ? 1 : 0; }
    }
    if (this.phase === 'grow') cyc = this.cyc;
    this.setOrigin(cyc);
    const P = this.P; this.pose(e, cyc, P);
    // a little hand on the camera
    const t = this.time, sway = 0.012 + 0.004 * P.h;
    P.look.x += Math.sin(t * 0.7) * sway; P.look.z += Math.cos(t * 0.53) * sway;
    this.cam.position.copy(P.pos); this.cam.up.set(0, 1, 0); this.cam.lookAt(P.look);
    this.cam.fov = P.fov; this.cam.far = Math.max(120, P.h * 6); this.cam.updateProjectionMatrix();

    // ---- the wavefront, and everything it carries
    const wE = clamp01(e / 0.9);
    const Rm = this.maxD, R = 7 * Math.pow(Rm / 7, wE * 0.82 + wE * wE * 0.18);
    const band = Math.max(2.2, R * 0.16);
    const U = this.U; U.uR.value = R; U.uBand.value = band; U.uT.value = t;
    this.updateInstances(R, band);
    const high = clamp01((P.h - 2.6) / 14);
    this.updateCeiling(P.h);
    // light: the corridor lamps up close, then a warm low key from one side (long shadows stand the letters up) and a soft sky
    const s = this.sun;
    s.intensity = 2.7 * smoother(high);
    const span = Math.max(14, P.h * 1.15);
    s.target.position.set(P.look.x, 0, P.look.z);
    s.position.set(P.look.x - span * 0.85, span * 1.05, P.look.z - span * 0.55);
    const sc = s.shadow.camera; sc.left = -span * 1.1; sc.right = span * 1.1; sc.top = span * 1.1; sc.bottom = -span * 1.1; sc.near = 0.5; sc.far = span * 4; sc.updateProjectionMatrix();
    s.castShadow = s.intensity > 0.05;
    this.hemi.intensity = 0.95 - 0.2 * high;
    for (const l of this.lamps) l.intensity = 16 * (1 - smoother(clamp01((P.h - 2.2) / 3)));
    U.uPool.value = 1.6 - 0.9 * high;
    U.uEdge.value = 0.22 * (1 - 0.6 * high) * (R < Rm * 0.98 ? 1 : 0);
    this.fog.near = Math.max(9, P.h * 1.1); this.fog.far = Math.max(40, P.h * 3.2 + 20);

    // ---- render, then blur by accumulation (more as the shot moves)
    const r = this.r;
    r.setRenderTarget(this.rtScene); r.render(this.scene, this.cam);
    const mv = this.fresh ? 0 : this.prevPos.distanceTo(P.pos) / Math.max(1, P.h) / Math.max(dt, 1 / 120);
    const climb = this.fresh ? 0 : (P.h - this.prevH) / Math.max(1, P.h) / Math.max(dt, 1 / 120);
    this.prevPos.copy(P.pos); this.prevH = P.h;
    const keep = this.fresh ? 0 : Math.pow(Math.min(0.84, 0.32 + mv * 0.35), dt * 60);
    this.accMat.uniforms.tCur.value = this.rtScene.texture;
    this.accMat.uniforms.tPrev.value = this.rtA.texture;
    this.accMat.uniforms.uKeep.value = keep;
    this.accMat.uniforms.uZoom.value = Math.min(0.09, Math.abs(climb) * 0.05);
    this.quad.material = this.accMat;
    r.setRenderTarget(this.rtB); r.render(this.quad, this.qCam);
    const tmp = this.rtA; this.rtA = this.rtB; this.rtB = tmp;
    this.outMat.uniforms.tAcc.value = this.rtA.texture;
    this.outMat.uniforms.uFade.value = fade;
    this.outMat.uniforms.uT.value = t;
    this.quad.material = this.outMat;
    r.setRenderTarget(null); r.render(this.quad, this.qCam);
    this.fresh = false;
  }

  private updateInstances(R: number, band: number) {
    for (const g of this.groups) {
      const arr = g.mesh.instanceMatrix.array as Float32Array;
      let dirty = false;
      for (let i = 0; i < g.x.length; i++) {
        const a = clamp01((R - g.d[i]) / band);
        if (a === g.a[i]) continue;
        g.a[i] = a; dirty = true;
        const o = i * 16, x = g.x[i], z = g.z[i];
        if (a <= 0) { arr.fill(0, o, o + 16); continue; }
        if (g.kind === 'letter') {
          // the letters rise out of the carpet, a touch past full height and back
          const e = backOut(a, 1.2);
          arr[o] = CELL; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
          arr[o + 4] = 0; arr[o + 5] = WH * Math.max(0.001, e); arr[o + 6] = 0; arr[o + 7] = 0;
          arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = CELL; arr[o + 11] = 0;
          arr[o + 12] = x; arr[o + 13] = 0; arr[o + 14] = z; arr[o + 15] = 1;
        } else if (g.kind === 'segH' || g.kind === 'segV') {
          // partitions hinge up off the floor (a pop-up book), overshooting a little
          const th = (1 - backOut(a, 1.7)) * (Math.PI / 2) * g.k[i];
          const c = Math.cos(th), s = Math.sin(th);
          if (g.kind === 'segH') {
            arr[o] = CELL; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
            arr[o + 4] = 0; arr[o + 5] = c * WH; arr[o + 6] = s * WH; arr[o + 7] = 0;
            arr[o + 8] = 0; arr[o + 9] = -s * TH; arr[o + 10] = c * TH; arr[o + 11] = 0;
          } else {
            arr[o] = c * TH; arr[o + 1] = s * TH; arr[o + 2] = 0; arr[o + 3] = 0;
            arr[o + 4] = -s * WH; arr[o + 5] = c * WH; arr[o + 6] = 0; arr[o + 7] = 0;
            arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = CELL; arr[o + 11] = 0;
          }
          arr[o + 12] = x; arr[o + 13] = 0; arr[o + 14] = z; arr[o + 15] = 1;
        } else {
          // furniture drops in and settles
          const b = g.base!, k = backOut(a, 2.2), drop = (1 - smoother(a)) * 1.6;
          for (let q = 0; q < 12; q++) arr[o + q] = b[o + q] * (q === 3 || q === 7 || q === 11 ? 1 : k);
          arr[o + 12] = x; arr[o + 13] = b[o + 13] + drop; arr[o + 14] = z; arr[o + 15] = 1;
        }
      }
      if (dirty) g.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private m4 = new THREE.Matrix4(); private q4 = new THREE.Quaternion(); private v3 = new THREE.Vector3(); private s3 = new THREE.Vector3(); private ax3 = new THREE.Vector3();
  private updateCeiling(h: number) {
    for (const c of this.ceil) {
      const sx = c.mesh.userData.sx as number;
      for (let i = 0; i < c.x.length; i++) {
        const d = Math.hypot(c.x[i], c.z[i]);
        const L = clamp01((h - 2.3) / 2.2 - d * 0.045 - c.j[i] * 0.35);
        if (L >= 1) { this.m4.makeScale(0, 0, 0); c.mesh.setMatrixAt(i, this.m4); continue; }
        this.ax3.set(Math.cos(c.ax[i]), 0.3, Math.sin(c.ax[i])).normalize();
        this.q4.setFromAxisAngle(this.ax3, L * L * 2.6);
        const k = 1 - L * L * L;
        this.v3.set(c.x[i], WH + L * L * (h * 2.2 + 6), c.z[i]);
        this.s3.set(sx * k, 0.05 * k, (sx === CELL ? CELL : 1.2) * k);
        this.m4.compose(this.v3, this.q4, this.s3);
        c.mesh.setMatrixAt(i, this.m4);
      }
      c.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    this.r.dispose(); this.rtScene?.dispose(); this.rtA?.dispose(); this.rtB?.dispose();
  }
}
