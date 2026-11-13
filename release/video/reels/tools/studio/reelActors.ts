// Actors for the reel studio: Dr. Calder (HumanRig researcher), the unit
// (HumanRig in the debtor's hazmat suit), the species posed by their stand-alone
// APIs, and the camera / light helpers the shots use.
import * as THREE from 'three';
import type { Studio } from './reelStudio';
import { calderRig } from '/src/game/prologue/calder';
import type { Researcher } from '/src/entities/researcher';
import { HumanRig, randomAppearance } from '/src/entities/humanRig';
import { hazmatOutfit } from '/src/entities/player';
import { buildGummyBear, poseGummyBear, type GummyPose } from '/src/creatures/species/gummy_bear';
import { buildBee, poseBee } from '/src/creatures/species/bumble_bee';
import { buildQueenBee, poseQueenBee, type QueenPose } from '/src/creatures/species/queen_bee';
import { buildBeeKeeper, poseBeeKeeper, type KeeperPose } from '/src/creatures/species/bee_keeper';
import type { KitRig } from '/src/creatures/kit/humanoids';
import type { AnimInput } from '/src/entities/humanAnim';

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const ease = (t: number) => { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const smooth = (t: number) => { t = clamp01(t); return t * t * (3 - 2 * t); };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** a key-framed value: [[t, v], ...] smoothed between keys */
export function keys(t: number, k: [number, number][]): number {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) if (t <= k[i][0]) { const [t0, v0] = k[i - 1], [t1, v1] = k[i]; return lerp(v0, v1, smooth((t - t0) / Math.max(1e-6, t1 - t0))); }
  return k[k.length - 1][1];
}
export function keysV(t: number, k: [number, THREE.Vector3][], out = new THREE.Vector3()): THREE.Vector3 {
  if (t <= k[0][0]) return out.copy(k[0][1]);
  for (let i = 1; i < k.length; i++) if (t <= k[i][0]) { const [t0, v0] = k[i - 1], [t1, v1] = k[i]; return out.lerpVectors(v0, v1, smooth((t - t0) / Math.max(1e-6, t1 - t0))); }
  return out.copy(k[k.length - 1][1]);
}

export interface Actor { root: THREE.Object3D; tick(t: number, dt: number): void; dispose?(): void }

/** a soft key light for faces (the Ledge's tubes are strange colours), and a fill */
export function filmLights(S: Studio) {
  const key = new THREE.PointLight(0xfff0dc, 0, 9, 1.4);
  const fill = new THREE.PointLight(0xc8e4ff, 0, 9, 1.6);
  S.scene.add(key, fill);
  S.pr.pinLights.push(key, fill);
  return { key, fill };
}

/** Dr. Calder: walks (to a point, at a pace), turns, gestures, talks, looks at things */
export class Calder implements Actor {
  r: Researcher; root: THREE.Object3D;
  pos = new THREE.Vector3(); yaw = 0; speed = 0;
  path: { t0: number; t1: number; a: THREE.Vector3; b: THREE.Vector3 } | null = null;
  turn: { t0: number; t1: number; a: number; b: number } | null = null;
  constructor(public S: Studio, x: number, z: number, yaw: number) {
    this.r = calderRig();
    this.root = this.r.root;
    this.pos.set(x, S.ground(x, z), z); this.yaw = yaw;
    S.scene.add(this.root);
  }
  /** walk from where she is to (x, z) between t0 and t1 (scene time) */
  walk(t0: number, t1: number, x: number, z: number) { this.path = { t0, t1, a: this.pos.clone(), b: V(x, this.S.ground(x, z), z) }; }
  face(t0: number, t1: number, yaw: number) { let b = yaw; while (b - this.yaw > Math.PI) b -= Math.PI * 2; while (b - this.yaw < -Math.PI) b += Math.PI * 2; this.turn = { t0, t1, a: this.yaw, b }; }
  /** the yaw that faces a world point */
  yawTo(x: number, z: number) { return Math.atan2(x - this.pos.x, z - this.pos.z); }
  tick(t: number, dt: number) {
    let sp = 0;
    if (this.path) {
      const p = this.path, k = clamp01((t - p.t0) / (p.t1 - p.t0));
      if (t >= p.t0 && t <= p.t1 + dt) {
        const prev = this.pos.clone();
        this.pos.lerpVectors(p.a, p.b, smooth(k));
        sp = prev.distanceTo(this.pos) / Math.max(1e-4, dt);
        if (sp > 0.05) { const want = Math.atan2(this.pos.x - prev.x, this.pos.z - prev.z); let d = want - this.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; this.yaw += d * Math.min(1, dt * 6); }
      }
      if (t > p.t1 + 0.2) this.path = null;
    }
    if (this.turn && t >= this.turn.t0) { const k = smooth((t - this.turn.t0) / (this.turn.t1 - this.turn.t0)); this.yaw = lerp(this.turn.a, this.turn.b, k); if (k >= 1) this.turn = null; }
    this.speed += (sp - this.speed) * Math.min(1, dt * 8);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.r.update(dt, { speed: this.speed, fidget: false, wx: this.pos.x, wy: this.pos.y, wz: this.pos.z, wyaw: this.yaw, ground: (x, z) => this.S.ground(x, z) } as Partial<AnimInput>);
  }
}

