// THE FACILITY (round 26): the run-down wing of the Meridian Institute of Liminality that Dr. Calder offers the
// operator at the start of a new game. It is a list of rooms, each with a CONDITION (0 derelict, 1 cleared,
// 2 repaired, 3 restored), a LOCK, the FURNITURE placed in it and the STAT BONUSES both give. The title's
// facility map (src/ui/menus/front/facilityMap.ts) draws every room as a diorama from this state; build mode
// (part B) restores rooms and places furniture through the setters below. It lives on this browser like the
// profile (localStorage) and rides along in every save (SaveData.facility), so a save restores it.
//
//   facility()                       the whole state (read only: change it through the setters)
//   room(id)                         one room
//   ROOMS / roomDef(id)              the static list: name, map cell, the screen it opens, its stat per level
//   signOffer() / offerSigned()      the contract (the new game's opening)
//   setCondition(id, c)  unlockRoom(id)  lockRoom(id)
//   placeFurniture(id, f) -> uid     moveFurniture(id, uid, at)  removeFurniture(id, uid)
//   registerFurniture(def)           part B: a furniture kind and the stats it gives (FURNITURE)
//   roomBonuses(id) / facilityBonuses()   summed stat bonuses (condition + furniture)
//   onFacility(fn) -> off            any change
//   serializeFacility() / loadFacility(data, merge)   the save system's side
import { bus } from '../core/events';

export type RoomId = 'unit' | 'control' | 'monitors' | 'lattice' | 'archive' | 'vault' | 'fab' | 'clone' | 'workshop' | 'bunks' | 'dress' | 'canteen';
/** 0 derelict (debris, tarps, dead lights) · 1 cleared · 2 repaired · 3 restored */
export type Condition = 0 | 1 | 2 | 3;
/** the stats a room or a piece of furniture raises (part B may add more) */
export type FacilityStat = 'morale' | 'rest' | 'health' | 'sanity' | 'research' | 'craft' | 'storage' | 'income';
export type Bonuses = Partial<Record<FacilityStat, number>>;

export interface Furniture {
  uid: string;
  kind: string;
  /** room-local metres from the room's centre (x across, z deep), and its turn (radians) */
  x: number; z: number; rot: number;
}
export interface FacilityRoom { id: RoomId; condition: Condition; locked: boolean; furniture: Furniture[] }
export interface FacilityState { v: 1; signed: boolean; signedAt?: number; rooms: Record<RoomId, FacilityRoom> }

/** where a room leads when the map opens it (title.ts): a menu room and an optional act inside it */
export type RoomScreen = { view: 'subject' | 'research' | 'archive' | 'monitor'; act?: string } | null;
export interface RoomDef {
  id: RoomId; name: string;
  /** the map cell: column, row (4 x 3) */
  cell: [number, number];
  screen: RoomScreen;
  /** what each condition level adds (times the level) */
  perLevel: Bonuses;
  /** open from the first day (the rest start locked) */
  open?: boolean;
  /** a lab station whose build opens it (src/ui/menus/lab/stations.ts) */
  station?: string;
}
export const ROOMS: RoomDef[] = [
  { id: 'monitors', name: 'Observation', cell: [0, 0], screen: { view: 'monitor' }, perLevel: { sanity: 1 }, open: true },
  { id: 'control', name: 'Control room', cell: [1, 0], screen: { view: 'research' }, perLevel: { research: 1 }, open: true },
  { id: 'lattice', name: 'Research lattice', cell: [2, 0], screen: { view: 'research', act: 'tree' }, perLevel: { research: 2 }, station: 'lattice' },
  { id: 'archive', name: 'Codex archive', cell: [3, 0], screen: { view: 'archive' }, perLevel: { research: 1, storage: 1 }, station: 'archive' },
  { id: 'unit', name: 'Unit room 4', cell: [0, 1], screen: { view: 'subject' }, perLevel: { health: 1 }, open: true },
  { id: 'vault', name: 'Containment', cell: [1, 1], screen: { view: 'archive', act: 'inhabitants' }, perLevel: { sanity: 1, storage: 1 } },
  { id: 'fab', name: 'Fabrication', cell: [2, 1], screen: { view: 'research', act: 'fab' }, perLevel: { craft: 2 }, station: 'filament' },
  { id: 'clone', name: 'Clone vat', cell: [3, 1], screen: null, perLevel: { health: 2 }, station: 'clone' },
  { id: 'workshop', name: 'Workshop', cell: [0, 2], screen: { view: 'research', act: 'talent' }, perLevel: { craft: 1, income: 1 }, station: 'talent' },
  { id: 'bunks', name: 'Bunks', cell: [1, 2], screen: null, perLevel: { rest: 2, morale: 1 } },
  { id: 'dress', name: 'Dressing room', cell: [2, 2], screen: null, perLevel: { morale: 2 }, station: 'decorate' },
  { id: 'canteen', name: 'Canteen', cell: [3, 2], screen: null, perLevel: { morale: 1, health: 1 }, station: 'commissary' },
];
export const roomDef = (id: RoomId) => ROOMS.find((r) => r.id === id)!;

/** a furniture kind (part B fills the catalogue) */
export interface FurnitureDef { kind: string; name: string; stats: Bonuses; rooms?: RoomId[] }
export const FURNITURE = new Map<string, FurnitureDef>();
export function registerFurniture(d: FurnitureDef) { FURNITURE.set(d.kind, d); }

