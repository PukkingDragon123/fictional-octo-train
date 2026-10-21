// CYBERWARE in play (G.cyber). The catalogue is src/survival/cyberParts.ts.
//
// State: Body.cyber = { parts: {slot: {k, rust, wear}}, charge } — a plain
// field on the Body, so save games keep it with the rest of the body
// (src/game/save.ts serialises every Body field). Each survivor's own machine
// owns their hardware; peers see it through the rig condition (cond.cyber in
// the outfit snapshot, src/net/net.ts), dropped parts go through 'dropFloor'.
//
// A cyber limb replaces flesh: the parts it covers are not in Body.severed
// (they work), wounds aimed at them dent the metal instead of bleeding, a
// creature that tears at one rips the hardware off at the socket (dropping it
// as an item and leaving a capped socket: a healed stump). Installing over a
// stump closes it.
//
// Effects are applied by wrapping a handful of Body / Player / LimbSystem /
// CombatSystem methods once per page (installCyber), so no other system has
// to know about cyberware: carry capacity, the movement / action / attack /
// aim multipliers in Body.mods(), traits the hardware behaves like
// (Body.has: the trap jaw is an iron gut, the lamp-eyes are eagle eyes that
// give you away), wound severity under dermal plating, shove power, and the
// rig condition. Per frame (local survivor): rust when wet (scrap), the cell
// draining (powered parts go dead and turn into penalties), clank noise
// that creatures hear, aches, cold.
import { G } from '../game/G';
import { bus } from '../core/events';
import { op } from '../game/ops';
import { defNode, hasUnlock } from '../game/research';
import { addStat } from '../game/profile';
import { Body } from './body';
import type { Injury } from './body';
import { Player } from '../entities/player';
import { LimbSystem } from './limbSystem';
import { CombatSystem } from '../game/combat';
import type { GameSystem } from '../game/game';
import type { BodyPart, Item } from '../items/item';
import { hasItemDef } from '../items/item';
import { createItem, serializeItem } from '../items/factory';
import type { MenuOption } from '../ui/ui';
import {
  CYBER_PARTS, CYBER_SLOTS, CyberSlot, CyberDef, SLOT_COVERS, SLOT_KIND, cyberDef, cyberDefByItem, slotConflicts, slotCovering, partsFor,
} from './cyberParts';
import '../audio/sounds_cyber';

export * from './cyberParts';

export interface CyberPartState { k: string; rust?: number; wear?: number }
export interface CyberState { parts: Partial<Record<CyberSlot, CyberPartState>>; charge: number }
/** a loadout as the operating table hands it over: {slot: part key} */
export type CyberLoadout = Partial<Record<CyberSlot, string>>;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------------ research: the 'cyber' branch of the watch's tree
for (const d of CYBER_PARTS) {
  defNode({
    key: d.node || 'cyber:' + d.key, branch: 'cyber', title: d.name, icon: 'cyber',
    desc: `${d.good} — ${d.bad}`, cost: d.node ? d.cost ?? 5 : 0, requires: d.requires,
  });
}
/** can the operating table fit this part (researched, or the starter)? */
export const partUnlocked = (d: CyberDef) => !d.node || hasUnlock(d.node);
/** a research hint for a locked part */
export function partHint(d: CyberDef): string {
  if (partUnlocked(d)) return '';
  const need = (d.requires || []).filter((r) => !hasUnlock(r)).map((r) => cyberDef(r.replace(/^cyber:/, ''))?.name || r);
  return `Research on the watch: CYBER › ${d.name} (${d.cost ?? 5} RP)${need.length ? ` — needs ${need.join(', ')} first` : ''}. Or find one out there.`;
}

