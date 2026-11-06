// SPECIMEN DETAIL: the containment wing's display versions of the game's
// creatures. The species' own rig (built and animated by its own code) is
// the armature; on top of every part this adds the anatomy a jar label would
// list, as real geometry on wet, layered materials:
//   a wet film     a black additive clearcoat twin of every rig mesh: only the
//                  specular glints of slick skin or chitin show (lit by the cell lamps)
//   heads          teeth rows on raw gums, extra wet eyes with a glint, drool,
//                  stitched-shut mouths (Hush)
//   limbs          veins and sinew cords wound along the bone, barbs
//   bodies         rib arcs under the skin, a ridge of spines, tumours and growths,
//                  sutures, exposed plaster lath and nails (Drywall Man)
// Colour comes from small painted canvases (mottled flesh with veins and
// bruising, bruised pale skin, banded chitin, striated sinew, stained bone),
// so the parts read as subsurface-ish rather than flat. One merged mesh per
// part per material; built only when a cell first comes near the camera.
// The breathing and the twitches run only for cells on screen (wing.ts).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Rig } from '../../../creatures/species';

type Skin = 'flesh' | 'pale' | 'grey' | 'dark' | 'chitin' | 'plaster' | 'plush' | 'glass' | 'static';
export interface Profile {
  skin: Skin; wet: number; teeth: number; eyes: number; ribs: number; spines: number; veins: number; sinew: number;
  tumors: number; drool: boolean; stitches: boolean; nails: number; breathe: number; twitch: number;
}
const BASE: Profile = { skin: 'flesh', wet: 0.6, teeth: 0, eyes: 0, ribs: 0, spines: 0, veins: 2, sinew: 1, tumors: 0, drool: false, stitches: false, nails: 0, breathe: 1, twitch: 1 };
/** the full treatment: the wing's most prominent specimens */
const FULL: Record<string, Partial<Profile>> = {
  hush: { skin: 'pale', wet: 0.9, ribs: 9, veins: 5, sinew: 4, stitches: true, tumors: 2, breathe: 1.4, twitch: 1.6 },
  grinhound: { skin: 'flesh', wet: 0.8, teeth: 26, eyes: 2, ribs: 7, spines: 6, veins: 3, sinew: 3, tumors: 3, drool: true, twitch: 1.4 },
  drywall_man: { skin: 'plaster', wet: 0.1, nails: 22, veins: 0, sinew: 2, tumors: 6, spines: 0, breathe: 0.4, twitch: 0.8 },
  employee: { skin: 'grey', wet: 0.5, teeth: 14, ribs: 5, veins: 4, sinew: 2, stitches: true, tumors: 1, twitch: 1.8 },
  tallyman: { skin: 'dark', wet: 0.7, teeth: 18, eyes: 3, ribs: 8, spines: 9, veins: 3, sinew: 4, twitch: 1.2 },
  stammer: { skin: 'chitin', wet: 0.85, eyes: 6, spines: 10, veins: 2, sinew: 4, teeth: 10, twitch: 2.2 },
  gloam: { skin: 'dark', wet: 1, teeth: 20, eyes: 8, veins: 4, sinew: 3, drool: true, tumors: 4, twitch: 1.3 },
  plenum: { skin: 'chitin', wet: 0.9, teeth: 12, eyes: 4, spines: 12, sinew: 3, veins: 2, twitch: 2 },
  // the pet: glossy chitin and nothing grafted on (her own rig carries the detail)
  mutt_roach: { skin: 'chitin', wet: 1, veins: 0, sinew: 0, breathe: 0.6, twitch: 1.2 },
};
export function profileOf(sp: any): Profile {
  const f = FULL[sp.key];
  if (f) return { ...BASE, ...f };
  const blood = sp.gore?.blood ?? 'red', T = sp.temperament, threat = sp.threat ?? 1, mean = T === 'hostile' || T === 'stalker' || T === 'ambush' || T === 'territorial';
  const skin: Skin = blood === 'stuffing' ? 'plush' : blood === 'plaster' ? 'plaster' : blood === 'glass' ? 'glass' : blood === 'static' ? 'static' : blood === 'shell' || blood === 'oil' ? 'chitin' : blood === 'dark' ? 'dark' : blood === 'pale' ? 'pale' : 'flesh';
  const organic = skin === 'flesh' || skin === 'pale' || skin === 'dark' || skin === 'chitin';
  return { ...BASE, skin, wet: organic ? 0.7 : skin === 'glass' ? 1 : 0.15, teeth: organic && mean ? 8 + threat * 3 : 0, eyes: organic && threat >= 3 ? 2 : 0, ribs: organic && threat >= 2 ? 4 : 0, spines: organic && mean ? 3 + threat : 0, veins: organic ? 2 + Math.min(2, threat) : 0, sinew: organic ? 1 + Math.floor(threat / 2) : 0, tumors: organic && threat >= 3 ? 2 : 0, drool: organic && mean && threat >= 3, breathe: organic ? 1 : 0.3, twitch: organic ? 1 + threat * 0.15 : 0.4 };
}

