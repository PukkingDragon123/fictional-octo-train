// The tribes: standing (reputation), a chalked tab of scrip per tribe (sell
// them things, buy from them against it), camps that fill with members,
// hostility when you hurt them, raids when they decide you are a problem,
// recruits who walk with you. World state lives in one replicated op
// ('tribe'), so co-op crews share standing and tabs, and saves keep them.
import { G } from '../game/G';
import { bus } from '../core/events';
import { defOp, op, isReplaying } from '../game/ops';
import type { GameSystem } from '../game/game';
import type { Creature } from '../creatures/creature';
import type { Zone } from '../world/zone';
import type { Item } from '../items/item';
import { itemDef } from '../items/item';
import { createItem } from '../items/factory';
import { Rng } from '../core/rng';
import { itemValue } from '../game/debt/values';
import { defScanInfo } from '../scan/scan';
import { TRIBES, TRIBE_KEYS, standing, type TribeKey, type TribeDef } from './defs';
import type { Camp } from './camp';
import { bark, memberName, prunePool, tribeOfCreature, sayAs } from './npc';
import { TradeUI } from './tradeUI';
import { Talk, talkTarget } from './talk';
import { tribeBrain, alarm, passBark } from './brain';
import { remember, attitude, shiftLoyalty, RECRUIT_COST, RECRUIT_REP, MAX_FOLLOWERS } from './mind';
import { SAY, line } from './speech';
import { fillBody, pickOdds, startPickpocket } from './theft';
import type { Player } from '../entities/player';

export interface TribeState {
  rep: Record<string, number>;
  tab: Record<string, number>;
  stat: Record<string, number>;
  gen: Record<string, number>;
  deadAt: Record<string, number>;
  aggro: Record<string, number>;
  met: Record<string, number>;
  raid: Record<string, number>;
  /** what each person remembers about the unit (src/tribes/mind.ts) */
  mind: Record<string, Record<string, number>>;
  /** followers' loyalty */
  loyal: Record<string, number>;
}
const blank = (): TribeState => ({ rep: Object.fromEntries(TRIBE_KEYS.map((k) => [k, TRIBES[k].startRep])), tab: {}, stat: {}, gen: {}, deadAt: {}, aggro: {}, met: {}, raid: {}, mind: {}, loyal: {} });
const HOSTILE = new Set(['hostile', 'stalker', 'ambush', 'territorial']);
const RESPAWN_H = 20;
export { RECRUIT_COST, RECRUIT_REP };

for (const k of TRIBE_KEYS) defScanInfo('tribe', k, { title: TRIBES[k].name, cls: TRIBES[k].lore.cls, notes: TRIBES[k].lore.notes });

export class TribeSystem implements GameSystem {
  name = 'tribes';
  st: TribeState = blank();
  ui: TradeUI;
  talk: Talk;
  /** shared cool-downs (warnings shouted, muggings) */
  warnT = 0; mugT = 0;
  private popT = 0;
  private lastHour = -1;
  private hurtT = new Map<string, number>();
  private pruneT = 0;

  constructor() {
    G.tribes = this;
    this.ui = new TradeUI(this);
    this.talk = new Talk(this);
    bus.on('creatureHurt', (c: Creature, hit: any) => this.onHurt(c, hit));
    bus.on('creatureKilled', (c: Creature, killer: any) => this.onKilled(c, killer));
    bus.on('thrallMade', (r: any) => { if (r?.owner && G.role !== 'client') this.bump('thralls', 1); });
  }

