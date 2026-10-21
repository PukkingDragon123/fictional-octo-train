// Hands-on crafting steps: what you can do to a thing with your hands and a
// tool, close up in first person (src/craft/inspect.ts). Each step is one
// physical motion repeated until the work is done: saw strokes, strikes,
// pulls, loops of binding. The basic ones are found by doing; better methods
// and blueprints come from the watch's research tree (branch 'recipe').
import type { Player } from '../entities/player';
import type { TileObject } from '../world/zone';
import { type Item, type ItemDef, itemDef } from '../items/item';
import { objDef, type ObjDef } from '../world/objects';
import { hasUnlock } from '../game/research';

export type Verb = 'saw' | 'grind' | 'strike' | 'tear' | 'wrap' | 'braid';
/** a tool option: item key or #tag, and how fast it works (1 = the right tool) */
export interface ToolOpt { m: string; speed: number }
/** a part used up: any one of the alternatives ([key or #tag, count, uses fraction]) */
export interface PartReq { label: string; any: [string, number, number?][] }

export interface HandOp {
  key: string;
  name: string;
  verb: Verb;
  desc: string;
  item?: (it: Item, d: ItemDef) => boolean;
  obj?: (o: TileObject, d: ObjDef) => boolean;
  tools?: ToolOpt[];
  /** works bare-handed at this speed (0 = needs a tool) */
  bare?: number;
  parts?: PartReq[];
  /** motions needed at speed 1 */
  work: number | ((p: Player, target: Item | null) => number);
  out: (target: Item | null, o?: TileObject | null) => [string, number][];
  /** research node needed to know how (shown greyed with its name until bought) */
  requires?: string;
  /** mission flag set when done (quests watch these) */
  flag?: string;
  xp?: [string, number];
  /** the target stays (a world object is worked, not consumed) */
  keepTarget?: boolean;
}

const tag = (d: ItemDef, t: string) => d.key === t || (d.tags || []).includes(t);
export const matches = (it: Item, m: string) => (m.startsWith('#') ? tag(itemDef(it.key), m.slice(1)) : it.key === m);

const CUT: ToolOpt[] = [{ m: '#saw', speed: 1 }, { m: '#axe', speed: 0.75 }, { m: '#knife', speed: 0.4 }, { m: '#sharp', speed: 0.3 }];
const HARD: ToolOpt[] = [{ m: '#hammer', speed: 1.1 }, { m: '#sledge', speed: 1.3 }, { m: 'stone', speed: 1 }, { m: 'brick', speed: 1 }, { m: '#heavyblunt', speed: 0.9 },
  { m: '#crowbar', speed: 0.9 }, { m: 'wrench', speed: 0.85 }, { m: 'pipe', speed: 0.8 }, { m: '#whetstone', speed: 0.9 }, { m: '#hard', speed: 0.8 }];
const GRIND: ToolOpt[] = [{ m: '#whetstone', speed: 1.5 }, { m: 'stone', speed: 0.9 }, { m: 'brick', speed: 0.8 }];
const SNIP: ToolOpt[] = [{ m: 'scissors', speed: 2 }, { m: '#knife', speed: 1.6 }, { m: '#sharp', speed: 1.3 }];
const BINDING: PartReq = { label: 'binding', any: [['cloth_strips', 2], ['rope', 1], ['#tape', 1, 0.2], ['wire', 1], ['rag', 3]] };

const isChair = (o: TileObject, d: ObjDef) => !!d.tags?.includes('chair') && (d.w ?? 1) <= 1 && !d.tags?.includes('stack') && o.key !== 'lifeguard_chair' && o.key !== 'wheelchair';
const tearable = (d: ItemDef) => d.clothing?.rip === 'rag' || ['cloth', 'bedsheet', 'towel_item', 'blanket', 'pillow_item'].includes(d.key);
const tearCount = (d: ItemDef) => d.clothing?.ripCount ?? ({ cloth: 4, bedsheet: 6, towel_item: 4, blanket: 6, pillow_item: 2 } as Record<string, number>)[d.key] ?? 3;

