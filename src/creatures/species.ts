import * as THREE from 'three';
import { ModelBuilder } from '../gfx/modelBuilder';
import { worldMaterial } from '../gfx/materials';
import type { Creature } from './creature';
import type { InjuryType } from '../survival/body';
import { defSpecies } from './registry';

export type Temperament = 'peaceful' | 'skittish' | 'curious' | 'neutral' | 'territorial' | 'hostile' | 'stalker' | 'ambush' | 'hazard';

export interface Rig {
  root: THREE.Group;        // positioned/rotated by the creature (facing +z)
  body: THREE.Group;        // bob/tilt
  parts: Record<string, THREE.Object3D>;
  /** eye glow meshes (visible in darkness) */
  eyes?: THREE.Object3D[];
  /** world-space height of the head for bubbles/sound */
  headY: number;
}

export interface SpeciesDef {
  key: string;
  name: string;
  /** scanner designation */
  code: string;
  temperament: Temperament;
  threat: number;           // 0..5 scanner threat rating
  hp: number;
  walk: number;             // m/s
  run: number;
  turn?: number;
  radius: number;
  height: number;
  sight: number;            // metres in good light
  fov: number;              // radians half-angle
  hearing: number;          // multiplier on noise radius
  nightVision?: boolean;
  smell?: boolean;          // follows scent trails
  vibration?: boolean;      // senses footsteps (ignores sight)
  light?: 'attracted' | 'repelled';
  attack?: { dmg: [number, number]; range: number; cooldown: number; kinds: InjuryType[]; corrupt: number; knock?: number; grab?: boolean; parts?: string[] };
  zones: string[];
  weight: number;           // spawn weight
  group?: [number, number];
  maxPerZone?: number;
  diet?: 'grass' | 'meat' | 'light' | 'none' | 'items';
  meat?: [string, number][];
  tame?: { food: string[]; feeds: number };
  /** behaviour flags */
  flags?: Partial<{ weepingAngel: boolean; wallHider: boolean; vents: boolean; mimic: boolean; watcher: boolean; leviathan: boolean; flying: boolean; swimmer: boolean; underCarpet: boolean; thief: boolean; furniture: string; ghost: boolean; immortal: boolean; noCorpse: boolean; nocturnal: boolean; pack: boolean; custodian: boolean; glitch: boolean; plush: boolean; companion: boolean }>;
  sounds?: { idle?: string; alert?: string; attack?: string; hurt?: string; death?: string; step?: string; call?: string; loop?: string };
  /** death decal ('none' for plush, glass, dust…); default is a blood pool */
  remains?: string;
  /** what it bleeds and what can be cut off it (gore system, src/gore) */
  gore?: GoreDef;
  /** gallery-only animation hook (pose previews) */
  animateGallery?(rig: Rig, t: number, pose?: string): void;
  scan: { cls: string; notes: string[] };
  build(): Rig;
  /** procedural animation: moving speed, state, time */
  animate(rig: Rig, c: Creature, t: number, dt: number): void;
  /** optional custom brain; return true if handled (skips default) */
  think?(c: Creature, dt: number): boolean;
}

/**
 * What comes out of a creature when it is hurt:
 * 'red' blood (default), 'dark' ichor, 'pale' watery blood, 'static' (glitched things),
 * 'stuffing' (plush, upholstery), 'plaster' (drywall), 'shell' (fibreglass), 'oil'
 * (hydraulic fluid), 'glow' paint, 'glass' shards, or 'none'.
 */
export type GoreBlood = 'red' | 'dark' | 'pale' | 'static' | 'stuffing' | 'plaster' | 'shell' | 'oil' | 'glow' | 'glass' | 'none';
export interface GoreDef {
  blood?: GoreBlood;
  /** tint multiplied into blood decals and particles (0xffffff = as painted) */
  tint?: number;
  /** named rig parts (see part()) that can be cut, shot or torn off; the whole sub-tree goes with it */
  sever?: string[];
  /** the head part: decapitation and head bursts */
  head?: string;
  /** can the whole body burst into chunks (default true) */
  gib?: boolean;
  /** colour of the generic meat / fluff chunks */
  flesh?: number;
}

export function def(s: SpeciesDef) { return defSpecies(s as any) as unknown as SpeciesDef; }

// ---------------------------------------------------------------- rig helpers
const MAT_CACHE = new Map<string, THREE.Material>();
export function creatureMaterial(glow = false) {
  const k = glow ? 'g' : 'n';
  let m = MAT_CACHE.get(k);
  if (!m) { m = glow ? worldMaterial({ unlit: true, outline: 1 }) : worldMaterial({}); MAT_CACHE.set(k, m); }
  return m;
}

/** Build a rig part: pivot group at `at` (relative to parent) containing a mesh built by fn */
export function part(rig: Rig, name: string, parent: THREE.Object3D, at: [number, number, number], fn: (mb: ModelBuilder) => void, glow = false): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(at[0], at[1], at[2]);
  const mb = new ModelBuilder();
  fn(mb);
  if (!mb.isEmpty) {
    const mesh = new THREE.Mesh(mb.build(), creatureMaterial(glow));
    mesh.castShadow = true; mesh.receiveShadow = true;
    g.add(mesh);
  }
  parent.add(g);
  rig.parts[name] = g;
  return g;
}

export function newRig(headY = 1): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  return { root, body, parts: {}, headY };
}

/** Classic procedural quadruped gait helper: returns leg swing for leg index 0..3 */
export function gait(phase: number, leg: number, amp: number) {
  const offs = [0, Math.PI, Math.PI * 0.5, Math.PI * 1.5];
  return Math.sin(phase + offs[leg]) * amp;
}
