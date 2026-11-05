// The observation room's tubes. One shader for every screen: whatever is fed
// in (a frame of the Institute's tape, a little painted canvas) is turned into
// green phosphor at the tube's own raster: luminance quantised with an ordered
// dither to a few phosphor levels, every other line dark, a slow roll bar, a
// slight barrel, burnt corners, tracking tear and snow when the signal breaks.
// Text on the tubes is Alagard bitmap text (src/gfx/bitfont.ts), hard pixels.
import * as THREE from 'three';
import { bitText, INK } from '../../gfx/bitfont';
import type { TapeFrame } from './recorder';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const FRAG = /* glsl */`
  uniform sampler2D tFeed; uniform sampler2D tOver;
  uniform vec2 uRes; uniform float uTime, uNoise, uPower, uFlash, uBlank, uTear, uGain;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
  float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
  void main() {
    vec2 q = vUv - 0.5;
    vec2 uv = 0.5 + q * (1.0 + 0.09 * dot(q, q));
    float row = floor(uv.y * uRes.y);
    // tracking: rows slide sideways while the signal is torn
    float tear = uTear + uNoise * 0.5;
    uv.x += (hash(vec2(row * 0.37, floor(uTime * 18.0))) - 0.5) * tear * 0.08 + sin(uv.y * 40.0 + uTime * 30.0) * tear * 0.004;
    vec2 cell = floor(uv * uRes);
    vec2 px = (cell + 0.5) / uRes;
    vec3 src = texture2D(tFeed, px).rgb;
    float l = dot(src, vec3(0.3, 0.59, 0.11));
    l = pow(clamp(l * uGain, 0.0, 1.0), 0.72) * 1.15;
    l = mix(l, 0.035, uBlank);
    float n = hash(cell + floor(uTime * 24.0) * 17.13);
    l = mix(l, n * 0.9, clamp(uNoise, 0.0, 1.0));
    l += (n - 0.5) * mix(0.035, 0.012, uBlank);
    // the roll bar
    float rb = fract(uv.y * 0.6 - uTime * 0.11);
    l += smoothstep(0.0, 0.05, rb) * (1.0 - smoothstep(0.05, 0.14, rb)) * mix(0.07, 0.025, uBlank);
    float o = texture2D(tOver, px).a;
    l = clamp(l, 0.0, 1.0);
    l = floor(l * 7.0 + bayer4(cell)) / 7.0;
    // vivid green phosphor
    vec3 col = l < 0.01 ? vec3(0.004, 0.02, 0.008) : mix(vec3(0.02, 0.12, 0.04), vec3(0.36, 1.0, 0.42), l);
    col = mix(col, vec3(0.62, 1.0, 0.6), l * l * 0.5);
    col = mix(col, vec3(0.8, 1.15, 0.78), o);
    if (mod(cell.y, 2.0) > 0.5) col *= 0.62;
    float v = 1.0 - smoothstep(0.36, 0.56, length(q * vec2(1.0, 1.2)));
    col *= mix(0.25, 1.0, v);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) col = vec3(0.0);
    col = col * uPower + vec3(0.5, 0.75, 0.55) * uFlash;
    gl_FragColor = vec4(col, 1.0);
  }`;

export interface TubeU {
  tFeed: { value: THREE.Texture | null }; tOver: { value: THREE.Texture | null }; uRes: { value: THREE.Vector2 };
  uTime: { value: number }; uNoise: { value: number }; uPower: { value: number }; uFlash: { value: number }; uBlank: { value: number }; uTear: { value: number }; uGain: { value: number };
}

function canvasTex(cv: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** the bulged, faceted face of a tube, w x h metres, facing +Z */
export function tubeGeometry(w: number, h: number, bulge = 0.02): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h, 6, 4);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) / (w / 2), y = p.getY(i) / (h / 2); p.setZ(i, bulge * (1 - Math.min(1, (x * x + y * y) * 0.5))); }
  g.computeVertexNormals();
  return g;
}

