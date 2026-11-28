// THE ZOO AND THE MUSEUM OF THE LIMINAL (round 26, part B): the exhibits a restored room (or a new annex wing) can
// hold, as models for the dioramas, build mode's strip and its ghost.
//   ENCLOSURE  'encl:<inhabitant>'  a glass-fronted habitat on a concrete curb: a corner of the levels inside (yellow
//              wallpaper and its damp carpet, straw, moss, a pool, drifts of paper, by the inhabitant), a fluorescent
//              fixture over it, a lamp hood lighting it from above, glints on the glass, the keepers' raised grate
//              walkway and rail behind, a brass plaque (an icon, no words); the inhabitant itself inside, alive
//              (its own rig from src/creatures/species and its own animation)
//   CASE       'case:<item>'        a find from a run in a brass-cornered vitrine on a panelled plinth, turning slowly on
//              a stand over red velvet under the case's own light
//   SPECIMEN   'jar:<inhabitant>'   a tall jar of glowing preserving fluid on a steel stand, the inhabitant suspended in
//              it, bubbles rising
// The creature loads with its species module (once); until then the habitat stands empty.
import * as THREE from 'three';
import type { FMats } from '../../scene/pixtex';
import { FacetBuilder, at, cbox, prism, lathe, jitter, gem } from '../../scene/facet';
import { extMats } from './kit';
import { itemModel } from './props3d';
import { ZOO_BY, type ZooSp } from '../../../../game/facilityStores';

type AnyRig = { root: THREE.Object3D };
type Sp = { build(): AnyRig; animateGallery?: (rig: AnyRig, t: number) => void };
const LOAD: Record<string, () => Promise<unknown>> = {
  moon_calf: () => import('../../../../creatures/species/moon_calf'), pale_hen: () => import('../../../../creatures/species/pale_hen'),
  hum_possum: () => import('../../../../creatures/species/hum_possum'), lumenmoth: () => import('../../../../creatures/species/lumenmoth'),
  tallow_pigeon: () => import('../../../../creatures/species/tallow_pigeon'), plushkin: () => import('../../../../creatures/species/plushkin'),
  carpet_grub: () => import('../../../../creatures/species/carpet_grub'), paper_grazer: () => import('../../../../creatures/species/paper_grazer'),
  spore_rat: () => import('../../../../creatures/species/spore_rat'), salamander: () => import('../../../../creatures/species/salamander'),
  stilt_gull: () => import('../../../../creatures/species/stilt_gull'), whip_rat: () => import('../../../../creatures/species/whip_rat'),
  battering_hare: () => import('../../../../creatures/species/battering_hare'), gaunt_wolf: () => import('../../../../creatures/species/gaunt_wolf'),
};
const loaded = new Map<string, Promise<Sp | null>>();
function speciesOf(z: ZooSp): Promise<Sp | null> {
  let p = loaded.get(z.key);
  if (!p) {
    p = (LOAD[z.mod]?.() ?? Promise.resolve()).then(() => import('../../../../creatures/registry')).then((r) => (r.species(z.key) as unknown as Sp) ?? null).catch((e) => { console.warn('[exhibit]', z.key, e); return null; });
    loaded.set(z.key, p);
  }
  return p;
}
/** the inhabitant, built and fitted to a height, standing at the origin of `g`; animates through g.userData.tick */
function inhabit(g: THREE.Group, z: ZooSp, fit: number, still = false) {
  void speciesOf(z).then((sp) => {
    if (!sp) return;
    let rig: AnyRig;
    try { rig = sp.build(); } catch (e) { console.warn('[exhibit] build', z.key, e); return; }
    const k = Math.min(1.6, fit / Math.max(0.05, z.h));
    rig.root.scale.multiplyScalar(k);
    rig.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; } });
    g.add(rig.root);
    let ph = Math.random() * 10;
    const anim = sp.animateGallery;
    g.userData.tick = (t: number) => {
      if (still) { rig.root.position.y = Math.sin(t * 0.6 + ph) * 0.01; rig.root.rotation.y = Math.sin(t * 0.2 + ph) * 0.15; return; }
      try { anim?.(rig, t + ph); } catch { ph = 0; }
      // a slow pace up and down its habitat
      rig.root.position.x = Math.sin((t + ph) * 0.18) * 0.35; rig.root.rotation.y = Math.cos((t + ph) * 0.18) > 0 ? Math.PI / 2 : -Math.PI / 2;
    };
  });
}

