// THE WING'S FURNITURE AS MODELS (round 26, part B): one model per kind in the stores (src/game/facilityStores.ts),
// registered for the facility map's dioramas (front/dioramas.ts registerFurnitureModel) and drawn the same way in
// build mode's catalogue and ghost. Three sources, all at true size, standing on y = 0, facing +Z:
//   the game's furniture kits (src/content/furniture): bunks, the hospital bed, the medical cabinet, the workbench,
//     the hydro rack and the welded planter (growing the farm's own crops), the CRT bank, the lab bench, shelves,
//     the sofa and armchair, the fridge, the vending machine, the floor lamp, plants
//   the Poly Haven lab props (public/props/lab via props/glb.ts): the tool chest, the welding cart, steel shelving
//     stocked, the storage cart, the radio
//   new ones in the room kit (scene/facet.ts) where nothing fitted: the armoury rack hung with the game's own
//     weapons, framed prints off the Institute's poster sheet, the rugs, the mess table, a terracotta pot of
//     almond thistle from the farm, the radio's side table
// Every model is centred on its footprint. modelOf(kind, mats) builds one (the catalogue and the ghost use it too).
import * as THREE from 'three';
import type { FMats } from '../../scene/pixtex';
import { FacetBuilder, at, cbox, prism, lathe, tube } from '../../scene/facet';
import { registerFurnitureModel, setFurnitureModelResolver } from '../dioramas';
import { enclosureModel, caseModel, jarModel } from './exhibits';
import { worldMaterial } from '../../../../gfx/materials';
import { ModelBuilder } from '../../../../gfx/modelBuilder';
import { drawPlant } from '../../../../game/economy/plantModels';
import { extMats, printTex } from './kit';
import { FURN } from '../../../../game/facilityStores';
import type { PrintKey } from '../../../../gfx/prints';

import { world, glb, menuWorldMat, itemModel, centre, shared } from './props3d';
export { menuWorldMat, itemModel };

function facet(mats: FMats, fn: (b: FacetBuilder) => void, extra = false): THREE.Group {
  const b = new FacetBuilder();
  fn(b);
  return b.build((extra ? extMats(mats) : mats) as unknown as FMats);
}

