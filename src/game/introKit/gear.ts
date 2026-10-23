// The Meridian Custody Officers' kit, faceted low-poly on the rig's bones
// (the bodies are the shared HumanRig; this only dresses them):
//   a riot helmet (an oval faceted shell with a crest ridge, a neck guard,
//   side pivots and a smoked visor in curved panels), a black tactical vest
//   (front and back plates, shoulder straps, side panels, three magazine
//   pouches, a radio pouch with the radio, its antenna and the coiled lead to
//   a shoulder mic, a brass badge), a duty belt (buckle, cuff case, baton
//   ring, a pouch), knee pads; and in hand a riot baton, the BAILIFF fitting
//   gun or the rig's pendant control.
import * as THREE from 'three';
import { ModelBuilder } from '../../gfx/modelBuilder';
import type { HumanRig } from '../../entities/humanRig';
import { cbox, lathe, prism, rod, tube, face, type V3, type V2 } from './poly';

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(k: string, f: () => THREE.BufferGeometry) { let g = geoCache.get(k); if (!g) { g = f(); geoCache.set(k, g); } return g; }

function helmetGeo(): THREE.BufferGeometry {
  const mb = new ModelBuilder();
  const cy = 0.095, cz = -0.005;
  // the shell: an oval faceted dome, flat facing forward
  lathe(mb, 0, cy - 0.03, cz, [[0.138, 0], [0.146, 0.05], [0.14, 0.1], [0.118, 0.15], [0.078, 0.185], [0.03, 0.2], [0, 0.202]], 9, 'ix_helmet', { sx: 0.96, sz: 1.1, phase: Math.PI / 2, caps: false });
  // crest ridge front to back, a brow rim
  cbox(mb, 0, cy + 0.155, cz - 0.02, 0.03, 0.04, 0.2, 0.01, 'ix_helmet');
  for (let i = 0; i < 6; i++) {
    const a0 = -1.0 + i * 0.36, a1 = a0 + 0.36;
    const P = (a: number, y: number, r: number): V3 => [Math.sin(a) * r * 0.96, y, cz + Math.cos(a) * r * 1.1];
    face(mb, [P(a0, cy - 0.032, 0.141), P(a1, cy - 0.032, 0.141), P(a1, cy - 0.006, 0.152), P(a0, cy - 0.006, 0.152)], 'plastic_black', {}, [0, 0, 0]);
  }
  // neck guard: angled plates at the back
  mb.push().translate(0, cy - 0.04, cz - 0.13).rotateX(0.35);
  cbox(mb, 0, -0.07, 0, 0.2, 0.08, 0.02, 0.006, 'ix_helmet', { color: 0x9aa0a8 });
  cbox(mb, 0, -0.12, 0.012, 0.18, 0.05, 0.02, 0.006, 'ix_helmet', { color: 0x8a9098 });
  mb.pop();
  // side pivots
  for (const s of [-1, 1]) {
    mb.push().translate(s * 0.138, cy + 0.03, cz + 0.045).rotateZ(-s * Math.PI / 2);
    lathe(mb, 0, 0, 0, [[0.024, 0], [0.024, 0.014], [0.012, 0.022]], 7, 'plastic_black');
    mb.pop();
  }
  // the visor: curved smoked panels hung from the pivots, a black rim
  const N = 7, span = 2.2, R = 0.158;
  for (let i = 0; i < N; i++) {
    const a0 = -span / 2 + i * span / N, a1 = a0 + span / N;
    const P = (a: number, y: number, r: number): V3 => [Math.sin(a) * r * 0.96, y, cz + 0.01 + Math.cos(a) * r * 1.06];
    face(mb, [P(a0, cy - 0.105, R - 0.012), P(a1, cy - 0.105, R - 0.012), P(a1, cy + 0.035, R), P(a0, cy + 0.035, R)], 'ix_visor', { uvScale: 1 }, [0, cy, cz]);
    face(mb, [P(a0, cy + 0.035, R), P(a1, cy + 0.035, R), P(a1, cy + 0.06, R - 0.006), P(a0, cy + 0.06, R - 0.006)], 'plastic_black', {}, [0, cy, cz]);
    face(mb, [P(a0, cy - 0.118, R - 0.016), P(a1, cy - 0.118, R - 0.016), P(a1, cy - 0.105, R - 0.012), P(a0, cy - 0.105, R - 0.012)], 'plastic_black', {}, [0, cy, cz]);
  }
  return mb.build();
}

