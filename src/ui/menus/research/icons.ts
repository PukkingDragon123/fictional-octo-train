// Pixel-art icons for the research tree (tree.ts), one per node, cached:
//   designs   the cosmetic's own 3D model (src/entities/cosmetics3d.ts) rendered
//             as a product shot and reduced to pixels; suit dyes are a painted
//             jumpsuit in the dye (with its stripes, chevrons or circuit weave)
//   recipes   the item the recipe makes (src/ui/icons.ts itemIcon)
//   limbs     the boxed part (its item model)
//   chips     hand-painted: a ceramic package, gold legs, a lit die with the
//             chip's glyph etched in it
// Every icon gets the same finish: punchier palette, a top-left lip, a
// darker bottom-right, a selective one-pixel outline.
import * as THREE from 'three';
import { G } from '../../../game/G';
import { U, worldMaterial } from '../../../gfx/materials';
import { PixelCanvas, mixHex } from '../../../gfx/pixel';
import { itemIcon } from '../../icons';
import { hasItemDef } from '../../../items/item';
import { cosmeticGeometry } from '../../../entities/cosmetics3d';
import { COSMETIC } from '../../../game/cosmetics';
import { cyberDef } from '../../../survival/cyberParts';
import type { TreeNode, ChipGlyph } from '../../../game/unitTree';

const cache = new Map<string, string>();
export const ICON = 24;

export function nodeIcon(n: TreeNode, size = ICON): string {
  const ck = n.key + '|' + size;
  const hit = cache.get(ck);
  if (hit !== undefined) return hit;
  let url = '';
  try {
    const ic = n.icon;
    if (ic.kind === 'item') { const k = [ic.key, ...(ic.alt ?? [])].find((q) => hasItemDef(q)); url = k ? itemIcon(k, '', size) : ''; }
    else if (ic.kind === 'limb') { const d = cyberDef(ic.key); url = d && hasItemDef(d.item) ? itemIcon(d.item, '', size) : ''; }
    else if (ic.kind === 'cos') url = cosIcon(ic.key, size);
    else if (ic.kind === 'chip') url = finish(chipArt(ic.glyph, ic.color, size));
    else url = finish(socketArt(size));
  } catch (e) { console.warn('tree icon', n.key, e); }
  if (!url) url = finish(chipArt('steady', 0x9aa0a8, size));
  cache.set(ck, url);
  return url;
}

// ================================================================== a model as a product shot
let scene: THREE.Scene | null = null; let cam: THREE.OrthographicCamera | null = null; let rt: THREE.WebGLRenderTarget | null = null; let rtW = 0;
const SS = 4;
function shoot(parts: { geo: THREE.BufferGeometry; mat: THREE.Material }[], size: number, yaw = 0.6, pitch = 0.42): PixelCanvas | null {
  const r = G?.pr?.renderer as THREE.WebGLRenderer | undefined;
  if (!r || !parts.length) return null;
  if (!scene) {
    scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 1.3));
    const key = new THREE.DirectionalLight(0xfff0d8, 2.6); key.position.set(-2.2, 3.6, 2.6); scene.add(key);
    const fill = new THREE.DirectionalLight(0x9db4ff, 0.8); fill.position.set(3, 1.2, 1.5); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 1.4); rim.position.set(1.5, 2.5, -3.5); scene.add(rim);
    cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.001, 100);
  }
  const W = size * SS;
  if (!rt || rtW !== W) { rt?.dispose(); rt = new THREE.WebGLRenderTarget(W, W, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true }); rtW = W; }
  const grp = new THREE.Group();
  const box = new THREE.Box3();
  for (const p of parts) { p.geo.computeBoundingBox(); box.union(p.geo.boundingBox!); grp.add(new THREE.Mesh(p.geo, p.mat)); }
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  for (const m of grp.children) m.position.copy(c).multiplyScalar(-1);
  const spin = new THREE.Group(); spin.add(grp); spin.rotation.y = yaw;
  scene!.add(spin);
  const span = Math.max(s.x, s.y, s.z) * 1.12 * (size / (size - 2)) + 1e-4;
  const C = cam!;
  C.left = -span / 2; C.right = span / 2; C.bottom = -span / 2; C.top = span / 2;
  const dist = span * 4 + 2;
  C.position.set(0, Math.sin(pitch) * dist, Math.cos(pitch) * dist); C.lookAt(0, 0, 0); C.near = 0.001; C.far = dist * 3; C.updateProjectionMatrix();
  const u = U as any;
  const want: Record<string, number> = { uCutOn: 0, uVisOn: 0, uFogNear: 1e4, uFogFar: 2e4, uGridScale: 0, uCollapse: 0, uSnapOn: 0, uWetness: 0 };
  const saved: Record<string, number> = {};
  for (const k of Object.keys(want)) if (u[k] && typeof u[k].value === 'number') { saved[k] = u[k].value; u[k].value = want[k]; }
  const px = new Uint8Array(W * W * 4);
  const prev = r.getRenderTarget(); const pc = new THREE.Color(); r.getClearColor(pc); const pa = r.getClearAlpha();
  try { r.setRenderTarget(rt); r.setClearColor(0, 0); r.clear(true, true, true); r.render(scene!, C); r.readRenderTargetPixels(rt!, 0, 0, W, W, px); }
  finally { r.setRenderTarget(prev); r.setClearColor(pc, pa); for (const k of Object.keys(saved)) u[k].value = saved[k]; scene!.remove(spin); }
  const toS = (v: number) => { v /= 255; v = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(v * 255))); };
  const out = new PixelCanvas(size, size); out.wrap = false;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let n = 0, R = 0, Gg = 0, B = 0;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) { const k = (((size - 1 - y) * SS + (SS - 1 - j)) * W + x * SS + i) * 4; if (px[k + 3] > 128) { n++; R += px[k]; Gg += px[k + 1]; B += px[k + 2]; } }
    if (n >= SS * SS * 0.4) out.setRGBA(x, y, toS(R / n), toS(Gg / n), toS(B / n), 255);
  }
  return out;
}

