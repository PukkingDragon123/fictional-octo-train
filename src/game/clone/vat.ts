// THE CLONE VAT (round 21, wave 4): a tall glass column of green growth medium on a
// steel plinth, the machine kit's green enamel cap above it with copper feed lines
// to the ceiling, a brass gauge and a bank of pilot lamps on the plinth's front, a
// drain grate under the glass. A body (HumanRig) can hang in the medium. Used by the
// control room's station (src/ui/menus/rooms/research.ts) and by the revive
// cutscene (./revive.ts), where the medium drains, the sleeve lifts into the cap and
// the new body steps out.
//   const v = buildVat(mats); v.level = 1; v.lift = 0; v.update(dt, t)
import * as THREE from 'three';
import type { FMats } from '../../ui/menus/scene/pixtex';
import { FacetBuilder, at, cbox, prism, lathe, tube, gem, bolt } from '../../ui/menus/scene/facet';

export const VAT = { r: 0.46, base: 0.34, h: 1.96 };

export interface Vat {
  group: THREE.Group;
  /** the glass sleeve and its ribs (lifts into the cap) */
  sleeve: THREE.Group;
  /** the medium column (scale y follows level) */
  fluid: THREE.Mesh;
  /** where a body hangs: the floor of the glass, centre */
  bay: THREE.Group;
  light: THREE.PointLight;
  /** 0 drained .. 1 full */
  level: number;
  /** 0 down .. 1 lifted into the cap */
  lift: number;
  /** pilot lamps: 0 idle, 1 working (amber chase), 2 alarm (red) */
  mode: number;
  update(dt: number, t: number): void;
  dispose(): void;
}

