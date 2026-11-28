// PROFESSIONS (round 25): the research lattice's main deck. Eight trades a unit gets better at by doing them, each a
// branch of the lattice (src/ui/menus/research/lattice.ts) whose nodes are bought with research points like any
// other, but only once the trade's own level is high enough. The level is earned in the runs, by doing the work:
//   combat      fighting (the weapon skills, strength)          medic       first aid
//   engineer    building, welding, wiring, tailoring             scavenger   foraging, trapping, looting, sneaking
//   cook        cooking, butchering                              botanist    farming, foraging plants
//   handler     feeding, taming and keeping animals              researcher  research points, scans
// Levels persist on this browser (profile stats 'prof:<key>', the XP), like research does.
//
// What a node does is data: `fx` per rank, stat -> multiplier (or + bonus for 'carry'). Stats the game already reads
// through src/survival/talents.ts talentMul (craft, build, medic, loot, melee, bleed, heal, hunger, scan, xp, ...)
// work with no new code: this module registers itself as a talent source. The rest are read where they apply:
//   combat     masteryRank(cls) (src/game/combat.ts, src/combat/grapple.ts), moveOwned(key) for the unlockable moves
//   research   'rp' in src/game/research.ts grantResearch
//   farming    'grow', 'yield' in src/build/farm.ts
//   animals    'tame' in src/creatures/manager.ts (taming time)
// HOOKS FOR OTHER WORKERS (farming, livestock, crafting, discovery):
//   profXp('handler', 10, 'milked')     award trade XP for an action (bus 'profession' fires)
//   profMul('herd') / profAdd('carry')  read a stat (1 / 0 when nothing owned); any string stat works
//   profNode({ key, prof, lane, title, ... fx })  register more nodes on a trade's branch (before the lattice opens)
//   previewShot(key, shot)               the lattice monitor's 3D scene for a node (src/ui/menus/research/preview.ts:
//                                        sets 'garden' 'pen' 'cook' 'bench' 'weld' 'store' 'lab' 'medic' 'combat')
// Reserved stats for them: 'herd' (livestock produce), 'milk', 'breed', 'feed' (feed eaten), 'preserve' (spoil time),
// 'forage' (finds), 'craftYield', 'discover' (finds in the codex).
import { bus } from '../core/events';
import { stat, addStat } from './profile';
import { hasUnlock, gateNode, researchNode, setResearchMul } from './research';
import { treeCategory, treeOffer } from './treeData';
import { talentSource } from '../survival/talents';
import { facilityMul, facilityAdd } from './facilityFx';
import type { SkillKey } from '../survival/traits';
import { G } from './G';

export type ProfKey = 'combat' | 'medic' | 'engineer' | 'scavenger' | 'cook' | 'botanist' | 'handler' | 'researcher';
export interface ProfDef { key: ProfKey; name: string; code: string; sub: string; color: number; skills: SkillKey[] }
export const PROFESSIONS: ProfDef[] = [
  { key: 'combat', name: 'Combat', code: 'CMB', sub: 'weapon mastery · moves · grit', color: 0xff6a3a, skills: ['blunt', 'blade', 'spear', 'firearm', 'strength'] },
  { key: 'medic', name: 'Medic', code: 'MED', sub: 'sutures · surgery · pharmacy', color: 0xff8a8a, skills: ['firstaid'] },
  { key: 'engineer', name: 'Engineer', code: 'ENG', sub: 'welding · building · the bench', color: 0xffc040, skills: ['carpentry', 'mechanics', 'electrical', 'tailoring'] },
  { key: 'scavenger', name: 'Scavenger', code: 'SCV', sub: 'rummaging · pockets · trade', color: 0xc8a070, skills: ['foraging', 'trapping', 'nimble', 'sneaking'] },
  { key: 'cook', name: 'Cook', code: 'COK', sub: 'the stove · butchery · the larder', color: 0xffa050, skills: ['cooking'] },
  { key: 'botanist', name: 'Botanist', code: 'BOT', sub: 'planters · yields · herbs', color: 0x7ae86a, skills: ['farming'] },
  { key: 'handler', name: 'Handler', code: 'HDL', sub: 'livestock · feeding · taming', color: 0xe8c890, skills: [] },
  { key: 'researcher', name: 'Researcher', code: 'RSC', sub: 'method · grants · the lucid mind', color: 0x8ac8ff, skills: [] },
];
export const profDef = (k: string) => PROFESSIONS.find((p) => p.key === k);
/** the lattice branch (treeData category) of a trade */
export const profBranch = (k: ProfKey) => 'p_' + k;
export const branchProf = (branch: string): ProfDef | undefined => (branch.startsWith('p_') ? profDef(branch.slice(2)) : undefined);

