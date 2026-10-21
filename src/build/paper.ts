// Physical paper for first-person props: blueprint sheets, index cards, gauge
// faces, tape labels. A pixel canvas (5x7 typewriter font) on a CanvasTexture,
// rendered nearest-neighbour so it reads as pixel art on a low-poly object.
import * as THREE from 'three';
import { Screen } from '../ui/font5x7';
import { G } from '../game/G';

export class Sheet {
  readonly scr: Screen;
  readonly tex: THREE.CanvasTexture;
  private cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  constructor(public w: number, public h: number) {
    this.scr = new Screen(w, h);
    this.cv = document.createElement('canvas'); this.cv.width = w; this.cv.height = h;
    this.ctx = this.cv.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.magFilter = THREE.NearestFilter; this.tex.minFilter = THREE.NearestFilter; this.tex.generateMipmaps = false;
    this.tex.colorSpace = THREE.SRGBColorSpace;
  }
  /** 0xRRGGBB to the screen's packed colour */
  c(rgb: number, a = 255) { return Screen.c(rgb, a); }
  commit() { this.ctx.putImageData(this.scr.img, 0, 0); this.tex.needsUpdate = true; }

  /** blueprint paper: blue with a faint grid, mottled, a punched hole and a coffee ring */
  blueprint(seed = 1) {
    const s = this.scr, d = s.data;
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const n = hash(x >> 1, y >> 1, seed);
      let c = n < 0.18 ? 0x1b4482 : n > 0.9 ? 0x2a5a9e : 0x22508f;
      if (x % 8 === 0 || y % 8 === 0) c = 0x2f62a8;
      d[y * s.w + x] = Screen.c(c);
    }
    s.frame(2, 2, s.w - 4, s.h - 4, Screen.c(0x8fb4e6));
    s.circle(s.w - 18, s.h - 22, 9, Screen.c(0x3a5a7a), 3);
  }
  /** manila / index-card paper with blue ruled lines and a red margin */
  card(ruled = true) {
    const s = this.scr, d = s.data;
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const n = hash(x, y, 7);
      let c = n < 0.1 ? 0xe2d8bc : 0xefe7cf;
      if (ruled && y > 12 && y % 9 === 3) c = 0xb8c8dc;
      if (ruled && x === 9) c = 0xd88a86;
      d[y * s.w + x] = Screen.c(c);
    }
    // a coffee ring
    s.circle(s.w - 20, s.h - 18, 11, Screen.c(0xc8a878), 0);
    s.circle(s.w - 20, s.h - 18, 10, Screen.c(0xd8bc90), 2);
  }
  /** a round gauge face: cream enamel, ticks, a red zone, a label */
  gaugeFace(label: string, red: 'low' | 'high' | 'none' = 'low') {
    const s = this.scr, cx = s.w / 2, cy = s.h / 2 + 2, r = s.w / 2 - 2;
    s.clear(0x1a1a18);
    s.disc(cx, cy - 2, r, Screen.c(0xe8e0c8));
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * (1.25 - i * 0.15), long = i % 5 === 0;
      const inRed = (red === 'low' && i <= 2) || (red === 'high' && i >= 8);
      for (let k = long ? r - 6 : r - 4; k < r - 1; k++) s.px(cx + Math.cos(a) * k, cy - 2 - Math.sin(a) * k, Screen.c(inRed ? 0xc8302a : 0x2a2622));
    }
    s.text(label, cx - s.textW(label) / 2, cy + 4, Screen.c(0x2a2622));
  }
}

function hash(x: number, y: number, s: number) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

/** a flat lit plane carrying a sheet (for overlay props) */
export function sheetMesh(sheet: Sheet, w: number, h: number, opts: { transparent?: boolean } = {}): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: sheet.tex, transparent: !!opts.transparent }));
  return m;
}

/** aim a raycaster from CSS pixel coordinates through the first-person overlay camera */
export function overlayRay(ray: THREE.Raycaster, cam: THREE.Camera, cx: number, cy: number, ndc = new THREE.Vector2()) {
  const pr = G.pr as any;
  if (!pr) return ray;
  const RW = pr.lowW + pr.margin * 2, RH = pr.lowH + pr.margin * 2;
  const lx = cx * pr.dpr / pr.scale + pr.margin, ly = (window.innerHeight - cy) * pr.dpr / pr.scale + pr.margin;
  ndc.set(lx / RW * 2 - 1, ly / RH * 2 - 1);
  ray.setFromCamera(ndc, cam);
  return ray;
}
