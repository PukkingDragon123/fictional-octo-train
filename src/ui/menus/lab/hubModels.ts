// THE FACILITY UPGRADES AS MODELS (round 27): what a facility node (src/game/facilityTree.ts) puts in the lab hub,
// on the lattice's plinth and in its preview. Most are the furniture round 26 modelled for the wing
// (../front/build/models.ts modelOf: the bunk, the hospital bed, the CRT bank, the cases and the enclosure...);
// the transport line and the fittings are new, faceted in the lab's own kit (scene/facet.ts):
//   lift     a caged freight lift: a steel deck on a scissor base, mesh sides, a hazard gate, a pulley head
//   drone    a courier drone: four ducted rotors on a carbon frame, a lamp, a crate in its sling
//   van      the armoured van: plate-steel body in Institute green, riveted, slit windows, a strongbox door
//   trough   a daylight trough: a white reflector and two tubes on chains
//   epoxy    a square of the new floor: tile ground flat under a clear glossy coat, a squeegee on it
// sync: true gives a model built at once (the lattice merges its meshes; Poly Haven props load later, so the
// kinds that use them have a world-model stand-in here).
import * as THREE from 'three';
import type { FMats } from '../scene/pixtex';
import { FacetBuilder, at, cbox, prism, lathe, tube, bolt, C } from '../monitor/props';
import { modelOf } from '../front/build/models';
import { world } from '../front/build/props3d';

const build = (mats: FMats, fn: (b: FacetBuilder) => void) => { const b = new FacetBuilder(); fn(b); return b.build(mats); };

function lift(mats: FMats): THREE.Object3D {
  return build(mats, (b) => {
    // the deck: chequer plate on a steel frame, a scissor base under it
    b.add('metal', cbox(1.3, 0.08, 1.1, 0.01), 0x6a6e70, at(0, 0.36, 0));
    b.add('hazard', cbox(1.32, 0.05, 1.12, 0.004), 0xffffff, at(0, 0.3, 0), { rep: 0.2 });
    for (const s of [-1, 1]) for (const a of [-0.5, 0.5]) b.add('metal', cbox(0.05, 0.05, 1.05, 0.006), 0x3a3e40, at(s * 0.55, 0.17, 0, a));
    b.add('metal', cbox(1.36, 0.06, 1.16, 0.008), 0x2a2e30, at(0, 0.03, 0));
    // mesh sides on corner posts, a gate of hazard bars at the front
    for (const [x, z] of [[-0.62, -0.52], [0.62, -0.52], [-0.62, 0.52], [0.62, 0.52]]) b.add('metal', cbox(0.05, 1.9, 0.05, 0.006), 0x8a9094, at(x, 1.35, z));
    for (const s of [-1, 1]) for (let i = 0; i < 9; i++) b.add('metal', cbox(0.012, 1.7, 0.012, 0.002), 0x9aa0a4, at(s * 0.62, 1.3, -0.45 + i * 0.112));
    for (let i = 0; i < 11; i++) b.add('metal', cbox(0.012, 1.7, 0.012, 0.002), 0x9aa0a4, at(-0.55 + i * 0.11, 1.3, -0.52));
    // the front gate is up: a hazard-striped bar and a mesh leaf folded under the head
    b.add('paint', cbox(1.2, 0.05, 0.04, 0.008), 0xe8c030, at(0, 1.98, 0.54), { rep: 0.3 });
    b.add('hazard', cbox(1.2, 0.07, 0.045, 0.004), 0xffffff, at(0, 2.1, 0.54), { rep: 0.2 });
    for (let i = 0; i < 11; i++) b.add('metal', cbox(0.012, 0.22, 0.012, 0.002), 0x9aa0a4, at(-0.55 + i * 0.11, 2.12, 0.5));
    // the head: a cross beam, a pulley drum, cables down to the deck
    b.add('metal', cbox(1.36, 0.12, 1.16, 0.012), 0x4a5052, at(0, 2.32, 0));
    b.add('metal', lathe([[0, 0], [0.12, 0], [0.12, 0.16], [0, 0.16]], 12), 0x2a2e30, at(0, 2.38, -0.08, 0, 0, Math.PI / 2));
    for (const x of [-0.4, 0.4]) b.add('chrome', prism(0.008, 1.9, 6), 0xc8ccd0, at(x, 1.38, -0.4));
    b.add('lamp', cbox(0.06, 0.04, 0.04, 0.01), 0xffb030, at(0.55, 2.42, 0.5));
    for (const [x, z] of [[-0.62, -0.52], [0.62, -0.52], [-0.62, 0.52], [0.62, 0.52]]) b.add('chrome', bolt(0.012, 0.01), C.steel, at(x, 2.28, z));
  });
}

