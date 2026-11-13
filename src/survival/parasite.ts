// The Parasite Salamander's life inside a host (round 17). The salamander itself
// (src/creatures/species/salamander.ts) latches on and burrows in; from then on it
// is this file's business:
//  - ORGANS: the unit's body gets a small organ model (gut, liver, stomach, a
//    kidney, a lung). The salamander eats them one at a time; a lost organ
//    really stops working (hunger, sickness, thirst, wind) and the Status shows
//    which (body.ts MOODLE_HOOKS). The place grows them back, slowly, once it is out.
//  - THE TIMELINE (game hours; one is 2.5 minutes): a wound and a lump that moves
//    under the skin (burrow, ~15 s: it can still be pulled out by the tail), then
//    feeding (an organ every ~0.9 h, the lump swelling, the pain growing), then it
//    stops eating and lays (the host bloats), and two hours later the clutch hatches
//    and the larvae chew their way out. It can be cut out of the wound with a knife
//    at any point before that (src/ui/body/treat.ts TREAT_HOOKS: the wound's options).
//  - CREATURE HOSTS: animals and corpses it gets into swell, sicken (animals) and
//    then burst, birthing larvae.
//  - VISUALS: a lump under the suit (or the hide) that crawls about and grows; on
//    animals the lumps are replicated through the creature's net memory.
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import { MOODLE_HOOKS, PART_NAMES, type Body, type Moodle, type Injury } from './body';
import type { BodyPart } from '../items/item';
import type { Player } from '../entities/player';
import type { Creature } from '../creatures/creature';
import { TimedAction } from '../actions/action';
import { createItem } from '../items/factory';
import { ModelBuilder } from '../gfx/modelBuilder';
import { worldMaterial } from '../gfx/materials';
import { mixHex } from '../gfx/pixel';

export type Organ = 'gut' | 'liver' | 'stomach' | 'kidney' | 'lung';
/** the order it eats them in (it never reaches the heart: it lays first) */
export const ORGANS: Organ[] = ['gut', 'liver', 'stomach', 'kidney', 'lung'];
const ORGAN: Record<Organ, { name: string; gone: string; desc: string; line: string }> = {
  gut: { name: 'Gut', gone: 'Gut Eaten', desc: 'Food goes through you. You burn calories and starve faster.', line: 'Something tore loose in my belly. Low down. It is warm in there.' },
  liver: { name: 'Liver', gone: 'Liver Eaten', desc: 'Nothing filters your blood. You are sick and getting sicker.', line: 'A dull, deep tearing under my right ribs. I feel poisoned.' },
  stomach: { name: 'Stomach', gone: 'Stomach Eaten', desc: 'You never feel full and you cannot keep food down.', line: 'It is in my stomach. I can feel it eating. I want to be sick.' },
  kidney: { name: 'Kidney', gone: 'Kidney Eaten', desc: 'Thirst comes on hard and fast.', line: 'A stab in my back, by the spine. My mouth has gone dry.' },
  lung: { name: 'Lung', gone: 'Lung Eaten', desc: 'You cannot get your wind back. Running is short.', line: 'I can only breathe half a breath. It is in my chest.' },
};
export type ParaStage = 'burrow' | 'feeding' | 'eggs';
export interface Infestation { stage: ParaStage; t: number; part: BodyPart; injId: number; size: number; eaten: Organ[]; nextEat: number; eggsT: number; warned: number }

declare module './body' {
  interface Body {
    /** a Parasite Salamander living in this body (src/survival/parasite.ts) */
    parasite?: Infestation | null;
    /** organ function 0..1 (missing = healthy) */
    organs?: Partial<Record<Organ, number>>;
  }
}

// game hours
export const BURROW_H = 0.1, EAT_EVERY = 0.9, LAY_AFTER = 4, HATCH_H = 2.0;
const hoursPer = (dt: number) => (G.clock?.paused ? 0 : dt * (G.clock?.hoursPerSecond ?? 24 / 3600));
const organOf = (b: Body, o: Organ) => b.organs?.[o] ?? 1;