// ---------------------------------------------------------------- the new ones
function armoury(mats: FMats): THREE.Object3D {
  const g = facet(mats, (b) => {
    // a steel rack: two uprights on feet, a pegboard back in olive, a top rail, a lower shelf of ammunition tins
    for (const x of [-0.58, 0.58]) { b.add('metal', cbox(0.05, 1.85, 0.36, 0.01), 0x3a3e40, at(x, 0.925, -0.04)); b.add('metal', cbox(0.1, 0.04, 0.44, 0.01), 0x2a2e30, at(x, 0.02, 0)); }
    b.add('paint', cbox(1.14, 1.5, 0.03, 0.006), 0x4e5a3a, at(0, 1.08, -0.2), { rep: 0.3 });
    for (let i = 0; i < 9; i++) for (let k = 0; k < 11; k++) b.add('rubber', cbox(0.012, 0.012, 0.004, 0.001), 0x14160c, at(-0.5 + i * 0.125, 0.42 + k * 0.125, -0.183));
    b.add('metal', cbox(1.2, 0.05, 0.1, 0.01), 0x5a5e5a, at(0, 1.86, -0.12));
    b.add('metal', cbox(1.12, 0.04, 0.34, 0.01), 0x4a4e50, at(0, 0.3, -0.04));
    for (let i = 0; i < 3; i++) {
      b.add('paint', cbox(0.28, 0.17, 0.2, 0.012), 0x4a5a32, at(-0.36 + i * 0.36, 0.41, -0.04 + (i % 2) * 0.03));
      b.add('paint', cbox(0.12, 0.03, 0.005, 0.002), 0xd8c878, at(-0.36 + i * 0.36, 0.43, 0.064 + (i % 2) * 0.03));
      b.add('chrome', cbox(0.08, 0.02, 0.03, 0.006), 0xb0b0a8, at(-0.36 + i * 0.36, 0.5, -0.04 + (i % 2) * 0.03));
    }
    // the hooks the weapons hang from
    for (let i = 0; i < 5; i++) b.add('chrome', prism(0.008, 0.08, 5), 0xc0c0b8, at(-0.44 + i * 0.22, 1.72, -0.15, Math.PI / 2));
    // a padlocked chain across the front
    b.add('metal', tube([[-0.58, 1.1, 0.14], [0, 1.02, 0.16], [0.58, 1.1, 0.14]], 0.008, 8, 4, false), 0x6a6a64);
    b.add('brass', cbox(0.07, 0.09, 0.03, 0.01), 0xc89a3a, at(0.02, 0.98, 0.17));
  });
  const W = ['pipe', 'machete', 'crowbar', 'fire_axe', 'golf_club'];
  W.forEach((k, i) => {
    const m = itemModel(k);
    if (!m) return;
    m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox!, size = bb.getSize(new THREE.Vector3());
    // stand the longest axis up, hung from its hook
    const piv = new THREE.Group();
    piv.add(m);
    if (size.x >= size.y && size.x >= size.z) m.rotation.z = Math.PI / 2; else if (size.z >= size.y) m.rotation.x = Math.PI / 2;
    const box = new THREE.Box3().setFromObject(piv), c = box.getCenter(new THREE.Vector3());
    m.position.sub(c);
    piv.position.set(-0.44 + i * 0.22, 1.7 - (box.max.y - box.min.y) / 2, -0.12);
    piv.rotation.z = (i % 2 ? 0.04 : -0.04);
    g.add(shared(piv));
  });
  return g;
}
const PRINT: Record<string, PrintKey> = { print_focus: 'poster_focus', print_calm: 'poster_calm', print_kind: 'poster_kind', print_specimen: 'poster_specimen', chart: 'anatomy' };
/** a print in a thin black frame behind glass, its back on the wall (z = 0), its centre at eye height */
function framed(mats: FMats, key: PrintKey): THREE.Object3D {
  const W = 0.6, H = key === 'anatomy' ? 0.8 : 0.82, y = 1.55;
  const g = facet(mats, (b) => {
    b.add('wood', cbox(W + 0.06, H + 0.06, 0.03, 0.006), 0x1e1a16, at(0, y, 0.015));
    b.add('paint', cbox(W + 0.02, H + 0.02, 0.006, 0.002), 0xe8e0c8, at(0, y, 0.031));
    b.add('chrome', prism(0.004, 0.08, 4), 0x8a8a84, at(0, y + H / 2 + 0.07, 0.01, 0, 0, 0.6));
  });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.04, H - 0.04), new THREE.MeshStandardMaterial({ map: printTex(key), roughness: 0.75 }));
  p.position.set(0, y, 0.036); p.receiveShadow = true;
  const gl = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0.2, depthWrite: false }));
  gl.position.set(0, y, 0.04); gl.userData.noGlow = true;
  g.add(p, gl);
  return g;
}
function rug(mats: FMats, kind: 'kilim' | 'runner' | 'mat', w: number, d: number): THREE.Object3D {
  const h = kind === 'mat' ? 0.02 : 0.014;
  const geo = new THREE.BoxGeometry(w, h, d);
  const n = geo.attributes.position.count, col = new Float32Array(n * 3).fill(0.5);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, extMats(mats)[kind]);
  m.position.y = h / 2; m.receiveShadow = true;
  const g = kind === 'mat' ? new THREE.Group() : facet(mats, (b) => {
    for (const z of [-1, 1]) { const N = Math.round(w * 16); for (let i = 0; i < N; i++) b.add('sponge', cbox(0.012, 0.004, 0.05, 0.001), 0xe0d4b4, at(-w / 2 + 0.03 + i * (w - 0.06) / (N - 1), 0.004, z * (d / 2 + 0.024), 0, (i % 3 - 1) * 0.2, 0)); }
  });
  g.add(m);
  return g;
}
function table(mats: FMats): THREE.Object3D {
  return facet(mats, (b) => {
    b.add('enamel', cbox(0.95, 0.04, 0.9, 0.01), 0xe8e0c8, at(0, 0.74, 0));
    b.add('chrome', cbox(0.97, 0.02, 0.92, 0.004), 0xb8b8b0, at(0, 0.715, 0));
    b.add('chrome', prism(0.03, 0.7, 6), 0xc0c4c8, at(0, 0.36, 0));
    b.add('metal', lathe([[0, 0], [0.32, 0], [0.3, 0.03], [0, 0.03]], 8), 0x6a6e70, at(0, 0, 0));
    for (const [x, z, ry] of [[0, 0.62, 0], [0, -0.62, Math.PI]] as [number, number, number][]) {
      b.add('paint', cbox(0.4, 0.04, 0.38, 0.01), 0xc84a2a, at(x, 0.45, z, 0, ry, 0));
      b.add('paint', cbox(0.4, 0.36, 0.04, 0.01), 0xc84a2a, at(x, 0.66, z + (ry ? -0.18 : 0.18), 0, ry, 0));
      for (const sx of [-0.16, 0.16]) for (const sz of [-0.15, 0.15]) b.add('chrome', prism(0.012, 0.44, 5), 0xc0c4c8, at(x + sx, 0.22, z + sz));
    }
    b.add('enamel', lathe([[0, 0], [0.04, 0], [0.045, 0.09], [0, 0.09]], 8), 0xe8e4d8, at(0.2, 0.76, 0.1));
    b.add('paint', cbox(0.26, 0.004, 0.2, 0.001), 0xd8d0b0, at(-0.2, 0.762, -0.1, 0, 0.3, 0));
  });
}
function radio(mats: FMats): THREE.Object3D {
  const g = facet(mats, (b) => {
    b.add('wood', cbox(0.6, 0.04, 0.5, 0.01), 0x6a4a2a, at(0, 0.58, 0), { grain: 'x' });
    for (const sx of [-0.26, 0.26]) for (const sz of [-0.2, 0.2]) b.add('wood', cbox(0.04, 0.56, 0.04, 0.006), 0x5a3a20, at(sx, 0.28, sz));
    b.add('wood', cbox(0.52, 0.02, 0.42, 0.006), 0x5a3a20, at(0, 0.16, 0));
    b.add('paint', cbox(0.24, 0.004, 0.3, 0.001), 0xe8e0c8, at(-0.1, 0.17, 0, 0, 0.2, 0));
  });
  return glb('radio', mats, [0.02, 0.6, 0], 0, 1, g, false);
}
function pottedCrop(mats: FMats): THREE.Object3D {
  const g = facet(mats, (b) => {
    b.add('paint', lathe([[0, 0], [0.15, 0], [0.19, 0.34], [0.21, 0.36], [0.21, 0.4], [0, 0.4]], 10), 0xb85a3a, at(0, 0, 0));
    b.add('paint', lathe([[0, 0], [0.18, 0], [0, 0.01]], 10), 0x3a2a1a, at(0, 0.37, 0));
    b.add('paint', lathe([[0, 0], [0.22, 0], [0.22, 0.03], [0, 0.03]], 10), 0x8a4a2a, at(0, 0, 0));
  });
  const mb = new ModelBuilder();
  try { drawPlant(mb, 'thistle', 0, 0.38, 0, 4, false, 2); drawPlant(mb, 'moss', 0.08, 0.38, 0.05, 3, false, 5); } catch { /* the atlas is not up */ }
  if (!mb.isEmpty) { const m = new THREE.Mesh(mb.build(), menuWorldMat()); m.castShadow = true; m.scale.setScalar(1.25); m.position.y = 0.38 * (1 - 1.25); g.add(m); }
  return g;
}