// ================================================================== painted skins
function rngOf(seed: number) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
function canvasTex(paint: (c: CanvasRenderingContext2D, r: () => number) => void, seed: number, size = 128): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d')!;
  paint(c, rngOf(seed));
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipMapLinearFilter;
  return t;
}
function mottled(c: CanvasRenderingContext2D, r: () => number, base: string, blot: string[], vein: string, n = 900) {
  c.fillStyle = base; c.fillRect(0, 0, 128, 128);
  for (let i = 0; i < n; i++) { c.fillStyle = blot[Math.floor(r() * blot.length)]; c.globalAlpha = 0.12 + r() * 0.25; const s = 2 + r() * 9; c.beginPath(); c.arc(r() * 128, r() * 128, s, 0, 7); c.fill(); }
  c.globalAlpha = 0.75; c.strokeStyle = vein;
  for (let v = 0; v < 9; v++) { let x = r() * 128, y = r() * 128, a = r() * 6.3; c.lineWidth = 1 + r() * 1.4; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 26; k++) { a += (r() - 0.5) * 0.9; x += Math.cos(a) * 3; y += Math.sin(a) * 3; c.lineTo(x, y); if (r() < 0.08) { c.moveTo(x, y); a += 1.2; } } c.stroke(); }
  c.globalAlpha = 1;
}
let MATS: Record<string, THREE.Material> | null = null;
function mats() {
  if (MATS) return MATS;
  const phys = (map: THREE.Texture, rough: number, clear: number, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) => new THREE.MeshPhysicalMaterial({ map, roughness: rough, metalness: 0, clearcoat: clear, clearcoatRoughness: 0.18, ...extra });
  const flesh = canvasTex((c, r) => mottled(c, r, '#b85a5a', ['#8a2a34', '#d88a7a', '#6a1a2a', '#c86a5a'], '#5a1030'), 11);
  const pale = canvasTex((c, r) => mottled(c, r, '#c8c4bc', ['#a8a0a8', '#e0dcd0', '#8a8a9a', '#b8a0a0'], '#4a5a8a', 700), 12);
  const grey = canvasTex((c, r) => mottled(c, r, '#8a8a84', ['#6a6a64', '#a8a49a', '#5a5048', '#9a8070'], '#3a3a5a', 700), 13);
  const dark = canvasTex((c, r) => mottled(c, r, '#2a2226', ['#1a1214', '#4a3238', '#3a1a22', '#5a4048'], '#7a1a2a', 800), 14);
  const chitin = canvasTex((c, r) => { c.fillStyle = '#3a2214'; c.fillRect(0, 0, 128, 128); for (let y = 0; y < 128; y += 8) { c.fillStyle = y % 16 ? '#5a3418' : '#24140a'; c.fillRect(0, y, 128, 3); } for (let i = 0; i < 300; i++) { c.fillStyle = r() < 0.5 ? '#7a4a24' : '#140a06'; c.fillRect(r() * 128, r() * 128, 1 + r() * 3, 1); } }, 15);
  const plaster = canvasTex((c, r) => { c.fillStyle = '#d8d2c4'; c.fillRect(0, 0, 128, 128); for (let i = 0; i < 900; i++) { c.fillStyle = r() < 0.5 ? '#c0b8a8' : '#ece6d8'; c.fillRect(r() * 128, r() * 128, 2, 2); } c.strokeStyle = '#4a4238'; for (let v = 0; v < 7; v++) { let x = r() * 128, y = r() * 128; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 10; k++) { x += (r() - 0.5) * 18; y += r() * 12; c.lineTo(x, y); } c.stroke(); } }, 16);
  const sinew = canvasTex((c, r) => { c.fillStyle = '#8a1a22'; c.fillRect(0, 0, 128, 128); for (let x = 0; x < 128; x += 2) { c.fillStyle = r() < 0.3 ? '#e8c8b8' : r() < 0.5 ? '#b02a30' : '#6a0a14'; c.globalAlpha = 0.6; c.fillRect(x, 0, 1, 128); } c.globalAlpha = 1; }, 17);
  const bone = canvasTex((c, r) => { c.fillStyle = '#e8dcc0'; c.fillRect(0, 0, 128, 128); for (let i = 0; i < 400; i++) { c.fillStyle = r() < 0.6 ? '#c8b088' : '#8a6a3a'; c.globalAlpha = 0.3 + r() * 0.4; c.fillRect(r() * 128, r() * 128, 1 + r() * 4, 1 + r() * 2); } c.globalAlpha = 1; }, 18);
  MATS = {
    flesh: phys(flesh, 0.42, 0.7), pale: phys(pale, 0.38, 0.8), grey: phys(grey, 0.5, 0.4), dark: phys(dark, 0.3, 0.9), chitin: phys(chitin, 0.25, 1),
    plaster: new THREE.MeshStandardMaterial({ map: plaster, roughness: 0.95 }), plush: new THREE.MeshStandardMaterial({ color: 0x8a6a54, roughness: 1 }),
    glass: phys(bone, 0.05, 1, { color: 0x9adcd8, transparent: true, opacity: 0.6 }), static: new THREE.MeshStandardMaterial({ color: 0x222833, roughness: 0.4, emissive: 0x2a4a6a }),
    sinew: phys(sinew, 0.35, 0.9), bone: phys(bone, 0.45, 0.5), gum: phys(flesh, 0.3, 1, { color: 0xd88a8a }),
    eye: new THREE.MeshPhysicalMaterial({ color: 0x0a0806, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, emissive: 0x3a0a04, emissiveIntensity: 0.6 }),
    nail: new THREE.MeshStandardMaterial({ color: 0x5a5a5e, roughness: 0.35, metalness: 0.9 }),
    drool: new THREE.MeshPhysicalMaterial({ color: 0xd8e0c8, roughness: 0.02, clearcoat: 1, transparent: true, opacity: 0.55 }),
  };
  return MATS;
}
/** the wet film: black, additive, clearcoated: only the specular glints show */
const films = new Map<number, THREE.MeshPhysicalMaterial>();
function filmMat(wet: number) {
  const k = Math.round(wet * 4);
  let m = films.get(k);
  if (!m) { m = new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.32 - k * 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); films.set(k, m); }
  return m;
}