// =====================================================================================
// infesting
// =====================================================================================
/** the local unit's body: it burrows in at `part` (call on the unit's own machine) */
export function infestPlayer(p: Player, part: BodyPart): boolean {
  const b = p.body;
  if (b.dead || b.parasite) return false;
  const inj = b.addInjury(part, 'bite', 0.35, { dirty: true });
  inj.infection = Math.max(inj.infection, 0.05);
  b.parasite = { stage: 'burrow', t: 0, part, injId: inj.id, size: 0.08, eaten: [], nextEat: BURROW_H + EAT_EVERY * 0.6, eggsT: -1, warned: 0 };
  b.panic = Math.min(100, b.panic + 45);
  bus.emit('think', p, ['It is pushing INTO me. Under the skin. It is going in—', 'It has its head in my ' + PART_NAMES[part].toLowerCase() + '. Get it OUT—'][Math.floor(Math.random() * 2)]);
  G.audio?.at?.('gore_squelch', p.x, p.z, 0.8);
  return true;
}
/** an animal or a corpse becomes a host (authority) */
export function infestCreature(host: Creature) {
  if (host.mem.para) return;
  host.mem.para = { t: 0, dead: host.dead ? 1 : 0 };
  const n = host.mem.net ?? (host.mem.net = {}); host.mem.netMem = n;
  n.px = 0.1;
}

// =====================================================================================
// the step (every peer: its own unit; the authority: creature hosts)
// =====================================================================================
export function parasiteFrame(dt: number) {
  const p = G.local as Player | undefined;
  if (p && !p.body.dead) stepPlayer(p, dt);
  if (G.role !== 'client') stepHosts(dt);
  lumpVisuals(dt);
}

function stepPlayer(p: Player, dt: number) {
  const b = p.body, dh = hoursPer(dt);
  if (dh <= 0) return;
  const inf = b.parasite;
  // what it ate grows back, slowly, once it is gone
  if (!inf && b.organs) for (const o of ORGANS) { const v = b.organs[o]; if (v !== undefined && v < 1) b.organs[o] = Math.min(1, v + 0.012 * dh); }
  organEffects(b, dh);
  if (!inf) return;
  inf.t += dh;
  // the way in: kept open and sore while it is inside
  let inj = b.parts[inf.part]?.injuries.find((i) => i.id === inf.injId);
  if (!inj) { inj = b.addInjury(inf.part, 'bite', 0.3, { dirty: true }); inf.injId = inj.id; }
  inj.heal = Math.min(inj.heal, 0.3);
  inj.sev = Math.max(inj.sev, Math.min(1, 0.3 + inf.size * 0.6));
  if (inf.stage === 'burrow' && inf.t >= BURROW_H) { inf.stage = 'feeding'; bus.emit('think', p, 'It is all the way in. I can see it moving under the suit. It is looking for something.'); }
  if (inf.stage === 'feeding') {
    inf.size = Math.min(0.85, inf.size + dh * 0.16);
    if (inf.t >= inf.nextEat && inf.eaten.length < LAY_AFTER) {
      const o = ORGANS[inf.eaten.length];
      inf.eaten.push(o);
      (b.organs ??= {})[o] = 0;
      inf.nextEat += EAT_EVERY;
      b.health = Math.max(3, b.health - 7);
      b.panic = Math.min(100, b.panic + 25);
      b.blood = Math.max(30, b.blood - 4);
      bus.emit('think', p, ORGAN[o].line);
      G.audio?.at?.('gore_squelch', p.x, p.z, 0.6);
      if (inf.eaten.length >= LAY_AFTER) { inf.stage = 'eggs'; inf.eggsT = inf.t; inf.size = 1; bus.emit('think', p, 'It has stopped eating. Something is... filling up in there. I am swelling. It is LAYING.'); }
    }
  }
  if (inf.stage === 'eggs') {
    const left = HATCH_H - (inf.t - inf.eggsT);
    b.stuffed = Math.max(b.stuffed, 75);
    b.sickness = Math.min(85, b.sickness + 4 * dh);
    if (left < 0.5 && inf.warned < 1) { inf.warned = 1; bus.emit('think', p, 'They are moving. Dozens of them. They are chewing. They are coming OUT—'); }
    if (left <= 0) burstPlayer(p);
  }
}

