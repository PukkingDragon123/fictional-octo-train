// GATHERING (round 16): the backrooms are the lumber yard. Salvage nodes grow in
// every level: peeling wallpaper and rotten drywall against the walls, sodden
// carpet, exposed pipe runs (they leak: a water tap), fallen light fixtures, dead
// vending units, scrap heaps, fungal blooms, old remains, and on the Ledge,
// slumped melted matter. Each one is worked by hand with the right tool:
//
//   [E] Strip: Peeling Wallpaper (Knife)          a timed action, the unit's hands at it,
//                                                 dust / sparks / splinters, a sound per bite
//   what comes off drops at the node as world items (pick them up, or let a crate in the camp
//   take them), the node visibly thins with each pull (state.left -> the model's variant) and
//   grows back over game hours (state.at). Clusters sit round rooms that make good camps.
//
// Tools: every node lists the tools that work it and how fast (a saw on a pipe run, a
// screwdriver on a dead machine); some can be done bare-handed, slowly. Better tools are
// quicker: a Fine or Masterwork tool (src/craft/stores.ts quality) works faster and turns up
// more. Research (lane 'Gathering' on the BLD branch): Quick Hands, Salvager's Eye, Seam
// Ecology, Salvage Sling + Pack Frame (carry capacity). Speed hook: src/build/speed.ts
// addSpeedMod(id, (p, kind) => kind === 'gather' ? 1.2 : 1).
import { G } from '../game/G';
import { bus } from '../core/events';
import { op } from '../game/ops';
import { Rng } from '../core/rng';
import { onZoneGeneratedLate } from '../world/worldGraph';
import { ZoneBuilder } from '../world/gen/builder';
import { objDef } from '../world/objects';
import { floorDef } from '../world/defs';
import { TF, type Zone, type TileObject } from '../world/zone';
import { createItem, serializeItem } from '../items/factory';
import { itemDef, hasItemDef, type Item } from '../items/item';
import { queueAt, FillAction } from '../actions/basic';
import { TimedAction } from '../actions/action';
import { hasUnlock } from '../game/research';
import { treeOffers } from '../game/treeData';
import { Body } from '../survival/body';
import { sparks, splinters } from './weld';
import { PK } from '../gore/particles';
import { gatherSpeed } from './speed';
import { bump, mark } from './progress';
import { shake } from '../gfx/juice';
import { piece } from './pieces';
import { DERELICT } from './blueprints';
import type { ActionAnim } from '../entities/humanAnim';
import type { Player } from '../entities/player';
import type { MenuOption } from '../ui/ui';
import type { SkillKey } from '../survival/traits';

type Fx = 'wood' | 'metal' | 'cloth' | 'wet' | 'spark' | 'dust' | 'bone';
export interface NodeDef {
  key: string;
  name: string;
  verb: string;
  /** tool tag ('#knife') or item key, with its time multiplier (lower is quicker), best first */
  tools: [string, number, string][];
  /** bare hands work too, at this multiplier */
  hands?: number;
  /** seconds per pull at x1 */
  time: number;
  /** pulls before it is picked clean */
  charges: number;
  /** game hours to grow one pull back */
  regrow: number;
  /** item, chance, min, max (drainables: max < 1 = the fraction of a box) */
  yields: [string, number, number, number][];
  anim: ActionAnim;
  sound: string;
  fx: Fx;
  skill: SkillKey;
  /** where it grows (zone key pattern) and how often */
  zones?: RegExp;
  weight: number;
  wall?: boolean;
}