/** the unit: a HumanRig in the debtor's hazmat suit */
export class Unit implements Actor {
  rig: HumanRig; root: THREE.Object3D;
  pos = new THREE.Vector3(); yaw = 0; speed = 0;
  input: Partial<AnimInput> = {};
  constructor(public S: Studio, x: number, z: number, yaw: number, seed = 0.37) {
    let s = seed * 1e6;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    this.rig = new HumanRig(randomAppearance(rnd), undefined, { secondary: true });
    this.rig.setOutfit(hazmatOutfit({}));
    this.root = this.rig.root;
    this.pos.set(x, S.ground(x, z), z); this.yaw = yaw;
    S.scene.add(this.root);
  }
  /** move by script: position + facing every frame, speed from the motion */
  tick(t: number, dt: number) {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.rig.update(dt, { speed: this.speed, stance: 'stand', full: '', action: '', actionT: 0, actionDur: 1, fidget: false, wx: this.pos.x, wy: this.pos.y, wz: this.pos.z, wyaw: this.yaw, ground: (x: number, z: number) => this.S.ground(x, z), ...this.input } as Partial<AnimInput>);
  }
}

export class Gummy implements Actor {
  rig: KitRig; root: THREE.Object3D;
  pose: GummyPose = 'idle'; o: { fs?: number; prey?: number; speed?: number; variant?: number } = {};
  constructor(S: Studio, x: number, z: number, yaw: number, variant = 0) {
    this.rig = buildGummyBear(variant); this.root = this.rig.root;
    this.root.position.set(x, S.ground(x, z), z); this.root.rotation.y = yaw;
    S.scene.add(this.root);
  }
  tick(t: number, dt: number) { poseGummyBear(this.rig, t, dt, this.pose, this.o); }
}

export class Bee implements Actor {
  rig: KitRig; root: THREE.Object3D;
  d = { fly: 1, panic: 0, bonk: 0, bonkSide: 1, dead: 0, seed: 0.3, flinch: 0, speed: 0, chew: 0, load: 0, still: 0 };
  constructor(S: Studio, x: number, y: number, z: number, yaw: number, variant = 0, seed = 0.3) {
    this.rig = buildBee(variant); this.root = this.rig.root;
    this.root.position.set(x, y, z); this.root.rotation.y = yaw; this.d.seed = seed;
    S.scene.add(this.root);
  }
  tick(t: number, dt: number) { poseBee(this.rig, { t, dt, ...this.d }); }
}

export class Queen implements Actor {
  rig: KitRig; root: THREE.Object3D;
  pose: QueenPose = 'idle'; gut: string[] | undefined;
  constructor(S: Studio, x: number, z: number, yaw: number) {
    this.rig = buildQueenBee(0); this.root = this.rig.root;
    this.root.position.set(x, S.ground(x, z), z); this.root.rotation.y = yaw;
    S.scene.add(this.root);
  }
  tick(t: number, dt: number) { poseQueenBee(this.rig, t, dt, this.pose, { gut: this.gut }); }
}

export class Keeper implements Actor {
  rig: ReturnType<typeof buildBeeKeeper>; root: THREE.Object3D;
  pose: KeeperPose = 'idle'; o: { growth?: number; mimic?: string; item?: string; yaw?: number } = {};
  constructor(S: Studio, x: number, z: number, yaw: number) {
    this.rig = buildBeeKeeper(); this.root = this.rig.root;
    this.root.position.set(x, S.ground(x, z), z); this.root.rotation.y = yaw;
    S.scene.add(this.root);
  }
  tick(t: number, dt: number) { poseBeeKeeper(this.rig, t, dt, this.pose, this.o); }
}

/** camera: position + look target, with a gentle handheld breathe */
export function aim(S: Studio, pos: THREE.Vector3, look: THREE.Vector3, fov = 40, hand = 1) {
  const t = S.t;
  const b = hand * 0.012;
  S.cam.position.set(pos.x + Math.sin(t * 0.7) * b, pos.y + Math.sin(t * 0.9 + 1) * b * 0.8, pos.z + Math.sin(t * 0.5 + 2) * b);
  S.cam.lookAt(look.x + Math.sin(t * 0.6 + 3) * b * 0.6, look.y + Math.sin(t * 0.8) * b * 0.5, look.z);
  S.cam.updateMatrixWorld();
  // the renderer widens a portrait picture's field of view (keeps a 6:5 width): ask for what gives `fov` vertically
  const asp = S.pr.lowW / Math.max(1, S.pr.lowH);
  S.pr.eyeFov = asp >= 1.2 ? fov : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov) / 2) * asp / 1.2));
  S.focus.set(look.x, 0, look.z);
}