// ---------------------------------------------------------------- the stores' models
const MAKE: Record<string, (m: FMats) => THREE.Object3D> = {
  bunk: () => world('bunk_bed'),
  cot: () => world('zw_cot'),
  hospbed: () => world('bed_hospital'),
  medcab: () => world('medical_cabinet'),
  workbench: () => world('workbench'),
  toolchest: (m) => glb('tool_chest', m),
  welder: (m) => glb('welder', m, [0, 0, 0], Math.PI / 2),
  hydro: () => world('bld_hydro', { crop: 'lamp_moss', stage: 4, water: 60 }),
  planter: () => world('bld_planter', { crop: 'almond_thistle', stage: 4, water: 60, tilled: 1 }),
  armoury,
  crtbank: () => world('crt_bank'),
  labbench: () => world('lab_bench'),
  bookshelf: () => world('bookshelf'),
  shelves: (m) => { const g = glb('shelves', m); glb('carton', m, [0, 0.135, 0], Math.PI / 2, 1, g, false); glb('toolbox', m, [0, 1.155, 0], 0.1, 1, g, false); glb('gallon', m, [-0.15, 0.625, 0.02], 0.3, 1, g, false); return g; },
  cart: (m) => glb('storage_cart', m, [0, 0, 0], Math.PI / 2),
  filing: () => world('filing_cabinet'),
  sofa: () => world('sofa'),
  armchair: () => world('armchair'),
  table,
  vending: () => world('vending_soda'),
  fridge: () => world('fridge'),
  radio,
  lamp: () => world('lamp_floor'),
  plant: pottedCrop,
  plant_tall: () => world('plant_tall'),
  rug_kilim: (m) => rug(m, 'kilim', 1.4, 1.9),
  rug_runner: (m) => rug(m, 'runner', 0.9, 2.4),
  rug_mat: (m) => rug(m, 'mat', 1.4, 0.9),
};
for (const k of Object.keys(PRINT)) MAKE[k] = (m) => framed(m, PRINT[k]);
Object.assign(MAKE, {
  radio_s: (m: FMats) => glb('radio', m), microscope: (m: FMats) => glb('microscope_old', m), kettle: (m: FMats) => glb('kettle', m),
  chemset: (m: FMats) => glb('chem_set', m), bunsen: (m: FMats) => glb('bunsen', m), plant_s: (m: FMats) => glb('plant_small', m), toolbox_s: (m: FMats) => glb('toolbox', m),
  // wall pieces: their backs on the wall (z = 0), facing +Z
  lamp_w: (m: FMats) => glb('wall_lamp', m, [0, 1.75, 0.08], 0, 1, new THREE.Group(), true),
  clock_w: (m: FMats) => facet(m, (b) => {
    b.add('wood', lathe([[0, 0], [0.17, 0], [0.17, 0.04], [0, 0.045]], 16), 0x5a3a20, at(0, 1.85, 0, Math.PI / 2));
    b.add('enamel', lathe([[0, 0], [0.15, 0], [0, 0.002]], 16), 0xf4f0e4, at(0, 1.85, 0.046, Math.PI / 2));
    for (let k = 0; k < 12; k++) b.add('rubber', cbox(0.008, 0.026, 0.002, 0.001), 0x14140f, at(Math.sin(k / 12 * Math.PI * 2) * 0.125, 1.85 + Math.cos(k / 12 * Math.PI * 2) * 0.125, 0.05, 0, 0, -k / 12 * Math.PI * 2));
    b.add('rubber', cbox(0.01, 0.09, 0.003, 0.001), 0x14140f, at(0.02, 1.88, 0.052, 0, 0, -0.5));
    b.add('paint', cbox(0.005, 0.12, 0.003, 0.001), 0xc8261e, at(-0.03, 1.83, 0.054, 0, 0, 2.2));
  }),
  shelf_w: (m: FMats) => facet(m, (b) => {
    b.add('wood', cbox(0.98, 0.035, 0.24, 0.006), 0x7a5a34, at(0, 1.4, 0.13), { grain: 'x' });
    for (const x of [-0.4, 0.4]) b.add('metal', cbox(0.025, 0.2, 0.2, 0.004, 0.6), 0x3a3a34, at(x, 1.3, 0.11));
  }),
});

/** a kind's model (a crate if it has none): the stores' and the exhibits ('encl:', 'case:', 'jar:') */
export function modelOf(kind: string, mats: FMats): THREE.Object3D {
  const [pre, key] = kind.split(':');
  if (key) { try { return pre === 'encl' ? enclosureModel(key, mats) : pre === 'jar' ? jarModel(key, mats) : caseModel(key, mats); } catch (e) { console.warn('[exhibit model]', kind, e); } }
  const f = MAKE[kind];
  if (f) { try { return f(mats); } catch (e) { console.warn('[facility model]', kind, e); } }
  return facet(mats, (b) => b.add('wood', cbox(0.5, 0.4, 0.4, 0.02), 0xa88a5a, at(0, 0.2, 0)));
}
let done = false;
/** register every kind in the stores with the dioramas (once) */
export function installFurnitureModels() {
  if (done) return;
  done = true;
  for (const f of FURN) registerFurnitureModel(f.kind, (m) => modelOf(f.kind, m));
  setFurnitureModelResolver((kind, m) => (kind.includes(':') ? modelOf(kind, m) : null));
}