export const NODES: NodeDef[] = [
  { key: 'gn_wallpaper', name: 'Peeling Wallpaper', verb: 'Strip', tools: [['#boxcutter', 0.75, 'Box Cutter'], ['#knife', 0.85, 'Knife'], ['#sharp', 1, 'Blade']], hands: 1.7, time: 3.2, charges: 4, regrow: 30,
    yields: [['paper', 0.9, 1, 2], ['rag', 0.55, 1, 2], ['cloth', 0.15, 1, 1], ['spawn_ear', 0.08, 1, 1]], anim: 'craft', sound: 'cy_rip', fx: 'cloth', skill: 'tailoring', weight: 3, wall: true },
  { key: 'gn_drywall', name: 'Rotten Drywall', verb: 'Break out', tools: [['#sledge', 0.65, 'Sledgehammer'], ['#crowbar', 0.8, 'Crowbar'], ['#hammer', 1, 'Hammer']], time: 4.2, charges: 3, regrow: 60,
    yields: [['plank', 0.85, 1, 1], ['wire', 0.45, 1, 1], ['nails', 0.3, 0.1, 0.3], ['pipe', 0.12, 1, 1], ['scrap_metal', 0.3, 1, 1]], anim: 'hammer', sound: 'dmg_hit_wood', fx: 'dust', skill: 'carpentry', weight: 3, wall: true },
  { key: 'gn_carpet', name: 'Sodden Carpet', verb: 'Cut', tools: [['#boxcutter', 0.75, 'Box Cutter'], ['#knife', 0.9, 'Knife'], ['#sharp', 1, 'Blade']], time: 3.8, charges: 3, regrow: 40,
    yields: [['rag', 0.85, 1, 3], ['cloth', 0.5, 1, 1], ['spawn_morel', 0.06, 1, 1]], anim: 'craft', sound: 'craft_tear', fx: 'wet', skill: 'tailoring', weight: 2 },
  { key: 'gn_pipes', name: 'Leaking Pipe Run', verb: 'Saw off', tools: [['#wrench', 0.8, 'Wrench'], ['#saw', 1, 'Saw'], ['#hammer', 1.6, 'Hammer']], time: 5.5, charges: 2, regrow: 96,
    yields: [['pipe', 1, 1, 1], ['scrap_metal', 0.5, 1, 1], ['wire', 0.15, 1, 1]], anim: 'saw', sound: 'craft_saw', fx: 'metal', skill: 'mechanics', weight: 2, wall: true },
  { key: 'gn_fixture', name: 'Fallen Light Fixture', verb: 'Pry apart', tools: [['#crowbar', 0.85, 'Crowbar'], ['#screwdriver', 1, 'Screwdriver'], ['#hammer', 1.4, 'Hammer']], time: 4.8, charges: 2, regrow: 120,
    yields: [['wire', 0.85, 1, 2], ['scrap_metal', 0.6, 1, 1], ['electronics_scrap', 0.35, 1, 1], ['fluoro_tube', 0.3, 1, 1], ['glass_shard', 0.4, 1, 2], ['lightbulb', 0.12, 1, 1]], anim: 'hammer', sound: 'dmg_hit_metal', fx: 'spark', skill: 'electrical', weight: 2 },
  { key: 'gn_machine', name: 'Dead Vending Unit', verb: 'Salvage', tools: [['#screwdriver', 1, 'Screwdriver'], ['#wrench', 1, 'Wrench'], ['#crowbar', 1.2, 'Crowbar']], time: 7, charges: 4, regrow: 200,
    yields: [['electronics_scrap', 0.7, 1, 2], ['wire', 0.6, 1, 1], ['sheet_metal', 0.35, 1, 1], ['spring', 0.3, 1, 1], ['coins', 0.4, 1, 1], ['gear', 0.14, 1, 1], ['fuse', 0.15, 1, 1], ['motor', 0.07, 1, 1]], anim: 'craft', sound: 'cy_bolt', fx: 'spark', skill: 'electrical', weight: 1.6, wall: true },
  { key: 'gn_scrap', name: 'Scrap Heap', verb: 'Scavenge', tools: [['#crowbar', 0.75, 'Crowbar'], ['#hammer', 0.85, 'Hammer']], hands: 1.2, time: 3, charges: 5, regrow: 36,
    yields: [['scrap_metal', 0.9, 1, 2], ['plank', 0.25, 1, 1], ['wire', 0.2, 1, 1], ['pipe', 0.12, 1, 1], ['spring', 0.15, 1, 1], ['screws', 0.15, 0.1, 0.25], ['nails', 0.15, 0.1, 0.25]], anim: 'loot', sound: 'vent_clank', fx: 'metal', skill: 'mechanics', weight: 3 },
  { key: 'gn_bloom', name: 'Fungal Bloom', verb: 'Chop', tools: [['#axe', 0.7, 'Axe'], ['#knife', 1, 'Knife'], ['#sharp', 1.1, 'Blade']], hands: 1.8, time: 3.6, charges: 3, regrow: 24,
    yields: [['wallpaper_ear', 0.6, 1, 2], ['puffball', 0.35, 1, 1], ['biomass', 0.5, 1, 1], ['hum_cap', 0.15, 1, 1], ['spawn_ear', 0.15, 1, 1], ['spawn_puffball', 0.1, 1, 1]], anim: 'saw', sound: 'tc_squish', fx: 'wet', skill: 'foraging', weight: 2, wall: true },
  { key: 'gn_remains', name: 'Old Remains', verb: 'Pick through', tools: [['#knife', 1, 'Knife'], ['#sharp', 1.1, 'Blade']], hands: 1.5, time: 4.6, charges: 2, regrow: 300,
    yields: [['bone', 0.85, 1, 3], ['leather_strips', 0.3, 1, 1], ['rag', 0.4, 1, 1], ['coins', 0.25, 1, 1], ['spring', 0.08, 1, 1]], anim: 'loot', sound: 'bone_crunch', fx: 'bone', skill: 'foraging', weight: 1.1 },
  { key: 'gn_melt', name: 'Melted Matter', verb: 'Chip', tools: [['#sledge', 0.7, 'Sledgehammer'], ['#hammer', 1, 'Hammer'], ['#crowbar', 1.2, 'Crowbar']], time: 4, charges: 4, regrow: 72,
    yields: [['plastic_scrap', 0.8, 1, 2], ['glass_shard', 0.4, 1, 1], ['scrap_metal', 0.4, 1, 1], ['glow_dust', 0.12, 1, 1]], anim: 'hammer', sound: 'craft_crack', fx: 'dust', skill: 'mechanics', zones: /^ledge/, weight: 6 },
];
const BY = new Map(NODES.map((n) => [n.key, n]));
export const nodeDef = (k: string) => BY.get(k);
export const isNode = (k: string) => BY.has(k);