function organEffects(b: Body, dh: number) {
  if (!b.organs) return;
  const loss = (o: Organ) => 1 - organOf(b, o);
  const g = loss('gut'), l = loss('liver'), s = loss('stomach'), k = loss('kidney'), u = loss('lung');
  if (g > 0) { b.calories -= 60 * g * dh; b.hunger = Math.min(100, b.hunger + 3 * g * dh); }
  if (l > 0) b.sickness = Math.min(75, b.sickness + 2.5 * l * dh);
  if (s > 0) { b.hunger = Math.min(100, b.hunger + 4 * s * dh); b.stuffed = Math.max(0, b.stuffed - 30 * s * dh); b.sickness = Math.min(75, b.sickness + 1 * s * dh); }
  if (k > 0) b.thirst = Math.min(100, b.thirst + 4 * k * dh);
  if (u > 0) b.endurance = Math.min(b.endurance, 1 - 0.45 * u);
}

/** the clutch hatches: the larvae come out through the wound */
function burstPlayer(p: Player) {
  const b = p.body, inf = b.parasite!;
  b.parasite = null;
  b.health = Math.max(2, b.health - 45);
  b.blood = Math.max(20, b.blood - 25);
  b.panic = 100;
  b.addInjury(inf.part === 'torso_u' || inf.part === 'torso_l' ? inf.part : 'torso_l', 'deep', 1, { dirty: true });
  bus.emit('think', p, ['They are coming out of me. They are coming OUT OF ME—', 'The skin split. Pale little things, wet, all over me—'][Math.floor(Math.random() * 2)]);
  burstFx(p.zoneKey, p.x, (p.y ?? 0) + 1.0, p.z);
  spawnBrood(p.zoneKey, p.x, p.z, 3 + Math.floor(Math.random() * 3), true);
  G.camera?.shake?.(0.35, 0.4);
}
function burstFx(zk: string, x: number, y: number, z: number) {
  const gore = (G as any).gore;
  try {
    const K = { key: 'pale', pal: 'red', drop: [0x9a3a42, 0xb4525a, 0xc87078, 0xdc9aa0], mist: 0xe0b0b4, style: 'drop', liquid: true, tint: 0xffe0e0 } as any;
    if (gore && G.local?.zoneKey === zk) {
      for (let i = 0; i < 6; i++) { const a = Math.random() * Math.PI * 2; gore.jet(K, 0xffffff, x, y, z, Math.cos(a), Math.sin(a), 6, 2.2, 0.5, 1.6, 0.035, 0.08); }
      gore.pool(G.getZone(zk), x, z, 1.4, K, 0xffffff);
    }
  } catch { /* gore optional */ }
  G.audio?.at?.('gore_burst', x, z, 1);
  G.audio?.at?.('tim_splat', x, z, 0.8);
}
/** larvae (and the spent adult) crawl out (authority) */
function spawnBrood(zk: string, x: number, z: number, n: number, adult: boolean) {
  const C = (G as any).creatures;
  if (!C || G.role === 'client') return;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * 0.6;
    const c = C.spawn('salamander_larva', zk, x + Math.cos(a) * r, z + Math.sin(a) * r);
    if (c) { c.facing = a; c.vx = Math.cos(a) * 1.5; c.vz = Math.sin(a) * 1.5; }
  }
  if (adult) { const c = C.spawn('parasite_salamander', zk, x + 0.4, z); if (c) c.mem.spent = G.time + 30; }
}

