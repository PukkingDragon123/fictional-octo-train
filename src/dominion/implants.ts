// Visible cyberware on a dominated creature: a steel cranial plate bolted
// over the cut, a status LED in the brain's tier colour, a whip antenna and a
// cable run down the neck. Built once per tier (shared geometry), sized to the
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
  const led = BRAINS[tier - 1].led;
  // cranial plate (unit size: the head is ~1 wide)
  mb.box(0, 0, 0, 0.62, 0.1, 0.7, 'metal_brushed', { color: 0xa8b0b8 });
  mb.box(0, 0.06, 0, 0.5, 0.04, 0.56, 'metal_dark');
  for (const [x, z] of [[-0.26, -0.3], [0.26, -0.3], [-0.26, 0.3], [0.26, 0.3]]) mb.cylinder(x, 0.05, z, 0.035, 0.04, 6, 'metal_brass');
  // stitched seam showing under the rim
  mb.box(0, -0.04, 0, 0.66, 0.03, 0.74, 'white', { color: 0x7a1a14 });
  // status lights
  for (let i = 0; i < tier + 1; i++) mb.box(-0.12 + i * 0.09, 0.09, 0.22, 0.05, 0.03, 0.05, 'white', { color: led, emissive: 2.2 });
  // antenna
  mb.cylinder(0.2, 0.08, -0.18, 0.02, 0.55 + tier * 0.12, 5, 'metal_grey');
  mb.box(0.2, 0.66 + tier * 0.12, -0.18, 0.06, 0.06, 0.06, 'white', { color: led, emissive: 2.4 });
  // cable run down the back of the neck
  for (let i = 0; i < 4; i++) mb.box(-0.08, -0.08 - i * 0.14, -0.36 - i * 0.05, 0.07, 0.12, 0.07, 'rubber_black');
  for (let i = 0; i < 4; i++) mb.box(0.08, -0.08 - i * 0.14, -0.36 - i * 0.05, 0.07, 0.12, 0.07, 'plastic_red', { color: 0xb02a20 });
  if (tier >= 3) for (let i = 0; i < 4; i++) mb.box(-0.21 + i * 0.14, 0.14, -0.05, 0.03, 0.12, 0.4, 'metal_brushed');
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