// ---------------------------------------------------------------- research: the gathering lane
treeOffers([
  { key: 'gt_quick', category: 'build', lane: 'Gathering', title: 'Quick Hands', cost: 2, item: 'box_cutter', alt: ['knife_kitchen', 'scrap_metal'], desc: 'Score, peel, lever. Where to put the blade, where to put the bar.', gives: 'gathering is a quarter faster' },
  { key: 'gt_salvager', category: 'build', lane: 'Gathering', title: 'Salvager\'s Eye', cost: 3, item: 'crowbar', alt: ['scrap_metal'], requires: ['gt_quick'], desc: 'You stop missing the good bits: the motor behind the panel, the spring in the coil.', gives: 'every pull rolls its finds twice (the second at half chance)' },
  { key: 'gt_regrow', category: 'build', lane: 'Gathering', title: 'Seam Ecology', cost: 3, item: 'spawn_ear', alt: ['wallpaper_ear', 'scrap_metal'], requires: ['gt_salvager'], desc: 'The building puts back what you take, and it puts it back faster where it has been taken before.', gives: 'salvage nodes grow back twice as fast' },
  { key: 'gt_sling', category: 'build', lane: 'Gathering', title: 'Salvage Sling', cost: 2, item: 'rope', alt: ['rag', 'scrap_metal'], desc: 'A sling of webbing across the chest for the long pieces.', gives: '+4 kg carry capacity' },
  { key: 'gt_frame', category: 'build', lane: 'Gathering', title: 'Pack Frame', cost: 4, item: 'steel_frame', alt: ['pipe', 'scrap_metal'], requires: ['gt_sling'], desc: 'A bent-pipe frame under the iron cube: the weight sits on the hips.', gives: '+6 kg carry capacity' },
]);
/** carry capacity from the gathering research (Body.carryCapacity, wrapped once below) */
export function gatherCarryBonus(): number { return (hasUnlock('gt_sling') ? 4 : 0) + (hasUnlock('gt_frame') ? 6 : 0); }
{
  const proto = Body.prototype as unknown as { carryCapacity: () => number; __gatherCap?: boolean };
  if (!proto.__gatherCap) {
    const base = proto.carryCapacity;
    proto.carryCapacity = function (this: Body) { return base.call(this) + gatherCarryBonus(); };
    proto.__gatherCap = true;
  }
}

// ---------------------------------------------------------------- state
const hours = () => G.clock?.hours ?? 0;
const regrowH = (d: NodeDef) => d.regrow * (hasUnlock('gt_regrow') ? 0.5 : 1);
export const leftOf = (o: TileObject) => { const d = nodeDef(o.key); return d ? Math.max(0, Math.min(d.charges, o.state.left ?? d.charges)) : 0; };

