// A STATION NOT BUILT YET (round 19, ./stations.ts): where it will stand, a pallet of crates under a dust sheet, a
// coil of cable, a caged work lamp on a stand and a square of hazard tape on the floor; and the build moment that
// replaces it (the crates sink away, the station rises out of a puff of dust with a shower of sparks).
// Faceted like the rest of the lab (src/ui/menus/monitor/props.ts).
import * as THREE from 'three';
import type { FMats } from '../scene/pixtex';
import { FacetBuilder, at, cbox, prism, tube, type V3 } from '../monitor/props';

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

/**
 * the lab filling up (round 19): the more stations are built, the more of the room is wired in. A cable tray runs
 * under the ceiling along the back wall (then the side walls), bundled cables lie in it, each built station takes a
 * drop cable down from the tray into a small junction box with a lit lamp, and caged work lamps hang off the tray.
 * `feeds` are the built stations (middle and top); `level` is how many are built.
 */
export function buildDressing(mats: FMats, room: { W: number; BACK: number; FRONT: number; H: number }, feeds: { x: number; z: number; top: number }[], level: number): THREE.Group {
  const g = new THREE.Group();
  if (level <= 0) return g;
  const b = new FacetBuilder();
  const { W, BACK, FRONT, H } = room;
  const ty = H - 0.32, inset = 0.3;
  // a tray between two points (rails, rungs, hanger rods to the ceiling, three cables lying in it)
  const tray = (x0: number, z0: number, x1: number, z1: number, seed: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0);
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
    for (const s of [-1, 1]) b.add('metal', cbox(len, 0.07, 0.02, 0.004), 0x6a6e66, at(mx + nx * s * 0.13, ty, mz + nz * s * 0.13, 0, ry));
    for (let t = 0.1; t < len; t += 0.32) {
      const px = x0 + (x1 - x0) * (t / len), pz = z0 + (z1 - z0) * (t / len);
      b.add('metal', cbox(0.02, 0.015, 0.28, 0.003), 0x585c56, at(px, ty - 0.03, pz, 0, ry));
    }
    for (let t = 0.3; t < len; t += 1.2) {
      const px = x0 + (x1 - x0) * (t / len), pz = z0 + (z1 - z0) * (t / len);
      for (const s of [-1, 1]) b.add('chrome', cbox(0.012, H - ty, 0.012, 0.002), 0xa8aca6, at(px + nx * s * 0.13, (H + ty) / 2, pz + nz * s * 0.13));
    }
    const cols = [0x1c1c1c, 0x2a2622, 0x8a3020, 0x2a4a7a];
    for (let c = 0; c < 3 + (seed % 2); c++) {
      const off = (c - 1.5) * 0.06, pts: V3[] = [];
      for (let k = 0; k <= 6; k++) {
        const u = k / 6, px = x0 + (x1 - x0) * u + nx * off, pz = z0 + (z1 - z0) * u + nz * off;
        pts.push([px, ty + 0.0 + Math.sin(u * 9 + c + seed) * 0.012, pz]);
      }
      b.add('rubber', tube(pts, 0.018 + (c % 2) * 0.006, 18, 5), cols[(c + seed) % cols.length]);
    }
  };
  tray(-W + inset, BACK + inset, W - inset, BACK + inset, 1);
  if (level >= 3) tray(-W + inset, BACK + inset, -W + inset, FRONT - 1.2, 2);
  if (level >= 5) tray(W - inset, BACK + inset, W - inset, FRONT - 1.2, 3);
  // each built station takes a drop from the nearest tray into a junction box on its top
  const lamps: THREE.Vector3[] = [];
  for (const f of feeds) {
    let tx = Math.max(-W + inset, Math.min(W - inset, f.x)), tz = BACK + inset;
    if (level >= 3 && f.x < -W * 0.4 && f.z > BACK + 1.2) { tx = -W + inset; tz = Math.min(FRONT - 1.2, f.z); }
    if (level >= 5 && f.x > W * 0.4 && f.z > BACK + 1.2) { tx = W - inset; tz = Math.min(FRONT - 1.2, f.z); }
    const top = Math.min(ty - 0.3, f.top + 0.02);
    const pts: V3[] = [[tx, ty + 0.02, tz], [tx + (f.x - tx) * 0.15, ty - 0.12, tz + (f.z - tz) * 0.15], [tx + (f.x - tx) * 0.7, (ty + top) / 2 + 0.1, tz + (f.z - tz) * 0.7], [f.x, top + 0.12, f.z], [f.x, top + 0.04, f.z]];
    b.add('rubber', tube(pts, 0.016, 16, 5), 0x1a1a1a);
    b.add('paint', cbox(0.14, 0.08, 0.1, 0.008), 0x3a6a3a, at(f.x, top + 0.03, f.z));
    b.add('lamp', cbox(0.025, 0.02, 0.025, 0.004), 0x80ff70, at(f.x + 0.04, top + 0.075, f.z));
    lamps.push(new THREE.Vector3(f.x, top, f.z));
  }
  // caged work lamps hung off the back tray (from the second station built)
  if (level >= 2) {
    // (round 25: none hangs in front of the research lattice or its bay monitor: they glared over the nodes)
    const spots = level >= 4 ? [-W * 0.62, W * 0.7] : [-W * 0.62, W * 0.7];
    for (const x of spots) {
      const z = BACK + inset + 0.18, y = ty - 0.42;
      b.add('chrome', cbox(0.01, 0.36, 0.01, 0.002), 0xa0a49e, at(x, ty - 0.2, z - 0.05));
      b.add('metal', prism(0.09, 0.14, 8, { rTop: 0.05 }), 0xe8b030, at(x, y + 0.05, z));
      for (let i = 0; i < 4; i++) b.add('metal', cbox(0.008, 0.12, 0.008, 0.002), 0x2a2a26, at(x + Math.cos(i * 1.57) * 0.07, y - 0.06, z + Math.sin(i * 1.57) * 0.07));
      b.add('lamp', prism(0.05, 0.08, 8), 0xfff2c8, at(x, y - 0.04, z));
    }
    const L = new THREE.PointLight(0xffe2b0, 0.9 + level * 0.15, 6, 1.6);
    // (round 25: up and out from the wall: low against it, it put a hot spot on the lattice's exhibits)
    L.position.set(0, ty - 0.1, BACK + inset + 1.5);
    g.add(L);
  }
  g.add(b.build(mats));
  return g;
}