/** a tube with its own feed canvas (grey levels in, phosphor out) and an overlay canvas (text, alpha) */
export class Tube {
  readonly mesh: THREE.Mesh;
  readonly u: TubeU;
  readonly feed = document.createElement('canvas');
  readonly over = document.createElement('canvas');
  readonly fx: CanvasRenderingContext2D;
  readonly ox: CanvasRenderingContext2D;
  private feedTex: THREE.CanvasTexture;
  private overTex: THREE.CanvasTexture;
  constructor(w: number, h: number, resW: number, resH: number, bulge = 0.02) {
    this.feed.width = this.over.width = resW; this.feed.height = this.over.height = resH;
    this.fx = this.feed.getContext('2d')!; this.ox = this.over.getContext('2d')!;
    this.fx.fillStyle = '#000'; this.fx.fillRect(0, 0, resW, resH);
    this.feedTex = canvasTex(this.feed); this.overTex = canvasTex(this.over);
    this.u = {
      tFeed: { value: this.feedTex }, tOver: { value: this.overTex }, uRes: { value: new THREE.Vector2(resW, resH) },
      uTime: { value: 0 }, uNoise: { value: 0 }, uPower: { value: 1 }, uFlash: { value: 0 }, uBlank: { value: 0 }, uTear: { value: 0 }, uGain: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.u as unknown as Record<string, THREE.IUniform>, vertexShader: VERT, fragmentShader: FRAG, toneMapped: false });
    this.mesh = new THREE.Mesh(tubeGeometry(w, h, bulge), mat);
  }
  feedChanged() { this.feedTex.needsUpdate = true; }
  overChanged() { this.overTex.needsUpdate = true; }
  dispose() { this.feedTex.dispose(); this.overTex.dispose(); (this.mesh.material as THREE.Material).dispose(); this.mesh.geometry.dispose(); }
}

/** white Alagard text with a dark ink outline into an overlay canvas (alpha carries the glyph) */
export function tubeText(c: CanvasRenderingContext2D, s: string, x: number, y: number, align: 'left' | 'center' | 'right' = 'left', scale = 1) {
  bitText(c, s, x, y, { font: 'body', color: '#ffffff', outline: null, shadow: null, align, scale });
}

// ------------------------------------------------------------------ the main feed
type Phase = 'play' | 'hold' | 'rewind' | 'file' | 'off';

/**
 * The big tube: the Institute's tape of the death, played, held on the body,
 * rewound with tracking snow and played again; later the report being typed.
 */
export class DeathFeed {
  readonly tube: Tube;
  private frames: TapeFrame[];
  private pos: number;          // tape seconds relative to the death
  private start: number;
  private end: number;
  private phase: Phase = 'play';
  private holdT = 0;
  private shown = -1;
  private t = 0;
  private overKey = '';
  /** the report lines typed onto the tube in the 'file' phase */
  private fileLines: string[] = [];
  private fileChars = 0;
  /** a burst of snow (cuts, rewinds) */
  snow = 0;
  /** called each time a key is "typed" in the file phase */
  onKey: (() => void) | null = null;

  constructor(w: number, h: number, frames: TapeFrame[], private deathAt: number, private o: { cam: string; zone: string; file: string; clock: () => string }) {
    this.tube = new Tube(w, h, 256, 192, 0.024);
    this.frames = frames;
    const first = frames.length ? (frames[0].t - deathAt) / 1000 : -1;
    const last = frames.length ? (frames[frames.length - 1].t - deathAt) / 1000 : 0;
    this.start = Math.max(first, -2.6);
    this.end = last;
    this.pos = this.start;
  }

  get atDeath() { return this.pos >= 0 && this.phase === 'play'; }

  /** show the report typing out (lines are typed at ~45 chars/s) */
  typeFile(lines: string[]) { this.phase = 'file'; this.fileLines = lines; this.fileChars = 0; this.overKey = ''; this.snow = Math.max(this.snow, 0.6); }
  /** an empty lit tube (the DOM report sits on it) */
  blank() { this.phase = 'off'; this.overKey = ''; }

