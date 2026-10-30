// The main menu's rooms (the monitor room, the monster containment, the experiment lab and the
// subject room) announce themselves here, so other systems can furnish them without touching the
// room code: the room decorator (blueprint mode, collectibles) and the researcher guide.
//
//   registerMenuRoom(room)          a room calls this once its scene is built (and again never)
//   onMenuRoom(cb)                  cb(room) for every room, now and later; returns an unsubscribe
//   menuRooms()                     the rooms registered so far
//   setActiveMenuRoom(id) / activeMenuRoom() / onActiveMenuRoom(cb)   which room the player is looking at
import type * as THREE from 'three';

export type MenuRoomId = 'monitor' | 'containment' | 'lab' | 'subject';

export interface MenuRoom {
  id: MenuRoomId;
  /** the room's own scene (add furniture, figures, characters here) */
  scene: THREE.Scene;
  /** the camera currently showing this room */
  camera: THREE.Camera;
  /** a group the decorator may fill with placed items (persisted by the decorator) */
  deco: THREE.Group;
  /** where things can stand: an axis-aligned floor rectangle in room space, y = floor height */
  floor: { minX: number; maxX: number; minZ: number; maxZ: number; y: number };
  /** shelves / surfaces items may be placed on (top faces, room space) */
  surfaces?: { minX: number; maxX: number; minZ: number; maxZ: number; y: number }[];
  /** a point the guide likes to stand at, and where she should look */
  guideSpot?: { pos: THREE.Vector3; look: THREE.Vector3 };
  /** the DOM element the room renders into (for overlays and pointer events) */
  host: HTMLElement;
  /** convert a pointer event to a world ray hit on the floor/surfaces (null = none) */
  pick?(clientX: number, clientY: number): THREE.Vector3 | null;
}

const rooms = new Map<MenuRoomId, MenuRoom>();
const subs = new Set<(r: MenuRoom) => void>();
let active: MenuRoomId | null = null;
const activeSubs = new Set<(id: MenuRoomId | null) => void>();

export function registerMenuRoom(room: MenuRoom) {
  rooms.set(room.id, room);
  for (const cb of subs) { try { cb(room); } catch (e) { console.warn('menu room hook', e); } }
}
export function onMenuRoom(cb: (r: MenuRoom) => void): () => void {
  subs.add(cb);
  for (const r of rooms.values()) { try { cb(r); } catch (e) { console.warn('menu room hook', e); } }
  return () => subs.delete(cb);
}
export function menuRooms(): MenuRoom[] { return [...rooms.values()]; }
export function setActiveMenuRoom(id: MenuRoomId | null) {
  if (active === id) return;
  active = id;
  for (const cb of activeSubs) { try { cb(id); } catch (e) { console.warn('menu room active hook', e); } }
}
export function activeMenuRoom(): MenuRoomId | null { return active; }
export function onActiveMenuRoom(cb: (id: MenuRoomId | null) => void): () => void { activeSubs.add(cb); return () => activeSubs.delete(cb); }