export function buildVat(mats: FMats, o: { seed?: number; ceiling?: number } = {}): Vat {
  const { r, base, h } = VAT;
  const group = new THREE.Group();
  const b = new FacetBuilder();
  // ---- the plinth: a stepped steel drum, a hazard ring, bolts, a drain grate in the floor of the glass
  b.add('metal', prism(r + 0.2, 0.1, 14), 0x4a4e4a, at(0, 0.05, 0), { ao: 0.2 });
  b.add('metal', prism(r + 0.14, base - 0.12, 14, { rTop: r + 0.1 }), 0x6a6e66, at(0, 0.1 + (base - 0.12) / 2, 0));
  b.add('hazard', prism(r + 0.155, 0.05, 14), 0xe8c030, at(0, 0.16, 0));
  b.add('chrome', prism(r + 0.04, 0.03, 14), 0xb8bcb8, at(0, base - 0.01, 0));
  b.add('rust', prism(r - 0.06, 0.012, 12), 0x5a4a3a, at(0, base + 0.006, 0));
  for (let i = 0; i < 6; i++) b.add('metal', cbox(r * 1.7, 0.01, 0.025, 0.003), 0x2a2c2a, at(0, base + 0.014, -r * 0.6 + i * r * 0.24));
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; b.add('chrome', bolt(0.022, 0.016), 0xc8ccc8, at(Math.cos(a) * (r + 0.17), 0.1, Math.sin(a) * (r + 0.17))); }
  // ---- the control face on the plinth (+z): a brass gauge, a lamp bank, a drain valve wheel
  const fz = r + 0.12;
  b.add('paint', cbox(0.46, 0.2, 0.06, 0.01), 0x3a6a3a, at(0, 0.21, fz, -0.12));
  b.add('brass', prism(0.07, 0.03, 12), 0xc8a050, at(-0.13, 0.22, fz + 0.035, Math.PI / 2 - 0.12));
  b.add('enamel', prism(0.055, 0.032, 12), 0xf0ead8, at(-0.13, 0.22, fz + 0.04, Math.PI / 2 - 0.12));
  b.add('rubber', cbox(0.006, 0.045, 0.006, 0.001), 0x1a1a1a, at(-0.13, 0.235, fz + 0.06, -0.12, 0, 0.6));
  // valve wheel on a stub pipe to the side
  b.add('copper', tube([[r + 0.05, 0.12, -0.12], [r + 0.22, 0.12, -0.12], [r + 0.3, 0.04, -0.12]], 0.03, 6, 6), 0xc87a48);
  b.add('paint', lathe([[0.08, -0.01], [0.09, 0], [0.09, 0.012], [0.08, 0.02]], 10), 0xb83a24, at(r + 0.2, 0.2, -0.12, 0, 0, Math.PI / 2));
  b.add('metal', cbox(0.02, 0.1, 0.02, 0.003), 0x4a4e4a, at(r + 0.2, 0.16, -0.12));
  // ---- the cap: green enamel drum, a brass band, a domed top, cable glands
  const capY = base + h;
  b.add('paint', prism(r + 0.12, 0.3, 14), 0x3e7048, at(0, capY + 0.15, 0));
  b.add('brass', prism(r + 0.135, 0.045, 14), 0xc8a050, at(0, capY + 0.02, 0));
  b.add('brass', prism(r + 0.135, 0.03, 14), 0xb08c3e, at(0, capY + 0.29, 0));
  b.add('metal', lathe([[r + 0.08, 0], [r * 0.8, 0.08], [r * 0.45, 0.14], [0.08, 0.17], [0.0, 0.17]], 14), 0x6a6e66, at(0, capY + 0.3, 0));
  b.add('hazard', cbox(0.3, 0.06, 0.02, 0.004), 0xe8c030, at(0, capY + 0.15, r + 0.12));
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; b.add('chrome', bolt(0.016, 0.012), 0xc8ccc8, at(Math.cos(a) * (r + 0.11), capY + 0.3, Math.sin(a) * (r + 0.11))); }
  // feed lines to the ceiling
  const top = o.ceiling ?? 3.0;
  const lines: [number, number, number][] = [[0.18, 0x2a2a2a, 0.03], [-0.16, 0xc87a48, 0.034], [0.0, 0x8a3020, 0.022]];
  lines.forEach(([x, col, rr], i) => {
    const z0 = (i - 1) * 0.12;
    b.add(col === 0xc87a48 ? 'copper' : 'rubber', tube([[x, capY + 0.42, z0], [x * 1.4, capY + 0.62, z0 - 0.1], [x * 1.8, top - 0.2, z0 - 0.35], [x * 1.8, top + 0.1, z0 - 0.4]], rr, 10, 6), col);
    b.add('brass', prism(rr + 0.016, 0.05, 8), 0xc8a050, at(x, capY + 0.44, z0));
  });
  // a pressure gauge on the cap
  b.add('brass', prism(0.06, 0.03, 12), 0xc8a050, at(-0.3, capY + 0.15, r + 0.06, Math.PI / 2, 0.5));
  b.add('enamel', prism(0.048, 0.034, 12), 0xf0ead8, at(-0.3, capY + 0.15, r + 0.065, Math.PI / 2, 0.5));
  group.add(b.build(mats));

  // ---- the sleeve: glass, four chrome ribs, two brass hoops
  const sleeve = new THREE.Group();
  const sb = new FacetBuilder();
  sb.add('glass', prism(r, h, 18, { c: 0.001 }), 0x6a9a8a, at(0, base + h / 2, 0));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    sb.add('chrome', cbox(0.035, h, 0.035, 0.006), 0xc8ccc8, at(Math.cos(a) * (r + 0.012), base + h / 2, Math.sin(a) * (r + 0.012), 0, -a));
  }
  for (const y of [base + 0.06, base + h * 0.5, base + h - 0.06]) sb.add('brass', prism(r + 0.022, 0.035, 18, { c: 0.002 }), 0xc8a050, at(0, y, 0));
  // glints down the glass: thin bright slivers (sells the cylinder from any side)
  for (const [a, w] of [[0.5, 0.012], [0.62, 0.006], [-2.4, 0.01]] as [number, number][]) sb.add('lamp', cbox(w, h * 0.86, 0.004, 0.001), 0x7a9a94, at(Math.cos(a) * (r + 0.004), base + h / 2, Math.sin(a) * (r + 0.004), 0, -a + Math.PI / 2));
  sleeve.add(sb.build(mats));
  group.add(sleeve);

  // ---- the medium: a column that drains, its bright surface, bubbles
  const fluidMat = new THREE.MeshStandardMaterial({ color: 0x48e070, emissive: 0x1c7a34, emissiveIntensity: 0.9, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide });
  const fluid = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.02, r - 0.02, 1, 22, 1, true), fluidMat);
  fluid.renderOrder = 3;
  group.add(fluid);
  const surfMat = new THREE.MeshBasicMaterial({ color: 0x9affb0, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const surf = new THREE.Mesh(new THREE.CircleGeometry(r - 0.02, 22), surfMat);
  surf.rotation.x = -Math.PI / 2; surf.renderOrder = 4;
  group.add(surf);
  const NB = 46;
  const bubbles = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xc8ffd8, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false }), NB);
  bubbles.frustumCulled = false; bubbles.renderOrder = 5;
  group.add(bubbles);
  const bub = Array.from({ length: NB }, (_, i) => ({ a: (i * 2.39996) % (Math.PI * 2), rr: (r - 0.06) * Math.sqrt(((i * 0.618) % 1)), y: ((i * 0.37) % 1), s: 0.008 + ((i * 0.13) % 1) * 0.014, v: 0.18 + ((i * 0.29) % 1) * 0.3 }));
  // ---- the pilot lamps on the plinth face (their own material: they change colour)
  const lampMats = [0, 1, 2, 3].map(() => new THREE.MeshBasicMaterial({ color: 0x40ff60, toneMapped: false }));
  const lampGeo = gem(0.016, 6, 0.014);
  lampMats.forEach((m, i) => { const l = new THREE.Mesh(lampGeo, m); l.position.set(0.02 + i * 0.055, 0.24 - (i % 2) * 0.0, fz + 0.04); l.rotation.x = Math.PI / 2 - 0.12; group.add(l); });
  const light = new THREE.PointLight(0x60ff90, 2.2, 3.4, 1.8);
  light.position.set(0, base + h * 0.55, 0);
  group.add(light);
  const bay = new THREE.Group();
  bay.position.set(0, base + 0.02, 0);
  group.add(bay);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const vat: Vat = {
    group, sleeve, fluid, bay, light, level: 1, lift: 0, mode: 0,
    update(dt: number, t: number) {
      const lv = Math.max(0, Math.min(1, vat.level));
      const fh = Math.max(0.002, lv * (h - 0.04));
      fluid.scale.set(1, fh, 1); fluid.position.y = base + 0.02 + fh / 2;
      fluid.visible = lv > 0.004;
      surf.position.y = base + 0.02 + fh + Math.sin(t * 2.3) * 0.004; surf.visible = lv > 0.004;
      surfMat.opacity = 0.35 + Math.sin(t * 3.1) * 0.08;
      sleeve.position.y = vat.lift * (h + 0.02) * 0.98;
      // bubbles rise through the medium only
      let n = 0;
      for (const bb of bub) {
        bb.y += (bb.v * dt) / Math.max(0.3, h);
        if (bb.y > 1) bb.y -= 1;
        const y = base + 0.04 + bb.y * (h - 0.08);
        if (y > base + 0.02 + fh - 0.01) continue;
        const wob = Math.sin(t * 3 + bb.a * 5) * 0.012;
        p.set(Math.cos(bb.a) * bb.rr + wob, y, Math.sin(bb.a) * bb.rr);
        s.setScalar(bb.s * (lv < 0.98 ? 1.5 : 1));
        m.compose(p, q, s); bubbles.setMatrixAt(n++, m);
      }
      bubbles.count = n; bubbles.instanceMatrix.needsUpdate = true;
      light.intensity = (0.6 + 1.8 * lv) * (0.94 + Math.sin(t * 7.1) * 0.03 + Math.random() * 0.03);
      // pilot lamps: idle steady green, working an amber chase, alarm a red blink
      lampMats.forEach((mm, i) => {
        if (vat.mode === 2) { const on = Math.floor(t * 4) % 2 === i % 2; mm.color.setRGB(on ? 2.2 : 0.3, on ? 0.25 : 0.04, on ? 0.15 : 0.03); }
        else if (vat.mode === 1) { const on = Math.floor(t * 6) % 4 === i; mm.color.setRGB(on ? 2.2 : 0.5, on ? 1.4 : 0.32, on ? 0.2 : 0.05); }
        else { const on = i < 3 || Math.floor(t * 1.2) % 2 === 0; mm.color.setRGB(on ? 0.3 : 0.05, on ? 2.0 : 0.25, on ? 0.5 : 0.06); }
      });
    },
    dispose() {
      group.traverse((x) => { const mm = x as THREE.Mesh; if (mm.isMesh && mm.geometry) mm.geometry.dispose(); });
      fluidMat.dispose(); surfMat.dispose(); for (const mm of lampMats) mm.dispose();
      (bubbles.material as THREE.Material).dispose();
    },
  };
  vat.update(0, 0);
  return vat;
}