function drone(mats: FMats): THREE.Object3D {
  return build(mats, (b) => {
    // the frame: a carbon cross, a yellow enamel hull, a lamp and a camera ball under the nose
    for (const a of [Math.PI / 4, -Math.PI / 4]) b.add('rubber', cbox(0.9, 0.035, 0.06, 0.006), 0x1a1a1c, at(0, 0.62, 0, a));
    b.add('enamel', cbox(0.34, 0.12, 0.28, 0.03), 0xd8a030, at(0, 0.64, 0));
    b.add('hazard', cbox(0.342, 0.03, 0.282, 0.004), 0xffffff, at(0, 0.6, 0), { rep: 0.12 });
    b.add('glass', lathe([[0, 0], [0.05, 0.01], [0.05, 0.05], [0, 0.07]], 10), 0x2a3a4a, at(0, 0.53, 0.12));
    b.add('lamp', cbox(0.06, 0.02, 0.01, 0.004), 0x7aff9a, at(0, 0.66, 0.145));
    // four ducted rotors
    for (const [x, z] of [[0.32, 0.32], [-0.32, 0.32], [0.32, -0.32], [-0.32, -0.32]]) {
      b.add('metal', lathe([[0.15, 0], [0.17, 0], [0.17, 0.07], [0.15, 0.07]], 14), 0x3a3e40, at(x, 0.6, z));
      b.add('rubber', cbox(0.27, 0.006, 0.035, 0.002), 0x2a2a2a, at(x, 0.64, z, 0.6));
      b.add('chrome', prism(0.02, 0.04, 8), 0xc8ccd0, at(x, 0.64, z));
    }
    // the sling and its crate
    for (const [x, z] of [[-0.12, -0.1], [0.12, -0.1], [-0.12, 0.1], [0.12, 0.1]]) b.add('rubber', tube([[x * 0.6, 0.58, z * 0.6], [x * 1.4, 0.32, z * 1.4]], 0.006, 4, 2), 0x1a1a1a);
    b.add('wood', cbox(0.36, 0.26, 0.3, 0.012), 0xb08a52, at(0, 0.17, 0));
    b.add('paint', cbox(0.364, 0.05, 0.304, 0.004), 0x3a5a3a, at(0, 0.2, 0));
    // the charging pad it stands over
    b.add('metal', cbox(0.9, 0.04, 0.9, 0.01), 0x3a3e40, at(0, 0.02, 0));
    b.add('hazard', cbox(0.92, 0.012, 0.06, 0.003), 0xffffff, at(0, 0.045, 0.43), { rep: 0.15 });
    b.add('hazard', cbox(0.92, 0.012, 0.06, 0.003), 0xffffff, at(0, 0.045, -0.43), { rep: 0.15 });
  });
}