  update(dt: number) {
    this.t += dt;
    const u = this.tube.u;
    u.uTime.value = this.t;
    this.snow = Math.max(0, this.snow - dt * 2.2);
    if (this.phase === 'play') {
      // the moment itself goes by slower
      const rate = this.pos > -0.6 && this.pos < 0.8 ? 0.55 : 1;
      this.pos += dt * rate;
      if (this.pos >= this.end) { this.pos = this.end; this.phase = 'hold'; this.holdT = 0; }
    } else if (this.phase === 'hold') {
      this.holdT += dt;
      if (this.holdT > 2.4) { this.phase = 'rewind'; this.snow = 0.5; }
    } else if (this.phase === 'rewind') {
      this.pos -= dt * 3.2;
      if (this.pos <= this.start) { this.pos = this.start; this.phase = 'play'; this.snow = 0.4; }
    }
    const feeding = this.phase === 'play' || this.phase === 'hold' || this.phase === 'rewind';
    u.uBlank.value = feeding ? 0 : 1;
    u.uTear.value = this.phase === 'rewind' ? 0.35 : this.phase === 'hold' ? 0.02 + Math.max(0, Math.sin(this.t * 3.1)) * 0.03 : 0;
    u.uNoise.value = Math.min(1, this.snow + (this.phase === 'rewind' ? 0.12 : 0));
    u.uGain.value = 1.15;
    if (feeding) this.showFrame();
    if (this.phase === 'file') {
      const before = Math.floor(this.fileChars);
      this.fileChars += dt * 42;
      if (Math.floor(this.fileChars) !== before && this.fileChars < this.fileLines.join('').length) this.onKey?.();
    }
    this.drawOver();
  }

  private showFrame() {
    const F = this.frames;
    if (!F.length) return;
    const want = this.deathAt + this.pos * 1000;
    let lo = 0, hi = F.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (F[m].t <= want) lo = m; else hi = m - 1; }
    if (lo === this.shown) return;
    this.shown = lo;
    const c = this.tube.fx;
    c.imageSmoothingEnabled = true;
    c.drawImage(F[lo].cv, 0, 0, this.tube.feed.width, this.tube.feed.height);
    this.tube.feedChanged();
  }

  private drawOver() {
    const c = this.tube.ox, W = this.tube.over.width, H = this.tube.over.height;
    const blink = Math.floor(this.t * 2.2) % 2 === 0;
    let key = this.phase + '|' + (blink ? 1 : 0);
    if (this.phase === 'play' || this.phase === 'hold') key += '|' + Math.floor(this.pos * 4) + '|' + (this.pos >= 0 ? 1 : 0);
    if (this.phase === 'file') key += '|' + Math.floor(this.fileChars);
    if (key === this.overKey) return;
    this.overKey = key;
    c.clearRect(0, 0, W, H);
    if (this.phase === 'file') {
      let left = Math.floor(this.fileChars);
      let y = 14;
      for (const ln of this.fileLines) {
        if (left <= 0) break;
        const s = ln.slice(0, left); left -= ln.length;
        tubeText(c, s, 14, y);
        y += 17;
      }
      if (blink) { c.fillStyle = '#fff'; c.fillRect(14, y, 8, 12); }
      this.tube.overChanged();
      return;
    }
    if (this.phase === 'off') { this.tube.overChanged(); return; }
    tubeText(c, this.o.cam, 12, 8);
    if (this.phase === 'rewind') tubeText(c, '<< REWIND', W - 12, 8, 'right');
    else {
      tubeText(c, 'REC', W - 12, 8, 'right');
      if (blink) c.fillRect(W - 46, 12, 8, 8);
    }
    tubeText(c, this.o.zone.toUpperCase().slice(0, 18), 12, H - 22);
    tubeText(c, this.o.clock(), W - 12, H - 22, 'right');
    if ((this.phase === 'play' && this.pos >= 0) || this.phase === 'hold') {
      if (blink || this.phase === 'play') {
        tubeText(c, 'NO VITALS', W / 2, H / 2 - 18, 'center');
        tubeText(c, 'SUBJECT ' + this.o.file, W / 2, H / 2, 'center');
      }
    }
    this.tube.overChanged();
  }

  dispose() { this.tube.dispose(); }
}