function vestGeo(): THREE.BufferGeometry {
  const mb = new ModelBuilder();
  // chest-bone frame: y 0 (bottom of the ribs) .. 0.27 (base of the neck), front +z
  cbox(mb, 0, -0.04, 0.085, 0.34, 0.29, 0.05, 0.02, 'ix_vest');
  cbox(mb, 0, -0.03, -0.105, 0.34, 0.28, 0.045, 0.02, 'ix_vest');
  for (const s of [-1, 1]) {
    cbox(mb, s * 0.165, -0.05, -0.01, 0.04, 0.2, 0.2, 0.012, 'ix_vest');
    // shoulder straps up over the trapezius
    mb.push().translate(s * 0.1, 0.235, 0).rotateZ(s * 0.18);
    cbox(mb, 0, 0, 0, 0.075, 0.035, 0.24, 0.012, 'ix_vest');
    mb.pop();
  }
  // three magazine pouches low on the front, flaps, a radio pouch high left, a brass badge right
  for (let i = -1; i <= 1; i++) {
    cbox(mb, i * 0.1, -0.035, 0.12, 0.085, 0.1, 0.045, 0.01, 'ix_pouch');
    cbox(mb, i * 0.1, 0.05, 0.123, 0.09, 0.025, 0.05, 0.008, 'ix_vest', { color: 0xd0d0d0 });
  }
  cbox(mb, 0.1, 0.1, 0.115, 0.07, 0.11, 0.04, 0.01, 'ix_pouch');
  cbox(mb, 0.1, 0.13, 0.13, 0.055, 0.12, 0.03, 0.008, { south: 'ix_radio', all: 'plastic_black' }, { fit: true });
  rod(mb, [0.12, 0.25, 0.128], [0.13, 0.4, 0.12], 0.006, 4, 'rubber_black', { r2: 0.004 });
  lathe(mb, 0.085, 0.25, 0.13, [[0.009, 0], [0.009, 0.015]], 6, 'plastic_black');
  // coiled lead to a mic on the right strap
  const coil: V3[] = [];
  for (let i = 0; i <= 26; i++) { const t = i / 26, a = t * Math.PI * 12; coil.push([0.08 - t * 0.17 + Math.cos(a) * 0.008, 0.16 + Math.sin(t * Math.PI) * 0.04 + Math.sin(a) * 0.008, 0.135]); }
  tube(mb, coil, 0.0035, 4, 'rubber_black', { caps: false });
  cbox(mb, -0.1, 0.17, 0.135, 0.04, 0.055, 0.025, 0.008, 'plastic_black');
  prism(mb.push().translate(-0.06, 0.06, 0.112), [[-0.02, 0], [0.02, 0], [0.024, 0.03], [0, 0.045], [-0.024, 0.03]] as V2[], 0, 0.008, 'metal_brass', { b: 0.002 });
  mb.pop();
  return mb.build();
}