/** the best tool this unit carries for a node: [item, multiplier, name] or null (hands: item null) */
export function toolFor(p: Player, d: NodeDef): { it: Item | null; mul: number; name: string } | null {
  for (const [t, mul, name] of d.tools) {
    const it = p.findTool(t);
    if (it) {
      const q = (it.data?.q as number | undefined) ?? 1;
      return { it, mul: mul * (q >= 3 ? 0.7 : q >= 2 ? 0.85 : q <= 0 ? 1.15 : 1), name };
    }
  }
  return d.hands ? { it: null, mul: d.hands, name: 'Hands' } : null;
}

// ---------------------------------------------------------------- the action
class GatherAction extends TimedAction {
  private fxT = 0.2; private sndT = 0.1;
  constructor(p: Player, public o: TileObject, private d: NodeDef, private tool: { it: Item | null; mul: number; name: string }) {
    super(p);
    const sk = p.body.skill(d.skill);
    this.duration = Math.max(1, d.time * tool.mul * (1 - Math.min(0.3, sk * 0.04)) * (hasUnlock('gt_quick') ? 0.75 : 1) / gatherSpeed(p));
    this.name = `${d.verb} ${d.name}`;
    this.anim = tool.it ? d.anim : 'loot';
    this.face = { x: o.x + 0.5, z: o.y + 0.5 };
  }
  isValid() {
    const z = G.zones.get(this.p.zoneKey);
    if (!z || z.objects.get(this.o.uid) !== this.o || leftOf(this.o) <= 0) return false;
    if (this.tool.it && !this.p.containerOf(this.tool.it)) return false;
    return Math.hypot(this.o.x + 0.5 - this.p.x, this.o.y + 0.5 - this.p.z) < 2.4;
  }
  update(dt: number) {
    this.fxT -= dt; this.sndT -= dt;
    const x = this.o.x + 0.5 + (Math.random() - 0.5) * 0.5, z = this.o.y + 0.5 + (Math.random() - 0.5) * 0.5, y = this.d.wall ? 0.4 + Math.random() * 1.2 : 0.15 + Math.random() * 0.4;
    if (this.fxT <= 0) { this.fxT = 0.35 + Math.random() * 0.2; fx(this.d.fx, x, y, z, 4); }
    if (this.sndT <= 0) { this.sndT = 0.55 + Math.random() * 0.35; G.audio?.at?.(this.tool.it ? this.d.sound : 'rummage', this.o.x + 0.5, this.o.y + 0.5, 0.65); if (this.p.isLocal && (this.d.anim === 'hammer')) shake(0.04, 0.1); }
    if (Math.random() < dt * 1.2) bus.emit('noise', { x: this.o.x + 0.5, z: this.o.y + 0.5, radius: this.d.anim === 'hammer' ? 16 : 9, kind: 'work', zone: this.p.zoneKey, by: this.p.id });
  }
  perform() {
    const p = this.p, o = this.o, d = this.d;
    const z = G.zones.get(p.zoneKey); if (!z || z.objects.get(o.uid) !== o) return;
    const left = leftOf(o);
    if (left <= 0) return;
    const got = rollYield(d, this.tool);
    // what comes off drops at the node, popping toward the unit
    const cx = o.x + 0.5, cz = o.y + 0.5;
    const dx = p.x - cx, dz = p.z - cz, dl = Math.hypot(dx, dz) || 1;
    got.forEach((it, i) => {
      const a = Math.atan2(dz / dl, dx / dl) + (i - (got.length - 1) / 2) * 0.5 + (Math.random() - 0.5) * 0.4, sp = 0.9 + Math.random() * 0.8;
      op('dropFloor', { z: z.key, item: serializeItem(it), x: cx + (dx / dl) * 0.25, zz: cz + (dz / dl) * 0.25, y: d.wall ? 0.9 : 0.4, v: [Math.cos(a) * sp, 1.2 + Math.random() * 1.2, Math.sin(a) * sp] });
    });
    op('objState', { z: z.key, uid: o.uid, patch: { left: left - 1, at: hours() } });
    fx(d.fx, cx, d.wall ? 0.8 : 0.3, cz, 12);
    G.audio?.at?.(got.length ? 'rummage' : d.sound, cx, cz, 0.7);
    if (this.tool.it && itemDef(this.tool.it.key).durability) this.tool.it.cond = Math.max(0, this.tool.it.cond - 1.5 / (itemDef(this.tool.it.key).durability ?? 100));
    p.body.addXp(d.skill, 3 + d.time * 0.6);
    bump('gather'); mark('gather:' + d.key);
    if (p.isLocal) {
      if (!got.length) bus.emit('think', p, 'Nothing worth keeping in that bit.');
      else bus.emit('halo', p, got.map((it) => itemDef(it.key).name).slice(0, 3).join(', '), 'good');
      if (left - 1 <= 0) setTimeout(() => bus.emit('think', p, `${d.name}: picked clean. It grows back, given time.`), 700);
    }
  }
}
function rollYield(d: NodeDef, tool: { it: Item | null; mul: number }): Item[] {
  const out: Item[] = [];
  const q = (tool.it?.data?.q as number | undefined) ?? 1;
  const rolls = 1 + (hasUnlock('gt_salvager') ? 1 : 0);
  for (let r = 0; r < rolls; r++) {
    for (const [k, ch, mn, mx] of d.yields) {
      if (!hasItemDef(k)) continue;
      const chance = ch * (r ? 0.5 : 1) * (tool.it ? 1 : 0.8);
      if (Math.random() >= chance) continue;
      if (mx < 1) { const it = createItem(k); it.uses = Math.min(1, mn + Math.random() * (mx - mn)); out.push(it); continue; }
      const n = mn + Math.floor(Math.random() * (mx - mn + 1));
      for (let i = 0; i < n; i++) out.push(createItem(k));
    }
  }
  // a fine tool finds one more of the main thing
  if (q >= 2 && hasItemDef(d.yields[0][0]) && d.yields[0][3] >= 1 && Math.random() < 0.6) out.push(createItem(d.yields[0][0]));
  return out.slice(0, 7);
}
function fx(kind: Fx, x: number, y: number, z: number, n: number) {
  const pool = G.gore?.parts;
  if (kind === 'spark' || kind === 'metal') { sparks(x, y, z, kind === 'spark' ? n : Math.ceil(n / 2), 2.4); if (kind === 'spark') G.pointLight(x, y, z, 0xb8d8ff, 1.2, 3); return; }
  if (kind === 'wood') { splinters(x, y, z, n); return; }
  if (!pool) return;
  const col = kind === 'cloth' ? [0xd8c890, 0xb8a070] : kind === 'wet' ? [0x5a6a3a, 0x8a7a4a] : kind === 'bone' ? [0xe8dcc0, 0xb8a888] : [0xd8d4c8, 0xa8a498];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 0.6 + Math.random() * 1.2;
    pool.add(PK.Dust, x, y, z, Math.cos(a) * s, 0.6 + Math.random() * 1.4, Math.sin(a) * s, 0.008 + Math.random() * 0.016, 0.5 + Math.random() * 0.7, col[i % 2]);
  }
}

