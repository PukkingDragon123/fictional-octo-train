// Pixel-art surfaces for physical readouts (tribes, domination, scanning):
// a Screen (5x7 typewriter / phosphor font) baked into a crisp texture, paper
// and card stock, phosphor CRT glass, world-space hanging tags, and the
// invisible pointer layer the first-person tables and devices listen through.
// Retro, physical: typewritten manila, chalk, amber and green phosphor.
import * as THREE from 'three';
import { Screen } from '../ui/font5x7';
import { G } from '../game/G';

export const PAL = {
  paper: 0xe6d9b8, paperDk: 0xc9b98f, paperEdge: 0xa8946a, ink: 0x2a2219, inkRed: 0x8a2416, inkBlue: 0x24365a,
  card: 0xeadfc0, hole: 0x1a140c, chalk: 0xe8e6da, slate: 0x2c3330,
  amber: 0xffb347, amberDk: 0x8a4a12, phos: 0x8cf07a, phosDk: 0x163a12, phosBg: 0x0a1a08,
  brass: 0xc8a050, steel: 0x8a9096,
};

const h01 = (x: number, y: number, s: number) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
const mix = (a: number, b: number, t: number) => {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t), g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t), bl = (a & 255) + (((b & 255) - (a & 255)) * t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};

/** a pixel surface with its texture: draw on .s, then flush() */
export class PixTex {
  s: Screen;
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  constructor(public w: number, public h: number) {
    this.s = new Screen(w, h);
    this.canvas = document.createElement('canvas');
    this.canvas.width = w; this.canvas.height = h;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.magFilter = THREE.NearestFilter; this.tex.minFilter = THREE.NearestFilter; this.tex.generateMipmaps = false;
    this.tex.colorSpace = THREE.SRGBColorSpace;
  }
  flush() { this.canvas.getContext('2d')!.putImageData(this.s.img, 0, 0); this.tex.needsUpdate = true; }
  clearAlpha() { this.s.data.fill(0); }
  // ---- paper and card
  paper(x: number, y: number, w: number, h: number, base = PAL.paper, seed = 1) {
    const s = this.s;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const n = h01(i, j, seed), edge = Math.min(i, j, w - 1 - i, h - 1 - j);
      let c = mix(base, PAL.paperDk, n * 0.35 + (edge < 2 ? 0.35 : 0));
      if (n > 0.985) c = PAL.paperEdge;
      s.px(x + i, y + j, Screen.c(c));
    }
    // a dog-eared corner
    for (let k = 0; k < 4; k++) for (let m = 0; m <= k; m++) s.px(x + w - 4 + k, y + m, Screen.c(PAL.paperEdge));
  }
  /** typewritten text: each letter sits a hair off the line, the ribbon ink uneven */
  typed(text: string, x: number, y: number, color = PAL.ink, scale = 1, maxW = 9999, seed = 3) {
    const s = this.s;
    let cx = x, i = 0;
    for (const ch of text.toUpperCase()) {
      if (cx - x + 6 * scale > maxW) break;
      const dy = h01(i, seed, 9) > 0.8 ? 1 : 0;
      const ink = h01(i, seed, 4) > 0.7 ? mix(color, PAL.paper, 0.3) : color;
      s.text(ch, cx, y + dy, Screen.c(ink), scale);
      cx += 6 * scale; i++;
    }
    return cx - x;
  }
  /** word-wrapped typed block; returns the y after it */
  typedPara(text: string, x: number, y: number, w: number, color = PAL.ink, lineH = 9, maxLines = 9) {
    const words = text.toUpperCase().split(/\s+/);
    let line = '', n = 0;
    const flush = () => { if (n < maxLines) this.typed(line, x, y + n * lineH, color, 1, w, n + 7); n++; line = ''; };
    for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (t.length * 6 > w && line) { flush(); line = wd; } else line = t; }
    if (line) flush();
    return y + Math.min(n, maxLines) * lineH;
  }
  /** a punched hole */
  hole(x: number, y: number, w = 2, h = 3) { this.s.rect(x, y, w, h, Screen.c(PAL.hole)); }
  /** CRT glass: dark phosphor ground, scanlines and a vignette, centred circle or rect */
  crt(x: number, y: number, w: number, h: number, round = false, bg = PAL.phosBg) {
    const s = this.s, cx = x + w / 2, cy = y + h / 2;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const dx = (i + 0.5 - w / 2) / (w / 2), dy = (j + 0.5 - h / 2) / (h / 2), r = dx * dx + dy * dy;
      if (round && r > 1) continue;
      let c = mix(bg, 0x000000, Math.min(1, r * 0.55) + (j % 2 ? 0.12 : 0));
      if (r < 0.06 && dx < 0 && dy < 0) c = mix(c, 0x3a5a36, 0.3);
      s.px(cx - w / 2 + i, cy - h / 2 + j, Screen.c(c));
    }
  }
  /** phosphor text with a one-pixel bloom */
  phos(text: string, x: number, y: number, color = PAL.phos, scale = 1, maxW = 9999) {
    const s = this.s, glow = Screen.c(mix(color, PAL.phosBg, 0.72));
    s.text(text.toUpperCase(), x + 1, y, glow, scale, maxW); s.text(text.toUpperCase(), x, y + 1, glow, scale, maxW);
    return s.text(text.toUpperCase(), x, y, Screen.c(color), scale, maxW);
  }
}

