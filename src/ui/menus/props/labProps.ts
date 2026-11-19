// THE LAB'S DETAILED PROPS (round 22): real-world objects from Poly Haven (CC0), converted with lowpix into lit,
// game-ready models at their true size (public/props/lab, CREDITS.md there), and stood about the menu's rooms:
// shelving, a drawer cabinet, gas bottles, a fire extinguisher, carts, a welder, tool chests, microscopes, glassware,
// lamps, a radio, clocks, plants, boxes and the small things people leave on benches. They light with each room's
// own lamps and go through its pixel pipeline like the hand-built kit.
//   installLabProps()   once; each room's props load the first time that room is on screen (one fetch per model,
//                       shared by every copy), so the menu's first load does not pay for them
// A spot with `need` stands only once that station is built (the lab from zero: a bare room, taped build sites,
// furnished as it is built). Nothing here takes the pointer; the rooms' hot props stay as they are.
import * as THREE from 'three';
import { onMenuRoom, onActiveMenuRoom, activeMenuRoom, type MenuRoom, type MenuRoomId } from '../menuRooms';
import { built, onLab, type StationKey } from '../lab/stations';
import { loadProp } from './glb';

/** a prop's place: model, position (room space, its base on y), yaw in degrees, scale, and the station it waits for */
interface Spot { a: string; p: [number, number, number]; r?: number; s?: number; need?: StationKey }

const DEG = Math.PI / 180;
const URL_OF = (a: string) => `${import.meta.env.BASE_URL}props/lab/${a}.glb`;

export const LAB_SPOTS: Partial<Record<MenuRoomId, Spot[]>> = {
  // the control room (rooms/research.ts: W 3.6, back -3.0, front 3.3) and its fab bay along the front wall
  research: [
    // steel shelving against the back wall between the fridge and the main computer, stocked
    { a: 'shelves', p: [-1.75, 0, -2.72] },
    { a: 'carton', p: [-1.75, 0.135, -2.72], r: 90 },
    { a: 'gallon', p: [-1.9, 0.625, -2.7], r: 20 },
    { a: 'kettle', p: [-1.6, 0.625, -2.72], r: -30 },
    { a: 'toolbox', p: [-1.75, 1.155, -2.72], r: 4 },
    { a: 'plant_small', p: [-1.62, 1.635, -2.7] },
    // a breaker box on the back wall over the stores in the right corner
    { a: 'power_box', p: [2.75, 1.35, -2.8] },
    // a glassware cart in the open floor left of the dissection table, a stool at the microscope bench
    { a: 'tool_cart', p: [-1.75, 0, -0.2], need: 'fridge' },
    { a: 'chem_set', p: [-1.75, 0.955, -0.2], need: 'fridge' },
    { a: 'stool_tall', p: [-2.7, 0, -1.2], r: 30, need: 'fridge' },
    { a: 'stool_low', p: [1.55, 0, 0.5], r: 15 },
    // an old brass microscope on the centrifuge bench under the observation window
    { a: 'microscope_old', p: [3.25, 0.92, -0.3], r: -90 },
    // the fab bay: a lamp and a breaker on the wall, gas bottles in the corner, a drum by the door
    { a: 'wall_lamp', p: [0.3, 2.15, 3.23], r: 180, need: 'filament' },
    { a: 'power_box', p: [0.3, 1.2, 3.1], r: 180, need: 'filament' },
    { a: 'gas_tank', p: [3.3, 0, 2.5], r: -70, need: 'filament' },
    { a: 'propane', p: [3.28, 0, 2.05], r: 40, need: 'filament' },
    { a: 'drum', p: [-2.8, 0, 2.95], need: 'filament' },
  ],
  // the codex archive (rooms/archive.ts: W 3.9, back -3.6, front 3.4)
  archive: [
    { a: 'storage_cart', p: [-2.55, 0, -1.5], r: 90 },
    { a: 'carton', p: [-2.55, 1.365, -1.6], r: 80 },
    { a: 'carton', p: [-2.55, 0.715, -1.35], r: 95 },
    { a: 'drum', p: [-3.3, 0, -1.3] },
    { a: 'hand_truck', p: [2.6, 0, -1.6], r: -60 },
    { a: 'radio', p: [-2.45, 0.78, 1.6], r: 70 },
  ],
  // unit room 4 (room3d.ts / roomKit.ts: W 3.4, back -2.4)
  subject: [
    { a: 'propane', p: [-1.6, 0, -2.15], r: 30 },
    { a: 'gas_tank', p: [-1.15, 0, -2.12], r: -20 },
    { a: 'drum', p: [1.05, 0, -2.05] },
  ],
};

interface Placed { room: MenuRoom; group: THREE.Group; items: { s: Spot; o: THREE.Object3D }[]; loading: boolean }
const placed = new Map<MenuRoomId, Placed>();
const rooms = new Map<MenuRoomId, MenuRoom>();

/** the rooms' own kit uses Lambert on the cheap path (scene/pixtex.ts): do the same */
function lowPath(scene: THREE.Scene): boolean {
  let low = false;
  scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (!low && m && (m as THREE.MeshLambertMaterial).isMeshLambertMaterial && (m as THREE.MeshLambertMaterial).map) low = true; });
  return low;
}

function show(pl: Placed) { for (const it of pl.items) it.o.visible = !it.s.need || built(it.s.need); }

async function furnish(id: MenuRoomId) {
  const room = rooms.get(id), spots = LAB_SPOTS[id];
  if (!room || !spots?.length) return;
  let pl = placed.get(id);
  if (pl && pl.room === room) return;
  pl?.group.removeFromParent();
  const group = new THREE.Group();
  group.name = 'labProps';
  pl = { room, group, items: [], loading: true };
  placed.set(id, pl);
  room.scene.add(group);
  const low = lowPath(room.scene);
  await Promise.all(spots.map(async (s) => {
    try {
      const m = await loadProp(URL_OF(s.a), low);
      m.position.set(...s.p);
      m.rotation.y = (s.r ?? 0) * DEG;
      if (s.s) m.scale.setScalar(s.s);
      m.name = 'prop:' + s.a;
      group.add(m);
      pl!.items.push({ s, o: m });
      m.visible = !s.need || built(s.need);
    } catch (e) { console.warn('[labprops]', s.a, e); }
  }));
  pl.loading = false;
}

let installed = false;
export function installLabProps() {
  if (installed) return;
  installed = true;
  onMenuRoom((r) => { rooms.set(r.id, r); if (activeMenuRoom() === r.id) void furnish(r.id); });
  onActiveMenuRoom((id) => { if (id) void furnish(id); });
  onLab(() => { for (const pl of placed.values()) show(pl); });
  if (import.meta.env.DEV) (window as unknown as { __labProps?: unknown }).__labProps = { placed, furnish, LAB_SPOTS, loadProp, URL_OF };
}