export const HAND_OPS: HandOp[] = [
  {
    key: 'saw_chair_leg', name: 'Saw a leg off', verb: 'saw', obj: isChair, tools: CUT, work: 9, keepTarget: true,
    desc: 'Tip the chair over and saw through a leg at the joint. Drag the blade back and forth along the line.',
    out: () => [['chair_leg', 1]], flag: 'craft:chair_leg', xp: ['carpentry', 2],
  },
  {
    key: 'knock_chair_leg', name: 'Knock a leg out', verb: 'strike', obj: isChair, tools: HARD, bare: 0.35, work: 6, keepTarget: true,
    desc: 'Hammer the leg sideways at the joint until the glue lets go. Click on the joint to strike; bare-handed works, slowly, and hurts.',
    out: () => [['chair_leg', 1]], flag: 'craft:chair_leg',
  },
  {
    key: 'sharpen_iron', name: 'Beat an edge', verb: 'strike', item: (it) => it.key === 'scrap_metal', tools: HARD,
    work: () => (hasUnlock('rc_edgework') ? 7 : 11),
    desc: 'Lay the scrap on something solid and hammer along one side with a rock or anything hard until it holds an edge. Hit the glowing line.',
    out: () => [['sharp_iron', 1]], flag: 'craft:sharp_iron', xp: ['mechanics', 3],
  },
  {
    key: 'grind_iron', name: 'Grind an edge', verb: 'grind', item: (it) => it.key === 'scrap_metal', tools: GRIND,
    work: () => (hasUnlock('rc_edgework') ? 8 : 13),
    desc: 'Rub the scrap\'s edge across a stone in long strokes until it bites.',
    out: () => [['sharp_iron', 1]], flag: 'craft:sharp_iron', xp: ['mechanics', 3],
  },
  {
    key: 'tear_cloth', name: 'Tear into strips', verb: 'tear', bare: 1, tools: SNIP,
    item: (_it, d) => tearable(d),
    work: (_p, t) => (t ? Math.min(6, tearCount(itemDef(t.key))) : 3),
    desc: 'Grip both ends and pull. Each pull tears a long strip off along the weave.',
    out: (t) => [['cloth_strips', t ? Math.min(6, tearCount(itemDef(t.key))) : 3]], flag: 'craft:cloth_strips', xp: ['tailoring', 1],
  },
  {
    key: 'cut_tough_cloth', name: 'Cut into strips', verb: 'tear', tools: SNIP,
    item: (_it, d) => !!d.clothing?.rip && d.clothing.rip !== 'rag',
    work: (_p, t) => (t ? Math.min(5, tearCount(itemDef(t.key))) : 3),
    desc: 'Too tough to tear: nick it with a blade first, then pull.',
    out: (t) => { const d = t ? itemDef(t.key) : null; return [[d?.clothing?.rip || 'cloth_strips', d ? Math.min(5, tearCount(d)) : 3]]; }, xp: ['tailoring', 1],
  },
  {
    key: 'braid_rope', name: 'Braid a rope', verb: 'braid', bare: 1, item: (it) => it.key === 'cloth_strips',
    parts: [{ label: 'more strips', any: [['cloth_strips', 2]] }],
    work: () => (hasUnlock('rc_lashing') ? 4 : 6),
    desc: 'Three strips, over and under. Circle the pointer round the braid to twist it tight.',
    out: () => [['rope', 1]], flag: 'craft:rope', xp: ['tailoring', 2],
  },
  {
    key: 'bind_axe', name: 'Bind an axe', verb: 'wrap', bare: 1, item: (it) => it.key === 'chair_leg' || it.key === 'plank',
    parts: [{ label: 'sharpened iron', any: [['sharp_iron', 1]] }, BINDING],
    work: () => (hasUnlock('rc_lashing') ? 4 : 6),
    desc: 'Seat the iron head on the end of the handle, then circle the pointer round the joint to wrap it tight.',
    out: () => [['crude_axe', 1]], flag: 'craft:crude_axe', xp: ['carpentry', 4],
  },
  {
    key: 'bind_knife', name: 'Bind a grip', verb: 'wrap', bare: 1, item: (it) => it.key === 'sharp_iron', requires: 'rc_edgework',
    parts: [{ label: 'binding', any: [['cloth_strips', 1], ['rag', 2], ['#tape', 1, 0.1]] }],
    work: 3,
    desc: 'Wrap the dull end until it sits in your fist without cutting you.',
    out: () => [['scrap_knife', 1]], flag: 'craft:scrap_knife', xp: ['mechanics', 2],
  },
  {
    key: 'bind_hammer', name: 'Lash a hammer', verb: 'wrap', bare: 1, item: (it) => it.key === 'chair_leg', requires: 'rc_crude_tools',
    parts: [{ label: 'a stone', any: [['stone', 1]] }, BINDING],
    work: () => (hasUnlock('rc_lashing') ? 4 : 5),
    desc: 'Wedge a stone into the split end of the handle and lash it in.',
    out: () => [['crude_hammer', 1]], flag: 'craft:crude_hammer', xp: ['carpentry', 3],
  },
];

