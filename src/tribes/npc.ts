// Tribe members are creatures with a human body: the creature system moves,
// hurts, kills and replicates them; this module dresses a pooled HumanRig per
// member (appearance and outfit seeded by the creature id, so every peer sees
// the same person), adds the tribe's headgear and weapon, animates it, and
// lets them talk (floating 'subtitle' lines near the local survivor).
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import { def, type Rig, type SpeciesDef } from '../creatures/species';
import type { Creature } from '../creatures/creature';
import { HumanRig } from '../entities/humanRig';
import type { JointName } from '../entities/humanRig';
import { ModelBuilder } from '../gfx/modelBuilder';
import { worldMaterial } from '../gfx/materials';
import { makeHeldMesh } from '../items/itemMeshes';
import { TRIBES, TRIBE_KEYS, type TribeDef, type TribeKey } from './defs';
import { readTime } from '../game/lines';

interface TribeRig extends Rig { hr: HumanRig | null; counter: THREE.Group; who: string }
interface Pooled { hr: HumanRig; t: TribeKey }
const POOL = new Map<string, Pooled>();
const GEO = new Map<string, THREE.BufferGeometry>();
let propMat: THREE.Material | null = null;

export const idHash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const seeded = (seed: number) => { let s = seed || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
/** a member's name (the same on every peer) */
export function memberName(c: Creature): string { const T = TRIBES[c.mem.tribe as TribeKey] ?? TRIBES[(c.sp.key.slice(6)) as TribeKey]; return T ? T.names[idHash(c.id) % T.names.length] : c.sp.name; }
export const tribeOfCreature = (c: Creature): TribeKey | null => (c.sp.key.startsWith('tribe_') ? (c.sp.key.slice(6) as TribeKey) : null);

function propGeo(key: string, fn: (mb: ModelBuilder) => void) {
  let g = GEO.get(key);
  if (!g) { const mb = new ModelBuilder(); fn(mb); g = mb.build(); GEO.set(key, g); }
  return g;
}

function dress(c: Creature, T: TribeDef): HumanRig {
  const r = seeded(idHash(c.id));
  const hr = new HumanRig(T.app(r));
  hr.setOutfit(T.outfit(r));
  propMat ??= worldMaterial({});
  const v = idHash(c.id) % 3;
  const head = new THREE.Mesh(propGeo(T.key + ':head:' + v, (mb) => T.head(mb, v)), propMat);
  head.scale.setScalar(hr.s); head.castShadow = true;
  hr.j.head.add(head);
  if (T.gear) {
    const g = new THREE.Mesh(propGeo(T.key + ':gear', (mb) => T.gear!.build(mb, v)), propMat);
    g.scale.setScalar(hr.s); hr.j[T.gear.joint as JointName].add(g);
  }
  const w = makeHeldMesh(T.weapon);
  if (w) hr.hold('R', w, 'perp');
  return hr;
}

function adopt(R: TribeRig, c: Creature, T: TribeDef) {
  let e = POOL.get(c.id);
  if (!e) { e = { hr: dress(c, T), t: T.key }; POOL.set(c.id, e); }
  R.counter.clear();
  R.counter.add(e.hr.root);
  R.hr = e.hr; R.who = c.id;
  R.parts = { ...e.hr.j } as Record<string, THREE.Object3D>;
}

/** drop rigs of members that no longer exist (called now and then by the tribe system) */
export function prunePool() {
  for (const [id, e] of POOL) if (!G.creatures?.creatures?.has(id)) { e.hr.root.removeFromParent(); e.hr.dispose(); POOL.delete(id); }
}

function say(c: Creature, text: string, T: TribeDef) {
  bus.emit('subtitle', { who: memberName(c), text, dur: readTime(text), style: 'tribe', tribe: T.key, color: T.css, x: c.x, y: c.y + c.height + 0.25, z: c.z });
}
/** a line from this member (local only; every peer voices its own survivor's encounters) */
export function bark(c: Creature, kind: keyof TribeDef['lines'], force = false) {
  const T = TRIBES[tribeOfCreature(c)!]; if (!T) return;
  if (!force && (c.mem._barkT ?? 0) > G.time) return;
  c.mem._barkT = G.time + 9 + Math.random() * 8;
  const L = T.lines[kind];
  say(c, L[Math.floor(Math.random() * L.length)], T);
}

function animate(T: TribeDef) {
  return (rig: Rig, c: Creature, t: number, dt: number) => {
    const R = rig as TribeRig;
    if (R.who !== c.id || !R.hr) adopt(R, c, T);
    const hr = R.hr!;
    const n = (G.role === 'client' ? c.mem.netMem : c.mem.net) || {};
    const hostile = c.state === 'chase' || c.state === 'attack' || c.attackPhase > 0;
    let full = '' as any, action = '', at = 0, dur = 1;
    if (c.dead) full = 'dead';
    else if (c.attackPhase > 0) { action = 'swing'; at = 0.4 - c.attackPhase; dur = 0.5; }
    else if (n.sit && c.speed < 0.1) full = 'sit';
    else if (n.act && c.speed < 0.1) { action = n.act; at = (t % 2); dur = 2; }
    // look at the local survivor when they are close
    const p = G.local;
    let look = 0;
    if (p && p.zoneKey === c.zoneKey && !c.dead) {
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      if (d < 6) {
        const want = Math.atan2(p.z - c.z, p.x - c.x) - c.facing;
        look = Math.max(-1.1, Math.min(1.1, Math.atan2(Math.sin(want), Math.cos(want))));
        // they talk to whoever walks up
        if (d < 4.2 && !G.dominion?.isDowned?.(c)) bark(c, hostile ? 'hostile' : c.tamedBy === p.id ? 'follow' : (c.mem._greeted ? 'idle' : 'greet'));
        if (d < 4.2) c.mem._greeted = true;
      } else if (hostile && d < 14) bark(c, (n.raid ? 'raid' : 'hostile'));
    }
    hr.animate(dt, {
      speed: c.speed, stance: 'stand', full, action: action as never, actionT: at, actionDur: dur, twoHanded: false,
      limp: 0, tired: 0, panic: hostile ? 0.3 : 0, cold: 0, aimPitch: 0, holdingLight: false, holding: true, lookYaw: -look * 0.8, weapon: hostile ? T.weaponKind : '', fidget: false,
    } as any);
    hr.fx.value.z = Math.min(1, c.hitFlash / 0.15) * 0.6;
    // the manager tips dead bodies on their side; this one lies the way the rig fell
    if (c.dead) {
      const k = Math.min(1, c.deathT * 2 + (c.deathT > 0 ? 0 : 1));
      const a = (Math.PI / 2) * Math.min(1, k + 0.01), ry = ((rig.root.userData.restY as number | undefined) ?? 0) * Math.min(1, k + 0.01);
      R.counter.rotation.set(0, 0, -a);
      R.counter.position.set(-ry * Math.sin(a), -ry * Math.cos(a), 0);
    } else if (R.counter.rotation.z) { R.counter.rotation.set(0, 0, 0); R.counter.position.set(0, 0, 0); }
  };
}

function build(): Rig {
  const root = new THREE.Group(), body = new THREE.Group(), counter = new THREE.Group();
  root.add(body); body.add(counter);
  return { root, body, parts: {}, headY: 1.75, hr: null, counter, who: '' } as TribeRig;
}

export const TRIBE_SPECIES: Record<TribeKey, SpeciesDef> = {} as any;
for (const k of TRIBE_KEYS) {
  const T = TRIBES[k];
  TRIBE_SPECIES[k] = def({
    key: 'tribe_' + k, name: T.member, code: 'S-' + k.toUpperCase() + ' // SURVIVOR', temperament: 'neutral', threat: 1,
    hp: T.hp, walk: 1.2, run: 3.9, turn: 9, radius: 0.27, height: 1.78, sight: 14, fov: 1.3, hearing: 1,
    attack: { dmg: T.dmg, range: 1.0, cooldown: 1.25, kinds: T.weaponKind === 'blade' ? ['laceration', 'bruise'] : ['bruise', 'fracture'], corrupt: 0, knock: 0.5, parts: ['head', 'torso_u', 'uarm_l', 'uarm_r', 'farm_l', 'farm_r'] },
    zones: [], weight: 0, diet: 'none',
    sounds: { hurt: 'hurt_player', death: 'hurt_player', alert: 'guard_bark' },
    scan: { cls: T.lore.cls, notes: T.lore.notes },
    gore: { blood: 'red', gib: false, sever: [] },
    build,
    animate: animate(T),
    think: (c: Creature, dt: number) => {
      if (c.dead) return true;
      if (c.tamedBy) return false; // a recruit: the companion brain follows its survivor
      return G.tribes?.think?.(c, dt) ?? false;
    },
  });
}
