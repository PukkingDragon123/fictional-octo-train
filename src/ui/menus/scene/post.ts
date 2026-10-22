// The subject room's composite: the scene is rendered small into a half-float
// target, then this pass draws it to the (equally small) canvas, which CSS
// blows up by a whole number with hard pixels. No blur of any kind: a black
// one-pixel silhouette line from depth steps, a filmic tone curve and a split
// grade (cold shadows, warm highlights, crushed blacks), a darkened side for
// the 2D menu, a vignette, the camera flash, blood on the lens (a pixel canvas
// of its own), light ordered dither to a slightly reduced palette, a whisper
// of grain.
import * as THREE from 'three';

export interface PostUniforms {
  tColor: { value: THREE.Texture | null }; tDepth: { value: THREE.Texture | null }; tLens: { value: THREE.Texture | null };
  uRes: { value: THREE.Vector2 }; uNear: { value: number }; uFar: { value: number }; uTime: { value: number };
  uFlash: { value: number }; uRed: { value: number }; uExposure: { value: number }; uOutline: { value: number };
  uSide: { value: THREE.Vector4 }; uLift: { value: THREE.Vector3 }; uGain: { value: THREE.Vector3 };
  uSat: { value: number }; uContrast: { value: number }; uFloor: { value: number }; uVig: { value: number }; uGrain: { value: number }; uLensOn: { value: number }; uLevels: { value: number };
}

