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

export const LAB_SPOTS: Partial<Record<MenuRoomId, Spot[]>> = {};

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