// ------------------------------------------------------------------ state
export function cyberState(b: Body | null | undefined): CyberState | undefined {
  const st = (b as any)?.cyber as CyberState | undefined;
  return st && st.parts ? st : undefined;
}
function ensureState(b: Body): CyberState {
  let st = cyberState(b);
  if (!st) { st = { parts: {}, charge: 100 }; (b as any).cyber = st; }
  return st;
}
/** {slot: key} of what a body has installed */
export function loadoutOf(b: Body | null | undefined): CyberLoadout {
  const st = cyberState(b), out: CyberLoadout = {};
  if (st) for (const s of CYBER_SLOTS) { const p = st.parts[s]; if (p?.k) out[s] = p.k; }
  return out;
}
export const hasCyber = (b: Body | null | undefined) => { const st = cyberState(b); return !!st && Object.values(st.parts).some((p) => !!p?.k); };

// ------------------------------------------------------------------ live effects (cached on the state, rebuilt when it changes)
interface Live {
  sig: string;
  attack: number; move: number; action: number; aim: number; carry: number; armor: number; kick: number;
  noise: number; drain: number; cold: number; fatigue: number; lucid: number; noRun: boolean;
  grants: Set<string>; revokes: Set<string>;
}
const LIVE = new WeakMap<CyberState, Live>();
const q = (v: number | undefined, n = 4) => Math.round((v ?? 0) * n);
function sigOf(st: CyberState) {
  let s = st.charge > 0 ? '+' : '-';
  for (const k of CYBER_SLOTS) { const p = st.parts[k]; if (p?.k) s += `${k}:${p.k}:${q(p.rust)}:${q(p.wear)};`; }
  return s;
}
export function liveFx(b: Body): Live | null {
  const st = cyberState(b);
  if (!st) return null;
  const sig = sigOf(st);
  let L = LIVE.get(st);
  if (L && L.sig === sig) return L;
  L = { sig, attack: 1, move: 1, action: 1, aim: 1, carry: 0, armor: 0, kick: 0, noise: 0, drain: 0, cold: 0, fatigue: 0, lucid: 0, noRun: false, grants: new Set(), revokes: new Set() };
  for (const slot of CYBER_SLOTS) {
    const ps = st.parts[slot]; const d = cyberDef(ps?.k);
    if (!ps || !d) continue;
    const f = d.fx, rust = ps.rust ?? 0, wear = ps.wear ?? 0;
    const dead = (f.drain ?? 0) > 0 && st.charge <= 0;
    // damage dulls what the part is good at; rust makes it stiff; a flat cell makes it dead weight
    const eff = (1 - wear * 0.5) * (1 - rust * 0.4);
    const pos = (v: number | undefined) => (v && v > 0 ? v * (dead ? 0 : eff) : v ?? 0);
    const neg = (v: number | undefined) => (v && v < 0 ? v : 0);
    const good = (v: number | undefined) => (v ?? 0) > 0 ? pos(v) : neg(v);
    L.attack *= 1 + good(f.attack);
    L.move *= 1 + good(f.move);
    // action: negative is quicker (good)
    const act = f.action ?? 0;
    L.action *= 1 + (act < 0 ? act * (dead ? 0 : eff) : act) + rust * 0.3 + wear * 0.1;
    L.aim *= 1 + good(f.aim);
    L.carry += dead ? 0 : (f.carry ?? 0) * eff;
    L.armor = Math.max(L.armor, (f.armor ?? 0) * (1 - wear * 0.6));
    L.kick += dead ? 0 : (f.kick ?? 0) * eff;
    L.noise = Math.max(L.noise, (f.noise ?? 0) * (1 + rust * 1.2 + wear * 0.5));
    L.drain += f.drain ?? 0;
    L.cold += f.cold ?? 0; L.fatigue += f.fatigue ?? 0; L.lucid += f.lucid ?? 0;
    if (!dead) { for (const g of f.grants || []) L.grants.add(g); for (const r of f.revokes || []) L.revokes.add(r); }
    if (dead) {
      if (d.kind === 'arm' || d.kind === 'hand') { L.action *= 1.3; L.attack *= 0.75; }
      if (d.kind === 'leg') { L.move *= 0.82; L.noRun = true; }
      if (d.kind === 'spine') { L.move *= 0.94; L.carry -= 2; }
    }
    if (rust > 0.85 && d.kind === 'leg') L.noRun = true;
  }
  LIVE.set(st, L);
  return L;
}