// ---------------------------------------------------------------- the system: labels, verbs, regrowth
export class Gathering {
  private t = 0;
  constructor() {
    bus.on('objectMenu', (p: Player, o: TileObject, out: MenuOption[]) => { if (isNode(o.key)) out.unshift(...this.menu(p, o)); });
    const g = G as unknown as { ctxHooks?: ((p: Player, touch: boolean) => unknown[])[] };
    (g.ctxHooks ||= []).push((p: Player) => this.ctx(p));
  }
  /** start working a node (E) */
  work(p: Player, o: TileObject): boolean {
    const d = nodeDef(o.key); if (!d) return false;
    if (leftOf(o) <= 0) { bus.emit('think', p, `${d.name}: picked clean. Back in about ${this.backIn(o)} hours.`); return false; }
    const tool = toolFor(p, d);
    if (!tool) { bus.emit('think', p, `I need a ${d.tools[0][2].toLowerCase()} for that${d.tools.length > 1 ? ' (or a ' + d.tools.slice(1).map((t) => t[2].toLowerCase()).join(', a ') + ')' : ''}.`); G.audio?.ui?.('dryfire'); return false; }
    queueAt(p, o.x + 0.5, o.y + 0.5, new GatherAction(p, o, d, tool), 1.3);
    return true;
  }
  private backIn(o: TileObject) { const d = nodeDef(o.key)!; return Math.max(1, Math.ceil(regrowH(d) - (hours() - (o.state.at ?? 0)))); }
  private why(p: Player, o: TileObject, d: NodeDef): string | undefined {
    if (leftOf(o) <= 0) return `picked clean · back in ${this.backIn(o)} h`;
    if (!toolFor(p, d)) return 'needs a ' + d.tools.map((t) => t[2].toLowerCase()).slice(0, 2).join(' or a ');
    return undefined;
  }
  private menu(p: Player, o: TileObject): MenuOption[] {
    const d = nodeDef(o.key)!;
    const tool = toolFor(p, d);
    const why = this.why(p, o, d);
    return [
      { label: `${d.verb} the ${d.name.toLowerCase()}${tool ? ` (${tool.name})` : ''}`, disabled: why ?? false, action: () => this.work(p, o) },
      { label: `${d.name}: ${leftOf(o)} of ${d.charges} left`, disabled: true },
    ];
  }
  /** the floating label: [E] Strip: Peeling Wallpaper (Box Cutter) */
  private ctx(p: Player): unknown[] {
    if (p.body.dead || G.build?.active) return [];
    let best: TileObject | null = null, bd = 1.7;
    for (const o of (G.interact?.objectsNear?.(p, 1.7) || []) as TileObject[]) {
      if (!isNode(o.key)) continue;
      const dd = Math.hypot(o.x + 0.5 - p.x, o.y + 0.5 - p.z);
      if (dd < bd) { bd = dd; best = o; }
    }
    if (!best) return [];
    const o = best, d = nodeDef(o.key)!;
    const tool = toolFor(p, d);
    const h = (objDef(o.key)?.height ?? 1);
    const at = { x: o.x + 0.5, y: (p.y ?? 0) + Math.min(1.9, h) + 0.25, z: o.y + 0.5 };
    const left = leftOf(o);
    const out: unknown[] = [{ id: 'gather', label: d.verb, icon: 'open', key: 'E', run: () => this.work(p, o), why: this.why(p, o, d), head: d.verb, name: `${d.name} (${tool?.name ?? d.tools[0][2]})${left < d.charges && left > 0 ? ` ${left}/${d.charges}` : ''}`, tgt: 'o:' + o.uid, anchor: () => at }];
    // a leak is a tap: fill a bottle from the can under it
    const water = o.key === 'gn_pipes' ? (o.state.water ?? 2) : 0;
    const v = water > 0.2 ? p.allItems().find((i) => (itemDef(i.key).fluidCap ?? 0) - (i.fluid?.amount ?? 0) > 0.1 && (!i.fluid || i.fluid.type === 'tainted')) : null;
    if (v) out.push({ id: 'gather_fill', label: 'Fill from the leak', icon: 'open', key: 'U', run: () => queueAt(p, o.x + 0.5, o.y + 0.5, new FillAction(p, v, 'tainted', water, (l) => op('objState', { z: p.zoneKey, uid: o.uid, patch: { water: Math.max(0, water - l) } })), 1.3), tgt: 'o:' + o.uid, anchor: () => at });
    return out;
  }
  /** nodes grow back over game hours (host; the zone the unit is in) */
  update(dt: number) {
    if (G.role === 'client') return;
    this.t -= dt; if (this.t > 0) return;
    this.t = 2;
    const p = G.local; const z = p ? G.zones.get(p.zoneKey) : null; if (!z) return;
    const now = hours();
    for (const o of z.objects.values()) {
      const d = nodeDef(o.key); if (!d) continue;
      const left = leftOf(o);
      if (left >= d.charges) continue;
      if (now - (o.state.at ?? 0) >= regrowH(d)) op('objState', { z: z.key, uid: o.uid, patch: { left: left + 1, at: now } });
    }
  }
}