  // ---------------------------------------------------------------- queries
  def(t: string): TribeDef { return TRIBES[t as TribeKey]; }
  rep(t: string) { return this.st.rep[t] ?? 0; }
  tab(t: string) { return Math.round(this.st.tab[t] ?? 0); }
  stat(k: string) { return this.st.stat[k] ?? 0; }
  standing(t: string) { return standing(this.rep(t)); }
  hostile(t: string) { return this.rep(t) < -12 || (this.st.aggro[t] ?? -1) > G.clock.hours; }
  met(t: string) { return !!this.st.met[t]; }
  /** price the tribe charges for an item (scrip off the tab) */
  buyPrice(t: string, key: string) {
    const v = Math.max(4, itemValue(createItemCached(key)));
    return Math.round(v * Math.max(0.85, Math.min(2, 1.6 - this.rep(t) * 0.007)));
  }
  /** what they credit for an item */
  sellPrice(t: string, it: Item) {
    const T = this.def(t), d = itemDef(it.key);
    const want = T.wants.includes(d.cat) || (d.tags || []).some((g) => T.wants.includes(g)) || T.wants.includes(d.key);
    const v = itemValue(it);
    return Math.max(0, Math.round(v * Math.max(0.3, Math.min(0.9, 0.5 + this.rep(t) * 0.004)) * (want ? 1.5 : 1)));
  }
  wanted(t: string, it: Item) { const T = this.def(t), d = itemDef(it.key); return T.wants.includes(d.cat) || (d.tags || []).some((g) => T.wants.includes(g)) || T.wants.includes(d.key); }
  wares(t: string): string[] { const r = this.rep(t); return this.def(t).wares.filter(([, min]) => r >= min).map(([k]) => k); }
  recruits(owner: string): Creature[] { return [...((G.creatures?.creatures?.values?.() || []) as Iterable<Creature>)].filter((c) => !c.dead && c.tamedBy === owner && tribeOfCreature(c)); }

  // ---------------------------------------------------------------- mutations (replicated)
  bumpRep(t: string, n: number, why = '') {
    if (!n) return;
    op('tribe', { k: 'rep', t, n });
    if (why && G.local) this.ui.toast(`${this.def(t).name.toUpperCase()} ${n > 0 ? '+' : ''}${n}`, why, n > 0 ? 'up' : 'down');
  }
  addTab(t: string, n: number) { op('tribe', { k: 'tab', t, n: Math.round(n) }); }
  bump(k: string, n = 1) { op('tribe', { k: 'stat', key: k, n }); }
  meet(t: string) { if (!this.met(t)) { op('tribe', { k: 'met', t }); G.missions?.set?.(`tribe:${t}:met`); } }

  apply(a: { k: string; t?: string; n?: number; key?: string; v?: number; id?: string }) {
    const s = this.st;
    switch (a.k) {
      case 'mem': { const m = ((s.mind ||= {})[a.id!] ||= {}); m[a.key!] = Math.max(0, (m[a.key!] ?? 0) + (a.n ?? 1)); bus.emit('tribeMemory', a.id, a.key); break; }
      case 'loyal': (s.loyal ||= {})[a.id!] = Math.max(0, Math.min(100, (s.loyal[a.id!] ?? 60) + (a.n ?? 0))); break;
      case 'rep': s.rep[a.t!] = Math.max(-100, Math.min(100, (s.rep[a.t!] ?? 0) + (a.n ?? 0))); bus.emit('tribeRep', a.t, s.rep[a.t!]); break;
      case 'tab': s.tab[a.t!] = Math.max(0, (s.tab[a.t!] ?? 0) + (a.n ?? 0)); bus.emit('tribeTab', a.t, s.tab[a.t!]); break;
      case 'stat': s.stat[a.key!] = (s.stat[a.key!] ?? 0) + (a.n ?? 1); break;
      case 'met': s.met[a.t!] = 1; break;
      case 'gen': s.gen[a.key!] = (s.gen[a.key!] ?? 0) + 1; delete s.deadAt[a.key!]; break;
      case 'dead': s.deadAt[a.key!] = a.v ?? 0; break;
      case 'aggro': s.aggro[a.t!] = a.v ?? 0; break;
      case 'raid': s.raid[a.t!] = a.v ?? 0; break;
    }
  }

  // ---------------------------------------------------------------- the host: camps
  private populate() {
    const zones = new Set<string>();
    for (const p of G.players.values()) zones.add(p.zoneKey);
    for (const zk of zones) {
      const z = G.zones.get(zk); if (!z) continue;
      for (const camp of (z.meta.tribeCamps || []) as Camp[]) {
        camp.slots.forEach((s, slot) => {
          const key = `${zk}:${camp.i}:${slot}`;
          const id = `tb_${zk}_${camp.i}_${slot}_${this.st.gen[key] ?? 0}`;
          const c = G.creatures?.creatures?.get(id) as Creature | undefined;
          if (c) {
            if ((c.dead || c.tamedBy) && this.st.deadAt[key] === undefined) op('tribe', { k: 'dead', key, v: G.clock.hours });
            return;
          }
          const dead = this.st.deadAt[key];
          if (dead !== undefined) { if (G.clock.hours - dead >= RESPAWN_H) op('tribe', { k: 'gen', key }); return; }
          this.spawnMember(camp.t, zk, s[0], s[1], id, { camp: camp.i, slot });
        });
      }
    }
  }