/** an overlay-scene material for flat pixel surfaces (cards, screens) */
export function flatMat(tex: THREE.Texture, glow = false) {
  return new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, toneMapped: false, color: glow ? 0xffffff : 0xdedad0 });
}

// ---------------------------------------------------------------- world-space hanging tags
/**
 * A manila tag on a string, hung in the world over what you can act on:
 * typed words, a key cap ("E"), tinted per owner. One sprite per tag; it only
 * redraws when its words change.
 */
export class WorldTag {
  sprite: THREE.Sprite;
  private pt: PixTex;
  private key = '';
  constructor(w = 96, h = 18) {
    this.pt = new PixTex(w, h);
    const m = new THREE.SpriteMaterial({ map: this.pt.tex, transparent: true, depthTest: false, depthWrite: false, fog: false });
    this.sprite = new THREE.Sprite(m);
    this.sprite.renderOrder = 999;
    this.sprite.visible = false;
    this.sprite.center.set(0.5, 0);
    G.pr.scene.add(this.sprite);
  }
  /** show the tag at (x, y, z) with `text`; kind tints the tag (paper, red warning, metal) */
  show(x: number, y: number, z: number, text: string, kind: 'paper' | 'red' | 'metal' | 'dim' = 'paper', keyCap = 'E') {
    const k = kind + '|' + keyCap + '|' + text;
    if (k !== this.key) { this.key = k; this.draw(text, kind, keyCap); }
    this.sprite.position.set(x, y, z);
    // one tag texel = one screen pixel of the low-res picture, at any zoom
    const cam = G.pr.camera, sc = Math.max(1e-3, (cam.top - cam.bottom) / Math.max(1, G.pr.lowH));
    this.sprite.scale.set(this.pt.w * sc, this.pt.h * sc, 1);
    this.sprite.visible = true;
  }
  hide() { this.sprite.visible = false; }
  private draw(text: string, kind: string, keyCap: string) {
    const p = this.pt, s = p.s;
    p.clearAlpha();
    const base = kind === 'red' ? 0xb8402a : kind === 'metal' ? 0x9aa0a0 : kind === 'dim' ? 0x8a8070 : PAL.paper;
    const tw = Math.min(p.w - 4, (keyCap ? 14 : 4) + text.length * 6 + 4);
    const x0 = Math.floor((p.w - tw) / 2);
    // string loop up to the hook
    s.vline(p.w >> 1, 0, 3, Screen.c(0x5a4a30));
    p.paper(x0, 4, tw, p.h - 4, base, text.length);
    // eyelet
    s.disc(x0 + 3, 4 + ((p.h - 4) >> 1), 1, Screen.c(PAL.brass));
    let x = x0 + 7;
    if (keyCap) {
      // a little bakelite key cap
      s.rect(x, 6, 9, 10, Screen.c(0x2a2420)); s.rect(x + 1, 6, 7, 8, Screen.c(0x4a4038));
      s.text(keyCap, x + 2, 7, Screen.c(0xf0e6d0));
      x += 12;
    }
    p.typed(text, x, 7, kind === 'red' ? 0xfff0e0 : kind === 'metal' ? 0x1a1a1a : PAL.ink, 1, p.w - x - 2, text.length);
    p.flush();
  }
}

// ---------------------------------------------------------------- first-person pointer layer
/** an invisible full-screen layer that hands pointer events to a first-person device while it is up */
export class PointerLayer {
  el: HTMLDivElement;
  constructor(name: string, on: { down?: (e: PointerEvent) => void; move?: (e: PointerEvent) => void; up?: (e: PointerEvent) => void }) {
    this.el = document.createElement('div');
    this.el.className = 'fp-capture fp-capture-' + name;
    this.el.style.cssText = 'position:fixed;inset:0;z-index:44;display:none;touch-action:none;background:transparent';
    document.body.append(this.el);
    if (on.down) this.el.addEventListener('pointerdown', (e) => { e.preventDefault(); on.down!(e); });
    if (on.move) this.el.addEventListener('pointermove', (e) => on.move!(e));
    if (on.up) window.addEventListener('pointerup', (e) => { if (this.el.style.display !== 'none') on.up!(e); });
  }
  set on(v: boolean) { this.el.style.display = v ? 'block' : 'none'; if (G.input) G.input.pointerOverUI = v; }
  set cursor(c: string) { this.el.style.cursor = c; }
}

/** raycast helper for overlay-scene picking */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
export function overlayRay(x: number, y: number, cam: THREE.Camera) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, cam);
  return ray;
}