function stepHosts(dt: number) {
  const C = (G as any).creatures; if (!C) return;
  const dh = hoursPer(dt);
  for (const c of C.creatures.values() as Iterable<Creature>) {
    const P = c.mem.para; if (!P) continue;
    P.t += dh;
    const corpse = c.dead;
    const hatch = corpse ? 1.2 : 3.0;
    const k = Math.min(1, P.t / hatch);
    const n = c.mem.net ?? (c.mem.net = {}); c.mem.netMem = n;
    n.px = +(0.1 + k * 0.9).toFixed(2);
    // a live host sickens: it slows, it bleeds from the inside
    if (!corpse) { c.hp -= dt * 0.25 * (1 + k * 2); c.stagger = Math.max(c.stagger, Math.random() < dt * 0.15 ? 0.6 : 0); }
    if (P.t >= hatch) {
      delete c.mem.para; n.px = 0;
      burstFx(c.zoneKey, c.x, c.y + c.height * 0.5, c.z);
      spawnBrood(c.zoneKey, c.x, c.z, 2 + Math.floor(Math.random() * 3), false);
      if (!corpse) C.damage('parasite', c.id, 9999, c.x, c.z, 0.2, 'burst');
      else c.butchered = true;
    }
  }
}

// =====================================================================================
// the lumps
// =====================================================================================
const LUMP_GEO = new Map<number, THREE.BufferGeometry>();
let LUMP_MAT: THREE.Material | null = null;
function lumpMesh(col: number): THREE.Mesh {
  let g = LUMP_GEO.get(col);
  if (!g) { const mb = new ModelBuilder(); mb.sphere(0, 0, 0, 0.5, 8, 6, 'white', { color: col }); g = mb.build(); LUMP_GEO.set(col, g); }
  const m = new THREE.Mesh(g, (LUMP_MAT ??= worldMaterial({})));
  m.castShadow = false; m.name = 'parasite_lump';
  return m;
}
const BONE_OF: Partial<Record<BodyPart, string>> = { torso_u: 'chest', torso_l: 'spine', groin: 'hips', neck: 'neck', head: 'head', uarm_l: 'uarmL', uarm_r: 'uarmR', farm_l: 'farmL', farm_r: 'farmR', thigh_l: 'thighL', thigh_r: 'thighR', shin_l: 'shinL', shin_r: 'shinR' };
function lumpVisuals(dt: number) {
  const t = G.time;
  // the local unit (and any unit whose body this machine runs)
  for (const p of (G.players?.values?.() ?? []) as Iterable<Player>) {
    const inf = p.body?.parasite;
    const ud = (p as any)._lump as { a?: THREE.Mesh; b?: THREE.Mesh; w?: THREE.Mesh; s: number } | undefined;
    if (!inf || p.body.dead) { if (ud) { ud.a?.removeFromParent(); ud.b?.removeFromParent(); ud.w?.removeFromParent(); (p as any)._lump = undefined; } continue; }
    const rig: any = p.rig;
    const travel = inf.stage === 'burrow' ? BONE_OF[inf.part] ?? 'spine' : 'spine';
    const bone = rig?.j?.[travel] as THREE.Object3D | undefined;
    if (!bone) continue;
    let L = ud;
    // the suit over it is stained where it went in: the lump reads darker and bloodier than the cloth round it
    const col = mixHex(rig.outfit?.torso?.color ?? 0xe8c428, 0x7a2a22, 0.42);
    if (!L) { L = (p as any)._lump = { s: 0 }; }
    if (!L.a || L.a.parent !== bone) { L.a?.removeFromParent(); L.a = lumpMesh(col); bone.add(L.a); }
    // it crawls about under the skin: a slow circuit with sudden lurches
    const s = (rig.s ?? 1);
    const k = inf.size;
    const lurch = Math.pow(Math.max(0, Math.sin(t * 1.7)), 12);
    const a = t * 0.9 + lurch * 1.5;
    const front = travel === 'spine' || travel === 'chest' || travel === 'hips';
    L.a.position.set(Math.sin(a) * 0.07 * s, (0.05 + Math.sin(a * 0.7) * 0.06) * s, front ? 0.11 * s + k * 0.03 : 0.05 * s);
    const sc = (0.075 + 0.085 * k) * s * (1 + Math.sin(t * 6) * 0.08 + lurch * 0.25);
    L.a.scale.set(sc, sc * 0.85, sc * 0.7);
    // the wound it went in by: a wet black-red hole in the suit, where it went in, for as long as it is inside
    const entry = rig?.j?.[BONE_OF[inf.part] ?? 'spine'] as THREE.Object3D | undefined;
    if (entry) {
      if (!L.w || L.w.parent !== entry) { L.w?.removeFromParent(); L.w = lumpMesh(0x3a0c0a); entry.add(L.w); }
      L.w.position.set(0.04 * s, 0.02 * s, (front ? 0.13 : 0.06) * s);
      L.w.scale.set(0.07 * s, 0.05 * s, 0.025 * s);
    }
    // full of eggs: the belly swells out
    if (inf.stage === 'eggs') {
      const belly = rig?.j?.spine as THREE.Object3D | undefined;
      if (belly) {
        if (!L.b || L.b.parent !== belly) { L.b?.removeFromParent(); L.b = lumpMesh(col); belly.add(L.b); }
        const e = Math.min(1, (inf.t - inf.eggsT) / HATCH_H);
        L.b.position.set(0, 0.04 * s, (0.1 + 0.03 * e) * s);
        const bs = (0.18 + 0.1 * e) * s * (1 + Math.sin(t * 9) * 0.02 * e);
        L.b.scale.set(bs, bs * 0.9, bs * 0.7);
      }
    } else if (L.b) { L.b.removeFromParent(); L.b = undefined; }
  }
  // animal hosts (any peer: the size is in the creature's net memory)
  const C = (G as any).creatures; if (!C) return;
  for (const c of C.creatures.values() as Iterable<Creature>) {
    const n = c.mem.netMem || c.mem.net;
    const px = n?.px ?? 0;
    const ud = c.rig?.root.userData as Record<string, any> | undefined;
    if (!c.rig || !ud) continue;
    if (!(px > 0)) { if (ud.lump) { (ud.lump as THREE.Mesh).removeFromParent(); ud.lump = null; } continue; }
    if (!ud.lump) { ud.lump = lumpMesh(0xc8a0a0); c.rig.body.add(ud.lump); }
    const m = ud.lump as THREE.Mesh, bs = c.rig.body.scale.y || 1;
    const a = t * 1.1 + (c.id.charCodeAt(1) || 0);
    m.position.set(Math.sin(a) * c.radius * 0.4 / bs, (c.height * 0.4 + Math.sin(a * 0.6) * c.height * 0.08) / bs, Math.cos(a * 0.8) * c.radius * 0.5 / bs);
    const sc = Math.max(c.radius, 0.15) * (0.25 + 0.6 * px) / bs * (1 + Math.sin(t * 7) * 0.05 * px);
    m.scale.set(sc, sc * 0.8, sc);
  }
}