function beltGeo(): THREE.BufferGeometry {
  const mb = new ModelBuilder();
  // hips-bone frame: the belt sits just above the hip joint
  lathe(mb, 0, 0.0, 0.0, [[0.175, 0], [0.18, 0.025], [0.175, 0.05]], 10, 'rubber_black', { sx: 1.0, sz: 0.72, phase: Math.PI / 2 });
  cbox(mb, 0, 0.005, 0.125, 0.06, 0.042, 0.015, 0.006, 'chrome');
  // cuff case, a pouch, the baton ring on the left hip
  cbox(mb, -0.12, -0.03, 0.09, 0.06, 0.07, 0.04, 0.01, 'ix_pouch');
  cbox(mb, 0.14, -0.04, 0.06, 0.05, 0.08, 0.05, 0.01, 'ix_pouch');
  cbox(mb, -0.02, -0.035, -0.125, 0.12, 0.07, 0.045, 0.01, 'ix_pouch');
  mb.push().translate(-0.18, -0.01, 0.0).rotateZ(Math.PI / 2);
  lathe(mb, 0, -0.02, 0, [[0.03, 0], [0.03, 0.04]], 7, 'chrome', { caps: false });
  mb.pop();
  return mb.build();
}

function kneeGeo(): THREE.BufferGeometry {
  const mb = new ModelBuilder();
  // shin-bone frame: the knee at the origin, front +z
  prism(mb.push().translate(0, -0.02, 0.05), [[-0.05, -0.08], [0.05, -0.08], [0.06, 0.0], [0.045, 0.05], [-0.045, 0.05], [-0.06, 0.0]] as V2[], 0, 0.035, 'ix_helmet', { b: 0.01, color: 0x6a7078 });
  mb.pop();
  return mb.build();
}