  spawnMember(t: TribeKey, zone: string, x: number, z: number, id: string, mem: Record<string, any> = {}): Creature | null {
    const c = G.creatures?.spawn?.('tribe_' + t, zone, x, z, { id }) as Creature | null;
    if (!c) return null;
    Object.assign(c.mem, { tribe: t, persistent: true, post: [x, z], ...mem });
    c.scanned = true;
    c.home = { x, z };
    return c;
  }

  /** a member's brain (host); false hands it to the default brain (src/tribes/brain.ts) */
  think(c: Creature, dt: number): boolean { return tribeBrain(this, c, dt); }
  /** a member shouts for the camp: everyone of the tribe in earshot turns on that player */
  alarm(c: Creature, pid: string, why: 'thief' | 'hurt' | 'attack' = 'attack') { alarm(c, pid, why); }

  /** the world prompt over a person: [E] Talk (followers too), [G] Pickpocket from behind */
  ctxActions(p: Player): any[] {
    if (this.talk.open || this.ui.isOpen) return [];
    const c = talkTarget(p); if (!c) return [];
    const t = tribeOfCreature(c)!;
    const at = () => (c.dead ? null : { x: c.x, y: c.y + c.height + 0.32, z: c.z });
    const tgt = { tgt: 'c:' + c.id, name: memberName(c), anchor: at };
    const fighting = (c.state === 'chase' || c.state === 'attack') && c.targetId === p.id;
    const out: any[] = [];
    if (fighting || (this.hostile(t) && !c.tamedBy)) out.push({ id: 'talk', label: 'Talk', icon: 'talk', key: 'E', why: 'they want me dead', head: 'Talk', ...tgt });
    else out.push({ id: 'talk', label: 'Talk', icon: 'talk', key: 'E', run: () => this.talk.open(c), head: 'Talk', ...tgt });
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    if (!c.tamedBy && !fighting && d < 1.5) {
      const odds = pickOdds(p, c);
      out.push({ id: 'pickpocket', label: odds > 0.6 ? 'Pickpocket' : 'Pickpocket (risky)', icon: 'steal', key: 'G', run: () => startPickpocket(p, c), ...tgt });
    }
    return out;
  }
  private nearPlayer(c: Creature, r: number) { for (const p of G.players.values()) if (p.zoneKey === c.zoneKey && Math.hypot(p.x - c.x, p.z - c.z) < r) return true; return false; }

  // ---------------------------------------------------------------- consequences (host)
  private onHurt(c: Creature, hit: any) {
    if (G.role === 'client') return;
    const t = c.mem.tribe as TribeKey | undefined;
    const by = hit?.by as string | undefined;
    const p = by ? G.players.get(by) : null;
    const owner = p ?? (by ? G.players.get(G.dominion?.rec?.(by)?.owner ?? '') : null);
    if (owner) c.mem.lastBy = owner.id;
    if (!t || !owner) return;
    const k = c.id;
    if ((this.hurtT.get(k) ?? 0) > G.time) return;
    this.hurtT.set(k, G.time + 2);
    // a follower takes it personally, and may walk
    if (c.tamedBy) { if (c.tamedBy === owner.id) { shiftLoyalty(c, -25); sayAs(c, line(SAY.followHurt)); } return; }
    remember(c, 'hit');
    this.bumpRep(t, c.mem.raid ? -1 : -6, 'you struck one of them');
    if (!c.mem.raid) alarm(c, owner.id, 'hurt');
    op('tribe', { k: 'aggro', t, v: G.clock.hours + 0.75 });
  }