// ------------------------------------------------------------------ installing and losing hardware
/** give the survivor an item, or drop it at their feet when there is no room */
function giveOrDrop(p: Player, key: string, name?: string) {
  if (!hasItemDef(key)) return;
  const it = createItem(key, undefined, { pristine: true });
  if (name) it.name = name;
  try { p.inv.add(it); bus.emit('inventoryChanged', p); return; } catch { /* full */ }
  op('dropFloor', { z: p.zoneKey, item: serializeItem(it), x: p.x, zz: p.z, y: p.y + 0.6 });
}
function changed(p: Player) {
  p.outfitDirty = true;
  p.refreshCondition?.();
  bus.emit('cyberChanged', p, loadoutOf(p.body));
  bus.emit('inventoryChanged', p);
}

/**
 * Fit a part into a slot. The flesh it covers is gone for good (a stump there
 * is closed into a socket); whatever was in the slot (or a conflicting slot)
 * comes out. opts.item: the boxed part being used up; opts.giveBack: old
 * hardware goes into the pack (field surgery) instead of vanishing (intake).
 */
export function installPart(p: Player, slot: CyberSlot, key: string, opts: { item?: Item | null; giveBack?: boolean } = {}): boolean {
  const d = cyberDef(key);
  if (!d || SLOT_KIND[slot] !== d.kind) return false;
  const b = p.body;
  // a hand needs a forearm to sit on
  if (d.kind === 'hand') {
    const side = slot.slice(-1);
    if (b.severed.includes(`farm_${side}` as BodyPart)) return false;
  }
  const st = ensureState(b);
  for (const s of [slot, ...slotConflicts(slot)]) {
    const old = st.parts[s];
    if (!old) continue;
    if (opts.giveBack) { const od = cyberDef(old.k); if (od) giveOrDrop(p, od.item); }
    delete st.parts[s];
  }
  const covers = SLOT_COVERS[slot];
  if (covers.length) {
    b.severed = b.severed.filter((x) => !covers.includes(x));
    for (const part of covers) b.parts[part].injuries = [];
  }
  st.parts[slot] = { k: key, rust: 0, wear: 0 };
  if (opts.item) p.removeItem(opts.item);
  changed(p);
  return true;
}
/** take a part out cleanly (field surgery): the slot becomes a capped socket */
export function removePart(p: Player, slot: CyberSlot, giveBack = true): boolean {
  const st = cyberState(p.body); const ps = st?.parts[slot];
  if (!st || !ps) return false;
  const d = cyberDef(ps.k);
  delete st.parts[slot];
  const covers = SLOT_COVERS[slot];
  if (covers.length) p.body.severed = [...new Set([...p.body.severed, ...covers])];
  if (giveBack && d) giveOrDrop(p, d.item);
  changed(p);
  return true;
}
/** a new prisoner's loadout from the operating table */
export function applyLoadout(p: Player, load: CyberLoadout | null | undefined) {
  if (!load) return;
  for (const s of CYBER_SLOTS) { const k = load[s]; if (k) installPart(p, s, k); }
}

