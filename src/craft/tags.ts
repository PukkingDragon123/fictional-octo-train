// Pixel-art paper and metal for the first-person close-ups: typewritten
// luggage tags on string, index cards, engraved brass plates, embossed label
// tape, chalk slates, blueprint sheets, and spring-scale dial faces. Each is
// a small RGBA buffer drawn texel by texel (5x7 glyphs, typewriter jitter,
// paper fibre, ink bleed) on a plane in the overlay scene, so it goes through
// the same low-res pixel pipeline as everything else. No DOM.
import * as THREE from 'three';
import { Screen, glyph5x7 } from '../ui/font5x7';

export type TagKind = 'tag' | 'card' | 'plate' | 'dymo' | 'slate' | 'blueprint' | 'bakelite';

const PAPER = 0xe6dcc0, PAPER_DK = 0xc8b890, PAPER_LT = 0xf2ead2, INK = 0x24201c;
let seedN = 1;
const rnd = () => { seedN = (seedN * 1103515245 + 12345) & 0x7fffffff; return seedN / 0x7fffffff; };

export interface PixTag {
  mesh: THREE.Mesh;
  scr: Screen;
  kind: TagKind;
  /** draw the background again (paper, metal...), then write on it */
  clear(): void;
  /** commit drawing to the texture */
  flush(): void;
  /** typewritten line; returns the x after it */
  type(s: string, x: number, y: number, ink?: number, scale?: number): number;
  /** wrapped text block; returns lines used */
  para(s: string, x: number, y: number, w: number, ink?: number, lineH?: number, maxLines?: number): number;
  w: number; h: number;
}

/** a pixel-art sheet w x h texels, `size` scene units wide */
export function pixTag(kind: TagKind, w: number, h: number, size: number): PixTag {
  const scr = new Screen(w, h);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, (size * h) / w), mat);
  const seed = Math.floor(Math.random() * 1e6);
  const t: PixTag = {
    mesh, scr, kind, w, h,
    clear() { seedN = seed; background(scr, kind); },
    flush() { ctx.putImageData(scr.img, 0, 0); tex.needsUpdate = true; },
    type(s, x, y, ink, scale = 1) { return typeText(scr, s, x, y, ink ?? inkFor(kind), scale, kind); },
    para(s, x, y, wpx, ink, lineH = 9, maxLines = 99) { return typePara(scr, s, x, y, wpx, ink ?? inkFor(kind), lineH, maxLines, kind); },
  };
  t.clear(); t.flush();
  return t;
}

export const inkFor = (k: TagKind) => (k === 'slate' ? 0xe8e4d8 : k === 'blueprint' ? 0xe8f0ff : k === 'dymo' ? 0xf4f0e8 : k === 'plate' ? 0x2a1c0c : k === 'bakelite' ? 0xe8dcc0 : INK);

const C = (rgb: number, a = 255) => Screen.c(rgb, a);
function shade(rgb: number, f: number) {
  const r = Math.min(255, Math.max(0, Math.round(((rgb >> 16) & 255) * f))), g = Math.min(255, Math.max(0, Math.round(((rgb >> 8) & 255) * f))), b = Math.min(255, Math.max(0, Math.round((rgb & 255) * f)));
  return (r << 16) | (g << 8) | b;
}

function background(s: Screen, kind: TagKind) {
  const { w, h } = s;
  s.data.fill(0);
  if (kind === 'tag') {
    // a manila luggage tag: clipped top corners, an eyelet, fibres, a darker rim
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const clip = Math.max(0, 5 - y);
      if (x < clip || x >= w - clip) continue;
      const edge = x === clip || x === w - clip - 1 || y === 0 || y === h - 1;
      const f = 0.94 + rnd() * 0.08 - (rnd() < 0.02 ? 0.12 : 0);
      s.px(x, y, C(edge ? PAPER_DK : shade(0xd8c48e, f)));
    }
    const ex = Math.floor(w / 2), ey = 4;
    s.disc(ex, ey, 3, C(0xb08a3a)); s.disc(ex, ey, 2, C(0x6a4a1a)); s.disc(ex, ey, 1, 0);
    return;
  }
  if (kind === 'card' || kind === 'blueprint') {
    const base = kind === 'card' ? PAPER : 0x2a4a8a;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      s.px(x, y, C(edge ? shade(base, 0.8) : shade(base, 0.95 + rnd() * 0.07)));
    }
    if (kind === 'card') { for (let y = 10; y < h - 2; y += 9) s.hline(2, w - 3, y, C(0xb8c8d8)); s.vline(8, 1, h - 2, C(0xd89a9a)); }
    else { for (let y = 4; y < h - 1; y += 6) s.hline(1, w - 2, y, C(0x3a5a9a)); for (let x = 4; x < w - 1; x += 6) s.vline(x, 1, h - 2, C(0x3a5a9a)); }
    // a pin at the top
    s.disc(Math.floor(w / 2), 3, 2, C(0xc83a2a)); s.px(Math.floor(w / 2) - 1, 2, C(0xff9a8a));
    return;
  }
  if (kind === 'plate' || kind === 'bakelite') {
    const base = kind === 'plate' ? 0xb8963a : 0x3a2618;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      const hi = x === 1 || y === 1;
      const f = kind === 'plate' ? 0.9 + 0.12 * Math.sin((x + y * 0.3) * 0.5) + rnd() * 0.05 : 0.92 + rnd() * 0.08;
      s.px(x, y, C(edge ? shade(base, 0.55) : hi ? shade(base, 1.25) : shade(base, f)));
    }
    for (const [x, y] of [[3, 3], [w - 4, 3], [3, h - 4], [w - 4, h - 4]]) { s.disc(x, y, 1, C(kind === 'plate' ? 0x6a5020 : 0x8a8478)); s.px(x - 1, y - 1, C(0xf0e0b0)); }
    return;
  }
  if (kind === 'dymo') {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) s.px(x, y, C(shade(0xa8241c, y === 0 || y === h - 1 ? 0.7 : 0.92 + rnd() * 0.1)));
    return;
  }
  if (kind === 'slate') {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const frame = x < 3 || y < 3 || x >= w - 3 || y >= h - 3;
      s.px(x, y, C(frame ? shade(0x8a5a2a, 0.85 + rnd() * 0.25) : shade(0x2a302c, 0.9 + rnd() * 0.15 + (rnd() < 0.03 ? 0.25 : 0))));
    }
  }
}