function van(mats: FMats): THREE.Object3D {
  return build(mats, (b) => {
    const G = 0x4e6a46, D = 0x2a3a28;
    // the body: a slab-sided plate box, a lower cab at the front, a raked bonnet
    b.add('paint', cbox(2.2, 1.25, 1.4, 0.05), G, at(-0.3, 1.05, 0), { rep: 0.4 });
    b.add('paint', cbox(0.9, 0.95, 1.36, 0.05), G, at(1.2, 0.9, 0), { rep: 0.4 });
    b.add('paint', cbox(0.5, 0.45, 1.3, 0.04), D, at(1.78, 0.66, 0));
    // slit windows and the windscreen's armoured louvres
    b.add('glass', cbox(0.04, 0.2, 1.1, 0.01), 0x2a3a4a, at(1.66, 1.18, 0, 0, 0, -0.35));
    for (let i = 0; i < 4; i++) b.add('metal', cbox(0.05, 0.03, 1.14, 0.004), 0x3a3e40, at(1.68 - i * 0.012, 1.1 + i * 0.07, 0, 0, 0, -0.35));
    for (const s of [-1, 1]) b.add('glass', cbox(0.36, 0.1, 0.02, 0.004), 0x2a3a4a, at(1.18, 1.2, s * 0.69));
    // plates and rivets, a hazard bumper, the strongbox doors at the back with their wheel lock
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) b.add('metal', cbox(0.5, 1.0, 0.012, 0.004), i % 2 ? G : 0x4a6442, at(-1.15 + i * 0.55, 1.05, s * 0.706));
    for (const s of [-1, 1]) for (let i = 0; i < 12; i++) b.add('chrome', bolt(0.012, 0.008), C.steel, at(-1.35 + i * 0.2, 1.62, s * 0.712, Math.PI / 2));
    b.add('hazard', cbox(0.1, 0.18, 1.44, 0.01), 0xffffff, at(2.06, 0.42, 0), { rep: 0.2 });
    b.add('metal', cbox(0.04, 1.1, 1.2, 0.01), 0x3a4a36, at(-1.42, 1.05, 0));
    b.add('chrome', lathe([[0, 0], [0.12, 0], [0.12, 0.03], [0, 0.03]], 10), 0xc8ccd0, at(-1.45, 1.05, 0, 0, 0, Math.PI / 2));
    b.add('lamp', cbox(0.02, 0.08, 0.2, 0.01), 0xfff0c0, at(2.04, 0.74, 0.48));
    b.add('lamp', cbox(0.02, 0.08, 0.2, 0.01), 0xfff0c0, at(2.04, 0.74, -0.48));
    b.add('lamp', cbox(0.1, 0.06, 0.1, 0.01), 0xffa020, at(1.2, 1.42, 0.4));
    // wheels: fat tyres, steel hubs
    for (const x of [-1.0, 1.35]) for (const s of [-1, 1]) {
      b.add('rubber', lathe([[0, 0], [0.34, 0], [0.36, 0.03], [0.36, 0.23], [0.34, 0.26], [0, 0.26]], 14), 0x141414, at(x, 0.36, s * 0.62 - (s > 0 ? 0 : 0.26), Math.PI / 2));
      b.add('metal', lathe([[0, 0], [0.18, 0], [0.18, 0.02], [0, 0.02]], 10), 0x8a9094, at(x, 0.36, s * 0.62 + (s > 0 ? 0.26 : -0.28), Math.PI / 2));
    }
  });
}

function trough(mats: FMats): THREE.Object3D {
  return build(mats, (b) => {
    b.add('enamel', cbox(1.25, 0.06, 0.32, 0.01), 0xf4f4ee, at(0, 1.5, 0));
    for (const s of [-1, 1]) b.add('enamel', cbox(1.25, 0.12, 0.02, 0.004), 0xe8e8e2, at(0, 1.44, s * 0.16, s * 0.5));
    for (const z of [-0.06, 0.06]) b.add('lamp', prism(0.022, 1.15, 8), 0xf4f8ff, at(0, 1.43, z, 0, 0, Math.PI / 2));
    for (const x of [-0.5, 0.5]) b.add('chrome', prism(0.006, 0.5, 6), 0xa8aca6, at(x, 1.78, 0));
    b.add('metal', cbox(1.4, 0.04, 0.4, 0.01), 0x3a3e40, at(0, 2.04, 0));
  });
}

function epoxy(mats: FMats): THREE.Object3D {
  const g = build(mats, (b) => {
    // a raised square of the old tile (cracked, grey) and the new: ground flat, the joints filled
    b.add('floor', cbox(1.2, 0.06, 1.2, 0.01), 0x8a908a, at(0, 0.03, 0));
    b.add('metal', cbox(1.24, 0.02, 1.24, 0.004), 0x2a2e30, at(0, 0.005, 0));
    // the squeegee lying on it, a tin of resin
    b.add('wood', prism(0.015, 0.9, 6), 0xb08a52, at(0.1, 0.09, 0.15, 0, 0.6, Math.PI / 2));
    b.add('rubber', cbox(0.45, 0.06, 0.04, 0.008), 0x1a1a1a, at(-0.28, 0.09, -0.12, 0, 0.6));
    b.add('metal', lathe([[0, 0], [0.11, 0], [0.11, 0.2], [0, 0.2]], 12), 0xc8c0a0, at(0.35, 0.06, -0.3));
    b.add('paint', lathe([[0.112, 0.05], [0.114, 0.05], [0.114, 0.15], [0.112, 0.15]], 12), 0x3a7a5a, at(0.35, 0.06, -0.3));
  });
  // the clear coat: a glossy pane over the tile
  const coat = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.008, 1.18), new THREE.MeshStandardMaterial({ color: 0xb8c8c0, roughness: 0.05, metalness: 0.35, transparent: true, opacity: 0.55 }));
  coat.position.y = 0.064;
  g.add(coat);
  return g;
}

