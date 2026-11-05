// What the player owns and where it stands, kept in the browser (localStorage,
// every access guarded: private windows and blocked storage just start empty).
//   owned(id) / addOwned(id, n)           how many of an item the player has bought or been given
//   placements(room) / setPlacements()    what stands where in each menu room (room space, metres, radians)
//   flags: the guide remembers what she has already explained, and whether she is muted
export interface Placement {
  /** unique per placed copy */
  uid: string;
  item: string;
  x: number; y: number; z: number;
  /** yaw (radians) */
  rot: number;
  /** -1 = the floor, else the room's surface index */
  surf: number;
  /** model scale (shelves shrink things) */
  s: number;
}
interface Data { v: 1; owned: Record<string, number>; rooms: Record<string, Placement[]>; flags: Record<string, number | string | boolean> }

const KEY = 'lp.deco.v1';
let data: Data | null = null;
const subs = new Set<() => void>();

function load(): Data {
  if (data) return data;
  let d: Data | null = null;
  try { const raw = localStorage.getItem(KEY); if (raw) d = JSON.parse(raw); } catch { d = null; }
  if (!d || d.v !== 1 || typeof d !== 'object') d = { v: 1, owned: {}, rooms: {}, flags: {} };
  d.owned ||= {}; d.rooms ||= {}; d.flags ||= {};
  data = d;
  return d;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(load())); } catch { /* storage blocked: keep it for this visit */ }
  for (const cb of subs) { try { cb(); } catch (e) { console.warn('deco store', e); } }
}
export function onStore(cb: () => void): () => void { subs.add(cb); return () => subs.delete(cb); }

export function owned(id: string): number { return load().owned[id] ?? 0; }
export function addOwned(id: string, n = 1) { const d = load(); d.owned[id] = Math.max(0, (d.owned[id] ?? 0) + n); save(); }
export function ownedIds(): string[] { return Object.keys(load().owned).filter((k) => load().owned[k] > 0); }

export function placements(room: string): Placement[] { return (load().rooms[room] ?? []).map((p) => ({ ...p })); }
export function setPlacements(room: string, list: Placement[]) { load().rooms[room] = list.map((p) => ({ ...p })); save(); }
/** how many copies of an item stand anywhere */
export function placedCount(id: string): number {
  let n = 0;
  for (const list of Object.values(load().rooms)) for (const p of list) if (p.item === id) n++;
  return n;
}
/** copies owned but not standing anywhere */
export function spare(id: string): number { return Math.max(0, owned(id) - placedCount(id)); }

export function flag<T extends number | string | boolean>(k: string, def: T): T { const v = load().flags[k]; return (v === undefined ? def : v) as T; }
export function setFlag(k: string, v: number | string | boolean) { load().flags[k] = v; save(); }

let uidN = 0;
export function newUid(): string { return Date.now().toString(36) + '-' + (uidN++).toString(36) + Math.floor(Math.random() * 1296).toString(36); }
