// The monitor on the cart: a small green phosphor tube drawn in hard pixels
// (a heart trace sweeping across a dotted graticule, a readout in EB Garamond,
// scanlines baked in) on a faceted bulged glass. Its glow is what tints the
// subject's cheek green on the title.
import * as THREE from 'three';
import { fontsReady } from '../../../gfx/crt';

const W = 96, H = 72;
const G = ['#020a04', '#06200c', '#0e4a1c', '#1f8a36', '#5cf07a', '#c8ffd0'];

export class PhosphorScreen {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  /** 0..1 the last beat (drives the green spill light) */
  beat = 0;
  bpm = 112;
  private cv = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private trace = new Float32Array(W);
  private x = 0; private acc = 0; private phase = 0; private draw = 0;
  private tcv = document.createElement('canvas');
  constructor(w: number, h: number) {
    this.cv.width = W; this.cv.height = H;
    this.ctx = this.cv.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.magFilter = this.tex.minFilter = THREE.NearestFilter; this.tex.generateMipmaps = false;
    this.tex.colorSpace = THREE.SRGBColorSpace;
    // a slightly bulged, faceted face of glass
    const g = new THREE.PlaneGeometry(w, h, 4, 3);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i) / (w / 2), y = p.getY(i) / (h / 2); p.setZ(i, 0.012 * (1 - Math.min(1, (x * x + y * y) * 0.5))); }
    const flat = g.toNonIndexed(); flat.computeVertexNormals();
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false });
    this.mesh = new THREE.Mesh(flat, this.mat);
    this.trace.fill(H * 0.62);
    this.tcv.width = W; this.tcv.height = H;
    fontsReady().catch(() => {});
  }
  /** the readout, in EB Garamond, thresholded to hard pixels */
  private text(n: string): Uint8ClampedArray {
    const c = this.tcv.getContext('2d')!;
    c.clearRect(0, 0, W, H);
    c.textBaseline = 'top'; c.fillStyle = '#fff';
    c.font = "600 11px 'EB Garamond', Garamond, serif";
    c.fillText('SUBJECT 4', 4, 2);
    c.font = "italic 600 10px 'EB Garamond', Garamond, serif";
    c.fillText('pulse', 4, H - 13);
    c.font = "600 13px 'EB Garamond', Garamond, serif";
    c.fillText(n, 30, H - 15);
    return c.getImageData(0, 0, W, H).data;
  }
  update(dt: number, t: number, power: number) {
    this.acc += dt;
    // the heart: a sharp spike every beat
    this.phase += dt * this.bpm / 60;
    const ph = this.phase % 1;
    this.beat = Math.max(0, 1 - ph * 5);
    const y0 = H * 0.6;
    const v = ph < 0.04 ? y0 - 4 : ph < 0.07 ? y0 + 3 : ph < 0.1 ? y0 - 22 : ph < 0.13 ? y0 + 8 : ph < 0.28 && ph > 0.2 ? y0 - 3 : y0;
    const step = 50 * dt;
    this.x += step;
    while (this.x >= 1) { this.x -= 1; this.draw = (this.draw + 1) % W; this.trace[this.draw] = v + (Math.random() - 0.5) * 1.2; }
    if (this.acc < 1 / 15) return;
    this.acc = 0;
    const c = this.ctx;
    c.fillStyle = G[0]; c.fillRect(0, 0, W, H);
    // graticule dots
    c.fillStyle = G[1];
    for (let y = 8; y < H; y += 8) for (let x = 4; x < W; x += 8) c.fillRect(x, y, 1, 1);
    // the trace, fading behind the sweep
    for (let i = 0; i < W; i++) {
      const age = (this.draw - i + W) % W;
      if (age > W - 10) continue;
      const k = 1 - age / W;
      const col = age < 2 ? G[5] : k > 0.75 ? G[4] : k > 0.4 ? G[3] : G[2];
      const a = Math.round(this.trace[i]), b = Math.round(this.trace[(i + 1) % W]);
      c.fillStyle = col;
      c.fillRect(i, Math.min(a, b), 1, Math.abs(b - a) + 1);
    }
    // readout
    const L = this.text(String(this.bpm + Math.round(Math.sin(t * 0.7) * 3)));
    const img = c.getImageData(0, 0, W, H), D = img.data;
    for (let i = 0; i < W * H; i++) if (L[i * 4 + 3] > 120) { D[i * 4] = 0x5c; D[i * 4 + 1] = 0xf0; D[i * 4 + 2] = 0x7a; }
    c.putImageData(img, 0, 0);
    c.fillStyle = G[4];
    if (Math.floor(t * 2) % 2) c.fillRect(W - 8, 4, 4, 4);
    // scanlines
    c.fillStyle = 'rgba(0,0,0,0.45)';
    for (let y = 1; y < H; y += 2) c.fillRect(0, y, W, 1);
    this.tex.needsUpdate = true;
    const p = power * (0.92 + Math.random() * 0.08);
    this.mat.color.setRGB(1.4 * p, 1.4 * p, 1.4 * p);
  }
  dispose() { this.tex.dispose(); this.mat.dispose(); this.mesh.geometry.dispose(); }
}