// ================================================================== levels
/** total XP at each level (index = level); level 10 is the top */
export const PROF_XP = [0, 60, 160, 320, 560, 900, 1400, 2100, 3000, 4200, 6000];
export const MAX_LEVEL = PROF_XP.length - 1;
export const profTotal = (k: ProfKey) => stat('prof:' + k);
export function profLevel(k: ProfKey): number { const x = profTotal(k); let l = 0; while (l < MAX_LEVEL && x >= PROF_XP[l + 1]) l++; return l; }
/** XP into the current level and the level's span (the lattice's gauge) */
export function profProgress(k: ProfKey): { level: number; xp: number; need: number; total: number } {
  const total = profTotal(k), level = profLevel(k);
  if (level >= MAX_LEVEL) return { level, xp: 1, need: 1, total };
  return { level, xp: total - PROF_XP[level], need: PROF_XP[level + 1] - PROF_XP[level], total };
}
/** award trade XP for doing the work (bus 'profession' { key, n, level, up, reason }) */
export function profXp(k: ProfKey, n: number, reason = '') {
  if (!(n > 0) || !profDef(k)) return;
  const before = profLevel(k);
  addStat('prof:' + k, Math.round(n * 10) / 10);
  const level = profLevel(k);
  bus.emit('profession', { key: k, n, level, up: level > before, reason });
  if (level > before) bus.emit('halo', G?.local, `${profDef(k)!.name} level ${level}`, 'good');
}
/** skill experience (src/survival/body.ts addXp) feeds the trade it belongs to */
const SKILL_PROF = new Map<SkillKey, ProfKey>();
for (const p of PROFESSIONS) for (const s of p.skills) SKILL_PROF.set(s, p.key);
export function profFromSkill(sk: SkillKey, amount: number) {
  const k = SKILL_PROF.get(sk);
  if (k) profXp(k, amount * (sk === 'strength' || sk === 'nimble' || sk === 'sneaking' ? 0.5 : 1), 'skill:' + sk);
}
// research points earned in the field make a researcher
bus.on('research', (e: { n: number; reason?: string }) => { if (e && e.n > 0 && !String(e.reason ?? '').startsWith('node:')) profXp('researcher', e.n * 3, 'rp'); });
bus.on('tamed', (p: unknown) => { if (p && p === G?.local) profXp('handler', 30, 'tamed'); });

// ================================================================== nodes
export interface ProfNodeDef {
  key: string; prof: ProfKey; lane: string; title: string; desc: string;
  /** RP per rank */
  cost: number[];
  /** trade level each rank needs */
  level: number[];
  /** per rank: stat -> multiplier ('carry': + kg); stacks over the ranks owned */
  fx?: Partial<Record<string, number>>[];
  /** per rank: one line of what it gives */
  gives: string[];
  requires?: string[];
  /** the item whose 3D model is the node's exhibit on the lattice */
  item?: string; alt?: string[];
}
const NODES = new Map<string, ProfNodeDef>();
const rankKey = (k: string, r: number) => (r <= 1 ? k : `${k}~${r}`);
/** ranks of a profession node owned */
export function profRank(key: string): number {
  const d = NODES.get(key);
  if (!d) return hasUnlock(key) ? 1 : 0;
  let r = 0;
  for (let i = 1; i <= d.cost.length; i++) if (hasUnlock(rankKey(key, i))) r = i; else break;
  return r;
}
/** register a node on a trade's branch (a research node by the same key, gated by the trade's level) */
export function profNode(d: ProfNodeDef) {
  NODES.set(d.key, d);
  const p = profDef(d.prof)!;
  treeOffer({ key: d.key, category: profBranch(d.prof), lane: d.lane, title: d.title, desc: d.desc, cost: d.cost, requires: d.requires, item: d.item, alt: d.alt, gives: d.gives, ranks: d.cost.length });
  d.level.forEach((lv, i) => {
    if (lv <= 0) return;
    gateNode(rankKey(d.key, i + 1), () => profLevel(d.prof) >= lv, () => `${p.name} level ${lv}`);
  });
}
/** the trade level a node's next rank waits on (the lattice shows it), or null when it waits on nothing */
export function profGate(key: string): { prof: ProfDef; level: number; have: number } | null {
  const base = key.replace(/~\d+$/, ''), d = NODES.get(base);
  if (!d) return null;
  const r = profRank(base);
  if (r >= d.cost.length) return null;
  const need = d.level[r] ?? 0, have = profLevel(d.prof);
  return need > have ? { prof: profDef(d.prof)!, level: need, have } : null;
}
export const profNodeDef = (key: string) => NODES.get(key.replace(/~\d+$/, ''));

