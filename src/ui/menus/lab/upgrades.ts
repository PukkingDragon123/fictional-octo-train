// THE FACILITY UPGRADES IN THE LAB HUB (round 27): every facility node researched on the lattice
// (src/game/facilityTree.ts) shows in the old lab hub's rooms. Its prop (./hubModels.ts) stands at its own spot
// in the room it belongs to and rises out of the floor in a puff the first time it is seen (the lab's build moment,
// ./site.ts); the daylight troughs hang new white fittings under the ceiling and light every room brighter; the
// epoxy floors lay a clear glossy coat over the tiles. One HubUpgrades per room (title.ts builds them once the
// rooms are up and ticks them); each re-reads the research whenever a node is bought.
import * as THREE from 'three';
import type { FMats } from '../scene/pixtex';
import { FAC_NODES, facRank, fitLevel, type HubRoom } from '../../../game/facilityTree';
import { bus } from '../../../core/events';
import { hubModel } from './hubModels';
import { startRise, stepRise, type Rise } from './site';
import { gameSound } from '../monitor/props';

/** where each upgrade's props stand: room-local x, z (metres) and the turn; one per prop of the node */
const SPOTS: Record<string, [number, number, number, number?][]> = {
  // the codex archive, the hall of the wing: cases down the left wall, the jars and the enclosure on the floor, a bunk
  // room's frame by the stacks, the CRT bank and the vending machine in the back corners, shelving by the dock
  fz_case: [[-2.95, -0.55, Math.PI / 2]],
  fz_hall: [[-2.95, 0.45, Math.PI / 2], [-2.95, -1.55, Math.PI / 2]],
  fz_jars: [[-1.95, 0.05, 0.6]],
  fz_encl: [[-1.55, -1.1, 0.35, 0.8]],
  fq_bunk: [[-3.2, 1.95, 0]],
  fq_cot: [[-2.15, 2.1, 0]],
  fl_crt: [[-3.2, -3.05, 0.35]],
  fq_vend: [[2.95, -3.2, -0.2]],
  fl_shelves: [[3.4, -1.65, -Math.PI / 2]],
  fw_hydro: [[3.3, 1.1, -Math.PI / 2]],
  // the control room: the lab bench by the dissection table, the ward bed between the table and the clone vat
  fl_bench: [[-1.45, -0.3, 0.2]],
  fq_hospbed: [[1.7, -0.45, 0]],
  // unit room 4: the armoury and the medical cabinet on the back wall either side of the hatch; the workshop down the
  // left wall
  fw_armoury: [[-1.25, -2.15, 0]],
  fq_medcab: [[1.3, -2.12, 0]],
  fw_tools: [[-2.95, -1.0, Math.PI / 2]],
  fw_bench: [[-2.85, 0.6, Math.PI / 2]],
  fw_welder: [[-2.8, 2.0, Math.PI / 2]],
};
export interface HubSpec {
  room: HubRoom;
  /** the floor's rectangle (the epoxy coat) and the ceiling */
  floor: { x0: number; x1: number; z0: number; z1: number }; ceil: number;
  /** where the daylight troughs hang */
  troughs: [number, number][];
}

export class HubUpgrades {
  group = new THREE.Group();
  private props = new Map<string, THREE.Object3D[]>();
  private rises: Rise[] = [];
  private lights: THREE.PointLight[] = [];
  private fittings = new THREE.Group();
  private coat: THREE.Mesh | null = null;
  private lightLv = -1; private floorLv = -1;
  private ready = false;
  constructor(private spec: HubSpec, scene: THREE.Scene, private mats: FMats) {
    this.group.name = 'hubUpgrades';
    this.group.add(this.fittings);
    scene.add(this.group);
    this.sync();
    this.ready = true;
    bus.on('researchUnlocked', () => this.sync());
  }
  /** the props of every researched node in this room; new ones rise (after the first build) */
  sync() {
    for (const d of FAC_NODES) {
      // (the transport line's tiers stand at the delivery dock: ./dock.ts)
      if (d.room !== this.spec.room || !d.props || d.branch === 'f_freight' || this.props.has(d.key) || facRank(d.key) < 1) continue;
      const spots = SPOTS[d.key] ?? [];
      const made: THREE.Object3D[] = [];
      d.props.forEach((kind, i) => {
        const at = spots[i];
        if (!at) return;
        const g = new THREE.Group();
        g.add(hubModel(kind, this.mats));
        g.position.set(at[0], 0, at[1]); g.rotation.y = at[2]; if (at[3]) g.scale.setScalar(at[3]);
        g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
        this.group.add(g);
        made.push(g);
      });
      this.props.set(d.key, made);
      if (this.ready && made.length) { this.rises.push(startRise(made)); gameSound('cy_clank', 0.5); }
    }
    this.fit();
  }
  /** the troughs and their light; the floor's coat */
  private fit() {
    const S = this.spec, lv = fitLevel('light'), fl = fitLevel('floor');
    if (lv !== this.lightLv) {
      this.lightLv = lv;
      for (const l of this.lights) l.removeFromParent();
      this.lights = [];
      this.fittings.clear();
      if (lv > 0) for (const [x, z] of S.troughs) {
        const t = hubModel('trough', this.mats);
        t.position.set(x, S.ceil - 2.06, z);
        this.fittings.add(t);
        const l = new THREE.PointLight(lv > 1 ? 0xf4f8ff : 0xfff4e4, lv > 1 ? 1.7 : 1.0, 5.5, 1.6);
        l.position.set(x, S.ceil - 0.75, z);
        this.fittings.add(l);
        this.lights.push(l);
      }
    }
    if (fl !== this.floorLv) {
      this.floorLv = fl;
      this.coat?.removeFromParent(); this.coat = null;
      if (fl > 0) {
        const f = S.floor;
        this.coat = new THREE.Mesh(new THREE.PlaneGeometry(f.x1 - f.x0, f.z1 - f.z0), new THREE.MeshStandardMaterial({ color: 0x5a6a62, roughness: 0.1, metalness: 0.55, transparent: true, opacity: 0.22, depthWrite: false }));
        this.coat.rotation.x = -Math.PI / 2; this.coat.position.set((f.x0 + f.x1) / 2, 0.012, (f.z0 + f.z1) / 2);
        this.coat.renderOrder = 3; this.coat.userData.noGlow = true; this.coat.receiveShadow = true;
        this.group.add(this.coat);
      }
    }
  }
  update(dt: number) {
    for (let i = this.rises.length - 1; i >= 0; i--) if (!stepRise(this.rises[i], dt)) this.rises.splice(i, 1);
  }
}