// ---------------------------------------------------------------- state
const KEY = 'noclip.facility';
let cache: FacilityState | null = null;

function fresh(): FacilityState {
  const rooms = {} as Record<RoomId, FacilityRoom>;
  for (const d of ROOMS) rooms[d.id] = { id: d.id, condition: d.open ? 1 : 0, locked: !d.open, furniture: [] };
  return { v: 1, signed: false, rooms };
}
/** an operator from before the facility: every lab station already built opens its room, repaired */
function seedFromLab(s: FacilityState) {
  let prof: { unlocked?: string[] } = {};
  try { prof = JSON.parse(localStorage.getItem('noclip.profile') || '{}'); } catch { /* none */ }
  const un = new Set(prof.unlocked ?? []);
  for (const d of ROOMS) if (d.station && un.has('lab:' + d.station)) { const r = s.rooms[d.id]; r.locked = false; r.condition = Math.max(r.condition, 2) as Condition; }
}
export function facility(): FacilityState {
  if (cache) return cache;
  let s: FacilityState | null = null;
  try { const raw = localStorage.getItem(KEY); if (raw) s = JSON.parse(raw); } catch { /* storage blocked: memory only */ }
  const base = fresh();
  if (s && s.v === 1 && s.rooms) {
    for (const d of ROOMS) { const r = s.rooms[d.id]; if (r) base.rooms[d.id] = { id: d.id, condition: clampC(r.condition), locked: !!r.locked, furniture: Array.isArray(r.furniture) ? r.furniture : [] }; }
    base.signed = !!s.signed; base.signedAt = s.signedAt;
  } else seedFromLab(base);
  cache = base;
  return cache;
}
const clampC = (c: unknown): Condition => Math.max(0, Math.min(3, Math.round(Number(c) || 0))) as Condition;
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(facility())); } catch { /* ignore */ }
  bus.emit('facilityChanged', facility());
}
export function onFacility(fn: (s: FacilityState) => void): () => void { return bus.on('facilityChanged', fn); }

export const room = (id: RoomId) => facility().rooms[id];
export const offerSigned = () => facility().signed;
export function signOffer() { const s = facility(); s.signed = true; s.signedAt = Date.now(); persist(); }
export function setCondition(id: RoomId, c: Condition) { room(id).condition = clampC(c); persist(); }
export function unlockRoom(id: RoomId) { room(id).locked = false; persist(); }
export function lockRoom(id: RoomId) { room(id).locked = true; persist(); }

let uidN = 0;
export function placeFurniture(id: RoomId, f: Omit<Furniture, 'uid'> & { uid?: string }): string {
  const uid = f.uid ?? Date.now().toString(36) + '-' + (uidN++).toString(36);
  room(id).furniture.push({ uid, kind: f.kind, x: f.x, z: f.z, rot: f.rot });
  persist();
  return uid;
}
export function moveFurniture(id: RoomId, uid: string, to: { x: number; z: number; rot?: number }) {
  const f = room(id).furniture.find((q) => q.uid === uid);
  if (!f) return;
  f.x = to.x; f.z = to.z; if (to.rot !== undefined) f.rot = to.rot;
  persist();
}
export function removeFurniture(id: RoomId, uid: string) { const r = room(id); r.furniture = r.furniture.filter((q) => q.uid !== uid); persist(); }

/** a room's stat bonuses: its level times its per-level stats, plus every piece of furniture in it */
export function roomBonuses(id: RoomId): Bonuses {
  const r = room(id), out: Bonuses = {};
  const add = (b: Bonuses, k = 1) => { for (const [s, v] of Object.entries(b) as [FacilityStat, number][]) out[s] = (out[s] ?? 0) + v * k; };
  if (!r.locked) add(roomDef(id).perLevel, r.condition);
  for (const f of r.furniture) { const d = FURNITURE.get(f.kind); if (d) add(d.stats); }
  return out;
}
export function facilityBonuses(): Bonuses {
  const out: Bonuses = {};
  for (const d of ROOMS) for (const [s, v] of Object.entries(roomBonuses(d.id)) as [FacilityStat, number][]) out[s] = (out[s] ?? 0) + v;
  return out;
}

// ---------------------------------------------------------------- the save system's side (src/game/save.ts)
export function serializeFacility(): FacilityState { return JSON.parse(JSON.stringify(facility())); }
/** a save's facility: merged into this browser's (the furthest condition, every placed piece), or replacing it */
export function loadFacility(data: unknown, merge = true) {
  const s = data as FacilityState | null;
  if (!s || s.v !== 1 || !s.rooms) return;
  const cur = facility();
  for (const d of ROOMS) {
    const r = s.rooms[d.id];
    if (!r) continue;
    const c = cur.rooms[d.id];
    if (!merge) { cur.rooms[d.id] = { id: d.id, condition: clampC(r.condition), locked: !!r.locked, furniture: [...(r.furniture ?? [])] }; continue; }
    c.condition = Math.max(c.condition, clampC(r.condition)) as Condition;
    c.locked = c.locked && !!r.locked;
    for (const f of r.furniture ?? []) if (!c.furniture.some((q) => q.uid === f.uid)) c.furniture.push({ ...f });
  }
  cur.signed = cur.signed || !!s.signed;
  persist();
}
/** tests and a fresh start */
export function resetFacility() { cache = fresh(); persist(); }