// ---- what the owned nodes add up to (cached; research purchases and the XP move it)
let cache: Map<string, number> | null = null;
bus.on('researchUnlocked', () => { cache = null; });
function totals(): Map<string, number> {
  if (cache) return cache;
  const m = new Map<string, number>();
  for (const d of NODES.values()) {
    const r = profRank(d.key);
    for (let i = 0; i < r; i++) for (const [s, v] of Object.entries(d.fx?.[i] ?? {})) {
      if (v === undefined) continue;
      m.set(s, s === 'carry' ? (m.get(s) ?? 0) + v : (m.get(s) ?? 1) * v);
    }
  }
  return (cache = m);
}
/** a trade stat's multiplier from every node owned (1 when none) */
export const profMul = (s: string) => (s === 'carry' ? 1 : (totals().get(s) ?? 1) * facilityMul(s));
/** an additive trade stat's bonus (0 when none) */
export const profAdd = (s: string) => (s === 'carry' ? (totals().get(s) ?? 0) + facilityAdd(s) : 0);
// the lattice is this browser's research: its trades apply to the local unit's body (talentMul / talentAdd)
talentSource((body, s) => {
  const loc = G?.local?.body as unknown;
  if (body && loc && body !== loc) return s === 'carry' ? 0 : 1;
  return s === 'carry' ? profAdd(s) : profMul(s);
});

setResearchMul(() => profMul('rp'));

// ---- combat: mastery and moves
export type MasteryKey = 'blunt' | 'blade' | 'improvised' | 'thrown';
/** which mastery a weapon class trains (src/combat/moves.ts WClass) */
export function masteryOf(cls: string): MasteryKey | null {
  if (cls === 'blunt' || cls === 'heavy') return 'blunt';
  if (cls === 'blade' || cls === 'axe' || cls === 'spear') return 'blade';
  if (cls === 'improvised' || cls === 'unarmed' || cls === 'cyber') return 'improvised';
  if (cls === 'thrown') return 'thrown';
  return null;
}
/** mastery ranks owned for a weapon class (0..3) */
export const masteryRank = (cls: string) => { const m = masteryOf(cls); return m ? profRank('pf_m_' + m) : 0; };
export type MoveKey = 'overhead' | 'kick' | 'counter' | 'finisher';
export const moveOwned = (k: MoveKey) => profRank('pf_mv_' + k) > 0;