const HAB: Record<ZooSp['hab'], { floor: number; mat: string; dress: (b: FacetBuilder, R: () => number) => void }> = {
  carpet: { floor: 0xb8a050, mat: 'carpet', dress: (b, R) => { for (let i = 0; i < 5; i++) b.add('rubber', jitter(cbox(0.2, 0.004, 0.14, 0.002), 0.02, i), 0x3a3010, at(-0.7 + R() * 1.4, 0.21, -0.2 + R() * 0.5)); b.add('paint', cbox(0.58, 0.02, 0.58, 0.004), 0xa89c80, at(0.5, 0.22, 0.1, 0.1, 0.5, 0.05)); } },
  straw: { floor: 0xa88a4a, mat: 'carpet', dress: (b, R) => { for (let i = 0; i < 40; i++) b.add('wood', cbox(0.12, 0.006, 0.01, 0.002), [0xd8b860, 0xc8a050, 0xe8c870][i % 3], at(-0.8 + R() * 1.6, 0.215 + R() * 0.02, -0.3 + R() * 0.6, 0, R() * 3, 0)); b.add('wood', cbox(0.5, 0.18, 0.14, 0.01), 0x7a5a34, at(-0.6, 0.29, -0.3), { grain: 'x' }); b.add('metal', lathe([[0, 0], [0.14, 0], [0.16, 0.08], [0, 0.08]], 10), 0x8a9294, at(0.6, 0.2, -0.25)); } },
  moss: { floor: 0x4a5a2a, mat: 'carpet', dress: (b, R) => { for (let i = 0; i < 22; i++) b.add('leather', gem(0.05 + R() * 0.06, 5, 0.04), [0x5a8a3a, 0x3a6a2a, 0x7aa84a][i % 3], at(-0.8 + R() * 1.6, 0.21, -0.35 + R() * 0.7)); b.add('wood', cbox(0.9, 0.1, 0.12, 0.03), 0x4a3424, at(0.1, 0.27, -0.3, 0, 0.3, 0.1)); } },
  tile: { floor: 0xd8dcd0, mat: 'tile', dress: (b) => { b.add('metal', cbox(0.22, 0.04, 0.22, 0.006), 0x5a5e5a, at(0.4, 0.22, 0)); b.add('enamel', lathe([[0, 0], [0.12, 0], [0.14, 0.07], [0, 0.07]], 10), 0xe8e4d8, at(-0.6, 0.2, -0.2)); } },
  water: { floor: 0x5a6a5a, mat: 'tile', dress: (b, R) => { b.add('glass', cbox(1.2, 0.01, 0.6, 0.004), 0x3a6a8a, at(0.1, 0.215, 0.05)); b.add('rubber', cbox(1.24, 0.004, 0.64, 0.002), 0x0a1418, at(0.1, 0.209, 0.05)); for (let i = 0; i < 9; i++) b.add('leather', prism(0.01, 0.3 + R() * 0.3, 4), 0x4a6a2a, at(-0.6 + R() * 0.3, 0.35, -0.3 + R() * 0.2, (R() - 0.5) * 0.3, 0, (R() - 0.5) * 0.3)); } },
  paper: { floor: 0xc8c0a8, mat: 'carpet', dress: (b, R) => { for (let i = 0; i < 28; i++) b.add('paint', cbox(0.14, 0.003, 0.2, 0.001), [0xece4cc, 0xe0d8b8, 0xf4f0e0][i % 3], at(-0.8 + R() * 1.6, 0.212 + i * 0.0015, -0.35 + R() * 0.7, 0, R() * 6, 0)); } },
};