// ================================================================== geometry helpers
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const clean = (g: THREE.BufferGeometry) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k); if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((n.attributes.position.count) * 2), 2)); if (!n.attributes.normal) n.computeVertexNormals(); return n; };
function cord(pts: THREE.Vector3[], r: number, seg = 18, rad = 5) { return clean(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, rad, false)); }
function spike(base: THREE.Vector3, dir: THREE.Vector3, r: number, len: number, segs = 5) {
  const g = new THREE.ConeGeometry(r, len, segs, 2);
  g.translate(0, len / 2, 0);
  // a slight hook toward the tip
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) / len; p.setZ(i, p.getZ(i) + y * y * len * 0.25); }
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize()));
  g.translate(base.x, base.y, base.z);
  return clean(g);
}
function lump(c: THREE.Vector3, r: number, rnd: () => number, detail = 2) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const v = V(p.getX(i), p.getY(i), p.getZ(i)); const k = 1 + (Math.sin(v.x * 40 + v.y * 23) * 0.5 + Math.sin(v.z * 37 - v.y * 11) * 0.5) * 0.18 + (rnd() - 0.5) * 0.06; v.multiplyScalar(k); p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals();
  g.translate(c.x, c.y, c.z);
  return clean(g);
}
function arc(c: THREE.Vector3, rx: number, rz: number, a0: number, a1: number, axis: 'x' | 'y' | 'z', tube: number) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 10; i++) { const a = a0 + (a1 - a0) * (i / 10); const u = Math.cos(a) * rx, v = Math.sin(a) * rz; pts.push(axis === 'y' ? V(c.x + u, c.y, c.z + v) : axis === 'x' ? V(c.x, c.y + u, c.z + v) : V(c.x + u, c.y + v, c.z)); }
  return cord(pts, tube, 14, 4);
}

