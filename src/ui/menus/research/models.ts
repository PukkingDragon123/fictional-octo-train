// THE LATTICE'S EXHIBITS (research/lattice.ts): one small 3D model per research
// node, of what the node unlocks, fitted into a unit box (largest side 1,
// centred on the origin) so the lattice can scale it onto its holo shelf.
//   recipes   the item the recipe makes (src/items/itemMeshes.ts itemGeometry),
//             stood upright with its broad face to the room (aligned by its box, as src/craft/fpKit.ts itemAlign does)
//   limbs     the real cyberware (src/entities/cyberGear.ts loosePartGeo), the
//             same part the operating table bolts on
//   designs   the cosmetic's own model (src/entities/cosmetics3d.ts); suit dyes
//             and patterns are a tailor's dress form wearing the cloth
//   chips     a ceramic package on gold legs, the lit die etched with the glyph
//   sockets   a steel socket bank with gold contact pins
// Every model comes with its meshes and their base materials; matFor() gives
// the lit / dim / dark / hot variants the lattice swaps on a node's state.
import * as THREE from 'three';
import { worldMaterial } from '../../../gfx/materials';
import { itemGeometry } from '../../../items/itemMeshes';
import { hasItemDef } from '../../../items/item';
import { cosmeticGeometry } from '../../../entities/cosmetics3d';
import { loosePartGeo } from '../../../entities/cyberGear';
import { rigDims } from '../../../entities/humanModel';
import { randomAppearance } from '../../../entities/humanRig';
import { COSMETIC } from '../../../game/cosmetics';
import { cyberDef, CYBER_SLOTS, SLOT_KIND } from '../../../survival/cyberParts';
import type { TreeNode } from '../../../game/unitTree';
import { chipArtCanvas, suitArtCanvas } from './icons';

export type Look = 'lit' | 'dim' | 'dark' | 'hot';
export interface Exhibit { root: THREE.Group; meshes: THREE.Mesh[] }

// ---------------------------------------------------------------- materials
const WORLD = new Map<Look, THREE.Material>();
/** the item atlas material (vertex colours, the shared world shader) in one of four looks */
function worldLook(l: Look): THREE.Material {
  let m = WORLD.get(l);
  if (m) return m;
  // a distinct cache key per look (worldMaterial caches by its options), so tinting one never tints the game's
  m = worldMaterial({ noVis: true, noFog: true, noGrid: true, lattice: l } as never);
  const lm = m as THREE.MeshLambertMaterial;
  if (l === 'dim') lm.color.setScalar(0.62);
  else if (l === 'dark') lm.color.setScalar(0.3);
  else if (l === 'hot') { lm.color.setScalar(1.08); lm.emissive = new THREE.Color(0x3a2a16); }
  WORLD.set(l, m);
  return m;
}
const BASE = worldLook('lit');
const variants = new Map<string, THREE.Material>();
/** the look of a model's material (the world material by table, others by clone) */
export function matFor(base: THREE.Material, l: Look): THREE.Material {
  if (base === BASE || WORLD.get('lit') === base) return worldLook(l);
  if (l === 'lit') return base;
  const k = base.uuid + l;
  let m = variants.get(k);
  if (m) return m;
  m = base.clone();
  const any = m as THREE.MeshStandardMaterial;
  const basic = (m as THREE.MeshBasicMaterial).isMeshBasicMaterial;
  if (l === 'dim') any.color?.multiplyScalar(0.6);
  else if (l === 'dark') any.color?.multiplyScalar(basic ? 0.15 : 0.32);
  else if (l === 'hot' && !basic && any.emissive) any.emissive = new THREE.Color(any.emissive).add(new THREE.Color(0x3a2a16));
  variants.set(k, m);
  return m;
}
const std = (color: number, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1, flatShading: true, ...o });

// ---------------------------------------------------------------- the exhibits
const cache = new Map<string, () => Exhibit>();
/** a fresh exhibit for a node (geometry and materials are shared between copies) */
export function nodeModel(n: TreeNode): Exhibit {
  let f = cache.get(n.key);
  if (!f) {
    let parts: { geo: THREE.BufferGeometry; mat: THREE.Material; q?: THREE.Quaternion; pre?: THREE.Matrix4 }[] = [];
    try { parts = buildParts(n); } catch (e) { console.warn('lattice model', n.key, e); }
    if (!parts.length) parts = chipParts('steady', 0x9aa0a8);
    // fit: the union of the parts' boxes to a unit cube about the origin
    const box = new THREE.Box3(), tmp = new THREE.Box3();
    for (const p of parts) { p.geo.computeBoundingBox(); tmp.copy(p.geo.boundingBox!); if (p.pre) tmp.applyMatrix4(p.pre); box.union(tmp); }
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    const k = 1 / Math.max(1e-4, s.x, s.y, s.z);
    const fit = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
    f = () => {
      const root = new THREE.Group();
      const meshes: THREE.Mesh[] = [];
      for (const p of parts) {
        const m = new THREE.Mesh(p.geo, p.mat);
        m.matrixAutoUpdate = false;
        m.matrix.copy(fit); if (p.pre) m.matrix.multiply(p.pre);
        m.castShadow = true;
        m.userData.base = p.mat;
        root.add(m); meshes.push(m);
      }
      return { root, meshes };
    };
    cache.set(n.key, f);
  }
  return f();
}