/** an exhibit enclosure for one inhabitant (2.0 x 1.5 m, front to +Z) */
export function enclosureModel(key: string, mats: FMats): THREE.Object3D {
  const z = ZOO_BY.get(key);
  const g = new THREE.Group();
  if (!z) return g;
  let s = key.length * 977;
  const R = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  const b = new FacetBuilder(), h = HAB[z.hab], W = 1.94, D = 1.06, cz = 0.18, H = 1.36, top = 0.2 + H;
  // the curb and the habitat floor in it
  b.add('concrete', cbox(2.0, 0.2, 1.16, 0.02), 0x8a867e, at(0, 0.1, cz), { rep: 0.8 });
  b.add('hazard', cbox(1.9, 0.05, 0.006, 0.001), 0xffffff, at(0, 0.06, cz + 0.582));
  b.add(h.mat as never, cbox(W - 0.06, 0.012, D - 0.06, 0.003), h.floor, at(0, 0.206, cz), { rep: 0.5 });
  // the back of the habitat: a corner of the levels, yellow paper over a skirting, a fluorescent fixture on a drop rod
  b.add('wallpaper' as never, cbox(W - 0.06, H - 0.12, 0.04, 0.004), 0xd0b860, at(0, 0.2 + (H - 0.12) / 2, cz - D / 2 + 0.04), { rep: 0.5 });
  b.add('wood', cbox(W - 0.06, 0.08, 0.05, 0.006), 0x6a5434, at(0, 0.25, cz - D / 2 + 0.06));
  for (let i = 0; i < 3; i++) b.add('rubber', jitter(cbox(0.2 + R() * 0.2, 0.25 + R() * 0.3, 0.003, 0.001), 0.02, i), 0x6a5a2a, at(-0.6 + i * 0.6 + R() * 0.2, 0.45 + R() * 0.4, cz - D / 2 + 0.062));
  b.add('enamel', cbox(0.7, 0.05, 0.14, 0.01), 0xd8d4c4, at(0, top - 0.22, cz - 0.1));
  b.add('lamp', cbox(0.64, 0.012, 0.09, 0.003), 0xa8ac9c, at(0, top - 0.25, cz - 0.1));
  for (const x of [-0.3, 0.3]) b.add('metal', prism(0.005, 0.18, 4), 0x3a3a3a, at(x, top - 0.11, cz - 0.1));
  h.dress(b, R);
  // the frame: corner posts, a top ring, mullions; a lamp hood along the front edge throwing light down into it
  for (const [x, zz] of [[-W / 2, cz - D / 2], [W / 2, cz - D / 2], [-W / 2, cz + D / 2], [W / 2, cz + D / 2]] as [number, number][]) b.add('metal', cbox(0.05, H, 0.05, 0.008), 0x2e3236, at(x, 0.2 + H / 2, zz));
  b.add('metal', cbox(W + 0.05, 0.06, 0.05, 0.008), 0x2e3236, at(0, top, cz + D / 2));
  b.add('metal', cbox(W + 0.05, 0.06, 0.05, 0.008), 0x2e3236, at(0, top, cz - D / 2));
  for (const x of [-1, 1]) b.add('metal', cbox(0.05, 0.06, D, 0.008), 0x2e3236, at(x * W / 2, top, cz));
  b.add('metal', cbox(0.03, H, 0.03, 0.006), 0x2e3236, at(0, 0.2 + H / 2, cz + D / 2));
  b.add('metal', cbox(W * 0.9, 0.1, 0.16, 0.02), 0x3a3e40, at(0, top + 0.06, cz + D / 2 - 0.1));
  b.add('lamp', cbox(W * 0.86, 0.01, 0.1, 0.003), 0x9a9080, at(0, top + 0.005, cz + D / 2 - 0.1));
  // the glass (front and sides) with long glints across it
  b.add('glass', cbox(W - 0.04, H - 0.04, 0.012, 0.002), 0x9ab8c8, at(0, 0.2 + H / 2, cz + D / 2));
  for (const x of [-1, 1]) b.add('glass', cbox(0.012, H - 0.04, D - 0.04, 0.002), 0x9ab8c8, at(x * W / 2, 0.2 + H / 2, cz));
  for (let i = 0; i < 3; i++) b.add('lamp', cbox(0.012, 0.55 - i * 0.12, 0.002, 0.001), 0x6a7a80, at(-0.6 + i * 0.09, 0.85 + i * 0.05, cz + D / 2 + 0.008, 0, 0, -0.55));
  b.add('lamp', cbox(0.008, 0.4, 0.002, 0.001), 0x5a6a70, at(0.55, 0.9, cz + D / 2 + 0.008, 0, 0, -0.55));
  // the keepers' walkway behind: a raised grate, posts, a yellow rail, a hatch in the back glass
  b.add('metal', cbox(2.0, 0.04, 0.3, 0.006), 0x5a5e5a, at(0, 0.3, -0.58));
  for (let i = 0; i < 12; i++) b.add('rubber', cbox(0.012, 0.042, 0.28, 0.001), 0x1a1c1a, at(-0.95 + i * 0.172, 0.302, -0.58));
  for (const x of [-0.98, 0, 0.98]) { b.add('metal', cbox(0.04, 0.3, 0.04, 0.006), 0x3a3e40, at(x, 0.15, -0.58)); b.add('paint', prism(0.014, 0.85, 6), 0xd8a820, at(x, 0.72, -0.72)); }
  b.add('paint', cbox(2.0, 0.03, 0.03, 0.008), 0xd8a820, at(0, 1.14, -0.72));
  b.add('metal', cbox(0.5, 0.7, 0.02, 0.006), 0x3a3e40, at(0.55, 0.65, cz - D / 2 - 0.01));
  // the plaque: brass with a paw engraved and an enamel band for its danger (green to red)
  b.add('brass', cbox(0.32, 0.1, 0.012, 0.003), 0xc8a050, at(-0.6, 0.12, cz + 0.586));
  b.add('enamel', cbox(0.06, 0.06, 0.004, 0.001), [0x3a9a4a, 0x7ab03a, 0xc8b030, 0xd88a2a, 0xc84a2a, 0x9a1a1a][Math.min(5, z.threat)], at(-0.71, 0.12, cz + 0.594));
  b.add('rubber', gem(0.016, 6, 0.008), 0x4a3418, at(-0.56, 0.11, cz + 0.594));
  for (let i = 0; i < 4; i++) b.add('rubber', gem(0.008, 5, 0.006), 0x4a3418, at(-0.58 + i * 0.013, 0.135, cz + 0.594));
  g.add(b.build(extMats(mats) as unknown as FMats));
  const pen = new THREE.Group(); pen.position.set(0, 0.215, cz + 0.05); g.add(pen);
  inhabit(pen, z, 0.85);
  g.userData.tick = (t: number, dt: number) => (pen.userData.tick as ((t: number, dt: number) => void) | undefined)?.(t, dt);
  return g;
}

