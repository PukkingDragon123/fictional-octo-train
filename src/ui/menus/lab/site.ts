// A STATION NOT BUILT YET (round 19, ./stations.ts): where it will stand, a pallet of crates under a dust sheet, a
// coil of cable, a caged work lamp on a stand and a square of hazard tape on the floor; and the build moment that
// replaces it (the crates sink away, the station rises out of a puff of dust with a shower of sparks).
// Faceted like the rest of the lab (src/ui/menus/monitor/props.ts).
import * as THREE from 'three';
import type { FMats } from '../scene/pixtex';
import { FacetBuilder, at, cbox, prism } from '../monitor/props';

/** the site: centred on (x, z) on the floor, `w` x `d` metres of taped floor */
export function buildSite(mats: FMats, x: number, z: number, w: number, d: number, seed = 1): THREE.Group {
  const g = new THREE.Group();
  const b = new FacetBuilder();
  const r = (n: number) => { const s = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453; return s - Math.floor(s); };
  // hazard tape round the footprint
  const tw = 0.05, y = 0.004;
  b.add('hazard', cbox(w, 0.004, tw, 0.001), 0xe8c030, at(x, y, z - d / 2));
  b.add('hazard', cbox(w, 0.004, tw, 0.001), 0xe8c030, at(x, y, z + d / 2));
  b.add('hazard', cbox(tw, 0.004, d, 0.001), 0xe8c030, at(x - w / 2, y, z));
  b.add('hazard', cbox(tw, 0.004, d, 0.001), 0xe8c030, at(x + w / 2, y, z));
  // a pallet and its crates (slats, a stencil band), one crate cracked open
  b.add('wood', cbox(1.0, 0.12, 0.8, 0.01), 0x9a7a4a, at(x, 0.06, z));
  for (let i = 0; i < 3; i++) b.add('wood', cbox(1.0, 0.02, 0.08, 0.004), 0x7a5a32, at(x, 0.13, z - 0.3 + i * 0.3));
  const crates: [number, number, number, number][] = [[-0.22, 0.2, 0.5, 0.5], [0.26, 0.17, 0.42, 0.42], [-0.02, 0.62, 0.4, 0.36]];
  crates.forEach(([cx, cy, cw, ch], i) => {
    const px = x + cx, pz = z + (i === 2 ? 0 : (r(i) - 0.5) * 0.1);
    b.add('wood', cbox(cw, ch, cw * 0.9, 0.012), [0xb08a52, 0xa07a46, 0xc09a60][i], at(px, cy + ch / 2 - 0.02, pz, 0, (r(i + 3) - 0.5) * 0.2));
    b.add('paint', cbox(cw + 0.006, 0.05, cw * 0.9 + 0.006, 0.004), 0x3a5a3a, at(px, cy + ch * 0.62, pz, 0, (r(i + 3) - 0.5) * 0.2));
    for (const sx of [-1, 1]) b.add('metal', cbox(0.02, ch * 0.9, 0.02, 0.003), 0x8a8e88, at(px + sx * cw / 2, cy + ch / 2 - 0.02, pz + cw * 0.45));
  });
  // the dust sheet thrown over the back crate
  b.add('sponge', cbox(0.62, 0.02, 0.56, 0.01), 0xd8d0bc, at(x - 0.2, 0.71, z, 0.12, 0.2, 0.06));
  b.add('sponge', cbox(0.04, 0.28, 0.52, 0.01), 0xccc4ae, at(x - 0.52, 0.58, z + 0.02, 0, 0.2, 0.18));
  // a coil of cable on the floor, a cable run toward the wall
  for (let i = 0; i < 6; i++) b.add('rubber', cbox(0.36 - i * 0.03, 0.02, 0.03, 0.006), 0x1e1e1e, at(x + 0.62, 0.02 + i * 0.012, z + 0.42, 0, i * 0.55));
  b.add('rubber', cbox(0.03, 0.02, 0.9, 0.006), 0x1a1a1a, at(x + 0.72, 0.012, z - 0.1, 0, 0.3));
  // the caged work lamp on its stand, lit
  b.add('metal', cbox(0.3, 0.03, 0.3, 0.006), 0x3a3e3a, at(x - 0.66, 0.015, z + 0.4));
  b.add('chrome', cbox(0.03, 1.2, 0.03, 0.004), 0xb8bcb8, at(x - 0.66, 0.62, z + 0.4));
  b.add('metal', prism(0.08, 0.16, 6), 0xe8b030, at(x - 0.66, 1.26, z + 0.34, 0.9));
  b.add('lamp', cbox(0.07, 0.07, 0.06, 0.01), 0xfff0c0, at(x - 0.66, 1.26, z + 0.27, 0.9));
  g.add(b.build(mats));
  const light = new THREE.PointLight(0xffd8a0, 1.4, 3.2, 2);
  light.position.set(x - 0.66, 1.2, z + 0.15);
  g.add(light);
  return g;
}

/** the build moment, ticked by the room: the station's groups rise out of the floor, scaled up from nothing */
export interface Rise { groups: THREE.Object3D[]; t: number; base: { o: THREE.Object3D; y: number; s: THREE.Vector3 }[]; onDust?: (k: number) => void }
export function startRise(groups: THREE.Object3D[]): Rise {
  const base = groups.map((o) => ({ o, y: o.position.y, s: o.scale.clone() }));
  for (const b of base) { b.o.visible = true; b.o.scale.set(b.s.x, 0.02, b.s.z); }
  return { groups, t: 0, base };
}
/** advance; true while it is still rising */
export function stepRise(r: Rise, dt: number): boolean {
  r.t = Math.min(1, r.t + dt / 1.1);
  const k = r.t, e = 1 + 2.4 * Math.pow(k - 1, 3) + 1.4 * Math.pow(k - 1, 2); // back-out ease
  for (const b of r.base) b.o.scale.set(b.s.x, Math.max(0.02, b.s.y * e), b.s.z);
  r.onDust?.(k);
  return k < 1;
}