/** a creature (or the band) tears at hardware: it comes off at the socket */
function ripPart(p: Player, slot: CyberSlot, how: string, from?: [number, number]) {
  const st = cyberState(p.body); const ps = st?.parts[slot];
  if (!st || !ps) return;
  const d = cyberDef(ps.k);
  // what the metal hand held falls
  if (SLOT_KIND[slot] === 'arm' || SLOT_KIND[slot] === 'hand') {
    const it = slot.endsWith('_r') ? p.handR : p.handL;
    if (it) { p.removeItem(it); op('dropFloor', { z: p.zoneKey, item: serializeItem(it), x: p.x, zz: p.z, y: p.y + 0.9, v: [(Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2] }); }
  }
  delete st.parts[slot];
  const covers = SLOT_COVERS[slot];
  if (covers.length) p.body.severed = [...new Set([...p.body.severed, ...covers])];
  if (d && hasItemDef(d.item)) {
    const it = createItem(d.item, undefined, { pristine: true });
    it.cond = clamp(1 - (ps.wear ?? 0) - 0.25, 0.1, 1);
    it.name = `${p.name}'s ${d.name}`;
    let vx = (Math.random() - 0.5) * 1.5, vz = (Math.random() - 0.5) * 1.5;
    if (from) { const dx = from[0] - p.x, dz = from[1] - p.z, l = Math.hypot(dx, dz) || 1; vx = (dx / l) * 2.4; vz = (dz / l) * 2.4; }
    op('dropFloor', { z: p.zoneKey, item: serializeItem(it), x: p.x, zz: p.z, y: p.y + 1, v: [vx, 2.2, vz] });
  }
  // no blood: sparks, a jolt of pain through the socket, a lot of fear
  sparksAt(p.x, p.y + (SLOT_KIND[slot] === 'leg' ? 0.5 : 1.15), p.z, 26);
  const b = p.body;
  b.panic = Math.min(100, b.panic + 55); b.stress = Math.min(100, b.stress + 20);
  b.health = Math.max(1, b.health - 4);
  G.pr && (G.pr.shake = Math.max(G.pr.shake, 0.9));
  G.audio?.at?.('cy_rip', p.x, p.z, 1);
  bus.emit('noise', { x: p.x, z: p.z, radius: 18, kind: 'metal', zone: p.zoneKey, by: p.id });
  setTimeout(() => bus.emit('think', p, `It ${how === 'crush' ? 'crushed' : 'tore'} the ${d?.name ?? 'hardware'} right off the socket. At least it doesn't bleed.`), 900);
  bus.emit('cyberLost', p, slot, ps.k);
  changed(p);
}

export function sparksAt(x: number, y: number, z: number, n = 14) {
  const sp = (G as any).destruct?.sparks;
  if (!sp?.add) return;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 3.5;
    sp.add(6 /* PK.Spark */, x, y, z, Math.cos(a) * s, 1 + Math.random() * 3, Math.sin(a) * s, 0.012 + Math.random() * 0.012, 0.3 + Math.random() * 0.5, Math.random() < 0.3 ? 0xffffff : 0xffb84a, 0.6);
  }
}