/** a welding cart built at once (the room's is a Poly Haven prop): two bottles on a trolley, the torch on its hook */
function weldcart(mats: FMats): THREE.Object3D {
  return build(mats, (b) => {
    b.add('paint', cbox(0.5, 0.06, 0.4, 0.01), 0xc8261e, at(0, 0.12, 0));
    for (const s of [-1, 1]) b.add('rubber', lathe([[0, 0], [0.09, 0], [0.09, 0.05], [0, 0.05]], 12), 0x141414, at(s * 0.22, 0.09, -0.12, 0, 0, Math.PI / 2));
    b.add('metal', cbox(0.04, 1.1, 0.04, 0.006), 0x3a3e40, at(0, 0.66, -0.18));
    b.add('chrome', prism(0.012, 0.36, 6), 0xc8ccd0, at(0, 1.2, -0.05, 0, 0, Math.PI / 2));
    for (const [x, col] of [[-0.11, 0x3a5a8a], [0.11, 0xc8a020]] as [number, number][]) {
      b.add('paint', lathe([[0, 0], [0.09, 0], [0.09, 0.7], [0.06, 0.78], [0.02, 0.8], [0, 0.8]], 12), col, at(x, 0.15, 0));
      b.add('brass', prism(0.022, 0.08, 8), 0xc8a050, at(x, 0.99, 0));
    }
    b.add('rubber', tube([[-0.11, 1.0, 0], [-0.2, 0.85, 0.15], [0.05, 0.6, 0.22], [0.15, 0.95, 0.12]], 0.01, 12, 5), 0x1a1a1a);
  });
}
/** a field cot: olive canvas on a folding steel frame, a grey blanket folded at the foot, a pillow */
function cot(mats: FMats): THREE.Object3D {
  return build(mats, (b) => {
    for (const x of [-0.36, 0.36]) b.add('metal', prism(0.016, 1.9, 6), 0x5a6062, at(x, 0.42, 0, Math.PI / 2));
    for (const z of [-0.8, -0.1, 0.8]) for (const s of [-1, 1]) b.add('metal', prism(0.012, 0.56, 6), 0x4a5052, at(0, 0.22, z, 0, 0, s * 0.72));
    b.add('leather', cbox(0.7, 0.03, 1.86, 0.01), 0x5a6a3a, at(0, 0.44, 0));
    b.add('leather', cbox(0.66, 0.06, 0.46, 0.02), 0x7a7e78, at(0, 0.49, 0.62));
    b.add('leather', cbox(0.5, 0.09, 0.3, 0.04), 0xe8e4d8, at(0, 0.5, -0.72));
  });
}
const OWN: Record<string, (m: FMats) => THREE.Object3D> = { lift, drone, van, trough, epoxy, cot };
/** the stand-ins built at once for the kinds whose model is a Poly Haven prop (loaded later) */
const SYNC: Record<string, () => THREE.Object3D> = {
  toolchest: () => world('tool_chest'), shelves: () => world('shelf_metal'), cart: () => world('zw_flat_trolley'),
};
const SYNC_M: Record<string, (m: FMats) => THREE.Object3D> = { welder: weldcart };
/** a facility upgrade's model, standing on y = 0, centred, facing +Z */
export function hubModel(kind: string, mats: FMats, sync = false): THREE.Object3D {
  const own = OWN[kind];
  if (own) return own(mats);
  if (kind === 'cart') return SYNC.cart();
  if (sync && SYNC[kind]) return SYNC[kind]();
  if (sync && SYNC_M[kind]) return SYNC_M[kind](mats);
  return modelOf(kind, mats);
}