function buildParts(n: TreeNode) {
  const ic = n.icon;
  if (ic.kind === 'item') { const k = [ic.key, ...(ic.alt ?? [])].find((q) => hasItemDef(q) && itemGeometry(q)); return k ? itemParts(k) : []; }
  if (ic.kind === 'limb') return limbParts(ic.key);
  if (ic.kind === 'cos') return cosParts(ic.key);
  if (ic.kind === 'chip') return chipParts(ic.glyph, ic.color);
  return socketParts();
}

/** an item stood up with its broad face to the room: aligned (long axis z, thin axis y), then tipped up */
/** the item's box axes, longest first: a rotation taking the longest to z, the middle to x, the thinnest to y */
function align(g: THREE.BufferGeometry): { q: THREE.Quaternion; center: THREE.Vector3 } {
  if (!g.boundingBox) g.computeBoundingBox();
  const b = g.boundingBox!;
  const size = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z].map((v) => Math.max(0.004, v));
  const [L, M, S] = [0, 1, 2].sort((i, j) => size[j] - size[i]);
  const img: THREE.Vector3[] = [];
  img[L] = new THREE.Vector3(0, 0, 1); img[M] = new THREE.Vector3(1, 0, 0); img[S] = new THREE.Vector3(0, 1, 0);
  const m = new THREE.Matrix4().makeBasis(img[0], img[1], img[2]);
  if (m.determinant() < 0) { img[M].negate(); m.makeBasis(img[0], img[1], img[2]); }
  return { q: new THREE.Quaternion().setFromRotationMatrix(m), center: b.getCenter(new THREE.Vector3()) };
}
function itemParts(key: string) {
  const g = itemGeometry(key);
  if (!g) return [];
  const a = align(g);
  const pre = new THREE.Matrix4();
  {
    const up = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    pre.multiply(up).multiply(new THREE.Matrix4().makeRotationFromQuaternion(a.q)).multiply(new THREE.Matrix4().makeTranslation(-a.center.x, -a.center.y, -a.center.z));
    // a long thing leans a little, like a tool hung on a peg
    pre.premultiply(new THREE.Matrix4().makeRotationZ(0.32));
  }
  return [{ geo: g, mat: BASE, pre }];
}

let dims: ReturnType<typeof rigDims> | null | undefined;
function limbParts(key: string) {
  if (dims === undefined) { try { dims = rigDims(randomAppearance(() => 0.5)); } catch { dims = null; } }
  const DIMS = dims;
  const d = cyberDef(key);
  if (!d) return [];
  const slot = CYBER_SLOTS.find((s) => SLOT_KIND[s] === d.kind && !s.endsWith('_l')) ?? CYBER_SLOTS.find((s) => SLOT_KIND[s] === d.kind);
  if (slot && DIMS) {
    try {
      const g = loosePartGeo(key, slot, DIMS);
      if (g.attributes.position?.count) {
        g.computeBoundingBox();
        // an arm or a leg hangs along -y: tip it to a diagonal so it fills the shelf
        const long = d.kind === 'arm' || d.kind === 'leg';
        return [{ geo: g, mat: BASE, pre: long ? new THREE.Matrix4().makeRotationZ(0.62) : undefined }];
      }
    } catch (e) { console.warn('lattice limb', key, e); }
  }
  return hasItemDef(d.item) ? itemParts(d.item) : [];
}

function cosParts(key: string) {
  const c = COSMETIC.get(key);
  if (!c) return [];
  if (c.slot === 'suit') return dressForm(key, c.color);
  const g = cosmeticGeometry(key);
  const out: { geo: THREE.BufferGeometry; mat: THREE.Material; pre?: THREE.Matrix4 }[] = [];
  const pre = c.slot === 'back' ? new THREE.Matrix4().makeRotationY(2.6) : undefined;
  if (g?.geo) out.push({ geo: g.geo, mat: BASE, pre });
  if (g?.glow) out.push({ geo: g.glow, mat: new THREE.MeshBasicMaterial({ color: c.color, toneMapped: false }), pre });
  return out;
}