// ------------------------------------------------------------------ the wraps (installed once)
let installed = false;
function installWraps() {
  if (installed) return;
  installed = true;
  const BP = Body.prototype as any;
  const baseCarry = BP.carryCapacity;
  BP.carryCapacity = function (this: Body) { const c = baseCarry.call(this); const L = liveFx(this); return L ? c + L.carry : c; };
  const baseMods = BP.mods;
  BP.mods = function (this: Body, heavy: number) {
    const m = baseMods.call(this, heavy);
    const L = liveFx(this);
    if (!L || !m) return m;
    m.move = clamp(m.move * L.move, 0.12, 1.3);
    m.action *= L.action; m.attack *= L.attack;
    m.aim = clamp(m.aim * L.aim, 0.1, 1);
    if (L.noRun) m.canRun = false;
    return m;
  };
  const baseHas = BP.has;
  BP.has = function (this: Body, t: string) {
    const st = (this as any).cyber;
    if (!st) return baseHas.call(this, t);
    const L = liveFx(this);
    if (L?.revokes.has(t)) return false;
    return baseHas.call(this, t) || !!L?.grants.has(t);
  };
  const baseAdd = BP.addInjury;
  BP.addInjury = function (this: Body, part: BodyPart, type: string, sev: number, opts?: unknown): Injury {
    const st = cyberState(this);
    if (st && type !== 'amputation') {
      const slot = slotCovering(st.parts as any, part);
      if (slot) {
        // metal takes it: a dent, no blood
        const ps = st.parts[slot]!;
        ps.wear = clamp((ps.wear ?? 0) + sev * (type === 'burn' ? 0.05 : 0.12) * (baseHas.call(this, 'machine_affinity') ? 0.6 : 1), 0, 1);
        bus.emit('cyberHit', this, slot, sev);
        return { id: -1, type, part, sev: 0, bleed: 0, heal: 1, healTime: 1, bandage: null, disinfected: 0, stitched: false, splinted: false, foreign: false, infection: 0, corrupt: false, age: 0 } as unknown as Injury;
      }
      const L = liveFx(this);
      if (L && L.armor > 0 && type !== 'fracture') sev *= 1 - L.armor;
    }
    return baseAdd.call(this, part, type, sev, opts);
  };
  const PP = Player.prototype as any;
  const baseCond = PP.computeCondition;
  if (typeof baseCond === 'function') PP.computeCondition = function (this: Player) {
    const c = baseCond.call(this);
    const load = loadoutOf(this.body);
    if (c && Object.keys(load).length) c.cyber = load;
    return c;
  };
  const LP = LimbSystem.prototype as any;
  const baseSever = LP.sever;
  if (typeof baseSever === 'function') LP.sever = function (this: LimbSystem, p: Player, part: BodyPart, cause: any): boolean {
    const st = cyberState(p?.body);
    if (st && p.isLocal && !p.body.dead && G.sandbox.limbLoss) {
      const slot = slotCovering(st.parts as any, part);
      if (slot) { ripPart(p, slot, cause?.how || 'tear', cause?.from); return true; }
      // the flesh above a metal hand comes off: the hand goes with it
      const side = String(part).slice(-1);
      if ((part === `uarm_${side}` || part === `farm_${side}`) && st.parts[`hand_${side}` as CyberSlot]) ripPart(p, `hand_${side}` as CyberSlot, cause?.how || 'tear', cause?.from);
    }
    return baseSever.call(this, p, part, cause);
  };
  const CP = CombatSystem.prototype as any;
  const baseShove = CP.shove;
  if (typeof baseShove === 'function') CP.shove = function (this: CombatSystem, p: Player) {
    const before = p.attackCooldown;
    baseShove.call(this, p);
    const L = liveFx(p.body);
    if (!L || L.kick <= 0 || before > 0 || p.attackCooldown <= 0) return;
    // the metal adds its weight behind the shove
    const cs = G.creatures;
    for (const c of cs?.creatures?.values?.() || []) {
      const cc: any = c;
      if (cc.dead || cc.zoneKey !== p.zoneKey) continue;
      const dx = cc.x - p.x, dz = cc.z - p.z, d = Math.hypot(dx, dz);
      if (d > 1.2 + cc.radius) continue;
      let da = Math.atan2(dz, dx) - p.facing; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > 1.0) continue;
      cs.damage(p.id, cc.id, 2 * L.kick, p.x, p.z, 1.5 * L.kick, 'shove');
    }
    G.audio?.at?.('cy_clank', p.x, p.z, 0.8);
  };
}

// ------------------------------------------------------------------ the system
const THINK: Record<string, string[]> = {
  rust: ['The joint is grinding. It needs oil.', 'Rust. I can hear it in the elbow.', 'It squeals every time I move it.'],
  flat: ['The cell is flat. The hardware is dead weight.', 'Power\'s gone. It just hangs there.'],
  low: ['Cell is under a fifth. I need a battery.'],
};
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const NEAR_TABLE = new Set(['operating_table', 'gurney']);

export class CyberSystem implements GameSystem {
  name = 'cyber';
  private lx = 0; private lz = 0; private walked = 0; private warned = new Set<string>();
  private remoteT = 0;

  constructor() {
    (G as any).cyber = this;
    installWraps();
    bus.on('worldMenu', (p: Player, t: any, opts: MenuOption[]) => { try { this.worldMenu(p, t, opts); } catch (e) { console.warn('cyber menu', e); } });
  }

  /** public API for other systems */
  loadout(p: Player) { return loadoutOf(p.body); }
  install(p: Player, slot: CyberSlot, key: string, item?: Item | null) { return installPart(p, slot, key, { item, giveBack: true }); }
  remove(p: Player, slot: CyberSlot) { return removePart(p, slot, true); }
  fx(p: Player) { return liveFx(p.body); }
  /** shove / kick multiplier (1 = flesh) for combat */
  kick(p: Player) { return 1 + (liveFx(p.body)?.kick ?? 0); }
  charge(p: Player) { return cyberState(p.body)?.charge ?? 0; }