const HEAD = /head|skull|face|jaw|mouth|muzzle|snout|maw|beak/i;
const LIMB = /arm|leg|fore|hand|thigh|shin|calf|claw|finger|limb|upper|lower|hind|foot|paw|wing/i;
const BODY = /body|torso|chest|spine|pelvis|hip|belly|trunk|shell|rib|core|abdomen|thorax/i;

/**
 * Dress a freshly built rig as a display specimen. Returns the parts that
 * breathe (bodies) for the wing's idle loop.
 */
export function dressSpecimen(rig: Rig, sp: any): { breathe: THREE.Object3D[]; profile: Profile } {
  const P = profileOf(sp), M = mats();
  let seed = 0; for (const ch of String(sp.key)) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) >>> 0;
  const rnd = rngOf(seed + 7);
  const skinMat = M[P.skin] ?? M.flesh;
  const breathe: THREE.Object3D[] = [];
  const film = filmMat(P.wet);
  const parts = Object.entries(rig.parts);
  let teeth = P.teeth, eyes = P.eyes, ribs = P.ribs, spines = P.spines, tumors = P.tumors, nails = P.nails;
  const heads = parts.filter(([n]) => HEAD.test(n)), bodies = parts.filter(([n]) => BODY.test(n) && !HEAD.test(n)), limbs = parts.filter(([n]) => LIMB.test(n) && !HEAD.test(n));
  const fallbackBody = bodies.length ? bodies : [['body', rig.body] as [string, THREE.Object3D]];
  const add = (o: THREE.Object3D, key: string, list: THREE.BufferGeometry[]) => {
    if (!list.length) return;
    const g = mergeGeometries(list, false);
    if (!g) return;
    const m = new THREE.Mesh(g, M[key] ?? skinMat);
    m.castShadow = false; m.receiveShadow = false; m.userData.noGlow = true;
    o.add(m);
  };
  const boxOf = (o: THREE.Object3D): THREE.Box3 | null => {
    const mesh = o.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh | undefined;
    if (!mesh?.geometry) return null;
    mesh.geometry.computeBoundingBox();
    const b = mesh.geometry.boundingBox!.clone();
    return b.isEmpty() ? null : b;
  };
  // ---- the wet film over every rig mesh
  if (P.wet > 0.05) rig.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.film || !(m.geometry?.attributes?.normal)) return;
    if ((m.material as THREE.MeshBasicMaterial)?.isMeshBasicMaterial) return;
    const f = new THREE.Mesh(m.geometry, film);
    f.userData.film = true; f.userData.noGlow = true; f.renderOrder = 3;
    m.add(f);
  });
  // ---- heads: teeth on gums, extra eyes, drool, stitches
  heads.forEach(([, o], hi) => {
    const b = boxOf(o); if (!b) return;
    const c = b.getCenter(V(0, 0, 0)), s = b.getSize(V(0, 0, 0));
    const w = Math.max(0.02, s.x), h = Math.max(0.02, s.y), front = b.max.z;
    const bone: THREE.BufferGeometry[] = [], gum: THREE.BufferGeometry[] = [], eye: THREE.BufferGeometry[] = [], drool: THREE.BufferGeometry[] = [], sin: THREE.BufferGeometry[] = [];
    const n = hi === 0 ? teeth : Math.floor(teeth / 3);
    if (n > 0) {
      const jy = b.min.y + h * 0.28, rx = w * 0.38, rz = s.z * 0.18;
      const half = Math.ceil(n / 2);
      for (const row of [1, -1]) {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i < half; i++) {
          const a = Math.PI * (0.12 + 0.76 * (i / Math.max(1, half - 1)));
          const p = V(c.x + Math.cos(a) * rx, jy + row * h * 0.03, front - rz + Math.sin(a) * rz);
          pts.push(p);
          const len = h * (0.07 + rnd() * 0.08) * (i % 4 === 0 ? 1.5 : 1);
          bone.push(spike(p, V((rnd() - 0.5) * 0.3, -row, 0.25), Math.min(w, h) * 0.022, len, 4));
        }
        if (pts.length > 1) gum.push(cord(pts, Math.min(w, h) * 0.03, 16, 5));
      }
    }
    const ne = hi === 0 ? eyes : 0;
    for (let i = 0; i < ne; i++) {
      const p = V(c.x + (rnd() - 0.5) * w * 0.7, c.y + h * (0.05 + rnd() * 0.35), front - s.z * 0.04);
      const r = Math.min(w, h) * (0.05 + rnd() * 0.05);
      eye.push(clean(new THREE.SphereGeometry(r, 10, 8).translate(p.x, p.y, p.z)));
      gum.push(cord([V(p.x - r * 1.2, p.y, p.z - r * 0.2), V(p.x, p.y + r * 0.4, p.z + r * 0.3), V(p.x + r * 1.2, p.y, p.z - r * 0.2)], r * 0.25, 8, 4));
    }
    if (P.drool && hi === 0) for (let i = 0; i < 3; i++) {
      const x = c.x + (rnd() - 0.5) * w * 0.5, y = b.min.y + h * 0.2, z = front - s.z * 0.1, L = h * (0.4 + rnd() * 0.7);
      drool.push(cord([V(x, y, z), V(x + 0.005, y - L * 0.5, z + 0.01), V(x, y - L, z)], Math.min(w, h) * 0.008, 10, 4));
      drool.push(clean(new THREE.SphereGeometry(Math.min(w, h) * 0.02, 6, 5).scale(1, 1.4, 1).translate(x, y - L, z)));
    }
    if (P.stitches && hi === 0) {
      const y = b.min.y + h * 0.3;
      sin.push(cord([V(c.x - w * 0.3, y, front - 0.004), V(c.x, y - h * 0.02, front + 0.004), V(c.x + w * 0.3, y, front - 0.004)], h * 0.012, 14, 4));
      for (let i = 0; i < 9; i++) { const x = c.x - w * 0.27 + (i / 8) * w * 0.54; sin.push(cord([V(x - 0.003, y + h * 0.05, front - 0.002), V(x + 0.003, y - h * 0.05, front + 0.006)], h * 0.006, 2, 3)); }
    }
    add(o, 'bone', bone); add(o, 'gum', gum); add(o, 'eye', eye); add(o, 'drool', drool); add(o, 'sinew', sin);
  });
  // ---- bodies: ribs, spines, tumours, nails
  fallbackBody.forEach(([, o], bi) => {
    const b = boxOf(o); if (!b) return;
    breathe.push(o);
    const c = b.getCenter(V(0, 0, 0)), s = b.getSize(V(0, 0, 0));
    const sk: THREE.BufferGeometry[] = [], bone: THREE.BufferGeometry[] = [], sin: THREE.BufferGeometry[] = [], nail: THREE.BufferGeometry[] = [];
    const share = (n: number) => Math.ceil(n / fallbackBody.length);
    // the long axis: ribs wrap round it
    const long = s.y >= s.z ? 'y' : 'z';
    const nr = share(ribs);
    for (let i = 0; i < nr; i++) {
      const k = (i + 0.5) / nr;
      if (long === 'y') { const y = b.min.y + s.y * (0.35 + k * 0.5); bone.push(arc(V(c.x, y, c.z), s.x * 0.52, s.z * 0.52, -0.1, Math.PI + 0.1, 'y', Math.min(s.x, s.z) * 0.03)); }
      else { const z = b.min.z + s.z * (0.25 + k * 0.55); bone.push(arc(V(c.x, c.y, z), s.y * 0.52, s.x * 0.53, Math.PI * 0.55, Math.PI * 1.45, 'z', Math.min(s.x, s.y) * 0.03)); }
    }
    const ns = share(spines);
    for (let i = 0; i < ns; i++) {
      const k = (i + 0.5) / ns;
      const p = long === 'y' ? V(c.x, b.min.y + s.y * (0.2 + k * 0.75), b.min.z + s.z * 0.08) : V(c.x, b.max.y - s.y * 0.06, b.min.z + s.z * (0.1 + k * 0.8));
      const dir = long === 'y' ? V(0, 0.3, -1) : V(0, 1, -0.45);
      bone.push(spike(p, dir, Math.min(s.x, s.y, s.z) * 0.06, Math.max(s.x, s.y, s.z) * (0.08 + rnd() * 0.1), 5));
    }
    const nt = share(tumors);
    for (let i = 0; i < nt; i++) {
      const p = V(c.x + (rnd() - 0.5) * s.x * 0.9, c.y + (rnd() - 0.3) * s.y * 0.7, c.z + (rnd() - 0.5) * s.z * 0.9);
      sk.push(lump(p, Math.min(s.x, s.y, s.z) * (0.12 + rnd() * 0.14), rnd, P.skin === 'plaster' ? 0 : 2));
    }
    for (let i = 0; i < share(nails); i++) {
      const p = V(c.x + (rnd() - 0.5) * s.x, c.y + (rnd() - 0.5) * s.y, (rnd() < 0.5 ? b.max.z : b.min.z));
      const d = V(rnd() - 0.5, rnd() - 0.5, p.z > c.z ? 1 : -1);
      nail.push(spike(p.clone().addScaledVector(d.clone().normalize(), -0.02), d, 0.005, 0.05 + rnd() * 0.05, 4));
    }
    if (P.sinew > 0 && bi === 0) for (let i = 0; i < P.sinew; i++) {
      const x = c.x + (rnd() - 0.5) * s.x * 0.8;
      sin.push(cord([V(x, b.max.y - s.y * 0.05, c.z + s.z * 0.45), V(x + (rnd() - 0.5) * 0.04, c.y, b.max.z + s.z * 0.04), V(x, b.min.y + s.y * 0.1, c.z + s.z * 0.4)], Math.min(s.x, s.z) * 0.035, 16, 5));
    }
    add(o, P.skin === 'glass' || P.skin === 'static' ? 'bone' : P.skin, sk); add(o, P.skin === 'plaster' ? 'nail' : 'bone', bone); add(o, 'sinew', sin); add(o, 'nail', nail);
    teeth = Math.max(0, teeth); eyes = Math.max(0, eyes);
  });
  // ---- limbs: veins and sinew cords along the bone, a barb or two
  limbs.forEach(([, o]) => {
    const b = boxOf(o); if (!b) return;
    const c = b.getCenter(V(0, 0, 0)), s = b.getSize(V(0, 0, 0));
    const ax: 'x' | 'y' | 'z' = s.y >= s.x && s.y >= s.z ? 'y' : s.x >= s.z ? 'x' : 'z';
    const L = ax === 'y' ? s.y : ax === 'x' ? s.x : s.z, R = Math.max(0.006, (ax === 'y' ? Math.min(s.x, s.z) : ax === 'x' ? Math.min(s.y, s.z) : Math.min(s.x, s.y)) * 0.5);
    const along = (k: number, a: number, rr: number) => {
      const u = Math.cos(a) * rr, v = Math.sin(a) * rr;
      return ax === 'y' ? V(c.x + u, b.min.y + L * k, c.z + v) : ax === 'x' ? V(b.min.x + L * k, c.y + u, c.z + v) : V(c.x + u, c.y + v, b.min.z + L * k);
    };
    const vein: THREE.BufferGeometry[] = [], sin: THREE.BufferGeometry[] = [], bone: THREE.BufferGeometry[] = [];
    for (let i = 0; i < P.veins; i++) {
      const a0 = rnd() * 6.3, tw = (rnd() - 0.5) * 2.4;
      const pts = [0.05, 0.3, 0.55, 0.8, 0.97].map((k, j) => along(k, a0 + tw * k + Math.sin(j * 2.1) * 0.3, R * 0.98));
      vein.push(cord(pts, Math.max(0.0025, R * 0.07), 16, 4));
    }
    for (let i = 0; i < Math.min(2, P.sinew); i++) {
      const a0 = rnd() * 6.3;
      sin.push(cord([0.08, 0.5, 0.92].map((k) => along(k, a0 + k * 1.4, R * 1.02)), Math.max(0.004, R * 0.16), 16, 5));
    }
    if (P.spines > 4 && rnd() < 0.5) { const p = along(0.6, rnd() * 6.3, R); bone.push(spike(p, p.clone().sub(along(0.6, 0, 0)), R * 0.25, R * 1.4, 4)); }
    add(o, 'sinew', sin); add(o, P.skin === 'chitin' ? 'dark' : 'sinew', vein); add(o, 'bone', bone);
  });
  void spines; void ribs; void tumors; void nails;
  return { breathe, profile: P };
}