/** the suit designs: a tailor's dress form (shoulders, waist, hips) in the cloth, on a turned stand */
const formGeo = (() => {
  let g: THREE.BufferGeometry | null = null;
  return () => {
    if (g) return g;
    const prof: [number, number][] = [[0.0, 0.0], [0.17, 0.02], [0.2, 0.12], [0.19, 0.26], [0.15, 0.4], [0.165, 0.52], [0.215, 0.66], [0.235, 0.74], [0.2, 0.8], [0.09, 0.84], [0.06, 0.9], [0.0, 0.92]];
    g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 14);
    // a flattened body: deeper side to side than front to back
    g.scale(1, 1, 0.68);
    g.computeVertexNormals();
    return g;
  };
})();
function dressForm(key: string, color: number) {
  const cv = suitArtCanvas(key, color);
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(2, 1.4);
  const cloth = std(0xffffff, { map: tex, roughness: 0.85, flatShading: false });
  const wood = std(0x6a4a2e, { roughness: 0.6 }), brass = std(0xc89a48, { metalness: 0.7, roughness: 0.35 });
  const body = formGeo().clone().translate(0, 0.42, 0);
  const pole = new THREE.CylinderGeometry(0.018, 0.022, 0.42, 6).translate(0, 0.21, 0);
  const cap = new THREE.CylinderGeometry(0.035, 0.035, 0.03, 8).translate(0, 1.35, 0);
  const foot = new THREE.CylinderGeometry(0.07, 0.16, 0.05, 6).translate(0, 0.025, 0);
  const collar = new THREE.TorusGeometry(0.075, 0.016, 4, 10).rotateX(Math.PI / 2).translate(0, 1.24, 0);
  const zip = new THREE.BoxGeometry(0.012, 0.42, 0.012).translate(0, 1.0, 0.16);
  return [
    { geo: body, mat: cloth }, { geo: pole, mat: wood }, { geo: foot, mat: wood }, { geo: cap, mat: brass },
    { geo: collar, mat: cloth }, { geo: zip, mat: brass },
  ];
}

/** a chip stood up on its legs: ceramic package, gold legs both sides, the lit die with its glyph */
function chipParts(glyph: Parameters<typeof chipArtCanvas>[0], color: number) {
  const die = new THREE.CanvasTexture(chipArtCanvas(glyph, color, 48));
  die.magFilter = die.minFilter = THREE.NearestFilter; die.generateMipmaps = false; die.colorSpace = THREE.SRGBColorSpace;
  const ceramic = std(0x2a2c30, { roughness: 0.42 }), gold = std(0xd8a838, { metalness: 0.85, roughness: 0.28 });
  const lit = new THREE.MeshBasicMaterial({ map: die, toneMapped: false, transparent: true, alphaTest: 0.5 });
  const out: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
  out.push({ geo: new THREE.BoxGeometry(0.8, 0.9, 0.16), mat: ceramic });
  // a bevel lip round the top and the notch
  out.push({ geo: new THREE.BoxGeometry(0.72, 0.82, 0.02).translate(0, 0, 0.088), mat: std(0x3a3e44, { roughness: 0.4 }) });
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) {
    const y = -0.34 + i * 0.136;
    out.push({ geo: new THREE.BoxGeometry(0.16, 0.05, 0.035).translate(s * 0.47, y, -0.03), mat: gold });
    out.push({ geo: new THREE.BoxGeometry(0.035, 0.05, 0.1).translate(s * 0.535, y, -0.09), mat: gold });
  }
  out.push({ geo: new THREE.PlaneGeometry(0.66, 0.66).translate(0, -0.02, 0.1), mat: lit });
  // the back: a gold heat spreader
  out.push({ geo: new THREE.BoxGeometry(0.5, 0.5, 0.02).translate(0, 0, -0.09), mat: gold });
  return out;
}

/** more sockets: a steel bank with three square sockets, gold contacts in each, a ribbon tail */
function socketParts() {
  const steel = std(0x8a9096, { metalness: 0.6, roughness: 0.35 }), dark = std(0x16181a), gold = std(0xe0b048, { metalness: 0.85, roughness: 0.25 });
  const out: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
  out.push({ geo: new THREE.BoxGeometry(0.34, 1.0, 0.16), mat: steel });
  for (let i = 0; i < 3; i++) {
    const y = 0.32 - i * 0.32;
    out.push({ geo: new THREE.BoxGeometry(0.24, 0.22, 0.04).translate(0, y, 0.07), mat: dark });
    for (let p = 0; p < 4; p++) out.push({ geo: new THREE.BoxGeometry(0.03, 0.12, 0.03).translate(-0.075 + p * 0.05, y, 0.09), mat: gold });
    out.push({ geo: new THREE.BoxGeometry(0.42, 0.04, 0.12).translate(0, y + 0.13, 0), mat: steel });
  }
  out.push({ geo: new THREE.BoxGeometry(0.2, 0.42, 0.02).translate(0, -0.66, -0.04).rotateX(0.3), mat: std(0xc8a040, { roughness: 0.7 }) });
  return out;
}