  update(dt: number, dh: number) {
    const p = G.local as Player | null;
    if (!p) return;
    // peers' hardware comes in through the outfit; nothing to simulate for them
    this.remoteT -= dt;
    const st = cyberState(p.body);
    if (!st || p.body.dead || !hasCyber(p.body)) { this.lx = p.x; this.lz = p.z; return; }
    const b = p.body;
    const L = liveFx(b)!;
    // rust: soaked scrap
    if (b.wetness > 25) {
      for (const s of CYBER_SLOTS) {
        const ps = st.parts[s]; const d = cyberDef(ps?.k);
        if (!ps || !d?.fx.rust) continue;
        ps.rust = clamp((ps.rust ?? 0) + d.fx.rust * (b.wetness / 100) * dh * 0.22 * (b.has('machine_affinity') ? 0.6 : 1), 0, 1);
        if (ps.rust > 0.4 && !this.warned.has('rust' + s)) { this.warned.add('rust' + s); bus.emit('think', p, pick(THINK.rust)); }
      }
    }
    // the cell
    if (L.drain > 0) {
      const was = st.charge;
      st.charge = clamp(st.charge - L.drain * dh * (b.has('machine_affinity') ? 0.75 : 1) * (b.has('tissue_rejection') ? 1.25 : 1), 0, 100);
      if (was > 20 && st.charge <= 20) bus.emit('think', p, pick(THINK.low));
      if (was > 0 && st.charge <= 0) { bus.emit('think', p, pick(THINK.flat)); G.audio?.at?.('cy_powerdown', p.x, p.z, 0.7); }
    }
    // aches, cold, adverts behind the eyes
    if (L.fatigue) b.fatigue = clamp(b.fatigue + L.fatigue * dh, 0, 100);
    if (L.cold && b.temp > 35.2) b.temp -= L.cold * dh;
    if (L.lucid) b.lucidity = clamp(b.lucidity - L.lucid * dh, 0, 100);
    // Tissue Rejection: the body fights every socket
    if (b.has('tissue_rejection')) {
      const n = Object.keys(st.parts).length;
      b.stress = clamp(b.stress + 0.7 * n * dh, 0, 100);
      b.unhappy = clamp(b.unhappy + 0.3 * n * dh, 0, 100);
      if (Math.random() < dt * 0.004 * n) bus.emit('think', p, pick(['The sockets are burning again.', 'My body wants the metal out.', 'It itches where the flesh meets the steel.']));
    }
    // clank: every couple of metres of walking, the hardware is heard
    const moved = Math.hypot(p.x - this.lx, p.z - this.lz);
    this.lx = p.x; this.lz = p.z;
    if (moved < 1.5) this.walked += moved;
    if (L.noise > 0 && this.walked > (p.running ? 1.6 : 2.4)) {
      this.walked = 0;
      const r = L.noise * (p.running ? 1.35 : p.sneaking ? 0.45 : 1);
      bus.emit('noise', { x: p.x, z: p.z, radius: r, kind: 'metal', zone: p.zoneKey, by: p.id });
      G.audio?.at?.(anyRust(st) > 0.4 ? 'cy_squeal' : 'cy_clank', p.x, p.z, p.sneaking ? 0.35 : 0.7);
    }
  }