  private onKilled(c: Creature, killer: any) {
    if (G.role === 'client') return;
    const t = c.mem.tribe as TribeKey | undefined;
    const kp = killer || (c.mem.lastBy ? G.players.get(c.mem.lastBy) : null);
    if (t) {
      fillBody(c);
      if (c.tamedBy) return;
      // followers of that tribe saw it
      if (kp) for (const f of this.recruits(kp.id)) if (f.mem.tribe === t && Math.hypot(f.x - c.x, f.z - c.z) < 20) { shiftLoyalty(f, -30); sayAs(f, 'That was one of mine.'); }
      // killing a member: they remember. Their rivals approve.
      this.bumpRep(t, c.mem.raid ? -3 : -25, 'you killed ' + memberName(c));
      this.bumpRep(this.def(t).rival, 4, 'an enemy of theirs died');
      if (this.rep(t) < -25 && !c.mem.raid) op('tribe', { k: 'raid', t, v: G.clock.hours + 2 + Math.random() * 4 });
      this.bump('kill:tribe_' + t);
      return;
    }
    if (!kp) return;
    this.bump('kill:' + c.sp.key);
    if (HOSTILE.has(c.sp.temperament)) {
      this.bump('kills_hostile');
      // a monster put down near a camp: they saw that
      const z = G.zones.get(c.zoneKey);
      for (const camp of ((z?.meta.tribeCamps || []) as Camp[])) if (Math.hypot(camp.x - c.x, camp.y - c.z) < 14) this.bumpRep(camp.t, 2, 'you killed something near their camp');
      // anyone it was after owes the unit for that
      for (const o of (G.creatures?.creatures?.values?.() || []) as Iterable<Creature>) {
        if (o.dead || !o.mem.tribe || o.tamedBy || o.zoneKey !== c.zoneKey || Math.hypot(o.x - c.x, o.z - c.z) > 7) continue;
        remember(o, 'help');
        if (Math.random() < 0.5) sayAs(o, ['Thank you. I mean it.', 'That was close. Too close.', 'I owe you for that one.'][Math.floor(Math.random() * 3)]);
        break;
      }
    }
  }

  // ---------------------------------------------------------------- raids (host, hourly)
  private hourly() {
    for (const t of TRIBE_KEYS) {
      const due = this.st.raid[t];
      const feud = this.rep(t) < -40;
      if (!(due && G.clock.hours >= due) && !(feud && Math.random() < 0.18)) continue;
      if (due) op('tribe', { k: 'raid', t, v: 0 });
      const ps = [...G.players.values()].filter((p) => !p.body.dead);
      if (!ps.length) continue;
      const p = ps[Math.floor(Math.random() * ps.length)];
      this.raid(t, p);
    }
  }
  /** send a raiding party after a survivor */
  raid(t: TribeKey, p: any) {
    const z = G.getZone(p.zoneKey);
    const spot = z.randomFloor(new Rng(Math.random() * 1e9), (x, y) => { const d = Math.hypot(x - p.x, y - p.z); return d > 12 && d < 24; }, 600);
    if (!spot) return 0;
    const n = 2 + Math.floor(Math.random() * 2) + (this.rep(t) < -60 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      // half of them go ahead and lie in wait where the survivor is walking
      let sx = spot[0] + 0.5 + (Math.random() - 0.5) * 2, sz = spot[1] + 0.5 + (Math.random() - 0.5) * 2, ambush = 0;
      if (i % 2 === 1) {
        const ax = Math.floor(p.x + Math.cos(p.facing) * 11 + (Math.random() - 0.5) * 6), az = Math.floor(p.z + Math.sin(p.facing) * 11 + (Math.random() - 0.5) * 6);
        if (z.inb(ax, az) && z.floor[z.idx(ax, az)] && !z.solid[z.idx(ax, az)]) { sx = ax + 0.5; sz = az + 0.5; ambush = 1; }
      }
      const c = this.spawnMember(t, z.key, sx, sz, `raid_${t}_${Math.floor(G.time * 10)}_${i}`, { raid: 1, raidUntil: G.time + 300, persistent: false, ambush });
      if (c) c.mem.net = { raid: 1 };
    }
    bus.emit('tribeRaid', t, p.id);
    if (p.isLocal) bus.emit('think', p, ['Footsteps. A lot of them, all at once.', 'Someone is coming for me. More than one.', `Chalk marks on the wall, fresh. ${this.def(t).name}.`][Math.floor(Math.random() * 3)]);
    return n;
  }