// ---------------------------------------------------------------- where they grow
const SKIP = new Set(['reality', 'exit', 'gallery']);
function freeFloor(z: Zone, x: number, y: number) {
  if (!z.inb(x, y)) return false;
  const i = z.idx(x, y);
  if (!z.floor[i] || z.solid[i] || (z.flags[i] & (TF.SHIFT | TF.STAIRS | TF.NOSPAWN))) return false;
  if (floorDef(z.floor[i])?.water) return false;
  for (const o of z.objectsAt(x, y)) if (!objDef(o.key)?.ceiling) return false;
  return true;
}
/** clusters of salvage round rooms that make good camps, a few strays, and a handful near where the level is entered */
export function placeNodes(z: Zone, seed: number) {
  if (SKIP.has(z.key) || z.key.startsWith('intro') || z.meta.noForage || z.meta.noGather) return;
  if ([...z.objects.values()].some((o) => isNode(o.key))) return;
  const rng = new Rng(seed ^ 0x6a7e5);
  const b = new ZoneBuilder(z, rng);
  const kinds: [string, number][] = NODES.filter((n) => !n.zones || n.zones.test(z.key)).map((n) => [n.key, n.weight]);
  if (!kinds.length) return;
  const want = Math.max(4, Math.min(16, Math.round((z.W * z.H) / 700)));
  const placed: TileObject[] = [];
  const tryAt = (x: number, y: number, key?: string): boolean => {
    if (!freeFloor(z, x, y)) return false;
    for (const q of placed) if (Math.abs(q.x - x) + Math.abs(q.y - y) < 3) return false;
    const n = !!z.wallN[z.idx(x, y)], w = !!z.wallW[z.idx(x, y)], e = z.inb(x + 1, y) && !!z.wallW[z.idx(x + 1, y)], so = z.inb(x, y + 1) && !!z.wallN[z.idx(x, y + 1)];
    const k = key ?? rng.weighted(kinds);
    const d = nodeDef(k)!;
    // wall pieces go on the faces the camera looks at (north and west walls): the near walls are cut away
    if (d.wall && !(n || w)) return false;
    // never in a doorway's swing
    for (const s of [0, 1] as const) if (z.edge(x, y, s) || (s === 0 && z.inb(x, y + 1) && z.edge(x, y + 1, 0)) || (s === 1 && z.inb(x + 1, y) && z.edge(x + 1, y, 1))) return false;
    const rot = (d.wall ? (n ? 0 : 3) : n ? 0 : e ? 1 : so ? 2 : w ? 3 : rng.int(0, 3)) as 0 | 1 | 2 | 3;
    const o = b.obj(k, x, y, rot, { left: d.charges });
    if (o) placed.push(o);
    return !!o;
  };
  // near the way in (the level's spawn): a starter yard, so a first camp has salvage on the doorstep
  const sp = z.meta.spawn as [number, number] | undefined;
  if (sp) {
    const starter = ['gn_scrap', 'gn_drywall', 'gn_wallpaper', 'gn_carpet'].filter((k) => kinds.some((q) => q[0] === k));
    let s = 0;
    for (let t = 0; t < 400 && s < starter.length; t++) {
      const a = rng.next() * Math.PI * 2, r = 4 + rng.next() * 9;
      if (tryAt(Math.floor(sp[0] + Math.cos(a) * r), Math.floor(sp[1] + Math.sin(a) * r), starter[s])) s++;
    }
  }
  // clusters round a few rooms
  for (let tries = 0; tries < want * 30 && placed.length < want; tries++) {
    const cx = rng.int(2, z.W - 3), cy = rng.int(2, z.H - 3);
    if (!freeFloor(z, cx, cy)) continue;
    let n = 0;
    for (let t = 0; t < 24 && n < 3; t++) if (tryAt(cx + rng.int(-4, 4), cy + rng.int(-4, 4))) n++;
  }
  // round 17: what an earlier unit built and left: derelict pieces beside the salvage. Scan one
  // and the build kit has its blueprint (src/build/blueprints.ts); the lockers sometimes hold a drawing.
  const dWant = Math.max(1, Math.min(4, Math.round(want / 4)));
  let dn = 0;
  for (let t = 0; t < 200 && dn < dWant && placed.length; t++) {
    const near = placed[rng.int(0, placed.length - 1)];
    const k = DERELICT[rng.int(0, DERELICT.length - 1)];
    const pc = piece(k); if (!pc?.obj || !objDef(pc.obj)) continue;
    const w = pc.w ?? 1, d = pc.d ?? 1;
    const x = near.x + rng.int(-3, 3), y = near.y + rng.int(-3, 3);
    let ok = true;
    for (let j = 0; j < d && ok; j++) for (let i = 0; i < w && ok; i++) if (!freeFloor(z, x + i, y + j) || (i > 0 && z.wallW[z.idx(x + i, y + j)]) || (j > 0 && z.wallN[z.idx(x + i, y + j)])) ok = false;
    if (!ok || (sp && Math.abs(sp[0] - x) + Math.abs(sp[1] - y) < 4)) continue;
    const o = b.obj(pc.obj, x, y, 0, { derelict: 1, dmg: 1 }, { tint: 0xc8bca8 });
    if (!o) continue;
    dn++;
    if (o.inv && rng.next() < 0.5) o.inv.add(createItem('blueprint_sheet', rng));
  }
}
onZoneGeneratedLate(placeNodes);