function typeText(s: Screen, str: string, x: number, y: number, ink: number, scale: number, kind: TagKind): number {
  let cx = x;
  const emboss = kind === 'dymo', chalk = kind === 'slate', engrave = kind === 'plate' || kind === 'bakelite';
  for (const ch of str.toUpperCase()) {
    const b = glyph5x7(ch);
    const jy = !emboss && !engrave && rnd() < 0.18 ? (rnd() < 0.5 ? -1 : 1) : 0;
    const dark = 0.75 + rnd() * 0.35;
    for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) if (b[j * 5 + i]) {
      const px = cx + i * scale, py = y + j * scale + jy;
      let col = ink;
      if (chalk) { if (rnd() < 0.18) continue; col = shade(ink, 0.8 + rnd() * 0.2); }
      else if (!emboss && !engrave) col = shade(ink, dark + (rnd() < 0.12 ? 0.5 : 0));
      if (scale === 1) s.px(px, py, C(col)); else s.rect(px, py, scale, scale, C(col));
      if (emboss || engrave) s.px(px + 1, py + 1, C(emboss ? 0x5a100c : shade(ink, 1.8)));
    }
    cx += 6 * scale;
  }
  return cx;
}

function typePara(s: Screen, str: string, x: number, y: number, w: number, ink: number, lineH: number, maxLines: number, kind: TagKind): number {
  const words = str.split(/\s+/).filter(Boolean);
  const per = Math.max(1, Math.floor(w / 6));
  let line = '', n = 0;
  const flush = () => { if (n < maxLines) typeText(s, n === maxLines - 1 && line.length > per - 1 ? line.slice(0, per - 1) + '…' : line, x, y + n * lineH, ink, 1, kind); n++; line = ''; };
  for (const wd of words) {
    const test = line ? line + ' ' + wd : wd;
    if (test.length > per && line) { flush(); if (n >= maxLines) return n; line = wd; } else line = test;
  }
  if (line && n < maxLines) flush();
  return n;
}

/** a string from a tag's eyelet to whatever it is tied to */
export function tagString(color = 0x8a7a5a): THREE.Line {
  const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]);
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color }));
}
export function setString(l: THREE.Line, a: THREE.Vector3, b: THREE.Vector3) {
  const p = l.geometry.attributes.position as THREE.BufferAttribute;
  p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true;
  l.geometry.computeBoundingSphere();
}

/** red rubber-stamp across a sheet ("READY", "NEED SAW") */
export function stamp(t: PixTag, s: string, x: number, y: number, col = 0xc8281c) {
  const w = s.length * 6 + 3;
  t.scr.frame(x - 2, y - 2, w + 1, 11, Screen.c(col));
  typeText(t.scr, s, x, y, col, 1, 'card');
}

/** a spring-scale dial face: ticks 0..max, a label, a small PACE sub-dial */
export function dialFace(max: number): PixTag {
  const t = pixTag('card', 64, 64, 0.16);
  const s = t.scr;
  s.data.fill(0);
  const cx = 31.5, cy = 31.5;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d > 31.5) continue;
    if (d > 28.5) s.px(x, y, C(shade(0xb8963a, 0.75 + 0.35 * Math.sin(Math.atan2(y - cy, x - cx) * 2 + 1))));
    else s.px(x, y, C(shade(0xece2c4, 0.95 + rnd() * 0.06)));
  }
  for (let i = 0; i <= 20; i++) {
    const a = Math.PI * 0.75 + (i / 20) * Math.PI * 1.5;
    const r0 = i % 5 === 0 ? 21 : 24;
    s.line(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * 27, cy + Math.sin(a) * 27, C(i > 15 ? 0xb8281c : INK));
  }
  for (let i = 0; i <= 4; i++) {
    const a = Math.PI * 0.75 + (i / 4) * Math.PI * 1.5;
    const v = String(Math.round((max * i) / 4));
    typeText(s, v, Math.round(cx + Math.cos(a) * 15 - v.length * 3), Math.round(cy + Math.sin(a) * 15 - 3), INK, 1, 'plate');
  }
  typeText(s, 'KG', 26, 40, 0x6a5020, 1, 'plate');
  // the PACE sub-dial
  s.circle(cx, 51, 7, C(0x6a6050));
  for (let i = 0; i <= 4; i++) { const a = Math.PI + (i / 4) * Math.PI; s.px(cx + Math.cos(a) * 6, 51 + Math.sin(a) * 6, C(i === 0 ? 0xb8281c : INK)); }
  t.flush();
  return t;
}