// ================================================================== the branches
PROFESSIONS.forEach((p, i) => treeCategory({ key: profBranch(p.key), name: p.name, sub: p.sub, code: p.code, order: -90 + i * 10 }));
const N = (prof: ProfKey, lane: string, rows: [string, string, string, number[], number[], Partial<Record<string, number>>[], string[], string?, string[]?, string[]?][]) => {
  for (const [key, title, desc, cost, level, fx, gives, item, alt, requires] of rows) profNode({ key, prof, lane, title, desc, cost, level, fx, gives, item, alt, requires });
};
// ---- COMBAT
N('combat', 'Mastery', [
  ['pf_m_blunt', 'Blunt', 'Clubs, pipes, hammers and the big two-handers: the swing finds the head and the knee.', [3, 6, 10], [1, 3, 5], [{}, {}, {}], ['+8% damage, +3% crit with blunt', '+16% damage, a club rings heads longer', '+24% damage, knocks things off their feet'], 'bat', ['pipe']],
  ['pf_m_blade', 'Blade', 'Knives, machetes, axes and spears: cleaner lines, deeper cuts, limbs that come away.', [3, 6, 10], [1, 3, 5], [{}, {}, {}], ['+8% damage, +3% crit with blades', '+16% damage, severs more often', '+24% damage, a cut through a limb takes it'], 'machete', ['knife_kitchen']],
  ['pf_m_improv', 'Improvised', 'Chair legs, bottles, fists: whatever is to hand, used like you meant it.', [3, 5, 8], [1, 2, 4], [{}, {}, {}], ['+10% damage with improvised and bare hands', '+20% damage, more poise damage', '+30% damage, grapples go your way'], 'chair_leg', ['plank']],
  ['pf_m_thrown', 'Thrown', 'Bottles, bricks, knives through the air: further, harder, on the mark.', [3, 5, 8], [1, 2, 4], [{}, {}, {}], ['+15% thrown damage, +1 m', '+30% thrown damage, +2 m', '+45% thrown damage, +3 m'], 'brick', ['bottle']],
]);
N('combat', 'Moves', [
  ['pf_mv_overhead', 'Overhead', 'A charged blunt blow comes straight down over the head with the whole body behind it.', [4], [1], [{}], ['heavy blunt blows: the overhead (more damage, knockdown)'], 'sledgehammer', ['hammer']],
  ['pf_mv_kick', 'Shove-Kick', 'The shove becomes a boot to the middle: it drives things back and down.', [4], [2], [{}], ['the shove is a kick: further back, drops small things'], 'boots_work', ['sneakers'], ['pf_mv_overhead']],
  ['pf_mv_counter', 'Counter', 'After a dodge or a broken grip the answer comes at once, and hard.', [6], [4], [{}], ['counters hit harder; grapples answer with a counter blow'], 'knife_scrap', ['knife_kitchen'], ['pf_mv_kick']],
  ['pf_mv_finisher', 'Finisher', 'Something on the floor stays on the floor: a finishing blow from above.', [9], [6], [{}], ['finish downed things sooner, with a killing blow'], 'axe', ['hatchet'], ['pf_mv_counter']],
]);
N('combat', 'Grit', [
  ['pf_c_wind', 'Second Wind', 'Breath for one more swing when there is none left.', [3, 6], [1, 4], [{ stamina: 0.9 }, { stamina: 0.88 }], ['stamina drains 10% slower', 'stamina drains 21% slower'], 'water_bottle', ['almond_water']],
  ['pf_c_grit', 'Iron Will', 'Wounds bleed less, fear builds slower.', [4], [3], [{ bleed: 0.88, panic: 0.9 }], ['bleeding -12%, panic builds 10% slower'], 'bandage', ['rag'], ['pf_c_wind']],
  ['pf_c_hands', 'Heavy Hands', 'Every blow carries more of the body.', [5, 9], [2, 6], [{ melee: 1.06 }, { melee: 1.06 }], ['+6% melee damage', '+12% melee damage'], 'gloves_work', ['gloves_rubber'], ['pf_c_grit']],
]);
// ---- MEDIC
N('medic', 'Treatment', [
  ['pf_md_hands', 'Steady Hands', 'Dressings and splints go on quicker, and stay on.', [3, 6], [1, 3], [{ medic: 0.88 }, { medic: 0.88 }], ['treating wounds takes 12% less time', 'treating wounds takes 23% less time'], 'bandage', ['rag']],
  ['pf_md_suture', 'Clean Sutures', 'A neat stitch closes a wound for good.', [4], [2], [{ bleed: 0.85 }], ['wounds bleed 15% less'], 'needle', ['thread'], ['pf_md_hands']],
  ['pf_md_surgeon', 'Field Surgeon', 'Cleaned, closed and dressed: the body heals faster after you.', [6, 10], [4, 7], [{ heal: 1.15 }, { heal: 1.15 }], ['wounds heal 15% faster', 'wounds heal 32% faster'], 'disinfectant', ['bandage'], ['pf_md_suture']],
]);
N('medic', 'Pharmacy', [
  ['pf_md_pills', 'Pill Sense', 'Knows what is safe to swallow and what is not.', [3], [1], [{ poison: 0.85 }], ['food sickness -15%'], 'pills', ['disinfectant']],
  ['pf_md_calm', 'Bedside Calm', 'A quiet voice in a bad room.', [4], [3], [{ stress: 0.88, panic: 0.92 }], ['stress -12%, panic builds 8% slower'], 'cigarettes', ['tea'], ['pf_md_pills']],
]);
N('medic', 'Field kit', [
  ['pf_md_kit', 'Field Kit', 'Everything for a wound in one roll, on the belt.', [3], [2], [{ carry: 1, medic: 0.95 }], ['+1 kg carry, treating 5% faster'], 'backpack_school', ['bag']],
  ['pf_md_trauma', 'Trauma Drills', 'Practised until the hands work while the head panics.', [5], [4], [{ panic: 0.9, stamina: 0.95 }], ['panic builds 10% slower, stamina drains 5% slower'], 'clipboard', ['notebook'], ['pf_md_kit']],
]);
// ---- ENGINEER
N('engineer', 'Building', [
  ['pf_en_weld', 'Quick Welds', 'Plates, hatches and barricades go up faster.', [3, 6], [1, 3], [{ build: 0.88 }, { build: 0.88 }], ['building and welding 12% faster', 'building and welding 23% faster'], 'welding_torch', ['blowtorch', 'hammer']],
  ['pf_en_brace', 'Bracing', 'Knows where the load goes.', [5], [4], [{ build: 0.92 }], ['building 8% faster again'], 'plank', ['steel_frame'], ['pf_en_weld']],
]);
N('engineer', 'The bench', [
  ['pf_en_bench', 'Bench Hand', 'Crafting at the bench and by hand goes quicker.', [3, 6], [1, 3], [{ craft: 0.88 }, { craft: 0.88 }], ['crafting 12% faster', 'crafting 23% faster'], 'screwdriver', ['wrench']],
  ['pf_en_belt', 'Tool Belt', 'Everything on a hook, nothing in the way.', [4], [2], [{ carry: 1.5 }], ['+1.5 kg carrying capacity'], 'toolbox', ['wrench'], ['pf_en_bench']],
  ['pf_en_jig', 'Templates', 'Do it once properly, then do it fast.', [6], [5], [{ craft: 0.9 }], ['crafting 10% faster again'], 'notebook', ['magazine'], ['pf_en_belt']],
]);
N('engineer', 'Salvage', [
  ['pf_en_salvage', 'Salvage Eye', 'Sees the parts inside the junk.', [3], [2], [{ loot: 0.92, scan: 1.06 }], ['looting 8% faster, scanner +6%'], 'scrap_metal', ['wire']],
  ['pf_en_wire', 'Wiring', 'Splices and fuses without a second look.', [5], [4], [{ build: 0.94, craft: 0.95 }], ['building 6% and crafting 5% faster'], 'wire', ['rope'], ['pf_en_salvage']],
]);
// ---- SCAVENGER
N('scavenger', 'Rummage', [
  ['pf_sc_fingers', 'Light Fingers', 'In and out of drawers and lockers before anything notices.', [3, 6], [1, 3], [{ loot: 0.85 }, { loot: 0.85 }], ['looting 15% faster', 'looting 28% faster'], 'gloves_work', ['rag']],
  ['pf_sc_pockets', 'Deep Pockets', 'Room for one more thing. Always.', [4, 8], [2, 5], [{ carry: 2 }, { carry: 2 }], ['+2 kg carrying capacity', '+4 kg carrying capacity'], 'backpack_school', ['bag'], ['pf_sc_fingers']],
  ['pf_sc_eye', 'Keen Eye', 'The scanner reaches further for someone who knows where to look.', [5], [4], [{ scan: 1.15 }], ['scanner range +15%'], 'binoculars', ['flashlight'], ['pf_sc_pockets']],
]);
N('scavenger', 'Quiet & trade', [
  ['pf_sc_quiet', 'Soft Soles', 'Footsteps that do not carry.', [3], [1], [{ noise: 0.88, crawlNoise: 0.85 }], ['footstep noise -12%, crawling -15%'], 'sneakers', ['boots_work']],
  ['pf_sc_haggle', 'Haggler', 'Traders charge you less and pay you more.', [4, 7], [2, 4], [{ buy: 0.94, sell: 1.06 }, { buy: 0.94, sell: 1.06 }], ['prices -6%, sales +6%', 'prices -12%, sales +12%'], 'coin', ['wallet'], ['pf_sc_quiet']],
]);
N('scavenger', 'Living rough', [
  ['pf_sc_lean', 'Lean Living', 'Gets by on less.', [3], [2], [{ hunger: 0.94, thirst: 0.95 }], ['hunger 6% and thirst 5% slower'], 'can_soup', ['water_bottle']],
  ['pf_sc_night', 'Night Eyes', 'The dark is just another room.', [5], [4], [{ scan: 1.08, panic: 0.95 }], ['scanner +8%, panic builds 5% slower'], 'flashlight', ['binoculars'], ['pf_sc_lean']],
]);
// ---- COOK
N('cook', 'The stove', [
  ['pf_ck_clean', 'Clean Kitchen', 'Raw and rotten food makes you sick less often.', [3], [1], [{ rawPoison: 0.7, poison: 0.88 }], ['sickness from raw -30%, from food -12%'], 'pot', ['can_soup']],
  ['pf_ck_hearty', 'Hearty Meals', 'Meals that stay with you.', [4, 7], [2, 4], [{ hunger: 0.93 }, { hunger: 0.93 }], ['hunger rises 7% slower', 'hunger rises 14% slower'], 'can_soup', ['pot'], ['pf_ck_clean']],
  ['pf_ck_brew', 'Brew Master', 'Tea, broth, boiled water: something warm to drink.', [4], [3], [{ thirst: 0.92 }], ['thirst rises 8% slower'], 'kettle', ['water_bottle'], ['pf_ck_hearty']],
]);
N('cook', 'Butchery & larder', [
  ['pf_ck_cleaver', 'Cleaver Hand', 'A carcass comes apart along its seams.', [3, 6], [1, 3], [{ butcher: 0.85 }, { butcher: 0.85 }], ['butchering 15% faster', 'butchering 28% faster'], 'knife_kitchen', ['meat_raw']],
  ['pf_ck_larder', 'Larder', 'Salted, smoked and sealed: food keeps longer.', [5], [4], [{ preserve: 1.25 }], ['stored food spoils 25% slower'], 'meat_raw', ['can_soup'], ['pf_ck_cleaver']],
]);
N('cook', 'Comfort', [
  ['pf_ck_comfort', 'Comfort Food', 'A hot meal is worth a night\'s sleep to the nerves.', [3], [2], [{ stress: 0.92, boredom: 0.9 }], ['stress -8%, boredom -10%'], 'pot', ['can_soup']],
  ['pf_ck_ration', 'Ration Tins', 'Portions that pack flat and keep.', [5], [4], [{ carry: 1, preserve: 1.1 }], ['+1 kg carry, stored food keeps 10% longer'], 'can_soup', ['pot'], ['pf_ck_comfort']],
]);
// ---- BOTANIST
N('botanist', 'Growing', [
  ['pf_bt_thumb', 'Green Thumb', 'Planters and hydro racks grow faster under your hands.', [3, 6, 9], [1, 3, 5], [{ grow: 1.12 }, { grow: 1.12 }, { grow: 1.12 }], ['crops grow 12% faster', 'crops grow 25% faster', 'crops grow 40% faster'], 'seeds', ['seed_packet', 'flower']],
  ['pf_bt_yield', 'Bountiful', 'More off every plant at harvest.', [5, 9], [2, 5], [{ yield: 1.2 }, { yield: 1.2 }], ['+20% harvest', '+44% harvest'], 'flower', ['seeds'], ['pf_bt_thumb']],
]);
N('botanist', 'Herbs', [
  ['pf_bt_forage', 'Forager', 'Knows the edible from the deadly at a glance.', [3], [1], [{ forage: 1.25, poison: 0.92 }], ['+25% foraged finds, sickness -8%'], 'mushroom', ['flower']],
  ['pf_bt_calm', 'Herbal Calm', 'A leaf to chew for the nerves.', [4], [3], [{ stress: 0.9, boredom: 0.9 }], ['stress and boredom -10%'], 'tea', ['flower'], ['pf_bt_forage']],
]);
N('botanist', 'Soil', [
  ['pf_bt_compost', 'Compost Heap', 'Scraps back into the soil, the soil back into the crop.', [3], [2], [{ grow: 1.08, yield: 1.08 }], ['crops grow 8% faster, +8% harvest'], 'bucket', ['pot']],
  ['pf_bt_seeds', 'Seed Saver', 'The best of every harvest goes back in the ground.', [6], [5], [{ yield: 1.12 }], ['+12% harvest'], 'seeds', ['flower'], ['pf_bt_compost']],
]);
// ---- HANDLER
N('handler', 'Husbandry', [
  ['pf_hd_feed', 'Feed Rounds', 'Animals fed on time give more.', [3, 6], [1, 3], [{ herd: 1.15, feed: 0.9 }, { herd: 1.15, feed: 0.9 }], ['livestock produce +15%, feed -10%', 'livestock produce +32%, feed -19%'], 'bucket', ['pot']],
  ['pf_hd_milk', 'Milking Hands', 'Calm hands, full pails.', [4], [2], [{ milk: 1.25 }], ['+25% milk and eggs'], 'milk', ['bucket'], ['pf_hd_feed']],
  ['pf_hd_breed', 'Breeding Pens', 'More young, healthier young.', [6], [5], [{ breed: 1.3 }], ['breeding 30% faster'], 'rope', ['twine'], ['pf_hd_milk']],
]);
N('handler', 'Taming', [
  ['pf_hd_calm', 'Calm Voice', 'Wild things come to the hand quicker.', [3, 6], [1, 4], [{ tame: 0.8 }, { tame: 0.85 }], ['taming 20% faster', 'taming 32% faster'], 'meat_raw', ['bread']],
]);
N('handler', 'The yard', [
  ['pf_hd_cull', 'Clean Cull', 'Quick, quiet, nothing wasted.', [3], [2], [{ butcher: 0.85 }], ['butchering 15% faster'], 'knife_kitchen', ['meat_raw']],
  ['pf_hd_hide', 'Hides & Wool', 'Everything off an animal has a use.', [5], [4], [{ herd: 1.1, craft: 0.96 }], ['livestock produce +10%, crafting 4% faster'], 'rope', ['rag'], ['pf_hd_cull']],
]);
// ---- RESEARCHER
N('researcher', 'Method', [
  ['pf_rs_notes', 'Field Notes', 'Writes everything down: every skill comes quicker.', [3, 6], [1, 3], [{ xp: 1.06 }, { xp: 1.06 }], ['+6% skill experience', '+12% skill experience'], 'notebook', ['pen']],
  ['pf_rs_grant', 'Grant Writer', 'The Institute pays more for the same findings.', [5, 9], [2, 5], [{ rp: 1.1 }, { rp: 1.1 }], ['+10% research points', '+21% research points'], 'clipboard', ['notebook'], ['pf_rs_notes']],
  ['pf_rs_scan', 'Data Hound', 'The suit scanner reaches further.', [5], [4], [{ scan: 1.12 }], ['scanner range +12%'], 'data_probe', ['binoculars'], ['pf_rs_grant']],
]);
N('researcher', 'Lucid mind', [
  ['pf_rs_lucid', 'Lucid Method', 'Holds on to the real for longer in there.', [4], [2], [{ lucid: 0.9 }], ['lucidity drains 10% slower'], 'almond_water', ['pills']],
  ['pf_rs_focus', 'Focus', 'Long nights at the bench do not wear you down.', [4], [3], [{ boredom: 0.85, stress: 0.94 }], ['boredom -15%, stress -6%'], 'tea', ['cigarettes'], ['pf_rs_lucid']],
]);

N('researcher', 'Field kit', [
  ['pf_rs_sample', 'Sample Kit', 'Jars, swabs and labels: more out of every find.', [3], [2], [{ rp: 1.05, carry: 0.5 }], ['+5% research points, +0.5 kg carry'], 'jar', ['notebook']],
  ['pf_rs_codex', 'Codex Habit', 'Files everything the same night.', [6], [5], [{ xp: 1.05, discover: 1.2 }], ['+5% skill experience, +20% codex finds'], 'clipboard', ['notebook'], ['pf_rs_sample']],
]);

// the research node for every rank exists from the start (the lattice's syncTree defines them from the offers too)
for (const d of NODES.values()) void researchNode(d.key);