export function makePost(): { scene: THREE.Scene; cam: THREE.OrthographicCamera; mat: THREE.ShaderMaterial; u: PostUniforms } {
  const u: PostUniforms = {
    tColor: { value: null }, tDepth: { value: null }, tLens: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) }, uNear: { value: 0.05 }, uFar: { value: 40 }, uTime: { value: 0 },
    uFlash: { value: 0 }, uRed: { value: 0 }, uExposure: { value: 1 }, uOutline: { value: 1 },
    uSide: { value: new THREE.Vector4(1, 0, 0, 0.4) }, uLift: { value: new THREE.Vector3(0.86, 0.96, 1.14) }, uGain: { value: new THREE.Vector3(1.08, 1.0, 0.86) },
    uSat: { value: 0.9 }, uContrast: { value: 1.08 }, uFloor: { value: 0 }, uVig: { value: 0.9 }, uGrain: { value: 0.012 }, uLensOn: { value: 0 }, uLevels: { value: 28 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u as unknown as Record<string, THREE.IUniform>,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */`
      uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tLens;
      uniform vec2 uRes; uniform float uNear, uFar, uTime, uFlash, uRed, uExposure, uOutline, uSat, uContrast, uVig, uGrain, uLensOn, uLevels, uFloor;
      uniform vec4 uSide; uniform vec3 uLift, uGain;
      varying vec2 vUv;
      float linD(vec2 uv) { float z = texture2D(tDepth, uv).x; if (z >= 1.0) return uFar * 4.0; float n = z * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - n * (uFar - uNear)); }
      float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
      float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
      vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, vec3(1e-6)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
      void main() {
        vec2 px = 1.0 / uRes;
        vec3 c = texture2D(tColor, vUv).rgb;
        // silhouette: this pixel lies well behind a neighbour -> it is the line round that neighbour
        float d = linD(vUv);
        float dn = min(min(linD(vUv - vec2(px.x, 0.0)), linD(vUv + vec2(px.x, 0.0))), min(linD(vUv - vec2(0.0, px.y)), linD(vUv + vec2(0.0, px.y))));
        float edge = step(0.03 + dn * 0.045, d - dn);
        c *= 1.0 - edge * uOutline;
        // the side the 2D menu sits on goes darker
        float s = dot(vUv, uSide.xy) + (uSide.x < 0.0 || uSide.y < 0.0 ? 1.0 : 0.0);
        c *= 1.0 - uSide.z * (1.0 - smoothstep(0.0, uSide.w, s));
        c *= 1.0 - uFloor * (1.0 - smoothstep(0.0, 0.38, vUv.y));
        // exposure, filmic curve, split grade
        c = aces(c * uExposure);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, uSat);
        c *= mix(uLift, uGain, smoothstep(0.02, 0.5, l));
        c = clamp((c - 0.18) * uContrast + 0.18, 0.0, 1.0);
        c = max(c - 0.006, 0.0) / 0.994;
        vec2 q = vUv - 0.5;
        c *= clamp(1.0 - dot(q, q) * uVig, 0.0, 1.0);
        c = toSRGB(c);
        if (uLensOn > 0.5) { vec4 lb = texture2D(tLens, vUv); c = mix(c, lb.rgb, lb.a); }
        c = mix(c, vec3(1.0, 0.97, 0.92), clamp(uFlash, 0.0, 1.0));
        c = mix(c, c * vec3(1.5, 0.3, 0.25) + vec3(0.1, 0.0, 0.0), clamp(uRed, 0.0, 1.0) * 0.45);
        // grain, then light ordered dither to a reduced palette
        vec2 ip = floor(vUv * uRes);
        c += (hash(ip + floor(uTime * 12.0) * 7.0) - 0.5) * uGrain;
        c = floor(c * uLevels + bayer4(ip)) / uLevels;
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  scene.add(quad);
  return { scene, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), mat, u };
}

/** blood on the lens, painted in pixels at the render's own resolution */
export class LensBlood {
  canvas = document.createElement('canvas');
  tex: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private drops: { x: number; y: number; r: number; pts: number[]; run: number; speed: number; t: number; life: number }[] = [];
  constructor() {
    this.canvas.width = 4; this.canvas.height = 4;
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.magFilter = this.tex.minFilter = THREE.NearestFilter; this.tex.generateMipmaps = false;
  }
  get active() { return this.drops.length > 0; }
  resize(w: number, h: number) { if (this.canvas.width === w && this.canvas.height === h) return; this.canvas.width = w; this.canvas.height = h; this.tex.dispose(); this.tex = new THREE.CanvasTexture(this.canvas); this.tex.magFilter = this.tex.minFilter = THREE.NearestFilter; this.tex.generateMipmaps = false; }
  splat(n: number) {
    const W = this.canvas.width, H = this.canvas.height;
    for (let i = 0; i < n; i++) {
      const r = (0.012 + Math.random() * 0.045) * H;
      const k = 10 + Math.floor(Math.random() * 6), pts: number[] = [];
      for (let j = 0; j < k; j++) pts.push(0.55 + Math.random() * 0.6 + (Math.random() < 0.2 ? 0.5 : 0));
      const x = Math.random() * W, y = Math.random() * H * 0.85;
      this.drops.push({ x, y, r, pts, run: 0, speed: 3 + Math.random() * 12, t: 0, life: 4 + Math.random() * 2.5 });
      // satellites flung off the main drop
      for (let s = 0; s < 3; s++) {
        const a = Math.random() * Math.PI * 2, d = r * (1.4 + Math.random() * 1.6), rr = r * (0.12 + Math.random() * 0.2);
        this.drops.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, r: rr, pts: [1, 0.8, 1.1, 0.9, 1, 0.85], run: 0, speed: 0, t: 0, life: 4 + Math.random() * 2 });
      }
    }
  }
  /** returns true when the texture changed */
  update(dt: number): boolean {
    if (!this.drops.length) return false;
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    c.clearRect(0, 0, W, H);
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t += dt; d.run += d.speed * dt * Math.max(0, 1 - d.t / d.life);
      if (d.t > d.life) { this.drops.splice(i, 1); continue; }
      const a = Math.min(1, (d.life - d.t) / 1.2) * 0.85;
      const poly = (x: number, y: number, r: number, col: string) => {
        c.fillStyle = col; c.beginPath();
        d.pts.forEach((m, j) => { const an = (j / d.pts.length) * Math.PI * 2; const X = Math.round(x + Math.cos(an) * r * m), Y = Math.round(y + Math.sin(an) * r * m * 0.9); if (j) c.lineTo(X, Y); else c.moveTo(X, Y); });
        c.closePath(); c.fill();
      };
      poly(d.x, d.y, d.r, `rgba(70,4,4,${a})`);
      poly(d.x, d.y - d.r * 0.08, d.r * 0.78, `rgba(118,10,10,${a})`);
      // the run down the glass
      c.fillStyle = `rgba(96,8,8,${a})`;
      c.fillRect(Math.round(d.x - d.r * 0.18), Math.round(d.y), Math.max(1, Math.round(d.r * 0.3)), Math.round(d.run));
      c.fillRect(Math.round(d.x - d.r * 0.24), Math.round(d.y + d.run - 2), Math.max(2, Math.round(d.r * 0.42)), 3);
      // a hard wet highlight
      c.fillStyle = `rgba(230,150,150,${a * 0.8})`;
      c.fillRect(Math.round(d.x - d.r * 0.35), Math.round(d.y - d.r * 0.4), Math.max(1, Math.round(d.r * 0.18)), Math.max(1, Math.round(d.r * 0.12)));
    }
    // hard edges: no soft alpha
    const img = c.getImageData(0, 0, W, H), D = img.data;
    for (let i = 3; i < D.length; i += 4) if (D[i]) D[i] = D[i] > 60 ? Math.min(220, D[i] + 40) : 0;
    c.putImageData(img, 0, 0);
    this.tex.needsUpdate = true;
    return true;
  }
  clear() { this.drops = []; this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); this.tex.needsUpdate = true; }
  dispose() { this.tex.dispose(); }
}