/** a find in a vitrine (0.75 x 0.75 m) */
export function caseModel(item: string, mats: FMats): THREE.Object3D {
  const g = new THREE.Group(), b = new FacetBuilder();
  b.add('paint', cbox(0.6, 0.86, 0.6, 0.02), 0x2a3a2e, at(0, 0.43, 0), { rep: 0.4 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('brass', cbox(0.03, 0.86, 0.03, 0.006), 0xb8903a, at(sx * 0.3, 0.43, sz * 0.3));
  b.add('wood', cbox(0.66, 0.05, 0.66, 0.01), 0x4a2e1a, at(0, 0.885, 0));
  b.add('sponge', cbox(0.5, 0.03, 0.5, 0.01), 0x7a1a1a, at(0, 0.925, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('brass', cbox(0.025, 0.52, 0.025, 0.004), 0xc8a050, at(sx * 0.265, 1.17, sz * 0.265));
  // the top: a brass frame round a glass lid (the find stays in view from above), its lamp along the back edge
  for (const z of [-0.28, 0.28]) b.add('brass', cbox(0.6, 0.035, 0.04, 0.008), 0xc8a050, at(0, 1.45, z));
  for (const x of [-0.28, 0.28]) b.add('brass', cbox(0.04, 0.035, 0.6, 0.008), 0xc8a050, at(x, 1.45, 0));
  b.add('glass', cbox(0.52, 0.006, 0.52, 0.002), 0x9ab8c8, at(0, 1.44, 0));
  b.add('brass', cbox(0.5, 0.05, 0.08, 0.01), 0xb8903a, at(0, 1.47, -0.24));
  b.add('lamp', cbox(0.42, 0.006, 0.05, 0.002), 0x9a8a68, at(0, 1.44, -0.24));
  b.add('glass', cbox(0.52, 0.5, 0.52, 0.002), 0x9ab8c8, at(0, 1.17, 0));
  b.add('lamp', cbox(0.008, 0.3, 0.002, 0.001), 0x6a7a80, at(-0.12, 1.2, 0.262, 0, 0, -0.5));
  b.add('brass', lathe([[0, 0], [0.05, 0], [0.03, 0.04], [0.015, 0.14], [0, 0.14]], 8), 0xc8a050, at(0, 0.94, 0));
  b.add('brass', cbox(0.24, 0.08, 0.01, 0.003), 0xc8a050, at(0, 0.7, 0.302));
  b.add('rubber', gem(0.014, 6, 0.006), 0x4a3418, at(0, 0.7, 0.308));
  g.add(b.build(mats));
  const m = itemModel(item);
  if (m) {
    m.geometry.computeBoundingBox();
    const size = m.geometry.boundingBox!.getSize(new THREE.Vector3()), c = m.geometry.boundingBox!.getCenter(new THREE.Vector3());
    const k = 0.34 / Math.max(size.x, size.y, size.z, 0.05);
    const piv = new THREE.Group(); piv.position.set(0, 1.08 + 0.17, 0);
    m.position.set(-c.x * k, -c.y * k, -c.z * k); m.scale.setScalar(k);
    piv.add(m); g.add(piv);
    piv.userData.shared = true; m.userData.shared = true;
    g.userData.tick = (t: number) => { piv.rotation.y = t * 0.4; };
  }
  return g;
}

/** a specimen in a jar of preserving fluid (0.5 x 0.5 m, small: it stands on a desk or a shelf) */
export function jarModel(key: string, mats: FMats): THREE.Object3D {
  const z = ZOO_BY.get(key), g = new THREE.Group(), b = new FacetBuilder();
  b.add('metal', lathe([[0, 0], [0.2, 0], [0.2, 0.05], [0.17, 0.07], [0, 0.07]], 12), 0x3a3e40, at(0, 0, 0));
  b.add('glass', lathe([[0, 0], [0.16, 0], [0.17, 0.05], [0.17, 0.5], [0.12, 0.56], [0, 0.56]], 14), 0xa8d8c8, at(0, 0.07, 0));
  b.add('lamp', lathe([[0, 0], [0.155, 0], [0.16, 0.05], [0.16, 0.44], [0, 0.44]], 14), 0x4a6a2a, at(0, 0.075, 0));
  b.add('brass', lathe([[0, 0], [0.13, 0], [0.13, 0.04], [0.06, 0.06], [0, 0.06]], 12), 0xc8a050, at(0, 0.62, 0));
  b.add('paint', cbox(0.12, 0.08, 0.004, 0.002), 0xe8e0c8, at(0, 0.2, 0.172));
  b.add('brass', cbox(0.1, 0.02, 0.006, 0.002), 0xc8a050, at(0, 0.02, 0.2));
  g.add(b.build(mats));
  const susp = new THREE.Group(); susp.position.set(0, 0.16, 0); g.add(susp);
  if (z) inhabit(susp, z, 0.3, true);
  const bub = new THREE.Mesh(new THREE.SphereGeometry(0.008, 5, 4), new THREE.MeshBasicMaterial({ color: 0xd8ffb0, toneMapped: false }));
  bub.userData.noGlow = true; g.add(bub);
  g.userData.tick = (t: number, dt: number) => { (susp.userData.tick as ((t: number, dt: number) => void) | undefined)?.(t, dt); const k = (t * 0.3) % 1; bub.position.set(Math.sin(t * 2) * 0.05, 0.1 + k * 0.4, 0.06); };
  return g;
}
