import * as THREE from 'three';
import type { SpeciesDef, Rig } from './species';
import { Container } from '../items/container';
import { uid } from '../core/rng';

export type CState =
  | 'idle' | 'wander' | 'graze' | 'sleep' | 'investigate' | 'stalk' | 'chase' | 'attack' | 'flee' | 'curious'
  | 'warn' | 'hide' | 'follow' | 'frozen' | 'mimic' | 'travel' | 'emerge' | 'watch' | 'dead' | 'eat' | 'nest' | 'disguised';

/** A living (or dead) creature instance. Simulated by the host, mirrored on clients. */
export class Creature {
  id: string;
  sp: SpeciesDef;
  zoneKey: string;
  x = 0; z = 0; y = 0;
  facing = 0; targetFacing = 0;
  vx = 0; vz = 0;
  speed = 0;
  hp: number;
  state: CState = 'idle';
  stateT = 0;
  /** chosen goal */
  goal: { x: number; z: number } | null = null;
  path: [number, number][] | null = null;
  pathIdx = 0;
  repathT = 0;
  targetId: string | null = null;
  awareness = new Map<string, number>();   // per-player detection 0..1
  lastSeen: { x: number; z: number; t: number } | null = null;
  lastHeard: { x: number; z: number; t: number; r: number } | null = null;
  home: { x: number; z: number };
  alert = 0;
  attackT = 0;
  attackPhase = 0;      // 0 none, >0 winding/striking (seconds)
  stagger = 0;
  thinkT = Math.random() * 0.2;
  rig: Rig | null = null;
  dead = false;
  deathT = 0;
  inv: Container | null = null;
  butchered = false;
  tamedBy: string | null = null;
  feeds = 0;
  visibleToLocal = false;
  scanned = false;
  /** misc per-species memory */
  mem: Record<string, any> = {};
  /** network interpolation */
  net?: { x: number; z: number; f: number; t: number };
  animT = 0;
  phase = 0;
  noiseCooldown = 0;
  spawnedAt = 0;
  lastObserved = 0;
  observed = false;
  wasSeenByLocal = false;
  name: string;
  radius: number;
  height: number;
  hitFlash = 0;

  constructor(sp: SpeciesDef, zoneKey: string, x: number, z: number, id?: string) {
    this.sp = sp;
    this.id = id || 'c' + uid();
    this.zoneKey = zoneKey;
    this.x = x; this.z = z;
    this.hp = sp.hp;
    this.home = { x, z };
    this.name = sp.name;
    this.radius = sp.radius;
    this.height = sp.height;
    this.facing = Math.random() * Math.PI * 2;
    this.targetFacing = this.facing;
  }

  setState(s: CState) { if (this.state !== s) { this.state = s; this.stateT = 0; this.path = null; } }

  get pos() { return new THREE.Vector3(this.x, this.y, this.z); }

  displayName() {
    if (this.dead) return (this.scanned ? this.sp.name : 'Something') + ' (dead)';
    if (this.sp.flags?.furniture && this.state === 'disguised') return this.sp.flags.furniture;
    return this.scanned ? this.sp.name : this.sp.temperament === 'peaceful' || this.sp.temperament === 'skittish' ? 'Animal' : 'Something';
  }

  snapshot() {
    return { id: this.id, k: this.sp.key, z: this.zoneKey, x: +this.x.toFixed(2), zz: +this.z.toFixed(2), y: +this.y.toFixed(2), f: +this.facing.toFixed(2), s: this.state, sp: +this.speed.toFixed(2), hp: Math.round(this.hp), d: this.dead ? 1 : 0, at: this.attackPhase > 0 ? 1 : 0, m: this.mem.netMem };
  }
}
