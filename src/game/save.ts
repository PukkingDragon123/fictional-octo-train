// Save games in IndexedDB. A save is small: world seed + sandbox + the op
// log (every change ever made to the world, replayed on load) + the local
// survivor + creatures + missions + clock.
import { G } from './G';
import { opLog } from './ops';
import { serializeContainer, deserializeContainer } from '../items/factory';
import { peekUid, restoreUidCounter, setUidBase } from '../core/rng';
import type { Player } from '../entities/player';
import type { Body } from '../survival/body';

export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  id: string;
  name: string;
  savedAt: number;
  seed: number;
  sandbox: any;
  hours: number;
  collapse: number;
  missions: any;
  log: string[];
  fires: Record<string, any>;
  player: any;
  creatures: any[];
  uid: number;
  playMinutes: number;
  vehicles?: any[];
}
export interface SaveMeta { id: string; name: string; savedAt: number; hours: number; zone: string; character: string; version: number }

// ---------------------------------------------------------------- IndexedDB
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open('noclip', 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('saves', { keyPath: 'id' }); d.createObjectStore('meta', { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
export async function listSaves(): Promise<SaveMeta[]> {
  try { const all = await tx<SaveMeta[]>('meta', 'readonly', (s) => s.getAll() as IDBRequest<SaveMeta[]>); return all.sort((a, b) => b.savedAt - a.savedAt); }
  catch { return []; }
}
export async function readSave(id: string): Promise<SaveData | null> {
  try { return (await tx<SaveData>('saves', 'readonly', (s) => s.get(id) as IDBRequest<SaveData>)) || null; } catch { return null; }
}
export async function deleteSave(id: string) {
  await tx('saves', 'readwrite', (s) => s.delete(id));
  await tx('meta', 'readwrite', (s) => s.delete(id));
}
async function writeSave(d: SaveData) {
  await tx('saves', 'readwrite', (s) => s.put(d));
  const meta: SaveMeta = { id: d.id, name: d.name, savedAt: d.savedAt, hours: d.hours, zone: d.player.zoneKey, character: d.player.name, version: d.version };
  await tx('meta', 'readwrite', (s) => s.put(meta));
}

// ---------------------------------------------------------------- body & player
const BODY_SKIP = new Set(['rng', 'onMoodle', 'onXp', 'lastLevels']);
export function serializeBody(b: Body): any {
  const o: any = {};
  for (const [k, v] of Object.entries(b)) {
    if (BODY_SKIP.has(k) || typeof v === 'function') continue;
    if (v instanceof Set) o[k] = { __set: [...v] };
    else o[k] = v;
  }
  return JSON.parse(JSON.stringify(o));
}
export function deserializeBody(b: Body, o: any) {
  for (const [k, v] of Object.entries(o || {})) {
    if (BODY_SKIP.has(k)) continue;
    if (v && typeof v === 'object' && '__set' in (v as any)) (b as any)[k] = new Set((v as any).__set);
    else (b as any)[k] = v;
  }
}

export function serializePlayer(p: Player): any {
  return {
    id: p.id, name: p.name, app: p.app, occupation: p.occupation, zoneKey: p.zoneKey, x: p.x, z: p.z, facing: p.facing,
    body: serializeBody(p.body), inv: serializeContainer(p.inv),
    worn: [...p.worn].map(([slot, it]) => [slot, it.uid]),
    handR: p.handR?.uid ?? null, handL: p.handL?.uid ?? null, light: p.lightItem?.uid ?? null, lightOn: p.flashlightOn,
    kills: p.kills, daysSurvived: p.daysSurvived, known: [...((p as any).knownSignals || [])], recipes: [...((p as any).knownRecipes || [])],
  };
}
export function restorePlayer(p: Player, s: any) {
  p.name = s.name; p.app = s.app; p.occupation = s.occupation;
  deserializeBody(p.body, s.body);
  p.inv = deserializeContainer(s.inv);
  p.inv.owner = 'player:' + p.id;
  const byUid = new Map<number, any>();
  for (const it of p.allItems()) { byUid.set(it.uid, it); setUidBase(it.uid + 1); }
  p.worn.clear();
  for (const [, uidv] of s.worn || []) { const it = byUid.get(uidv); if (it) p.wear(it); }
  if (s.handR != null && byUid.get(s.handR)) p.equip(byUid.get(s.handR), 'R');
  if (s.handL != null && byUid.get(s.handL)) p.equip(byUid.get(s.handL), 'L');
  if (s.light != null) p.lightItem = byUid.get(s.light) || null;
  p.flashlightOn = !!s.lightOn && !!p.lightItem;
  p.kills = s.kills || 0; p.daysSurvived = s.daysSurvived || 0;
  (p as any).knownSignals = new Set(s.known || []);
  (p as any).knownRecipes = new Set(s.recipes || []);
  p.outfitDirty = true;
}

// ---------------------------------------------------------------- whole game
export function snapshotGame(name?: string): SaveData {
  const p = G.local;
  const creatures: any[] = [];
  for (const c of (G.creatures?.creatures?.values?.() || []) as Iterable<any>) {
    if (c.dead && !c.inv?.items.length) continue;
    creatures.push({ id: c.id, k: c.sp.key, z: c.zoneKey, x: c.x, zz: c.z, hp: c.hp, dead: c.dead, butchered: c.butchered, tamedBy: c.tamedBy, feeds: c.feeds, scanned: c.scanned, home: c.home, inv: c.inv ? serializeContainer(c.inv) : null, st: c.state, mem: plainMem(c.mem) });
  }
  const fires: Record<string, any> = {};
  for (const z of G.zones.values()) if (z.meta.fires && Object.keys(z.meta.fires).length) fires[z.key] = z.meta.fires;
  return {
    version: SAVE_VERSION,
    id: G.saveId || ('w' + Date.now().toString(36)),
    name: name || `${p.name} — day ${Math.floor(G.clock.hours / 24) + 1}`,
    savedAt: Date.now(),
    seed: G.worldSeed, sandbox: G.sandbox, hours: G.clock.hours, collapse: G.collapse,
    missions: G.missions?.serialize?.() ?? null,
    log: opLog.slice(), fires,
    player: serializePlayer(p),
    creatures, uid: peekUid(), vehicles: (G as any).vehicles?.serialize?.() ?? [],
    playMinutes: (G.playMinutes || 0) + (performance.now() - (G.sessionStart || 0)) / 60000,
  };
}
export async function saveGame(name?: string): Promise<boolean> {
  if (G.role === 'client' || !G.local || G.local.body.dead) return false;
  try {
    const d = snapshotGame(name);
    G.saveId = d.id;
    await writeSave(d);
    return true;
  } catch (e) { console.error('save failed', e); return false; }
}

/** the JSON-safe part of a creature's memory (numbers, strings, flags, small plain data) */
function plainMem(mem: Record<string, any> | undefined): Record<string, any> | undefined {
  if (!mem) return undefined;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(mem)) {
    if (v == null || typeof v === 'function') continue;
    if (typeof v !== 'object') { out[k] = v; continue; }
    try { const j = JSON.stringify(v); if (j.length < 2000) out[k] = JSON.parse(j); } catch { /* cyclic or exotic: skip */ }
  }
  return out;
}

/** restore creatures etc. after the world has been rebuilt (called by the session) */
export function restoreAfterLoad(s: SaveData) {
  restoreUidCounter(s.uid || 0);
  for (const c of s.creatures || []) {
    const cr = G.creatures?.spawn?.(c.k, c.z, c.x, c.zz, { id: c.id, hp: c.hp, tamedBy: c.tamedBy, feeds: c.feeds, scanned: c.scanned, home: c.home });
    if (!cr) continue;
    if (c.dead) { cr.dead = true; cr.deathT = 99; cr.butchered = !!c.butchered; }
    if (c.inv) cr.inv = deserializeContainer(c.inv);
    if (c.mem) Object.assign(cr.mem, c.mem);
    if (c.st && !c.dead) cr.state = c.st;
  }
  for (const [zk, f] of Object.entries(s.fires || {})) { const z = G.getZone(zk); z.meta.fires = f; }
  if (s.vehicles) { for (const v of s.vehicles) G.getZone(v.zone); (G as any).vehicles?.load?.(s.vehicles); }
}