  // ---------------------------------------------------------------- player actions (local)
  buy(t: string, key: string): boolean {
    const p = G.local; if (!p) return false;
    const price = this.buyPrice(t, key);
    if (this.tab(t) < price) return false;
    this.addTab(t, -price);
    const it = createItem(key);
    p.addItem(it);
    bus.emit('inventoryChanged', p);
    this.traded(t, price);
    return true;
  }
  sell(t: string, it: Item): number {
    const p = G.local; if (!p) return 0;
    const v = this.sellPrice(t, it);
    if (v <= 0) return 0;
    p.removeItem(it);
    bus.emit('inventoryChanged', p);
    this.addTab(t, v);
    this.traded(t, v);
    return v;
  }
  private traded(t: string, v: number) {
    this.bump('traded:' + t, v);
    const before = Math.floor((this.stat('traded:' + t) - v) / 60), after = Math.floor(this.stat('traded:' + t) / 60);
    if (after > before) this.bumpRep(t, Math.min(3, after - before), 'good trade');
    G.audio?.ui?.('tribe_trade', 0.5);
    bus.emit('tribeTrade', t, v);
  }
  canRecruit(t: string) { const p = G.local; return !!p && this.rep(t) >= RECRUIT_REP && this.tab(t) >= RECRUIT_COST && this.recruits(p.id).length < MAX_FOLLOWERS; }
  recruit(c: Creature): boolean {
    const p = G.local, t = tribeOfCreature(c);
    if (!p || !t || !this.canRecruit(t)) return false;
    this.addTab(t, -RECRUIT_COST);
    op('tribeRecruit', { id: c.id, by: p.id });
    bark(c, 'recruit', true);
    return true;
  }

  // ---------------------------------------------------------------- frame
  update(dt: number) {
    const host = G.role !== 'client';
    if (host) {
      this.popT -= dt;
      if (this.popT <= 0) { this.popT = 1.5; this.populate(); this.recruitsKeepUp(); }
      const h = Math.floor(G.clock.hours);
      if (h !== this.lastHour) { if (this.lastHour >= 0) this.hourly(); this.lastHour = h; }
    }
    this.pruneT -= dt;
    if (this.pruneT <= 0) { this.pruneT = 10; prunePool(); }
    this.ui.update(dt);
    this.talk.update(dt);
    // a word from people the unit walks past
    const p = G.local;
    if (p && !this.talk.open && (this.barkT -= dt) <= 0) {
      this.barkT = 0.6;
      const c = talkTarget(p);
      if (c && Math.hypot(c.x - p.x, c.z - p.z) < 2.4 && !(c.state === 'chase' || c.state === 'attack')) passBark(c, p);
    }
  }
  private barkT = 0;

  /** recruits follow their survivor through portals */
  private recruitsKeepUp() {
    for (const c of (G.creatures?.creatures?.values?.() || []) as Iterable<Creature>) {
      if (c.dead || !c.tamedBy || !c.mem.tribe) continue;
      const p = G.players.get(c.tamedBy);
      if (!p || p.zoneKey === c.zoneKey || c.mem.stay) continue;
      if (c.rig) { G.creatures.root.remove(c.rig.root); c.rig = null; }
      c.zoneKey = p.zoneKey; c.x = p.x - Math.cos(p.facing); c.z = p.z - Math.sin(p.facing); c.path = null;
    }
  }
}

const itemCache = new Map<string, Item>();
function createItemCached(key: string): Item { let it = itemCache.get(key); if (!it) { it = createItem(key); it.cond = 1; itemCache.set(key, it); } return it; }

// ---------------------------------------------------------------- ops
defOp('tribe', (a: any) => { (G.tribes as TribeSystem | null)?.apply(a); });
defOp('tribeRecruit', (a: { id: string; by: string }) => {
  const c = G.creatures?.creatures?.get(a.id) as Creature | undefined;
  if (!c || c.dead || isReplaying()) return;
  if (!a.by) { c.tamedBy = null; c.mem.recruit = null; c.mem.stay = false; return; } // sent home
  c.tamedBy = a.by; c.mem.recruit = a.by; c.mem.persistent = true; c.mem.raid = 0;
  c.mem.net = { sit: 0, act: '' };
  bus.emit('tribeRecruited', c, a.by);
});