// ------------------------------------------------------------------ the other tubes
export type SideKind = 'vitals' | 'map' | 'static' | 'cam' | 'next' | 'log';

/** a small tube with something of its own: a flat vitals trace, the last position, another camera, snow */
export class SideTube {
  readonly tube: Tube;
  private t = Math.random() * 10;
  private acc = 0;
  private trace: number[] = [];
  constructor(w: number, h: number, private kind: SideKind, private o: { still?: HTMLCanvasElement | null; map?: (c: CanvasRenderingContext2D, W: number, H: number, t: number) => void; label?: string; file?: string } = {}) {
    this.tube = new Tube(w, h, 112, 84, 0.016);
    if (kind === 'static') this.tube.u.uNoise.value = 0.85;
    if (kind === 'cam' && o.still) { this.tube.fx.drawImage(o.still, 0, 0, 112, 84); this.tube.feedChanged(); }
    for (let i = 0; i < 112; i++) this.trace.push(50);
  }
  update(dt: number) {
    this.t += dt; this.acc += dt;
    this.tube.u.uTime.value = this.t;
    if (this.kind === 'static') this.tube.u.uNoise.value = 0.75 + Math.sin(this.t * 0.7) * 0.1;
    if (this.acc < 1 / 10) return;
    this.acc = 0;
    const c = this.tube.fx, oc = this.tube.ox, W = 112, H = 84;
    const blink = Math.floor(this.t * 2) % 2 === 0;
    oc.clearRect(0, 0, W, H);
    switch (this.kind) {
      case 'vitals': {
        c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
        c.fillStyle = '#1a1a1a'; for (let y = 10; y < H; y += 10) for (let x = 4; x < W; x += 8) c.fillRect(x, y, 1, 1);
        // the trace: flat, the sweep crawling along it
        const sx = Math.floor((this.t * 26) % W);
        c.fillStyle = '#ffffff'; c.fillRect(0, 52, W, 1);
        c.fillStyle = '#000'; c.fillRect(sx, 46, 6, 12);
        c.fillStyle = '#ffffff'; c.fillRect(sx - 1, 51, 2, 3);
        tubeText(oc, 'HR', 6, 6); tubeText(oc, '0', W - 8, 6, 'right');
        if (blink) tubeText(oc, 'FLATLINE', W / 2, H - 22, 'center');
        break;
      }
      case 'map': {
        c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
        this.o.map?.(c, W, H, this.t);
        tubeText(oc, 'LAST FIX', 5, 4);
        break;
      }
      case 'cam': {
        tubeText(oc, this.o.label || 'CAM 03', 5, 4);
        if (blink) oc.fillRect(W - 10, 7, 5, 5);
        break;
      }
      case 'static': {
        tubeText(oc, 'NO SIGNAL', W / 2, H / 2 - 8, 'center');
        break;
      }
      case 'next': {
        c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
        tubeText(oc, 'INTAKE', W / 2, 10, 'center');
        tubeText(oc, 'NEXT', W / 2, 32, 'center');
        if (blink) tubeText(oc, 'SUBJECT', W / 2, 50, 'center');
        break;
      }
      case 'log': {
        c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
        const rows = ['DELETION', 'LOGGED', this.o.file || '', 'FILE OK'];
        const n = Math.min(rows.length, Math.floor(this.t * 1.5) % (rows.length + 3));
        for (let i = 0; i < n; i++) tubeText(oc, rows[i], 6, 4 + i * 18);
        break;
      }
    }
    this.tube.feedChanged(); this.tube.overChanged();
  }
  dispose() { this.tube.dispose(); }
}

export { INK };
