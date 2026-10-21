// Visible hardware on a dominated creature: a riveted steel skull cap bolted
// over the cut, its vacuum valves glowing through the glass (one per tier), a
// brass dial, a whip aerial and cloth-braided leads down the neck. Built once per tier (shared geometry), sized to the
// body and parented to the head part so it moves with the animation.
import * as THREE from 'three';
import { ModelBuilder } from '../gfx/modelBuilder';
import { worldMaterial } from '../gfx/materials';
import { G } from '../game/G';
import type { Creature } from '../creatures/creature';
import type { DominionSystem } from './dominion';
import { BRAINS } from './brains';
import { dome, ring, blob, capsule, rbox } from '../scan/shapes';

const GEO = new Map<number, THREE.BufferGeometry>();
let mat: THREE.Material | null = null;

function implantGeo(tier: number): THREE.BufferGeometry {
  let g = GEO.get(tier);
  if (g) return g;
  const mb = new ModelBuilder();
  const fil = BRAINS[tier - 1].led;
  // a riveted steel skull cap (unit size: the head is ~1 wide), a rolled brass collar where the cut was
  dome(mb, 0, 0.02, 0, 0.36, 'metal_rusty', { color: 0x8a8880, sy: 0.42 }, 18);
  ring(mb, 0, 0.02, 0, 0.35, 0.035, 'metal_brass', { color: 0xb8903e }, 20);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; blob(mb, Math.cos(a) * 0.33, 0.07, Math.sin(a) * 0.33, 0.022, 0.016, 0.022, 'metal_brass', {}, 6); }
  ring(mb, 0, -0.01, 0, 0.36, 0.018, 'white', { color: 0x6a1a12 }, 20); // the stitched seam under the collar
  // vacuum valves standing out of the cap, one per tier, filaments glowing
  for (let i = 0; i < tier; i++) {
    const x = (i - (tier - 1) / 2) * 0.17, h = 0.26 + (i % 2) * 0.05, y0 = 0.15;
    mb.cylinder(x, y0 - 0.02, -0.05, 0.075, 0.06, 14, 'plastic_black', { color: 0x3a2418, rTop: 0.065 });
    mb.cylinder(x, y0 + 0.04, -0.05, 0.058, h, 14, 'glass', { color: 0xd0dcd6 });
    mb.sphere(x, y0 + 0.04 + h, -0.05, 0.058, 12, 6, 'glass', { color: 0xd0dcd6, sy: 0.9 });
    capsule(mb, [x, y0 + 0.1, -0.035], [x, y0 + 0.08 + h * 0.6, -0.035], 0.016, 'white', { color: fil, emissive: 1.9 }, 6);
  }
  // a brass needle dial on the brow
  mb.push().translate(0.17, 0.12, 0.27).rotateX(1.0);
  mb.cylinder(0, 0, 0, 0.09, 0.03, 16, 'metal_brass'); mb.cylinder(0, 0.03, 0, 0.072, 0.005, 16, 'paper', { color: 0xe8dcb8 });
  ring(mb, 0, 0.032, 0, 0.08, 0.01, 'metal_brass', {}, 16);
  mb.pop();
  // a whip aerial with a bulb
  capsule(mb, [-0.24, 0.1, -0.22], [-0.26, 0.62 + tier * 0.12, -0.24], 0.013, 'metal_brass', {}, 6);
  blob(mb, -0.26, 0.64 + tier * 0.12, -0.24, 0.035, 0.035, 0.035, 'white', { color: fil, emissive: 1.6 }, 8);
  // cloth-braided leads down the back of the neck
  capsule(mb, [-0.09, 0.0, -0.3], [-0.12, -0.55, -0.52], 0.035, 'fabric_brown', { color: 0x5a4430 }, 8);
  capsule(mb, [0.09, 0.0, -0.3], [0.12, -0.55, -0.52], 0.035, 'rubber_black', {}, 8);
  if (tier >= 3) for (let i = 0; i < 4; i++) rbox(mb, -0.27 + i * 0.18, 0.1, 0.12, 0.03, 0.1, 0.26, 'metal_brushed', {}, 0.01, 1);
  g = mb.build();
  GEO.set(tier, g);
  return g;
}

const HEAD_NAMES = ['head', 'skull', 'Head', 'neck'];
function headPart(c: Creature): THREE.Object3D | null {
  const rig = c.rig; if (!rig) return null;
  const hn = c.sp.gore?.head;
  if (hn && rig.parts[hn]) return rig.parts[hn];
  for (const n of HEAD_NAMES) if (rig.parts[n]) return rig.parts[n];
  return rig.body;
}

/** attach / refresh implants on the local zone's thralls, and re-wire bodies that came back (saves, mirrors) */
export function syncImplants(d: DominionSystem) {
  const zk = G.local?.zoneKey;
  for (const r of d.thralls.values()) {
    const c = d.creature(r.id);
    if (!c || c.dead) continue;
    if (!c.mem.dom) d.wire(c, r);
    if (!c.rig || c.zoneKey !== zk) continue;
    const ud = c.rig.root.userData;
    if (ud.domImp === r.tier) continue;
    dropImplant(c);
    const at = headPart(c);
    if (!at) continue;
    mat ??= worldMaterial({});
    const m = new THREE.Mesh(implantGeo(r.tier), mat);
    m.name = 'dom_implant';
    m.castShadow = true;
    // size from the body: world head size ~ 15% of the height, corrected for the part's world scale
    const s = Math.max(0.12, Math.min(0.55, c.height * 0.16 + c.radius * 0.25));
    c.rig.root.updateMatrixWorld(true);
    const ws = new THREE.Vector3(); at.getWorldScale(ws);
    m.scale.setScalar(s / Math.max(0.05, ws.x));
    const isBody = at === c.rig.body;
    m.position.set(0, (isBody ? c.height * 0.9 : s * 0.55) / Math.max(0.05, ws.y), isBody ? c.radius * 0.5 : 0);
    at.add(m);
    ud.domImp = r.tier; ud.domMesh = m;
    // a Titan Lobe overdrives the body: it swells into something a size too big
    if (r.tier >= 3) c.rig.root.scale.setScalar(1.25);
  }
}

export function dropImplant(c: Creature) {
  const ud = c.rig?.root.userData;
  if (!ud?.domMesh) return;
  (ud.domMesh as THREE.Object3D).removeFromParent();
  c.rig!.root.scale.setScalar(1);
  ud.domMesh = null; ud.domImp = 0;
}