function cosIcon(key: string, size: number): string {
  const c = COSMETIC.get(key);
  if (!c) return '';
  if (c.slot === 'suit') return finish(suitArt(key, c.color, size));
  const g = cosmeticGeometry(key);
  const parts: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
  if (g?.geo) parts.push({ geo: g.geo, mat: worldMaterial({ noVis: true, noFog: true, noGrid: true }) });
  if (g?.glow) parts.push({ geo: g.glow, mat: new THREE.MeshBasicMaterial({ color: c.color }) });
  const pc = shoot(parts, size, c.slot === 'back' ? 2.6 : 0.55, c.slot === 'hat' ? 0.5 : 0.3);
  return pc ? finish(pc) : finish(chipArt('steady', c.color, size));
}

// ================================================================== painted art
const P = (w: number) => { const p = new PixelCanvas(w, w); p.wrap = false; return p; };
function suitArt(key: string, col: number, S: number): PixelCanvas {
  const p = P(S);
  const k = S / 24;
  const R = (x: number, y: number, w: number, h: number, c: number) => p.rect(Math.round(x * k), Math.round(y * k), Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)), c);
  const base = col, dk = mixHex(col, 0x10141a, 0.35), lt = mixHex(col, 0xffffff, 0.25);
  // the jumpsuit laid flat: sleeves, body, legs, a collar and the zip
  R(4, 4, 16, 9, base); R(1, 5, 4, 8, base); R(19, 5, 4, 8, base); R(5, 12, 14, 3, base);
  R(5, 15, 6, 8, base); R(13, 15, 6, 8, base);
  R(9, 3, 6, 2, dk); R(11, 5, 2, 10, dk); R(5, 13, 14, 1, dk);
  R(1, 12, 4, 1, dk); R(19, 12, 4, 1, dk); R(5, 22, 6, 1, dk); R(13, 22, 6, 1, dk);
  R(5, 5, 2, 7, lt); R(1, 6, 1, 5, lt);
  const S2 = p.w, ins = (x: number, y: number) => p.alpha(x, y) > 0;
  if (key === 'suit_stripe') for (let y = 0; y < S2; y++) if (((y / k) | 0) % 3 === 0) for (let x = 0; x < S2; x++) if (ins(x, y)) p.set(x, y, 0x1a1a1a);
  if (key === 'suit_hazard') for (let y = 0; y < S2; y++) for (let x = 0; x < S2; x++) if (ins(x, y) && (y > S2 * 0.62 || x < S2 * 0.2 || x > S2 * 0.8) && (((x + y) / (2 * k)) | 0) % 2 === 0) p.set(x, y, 0x17150f);
  if (key === 'suit_circuit') for (let y = 0; y < S2; y += Math.max(2, Math.round(3 * k))) for (let x = 0; x < S2; x++) if (ins(x, y) && ((x * 7 + y * 3) % 11 < 6)) p.set(x, y, 0x3affd8);
  return p;
}
function chipArt(glyph: ChipGlyph, col: number, S: number): PixelCanvas {
  const p = P(S);
  const k = S / 24;
  const R = (x: number, y: number, w: number, h: number, c: number) => p.rect(Math.round(x * k), Math.round(y * k), Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)), c);
  // gold legs both sides, the ceramic package, a notch, the lit die
  for (let i = 0; i < 5; i++) { R(1, 5 + i * 3, 4, 1.5, 0xd8a838); R(19, 5 + i * 3, 4, 1.5, 0xd8a838); R(1, 5 + i * 3, 1, 1.5, 0xfff0a0); }
  R(4, 3, 16, 18, 0x2a2c30); R(4, 3, 16, 1, 0x4a4e56); R(4, 3, 1, 18, 0x3e4248); R(4, 20, 16, 1, 0x16181a); R(19, 3, 1, 18, 0x1c1e22);
  R(11, 3, 2, 1, 0x101214);
  R(6, 5, 1, 1, 0xb8bcc0);
  const dark = mixHex(col, 0x000000, 0.55), mid = col, hi = mixHex(col, 0xffffff, 0.45);
  R(7, 7, 10, 10, dark); R(8, 8, 8, 8, mixHex(col, 0x000000, 0.25));
  const D = (x: number, y: number, c = hi) => R(8 + x, 8 + y, 1, 1, c);
  // the glyph etched in the die (8x8 die px)
  const G8: Record<ChipGlyph, string[]> = {
    calm: ['........', '........', '.##..##.', '#..##..#', '........', '.##..##.', '#..##..#', '........'],
    steady: ['...##...', '...##...', '########', '...##...', '..####..', '.##..##.', '.##..##.', '..####..'],
    recall: ['..####..', '.#....#.', '#..##..#', '#.#..#.#', '#.#..#.#', '#..##..#', '.#....#.', '..####..'],
    eye: ['........', '..####..', '.#....#.', '#..##..#', '#..##..#', '.#....#.', '..####..', '........'],
    ear: ['..####..', '.#....#.', '.#.##.#.', '.#.#..#.', '...#.#..', '...#.#..', '..#..#..', '..###...'],
    heart: ['........', '.##..##.', '########', '########', '.######.', '..####..', '...##...', '........'],
    gut: ['.######.', '#......#', '#.####.#', '#.#..#.#', '#.#.##.#', '#.#....#', '#.######', '#.......'],
    mule: ['........', '.######.', '.#.##.#.', '.######.', '.#.##.#.', '.######.', '.#....#.', '........'],
    step: ['....##..', '...####.', '...####.', '....###.', '.##.....', '####....', '####....', '.###....'],
  };
  G8[glyph].forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') D(x, y, (x + y) % 5 === 0 ? 0xffffff : hi); }));
  R(7, 7, 10, 1, mid); R(7, 7, 1, 10, mid);
  // a printed lot code under the die
  for (let i = 0; i < 4; i++) R(7 + i * 3, 18, 2, 1, 0x7a7e86);
  return p;
}
function socketArt(S: number): PixelCanvas {
  const p = P(S);
  const c = S / 2 - 0.5;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x - c, y - c) / (S / 2);
    if (d < 0.92 && d > 0.62) p.set(x, y, mixHex(0x8a8e94, 0x3a3e44, (y / S) * 0.8));
    else if (d <= 0.62 && d > 0.48) p.set(x, y, 0x1a1c1e);
    else if (d <= 0.48) p.set(x, y, (x + y) % 4 === 0 ? 0xffd070 : 0x6a4a1a);
  }
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; p.set(Math.round(c + Math.cos(a) * S * 0.38), Math.round(c + Math.sin(a) * S * 0.38), 0xe8ecf0); }
  return p;
}