/** a riot baton: handle toward -x, business end toward +x (the held-item convention); wet 0..2: blood on the striking end */
export function batonGeo(wet = 0): THREE.BufferGeometry {
  return cached('baton' + wet, () => {
    const mb = new ModelBuilder();
    rod(mb, [-0.2, 0, 0], [-0.03, 0, 0], 0.024, 8, 'ix_rubber');
    rod(mb, [-0.03, 0, 0], [0.46, 0, 0], 0.023, 8, 'plastic_black', { r2: 0.02, color: 0x3a3c40 });
    rod(mb, [-0.215, 0, 0], [-0.2, 0, 0], 0.029, 8, 'plastic_black');
    rod(mb, [0.46, 0, 0], [0.48, 0, 0], 0.021, 8, 'chrome');
    rod(mb, [-0.035, 0, 0], [-0.025, 0, 0], 0.03, 8, 'plastic_black');
    tube(mb, [[-0.215, 0, 0], [-0.24, -0.03, 0.005], [-0.25, -0.07, 0], [-0.23, -0.1, -0.01]], 0.004, 4, 'rubber_black', { caps: false });
    if (wet > 0) {
      // a wet red sleeve over the striking end, longer the more it has been used, and drips hanging off it
      const from = 0.46 - 0.12 - wet * 0.08;
      rod(mb, [from, 0, 0], [0.485, 0, 0], 0.0245, 8, 'white', { r2: 0.0225, color: wet > 1 ? 0x5a0606 : 0x7a0c0a });
      for (let i = 0; i < 2 + wet * 2; i++) {
        const x = from + 0.03 + i * 0.045, a = i * 2.1;
        cbox(mb, x, Math.cos(a) * 0.02 - 0.012, Math.sin(a) * 0.02, 0.008, 0.02 + (i % 3) * 0.008, 0.008, 0.002, 'white', { color: 0x6a0808 });
      }
    }
    return mb.build();
  });
}
/** the BAILIFF fitting gun: squat body, C jaw at the muzzle (+x), pistol grip, amber lamp */
export function fittingGunGeo(): { body: THREE.BufferGeometry; lamp: THREE.BufferGeometry } {
  const body = cached('gun', () => {
    const mb = new ModelBuilder();
    mb.push().rotateY(-Math.PI / 2);
    prism(mb, [[-0.13, -0.035], [0.1, -0.04], [0.13, -0.01], [0.13, 0.035], [0.05, 0.05], [-0.12, 0.045]] as V2[], -0.04, 0.04, 'ix_yellow', { b: 0.008 });
    mb.pop();
    mb.push().translate(-0.06, -0.035, 0).rotateZ(0.25);
    cbox(mb, 0, -0.12, 0, 0.045, 0.12, 0.05, 0.01, 'ix_rubber');
    mb.pop();
    // the C jaw
    for (let i = 0; i < 6; i++) {
      const a0 = -Math.PI * 0.75 + i * Math.PI * 1.5 / 6, a1 = a0 + Math.PI * 1.5 / 6;
      const P = (a: number, r: number, z: number): V3 => [0.17 + Math.cos(a) * r * 0.4, Math.sin(a) * r, z];
      face(mb, [P(a0, 0.06, 0.03), P(a1, 0.06, 0.03), P(a1, 0.06, -0.03), P(a0, 0.06, -0.03)], 'ix_steel', {}, [0.17, 0, 0]);
      face(mb, [P(a0, 0.04, -0.03), P(a1, 0.04, -0.03), P(a1, 0.04, 0.03), P(a0, 0.04, 0.03)], 'metal_dark', {}, [0.17 + 1, 0, 0]);
      for (const z of [0.03, -0.03]) face(mb, [P(a0, 0.04, z), P(a1, 0.04, z), P(a1, 0.06, z), P(a0, 0.06, z)], 'ix_steel', {}, [0.17, 0, -z * 10]);
    }
    rod(mb, [0.13, 0.0, 0], [0.18, 0.0, 0], 0.012, 6, 'chrome');
    tube(mb, [[-0.13, 0.0, 0], [-0.2, -0.02, 0.01], [-0.28, -0.12, 0.0], [-0.3, -0.3, -0.02]], 0.012, 5, 'ix_hose', { caps: false });
    return mb.build();
  });
  const lamp = cached('gunlamp', () => { const mb = new ModelBuilder(); lathe(mb, 0.0, 0.048, 0, [[0.014, 0], [0.014, 0.012], [0, 0.02]], 6, 'ix_sodium', { color: 0xffffff }); return mb.build(); });
  return { body, lamp };
}
/** the rig's pendant control: a yellow box on its cable, two buttons */
export function pendantGeo(): THREE.BufferGeometry {
  return cached('pendant', () => {
    const mb = new ModelBuilder();
    cbox(mb, 0, -0.1, 0, 0.07, 0.16, 0.05, 0.012, 'ix_yellow');
    lathe(mb.push().translate(0, -0.03, 0.026).rotateX(Math.PI / 2), 0, 0, 0, [[0.015, 0], [0.015, 0.012], [0, 0.015]], 6, 'plastic_red', { color: 0xff2a18 });
    mb.pop();
    lathe(mb.push().translate(0, -0.08, 0.026).rotateX(Math.PI / 2), 0, 0, 0, [[0.012, 0], [0.012, 0.01], [0, 0.012]], 6, 'plastic_black', { color: 0x30a040 });
    mb.pop();
    tube(mb, [[0, 0.0, 0], [0.0, 0.08, -0.02], [0.05, 0.2, -0.06], [0.08, 0.5, -0.1]], 0.008, 4, 'ix_cable', { caps: false });
    return mb.build();
  });
}

/** put the kit on a rig (meshes parented to its bones, scaled with it) */
export function dressGuard(rig: HumanRig, mat: THREE.Material): THREE.Mesh[] {
  const s = rig.s;
  const out: THREE.Mesh[] = [];
  const put = (bone: string, g: THREE.BufferGeometry) => {
    const b = (rig.bones as Record<string, THREE.Object3D>)[bone] ?? (rig.j as Record<string, THREE.Object3D>)[bone];
    if (!b) return;
    const m = new THREE.Mesh(g, mat);
    m.scale.setScalar(s);
    m.castShadow = true; m.receiveShadow = true;
    m.frustumCulled = false;
    b.add(m);
    out.push(m);
  };
  put('head', cached('helmet', helmetGeo));
  put('chest', cached('vest', vestGeo));
  put('hips', cached('belt', beltGeo));
  put('shinL', cached('knee', kneeGeo));
  put('shinR', cached('knee', kneeGeo));
  return out;
}