// =====================================================================================
// the Status: what is inside you, what it has eaten
// =====================================================================================
MOODLE_HOOKS.push((b: Body, out: Moodle[]) => {
  const inf = b.parasite;
  if (inf) {
    if (inf.stage === 'burrow') out.push({ key: 'parasite', name: 'Something Under the Skin', level: 2, desc: 'Something is burrowing in. Pull it out by the tail NOW, from the wound.' });
    else if (inf.stage === 'feeding') out.push({ key: 'parasite', name: inf.eaten.length >= 2 ? 'Being Eaten' : 'Something Moving Inside', level: inf.eaten.length >= 2 ? 4 : 3, desc: 'A parasite is eating your organs one by one. Cut it out of the wound with a knife before it lays.' });
    else out.push({ key: 'parasite', name: 'Full of Eggs', level: 4, desc: 'It has laid. Cut the eggs out of the wound with a knife before they hatch.' });
  }
  if (b.organs) for (const o of ORGANS) {
    const v = organOf(b, o);
    if (v < 0.75) out.push({ key: 'organ_' + o, name: v < 0.25 ? ORGAN[o].gone : ORGAN[o].name + ' Damaged', level: v < 0.25 ? 3 : 2, desc: ORGAN[o].desc + ' It grows back, slowly, once nothing is eating it.' });
  }
});