  // ---------------------------------------------------------------- right-click: field surgery, oil, cells
  private worldMenu(p: Player, t: any, opts: MenuOption[]) {
    if (!p?.isLocal || p.body.dead) return;
    if (t?.kind === 'player' && t.p && t.p !== p) return;
    const st = cyberState(p.body);
    const subs: MenuOption[] = [];
    const table = t?.kind === 'object' && t.obj && NEAR_TABLE.has(t.obj.key) ? t.obj : null;
    const site = table || this.surgerySite(p);
    const kits = p.allItems().filter((it) => !!cyberDefByItem(it.key));
    if (site || table) {
      const label = table ? 'Lie on the table: cyber surgery' : 'Self-surgery (surgery rig)';
      subs.push({ label, disabled: !kits.length && !hasCyber(p.body) ? 'no hardware to fit (find or build a part)' : false, action: () => this.openField(p) });
    } else if (kits.length) {
      subs.push({ label: 'Fit hardware', disabled: 'needs an operating table or a surgery rig', action: undefined });
    }
    if (st && hasCyber(p.body)) {
      const oil = p.findItem((it) => it.key === 'machine_oil' && (it.uses ?? 1) > 0.01);
      const rusty = anyRust(st);
      if (rusty > 0.05) subs.push({ label: `Oil the joints (rust ${Math.round(rusty * 100)}%)`, disabled: !oil ? 'needs machine oil' : false, action: oil ? () => this.oil(p, oil) : undefined });
      if (liveFx(p.body)!.drain > 0) {
        const cell = p.findTool('#battery', 0.05) || p.findItem((it) => it.key === 'battery' && (it.uses ?? 1) > 0.05);
        subs.push({ label: `Swap the cell (${Math.round(st.charge)}%)`, disabled: !cell ? 'needs a battery' : st.charge > 95 ? 'cell is full' : false, action: cell ? () => this.swapCell(p, cell) : undefined });
      }
    }
    if (subs.length) opts.push({ label: 'Cyberware', sub: subs });
  }

  /** an operating table or gurney within reach, or a surgery rig in the pack */
  surgerySite(p: Player): boolean {
    if (p.findItem((it) => it.key === 'surgery_rig')) return true;
    const z = G.getZone(p.zoneKey);
    for (const o of z.objects.values()) if (NEAR_TABLE.has(o.key) && Math.abs(o.x + 0.5 - p.x) < 2.5 && Math.abs(o.y + 0.5 - p.z) < 2.5) return true;
    return false;
  }

  openField(p: Player) {
    import('../ui/surgery/field').then((m) => m.fieldSurgery(p)).catch((e) => console.warn('field surgery', e));
  }

  private oil(p: Player, oil: Item) {
    const st = cyberState(p.body); if (!st) return;
    for (const s of CYBER_SLOTS) { const ps = st.parts[s]; if (ps) ps.rust = 0; }
    oil.uses = Math.max(0, (oil.uses ?? 1) - 0.2);
    if (oil.uses <= 0.01) p.removeItem(oil);
    for (const k of [...this.warned]) if (k.startsWith('rust')) this.warned.delete(k);
    G.audio?.at?.('cy_servo', p.x, p.z, 0.7);
    bus.emit('think', p, 'Better. It moves like it should.');
    changed(p);
  }
  private swapCell(p: Player, cell: Item) {
    const st = cyberState(p.body); if (!st) return;
    const add = (cell.uses ?? 1) * 100;
    st.charge = clamp(st.charge + add, 0, 100);
    cell.uses = 0;
    p.removeItem(cell);
    G.audio?.at?.('cy_powerup', p.x, p.z, 0.8);
    bus.emit('think', p, 'Click. The hardware hums back to life.');
    changed(p);
  }
}

function anyRust(st: CyberState) { let r = 0; for (const s of CYBER_SLOTS) r = Math.max(r, st.parts[s]?.rust ?? 0); return r; }

/** the part options for a slot (for UIs): every part of that kind with availability */
export function slotOptions(slot: CyberSlot) {
  return partsFor(slot).map((d) => ({ def: d, unlocked: partUnlocked(d), hint: partHint(d) }));
}


// ------------------------------------------------------------------ the operating table's hand-off to the session
let pending: CyberLoadout | null = null;
/** the operating table stores what it fitted; the next new survivor takes it (src/game/session.ts) */
export function setPendingLoadout(l: CyberLoadout | null) { pending = l && Object.keys(l).length ? { ...l } : null; }
export function takePendingLoadout(): CyberLoadout | null { const l = pending; pending = null; return l; }

/** install the cyber system for a running game */
export function installCyber(g: { addSystem: (s: GameSystem) => unknown }) {
  if ((G as any).cyber) return (G as any).cyber as CyberSystem;
  const s = new CyberSystem();
  g.addSystem(s);
  return s;
}
