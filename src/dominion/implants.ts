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

const GEO = new Map<number, THREE.BufferGeometry>();
let mat: THREE.Material | null = null;

function implantGeo(tier: number): THREE.BufferGeometry {
  let g = GEO.get(tier);
  if (g) return g;
  const mb = new ModelBuilder();
  const fil = BRAINS[tier - 1].led;
  // a riveted steel skull cap (unit size: the head is ~1 wide), a brass collar where the cut was
  mb.box(0, 0, 0, 0.66, 0.1, 0.74, 'metal_rusty', { color: 0x8a8880 });
  mb.box(0, 0.07, 0, 0.5, 0.06, 0.58, 'metal_rusty', { color: 0x9a988e });
  mb.box(0, -0.05, 0, 0.7, 0.04, 0.78, 'metal_brass', { color: 0xb8903e });
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; mb.box(Math.cos(a) * 0.31, 0.05, Math.sin(a) * 0.35, 0.04, 0.03, 0.04, 'metal_brass'); }
  // the stitched seam under the collar
  mb.box(0, -0.08, 0, 0.68, 0.025, 0.76, 'white', { color: 0x6a1a12 });
  // vacuum valves standing out of the cap, one per tier, filaments glowing
  for (let i = 0; i < tier; i++) {
    const x = (i - (tier - 1) / 2) * 0.17, h = 0.26 + (i % 2) * 0.05;
    mb.cylinder(x, 0.1, -0.05, 0.075, 0.05, 8, 'plastic_black', { color: 0x3a2418 });
    mb.cylinder(x, 0.15, -0.05, 0.06, h, 8, 'glass', { color: 0xd0dcd6 });
    mb.sphere(x, 0.15 + h, -0.05, 0.06, 8, 4, 'glass', { color: 0xd0dcd6, sy: 0.8 });
    mb.box(x, 0.2 + h * 0.3, -0.05, 0.03, h * 0.45, 0.015, 'white', { color: fil, emissive: 1.8 });
  }
  // a brass needle dial on the brow
  mb.push().translate(0.16, 0.1, 0.3).rotateX(1.1);
  mb.cylinder(0, 0, 0, 0.09, 0.03, 10, 'metal_brass'); mb.cylinder(0, 0.03, 0, 0.07, 0.005, 10, 'paper', { color: 0xe8dcb8 });
  mb.box(0.02, 0.036, 0.02, 0.07, 0.006, 0.01, 'plastic_black');
  mb.pop();
  // a whip aerial with a bulb
  mb.cylinder(-0.24, 0.08, -0.22, 0.015, 0.5 + tier * 0.12, 5, 'metal_brass');
  mb.sphere(-0.24, 0.6 + tier * 0.12, -0.22, 0.035, 6, 4, 'white', { color: fil, emissive: 1.6 });
  // cloth-braided leads down the back of the neck
  for (let i = 0; i < 5; i++) { mb.box(-0.09, -0.08 - i * 0.12, -0.36 - i * 0.05, 0.07, 0.11, 0.07, 'fabric_brown', { color: i % 2 ? 0x4a3a2a : 0x6a5238 }); mb.box(0.09, -0.08 - i * 0.12, -0.36 - i * 0.05, 0.07, 0.11, 0.07, 'rubber_black'); }
  if (tier >= 3) for (let i = 0; i < 4; i++) mb.box(-0.27 + i * 0.18, 0.12, 0.18, 0.03, 0.1, 0.3, 'metal_brushed');
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