// =====================================================================================
// getting it out (the wound's options in the Status, src/ui/body/treat.ts)
// =====================================================================================
class CutOutParasiteAction extends TimedAction {
  constructor(p: Player, public inj: Injury, public tool: { key: string } | null, public pull: boolean) {
    super(p);
    this.anim = 'bandage';
    const inf = p.body.parasite!;
    this.name = pull ? 'Pull it out' : inf.stage === 'eggs' ? 'Cut out the eggs' : 'Cut it out';
    this.duration = pull ? 2.6 : 9 * (1 - p.body.skill('firstaid') * 0.05);
  }
  isValid() { return !!this.p.body.parasite && this.p.body.allInjuries().includes(this.inj); }
  perform() {
    const p = this.p, b = p.body, inf = b.parasite;
    if (!inf) return;
    const skill = b.skill('firstaid');
    const scalpel = this.tool?.key === 'scalpel';
    const chance = this.pull ? (inf.stage === 'burrow' ? 0.75 : 0.1) : 0.55 + skill * 0.05 + (scalpel ? 0.2 : 0) - (inf.stage === 'eggs' ? 0.1 : 0);
    b.panic = Math.min(100, b.panic + 20);
    if (Math.random() < chance) {
      b.parasite = null;
      if (!this.pull) b.addInjury(this.inj.part, 'deep', 0.55 + (inf.stage === 'eggs' ? 0.25 : 0), { dirty: true });
      else this.inj.bleed += 0.2;
      p.inv.add(createItem('parasite_salamander', undefined, { pristine: true }));
      if (inf.stage === 'eggs') p.inv.add(createItem('salamander_eggs', undefined, { pristine: true }));
      bus.emit('think', p, inf.stage === 'eggs' ? 'It is out. And the eggs. A whole clutch, in a skin. Still moving.' : 'It is OUT. It is still wriggling in my hand. Pale. Wet. Too many fingers.');
      G.audio?.at?.('gore_tear', p.x, p.z, 0.8);
      b.addXp('firstaid', 20);
    } else {
      if (this.pull) { inf.stage = 'feeding'; inf.t = Math.max(inf.t, BURROW_H); bus.emit('think', p, 'It slipped out of my fingers. It is gone in. All the way in.'); }
      else { b.addInjury(this.inj.part, 'deep', 0.45, { dirty: true }); bus.emit('think', p, 'It moved. I cut into nothing. It is still in there.'); }
      G.audio?.at?.('gore_squelch', p.x, p.z, 0.7);
    }
    bus.emit('inventoryChanged', p);
  }
}
// (loaded lazily: the Status screen pulls in the medical actions and their UI, which the creature
// system, and headless tools like the zone checker, should not have to load)
type TreatHook = (typeof import('../ui/body/treat'))['TREAT_HOOKS'][number];
const treatHook: TreatHook = (p, inj, o, run) => {
  const inf = p.body.parasite;
  if (!inf || inj.id !== inf.injId) return;
  if (inf.stage === 'burrow') { o.unshift({ key: 'pull', label: 'Pull it out by the tail', using: 'bare fingers', run: run(new CutOutParasiteAction(p, inj, null, true)) }); return; }
  const knife = p.findTool('scalpel') || p.findTool('#knife') || p.findTool('#sharp') || null;
  o.unshift({ key: 'pull', label: inf.stage === 'eggs' ? 'Cut out the eggs' : 'Cut it out', using: knife ? undefined : undefined, missing: knife ? undefined : 'a knife or a scalpel', run: knife ? run(new CutOutParasiteAction(p, inj, knife as any, false)) : undefined });
};
import('../ui/body/treat').then((m) => { if (!m.TREAT_HOOKS.includes(treatHook)) m.TREAT_HOOKS.push(treatHook); }).catch(() => { /* headless */ });

/** dev / tests: window.__para */
try { (globalThis as any).__para = { infestPlayer, infestCreature, ORGANS }; } catch { /* no window */ }