/** idle life for an on-screen specimen: breathing, and now and then a twitch somewhere */
export class SpecimenLife {
  private off = new Map<THREE.Object3D, THREE.Euler>();
  private next = 0.5 + Math.random() * 2;
  private hits: { o: THREE.Object3D; ax: number; amp: number; t: number }[] = [];
  constructor(private rig: Rig, private breathe: THREE.Object3D[], private P: Profile) {}
  /** undo last frame's offsets before the species animates (parts it does not pose would drift) */
  private dy = 0;
  before() { for (const [o, e] of this.off) { o.rotation.x -= e.x; o.rotation.y -= e.y; o.rotation.z -= e.z; } this.off.clear(); this.rig.body.position.y -= this.dy; this.dy = 0; }
  after(dt: number, t: number) {
    const b = Math.sin(t * (1.1 + this.P.breathe * 0.3)) * 0.022 * this.P.breathe;
    for (const o of this.breathe) { const e = this.offOf(o); e.x += b * 0.6; }
    this.dy = b * 0.04; this.rig.body.position.y += this.dy;
    this.next -= dt * this.P.twitch;
    if (this.next <= 0) {
      this.next = 0.8 + Math.random() * 3.5;
      const parts = Object.values(this.rig.parts);
      const n = Math.random() < 0.3 ? 3 : 1;
      for (let i = 0; i < n && parts.length; i++) this.hits.push({ o: parts[Math.floor(Math.random() * parts.length)], ax: Math.floor(Math.random() * 3), amp: (Math.random() - 0.5) * 0.5, t: 0 });
    }
    this.hits = this.hits.filter((h) => {
      h.t += dt;
      const k = Math.exp(-h.t * 9) * Math.sin(h.t * 60) * h.amp;
      const e = this.offOf(h.o);
      if (h.ax === 0) e.x += k; else if (h.ax === 1) e.y += k; else e.z += k;
      return h.t < 0.5;
    });
    for (const [o, e] of this.off) { o.rotation.x += e.x; o.rotation.y += e.y; o.rotation.z += e.z; }
  }
  private offOf(o: THREE.Object3D) { let e = this.off.get(o); if (!e) { e = new THREE.Euler(0, 0, 0); this.off.set(o, e); } return e; }
}