export function handOp(key: string) { return HAND_OPS.find((h) => h.key === key); }
export function opsForItem(it: Item): HandOp[] { const d = itemDef(it.key); return HAND_OPS.filter((h) => h.item?.(it, d)); }
export function opsForObject(o: TileObject): HandOp[] { const d = objDef(o.key); return d ? HAND_OPS.filter((h) => h.obj?.(o, d)) : []; }
export const opWork = (h: HandOp, p: Player, t: Item | null) => (typeof h.work === 'function' ? h.work(p, t) : h.work);

/** everything the survivor can reach with their hands: carried and held, nothing worn */
export function reachable(p: Player): Item[] { return p.allItems().filter((i) => !p.isWorn(i)); }

/** the best tool you have for a step (null = none; bare = no tool needed) */
export function pickTool(p: Player, h: HandOp, exclude: Item | null): { it: Item | null; speed: number } | null {
  let best: { it: Item | null; speed: number } | null = h.bare ? { it: null, speed: h.bare } : null;
  const pool = reachable(p);
  for (const t of h.tools || []) {
    for (const it of pool) {
      if (it === exclude || !matches(it, t.m)) continue;
      const d = itemDef(it.key);
      if (d.durability && it.cond <= 0) continue;
      if (!best || t.speed > best.speed) best = { it, speed: t.speed };
    }
  }
  return best;
}

export interface PartPick { req: PartReq; items: Item[]; uses?: number; missing: boolean }
/** which carried items a step's parts would use (missing = not enough of any alternative) */
export function pickParts(p: Player, h: HandOp, target: Item | null, extraPool?: Item[]): PartPick[] {
  const used = new Set<Item>();
  if (target) used.add(target);
  const pool = extraPool ? [...extraPool, ...reachable(p).filter((i) => !extraPool.includes(i))] : reachable(p);
  const out: PartPick[] = [];
  for (const req of h.parts || []) {
    let got: PartPick | null = null;
    for (const [m, n, uses] of req.any) {
      if (uses) {
        const it = pool.find((i) => !used.has(i) && matches(i, m) && (i.uses ?? 1) >= uses - 1e-6);
        if (it) { got = { req, items: [it], uses, missing: false }; break; }
        continue;
      }
      const c = pool.filter((i) => !used.has(i) && matches(i, m)).slice(0, n);
      if (c.length >= n) { got = { req, items: c, missing: false }; break; }
    }
    if (got) { if (!got.uses) got.items.forEach((i) => used.add(i)); out.push(got); }
    else out.push({ req, items: [], missing: true });
  }
  return out;
}

/** a readable list of what a part can be */
export function partLabel(req: PartReq): string {
  return req.any.map(([m, n, u]) => (u ? '' : n > 1 ? n + '× ' : '') + (m.startsWith('#') ? m.slice(1) : itemDef(m).name.toLowerCase())).join(' / ');
}
export function toolLabel(h: HandOp): string {
  if (!h.tools?.length) return 'bare hands';
  const names = h.tools.slice(0, 4).map((t) => (t.m.startsWith('#') ? t.m.slice(1) : itemDef(t.m).name.toLowerCase()));
  return (h.bare ? 'hands or ' : '') + names.join(' / ');
}