// ================================================================== the finish
function finish(pc: PixelCanvas): string {
  const S = pc.w;
  const src = new Uint8ClampedArray(pc.data);
  const op = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && src[(y * S + x) * 4 + 3] > 0;
  const at = (x: number, y: number) => { const i = (y * S + x) * 4; return (src[i] << 16) | (src[i + 1] << 8) | src[i + 2]; };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!op(x, y)) continue;
    const c = at(x, y);
    if (!op(x, y - 1) || !op(x - 1, y)) pc.set(x, y, mixHex(c, 0xfff6e0, 0.24));
    else if (!op(x, y + 1) || !op(x + 1, y)) pc.set(x, y, mixHex(c, 0x000000, 0.24));
  }
  const s2 = new Uint8ClampedArray(pc.data);
  const opa = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && s2[(y * S + x) * 4 + 3] > 0;
  const col = (x: number, y: number) => { const i = (y * S + x) * 4; return (s2[i] << 16) | (s2[i + 1] << 8) | s2[i + 2]; };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (opa(x, y)) continue;
    let nc = -1, shadow = false;
    if (opa(x, y + 1)) nc = col(x, y + 1); else if (opa(x + 1, y)) nc = col(x + 1, y);
    else if (opa(x - 1, y)) { nc = col(x - 1, y); shadow = true; } else if (opa(x, y - 1)) { nc = col(x, y - 1); shadow = true; }
    if (nc >= 0) pc.set(x, y, mixHex(nc, 0x07060a, shadow ? 0.86 : 0.74));
  }
  const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  cv.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
  return cv.toDataURL();
}
