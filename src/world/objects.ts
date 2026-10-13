import * as THREE from 'three';
import { ModelBuilder } from '../gfx/modelBuilder';
import { Zone, TileObject, ObjState } from './zone';

export interface ContainerSpec {
  capacity: number;
  name?: string;
  kind: 'drawer' | 'cabinet' | 'fridge' | 'freezer' | 'shelf' | 'crate' | 'locker' | 'trash' | 'counter' | 'vending' | 'desk' | 'oven' | 'box' | 'wardrobe' | 'trunk' | 'cooler' | 'medical' | 'tool' | 'mailbox' | 'pile' | 'bin' | 'safe';
  loot?: string;
  lockable?: boolean;
  cooling?: 'fridge' | 'freezer';
  heating?: boolean;
}

export interface ObjDef {
  key: string;
  name: string;
  w?: number; d?: number;          // footprint in tiles at rot 0
  height: number;
  block?: 'solid' | 'low' | 'table' | 'none';
  blocksSight?: boolean;
  tall?: boolean;                  // force cutout material
  foliage?: boolean;
  dynamic?: boolean;               // rendered as its own mesh (animated)
  onWall?: boolean;                // mounted on the north edge of its tile at rot 0
  ceiling?: boolean;               // ceiling fixture: does not occupy floor space
  model: (mb: ModelBuilder, s: ObjState, o?: TileObject) => void;
  variant?: (s: ObjState) => string;
  container?: ContainerSpec;
  containers?: ContainerSpec[];    // several (e.g. desk drawers + top)
  light?: { color: number; intensity: number; radius: number; y: number; kind: 'fluoro' | 'bulb' | 'sodium' | 'lamp' | 'neon' | 'screen' | 'fire' | 'emergency'; flicker?: number; power?: boolean };
  power?: boolean;                 // appliance needs electricity
  movable?: number;                // weight in kg if it can be picked up / dragged
  disassemble?: { tools: string[]; time: number; skill?: string; yields: [string, number, number][] };
  flammable?: number;
  hp?: number;
  sit?: boolean;
  sleep?: number;                  // sleep quality 0..1
  surface?: number;                // placement surface height
  water?: { tainted?: boolean; capacity: number; tap?: boolean };
  heat?: 'stove' | 'microwave' | 'fire' | 'grill' | 'kettle';
  tags?: string[];
  sound?: 'wood' | 'metal' | 'plastic' | 'fabric' | 'glass' | 'ceramic' | 'paper' | 'flesh';
  brokenPassable?: boolean;
  hum?: string;                    // ambient sound when powered
  lore?: string;                   // readable content id
  desc?: string;
  interact?: string[];             // extra interaction handler keys
  noShadow?: boolean;
  /** creatures may disguise as this */
  mimicOf?: string;
}

const REG = new Map<string, ObjDef>();
export function defObj(d: ObjDef): ObjDef { REG.set(d.key, d); return d; }
export function objDef(key: string): ObjDef | undefined { return REG.get(key); }
export function allObjDefs() { return [...REG.values()]; }
Zone.objDef = (k: string) => REG.get(k);

const geoCache = new Map<string, THREE.BufferGeometry | null>();

/** Cached geometry for an object definition + appearance variant */
export function objectGeometry(d: ObjDef, o: TileObject): THREE.BufferGeometry | null {
  const v = d.variant ? d.variant(o.state || {}) : '';
  const key = d.key + '|' + v;
  let g = geoCache.get(key);
  if (g === undefined) {
    const mb = new ModelBuilder();
    try { d.model(mb, o.state || {}, o); } catch (e) { console.error('model error', d.key, e); }
    g = mb.isEmpty ? null : mb.build();
    geoCache.set(key, g);
  }
  return g;
}

/** Build a standalone geometry (for previews / icons / dynamic objects) */
export function buildObjGeometry(key: string, state: ObjState = {}): THREE.BufferGeometry | null {
  const d = objDef(key);
  if (!d) return null;
  return objectGeometry(d, { uid: 0, key, x: 0, y: 0, rot: 0, state });
}

export function clearObjCache() { geoCache.clear(); }
