// THE CONTROL ROOM'S RESEARCH TREE (the 3D lattice on the main computer, src/ui/menus/research/lattice.ts)
// and THE UNIT'S FIT (the unit room, src/ui/menus/intake.ts). Research points
// (src/game/research.ts) buy nodes; a branch per category of src/game/treeData.ts
// (recipes, building pieces, device upgrades registered there as data, or any
// defNode() research node, appear on their branch by themselves), each a page of
// lanes whose nodes chain left to right and lock until the node before is owned:
//   design   UNIT DESIGNS: suit dyes and patterns, visors, helmets, masks and
//            kit (the cosmetics catalogue, src/game/cosmetics.ts). Owning one
//            unlocks profile 'cos:<key>', so the unit room can dress the unit in it.
//   recipe   RECIPES: the crafting and cooking research nodes the game already
//            gates on (src/craft/knowledge.ts, src/cook/recipes.ts), plus (round
//            14: the wrist watch's in-run R&D page is gone, research is only done
//            here between runs) build-mode blueprints (src/build/content.ts),
//            dominion schematics (src/dominion/brains.ts) and the suit scanner's
//            firmware (src/scan/scan.ts).
//   chip     CHIPS: permanent implants with ranks; each rank behaves like a
//            trait (src/survival/traits.ts) once the chip is fitted in a socket.
//   limb     LIMBS: the cyberware catalogue's research nodes ('cyber:<key>',
//            src/survival/cyberParts.ts); owned limbs can be fitted to the unit.
// A node with ranks is one research node per rank ('<key>', '<key>~2', ...).
// Purchases are staged (undo / confirm) before any point is spent.
// The fit (chips in sockets, limbs on slots, designs worn) lives in the Meridian
// file (src/game/meridian.ts) and goes into every new run (src/game/metaRun.ts:
// applyUnitFit).
import { bus } from '../core/events';
import { defNode, researchNode, researchNodes, hasUnlock, researchPoints, buyNode, type ResearchNode } from './research';
import { treeCategories, treeOfferList, treeDataVersion, categoryFor, treeCategory } from './treeData';
import { hasItemDef } from '../items/item';
import { unlock, isUnlocked } from './profile';
import { COSMETIC, type CosSlot } from './cosmetics';
import { CYBER_PARTS, cyberDef, type CyberSlot, SLOT_KIND, slotConflicts } from '../survival/cyberParts';
import { file, saveFile } from './meridian';
// the economy's offers (press patterns, press upgrades, homestead pieces, farming) register themselves as data
import './economy/registry';
import './mapUpgrades'; // the survey map's upgrades (UI worker, round 15)
import './reqQuests'; // round 17: requirement quests gate the important nodes (nodeQuest(key) for progress)

/** a branch of the tree: one per category of src/game/treeData.ts (design, recipe, build, device, chip, limb, and any registered) */
export type Branch = string;
/** the branches in lattice order (filled from src/game/treeData.ts; syncTree() keeps it current) */
export const BRANCHES: { key: Branch; name: string; sub: string; code: string }[] = [];

/** what a node's icon shows (src/ui/menus/research/icons.ts paints it) */
export type IconSpec =
  | { kind: 'cos'; key: string }
  | { kind: 'item'; key: string; alt?: string[] }
  | { kind: 'chip'; glyph: ChipGlyph; color: number }
  | { kind: 'limb'; key: string }
  | { kind: 'socket' };
export type ChipGlyph = 'calm' | 'steady' | 'recall' | 'eye' | 'ear' | 'heart' | 'gut' | 'mule' | 'step';

export interface TreeNode {
  key: string; branch: Branch;
  /** lane (row) and column on the branch's page */
  row: number; col: number;
  title: string;
  ranks: number;
  /** the research node per rank */
  rn: string[];
  /** RP per rank */
  costs: number[];
  /** tree nodes that must own rank 1 first (drawn as pipes) */
  req: string[];
  icon: IconSpec;
  /** per rank: what it gives (one line) */
  gives: string[];
  desc: string;
  cos?: string;
  chip?: ChipDef;
  limb?: string;
}
export interface Lane { branch: Branch; row: number; label: string }
export interface ChipDef { key: string; name: string; glyph: ChipGlyph; color: number; traits: string[][]; lines: string[] }

const NODES: TreeNode[] = [];
const BY_KEY = new Map<string, TreeNode>();
const LANES: Lane[] = [];
const rankKey = (key: string, r: number) => (r <= 1 ? key : `${key}~${r}`);
function add(n: Omit<TreeNode, 'rn'> & { rn?: string[] }) {
  const node = { ...n, rn: n.rn ?? Array.from({ length: n.ranks }, (_, i) => rankKey(n.key, i + 1)) } as TreeNode;
  NODES.push(node); BY_KEY.set(node.key, node);
  return node;
}
const lane = (branch: Branch, row: number, label: string) => LANES.push({ branch, row, label });

// ================================================================== UNIT DESIGNS (the cosmetics catalogue)
// the issue jumpsuit (suit_std) and the commendation dyes earned elsewhere are not on the tree
const DESIGN_LANES: [number, string, string[], string | null, number][] = [
  [0, 'Suit dyes & patterns', ['suit_orange', 'suit_grey', 'suit_white', 'suit_red', 'suit_stripe', 'suit_hazard', 'suit_circuit'], null, 0],
  [2, 'Visors & eyewear', ['eyes_shades', 'eyes_goggles', 'eyes_cinema', 'eyes_monocle', 'eyes_led'], 'suit_grey', 1],
  [4, 'Helmets & headgear', ['hat_watch', 'hat_bucket', 'hat_crown', 'hat_cone', 'hat_tophat', 'hat_antlers', 'hat_halo'], 'suit_orange', 0],
  [6, 'Masks', ['face_bandana', 'face_resp', 'face_muzzle', 'face_goalie', 'face_smile'], 'hat_bucket', 1],
  [8, 'Neck & back kit', ['neck_tags', 'neck_scarf', 'neck_collar', 'back_cable', 'back_tank', 'back_wings'], 'face_resp', 2],
];
const SLOT_WORD: Record<CosSlot, string> = { suit: 'suit design', hat: 'headgear', eyes: 'eyewear', face: 'mask', neck: 'neck piece', back: 'back piece' };
for (const [row, label, keys, from, c0] of DESIGN_LANES) {
  lane('design', row, label);
  keys.forEach((k, i) => {
    const c = COSMETIC.get(k);
    if (!c) return;
    const key = 'dsn_' + k;
    add({
      key, branch: 'design', row, col: c0 + i, title: c.name, ranks: 1, costs: [Math.min(6, 1 + Math.floor((c0 + i) * 0.75))],
      req: i === 0 ? (from ? ['dsn_' + from] : []) : ['dsn_' + keys[i - 1]],
      icon: { kind: 'cos', key: k }, gives: [`unit ${SLOT_WORD[c.slot]}: ${c.name}`], desc: c.desc, cos: k,
    });
  });
}

// ================================================================== RECIPES (the game's own recipe nodes)
const RECIPE_LAYOUT: [string, number, number, string, string[]?][] = [
  ['rc_scavenger', 0, 0, 'scrap_metal', ['cloth_strip', 'rag']],
  ['rc_edgework', 0, 1, 'knife_scrap', ['knife_kitchen']],
  ['rc_crude_tools', 0, 2, 'hammer_crude', ['hammer']],
  ['rc_lashing', 2, 1, 'rope', ['twine', 'wire']],
  ['rc_bench', 4, 1, 'screwdriver', ['wrench']],
  ['rc_schematics', 4, 2, 'notebook', ['magazine']],
  ['rc_tailor', 6, 1, 'backpack_school', ['needle', 'thread']],
  ['rc_field_medic', 6, 2, 'bandage', ['disinfectant']],
  ['rc_stew', 8, 0, 'pot', ['can_soup']],
  ['rc_glow', 8, 1, 'glow_dust', ['almond_water']],
  ['rc_skewer', 10, 0, 'meat_raw', ['knife_kitchen']],
  ['rc_offal', 10, 1, 'heart_raw', ['meat_raw']],
  ['rc_marrow', 10, 2, 'bone', ['meat_raw']],
  ['rc_wax', 10, 3, 'candle', ['sugar']],
  ['rc_long', 10, 4, 'meat_raw', []],
];
const RECIPE_LANES: [number, string][] = [[0, 'Hand craft'], [2, 'Binding'], [4, 'The bench'], [6, 'Patterns & kits'], [8, 'Kitchen'], [10, 'The grill']];
for (const [row, label] of RECIPE_LANES) lane('recipe', row, label);
const prevInRow: Record<number, string> = {};
for (const [key, row, col, item, alt] of RECIPE_LAYOUT) {
  const rn = researchNode(key);
  // the tree also chains nodes that have no requirement of their own (left to right, like every lane)
  const own = rn?.requires?.length ? rn.requires : null;
  const chain = prevInRow[row] ? [prevInRow[row]] : row === 0 ? [] : row === 10 ? ['rc_stew'] : ['rc_scavenger'];
  add({
    key, branch: 'recipe', row, col, title: rn?.title ?? key, ranks: 1, rn: [key], costs: [rn?.cost ?? 3], req: own ?? chain,
    icon: { kind: 'item', key: item, alt }, gives: ['recipe: ' + (rn?.title ?? key)], desc: rn?.desc ?? '',
  });
  prevInRow[row] = key;
}

// ---- what the watch's R&D page used to sell mid-run: blueprints, dominion schematics, scanner firmware.
// The research nodes are the game's own (same keys, so old saves keep what they bought); defined here too
// when the menu runs without those modules, with the same costs and requirements.
const FIELD: { branch: Branch; lane: [number, string]; nodes: [string, string, number, string, string[], string, string[]?][] }[] = [
  { branch: 'build', lane: [0, 'Blueprints'], nodes: [
    ['bp_spikes', 'Rebar Spikes', 2, 'Weld sharpened rebar to a plate. Anything that walks over it regrets it.', [], 'scrap_metal'],
    ['bp_hatch', 'Bulkhead Hatch', 3, 'A welded door hung in a scrap-plate wall on a spring hinge.', [], 'sheet_metal'],
    ['bp_hydro', 'Hydro Rack', 4, 'Two-tier hydroponic rack with grow LEDs. Fast crops, little water, needs power.', [], 'lightbulb'],
    ['bp_mech_bench', 'Powered Workbench', 4, 'The first mechanical table: motorised vise, grinder, drill press. Counts as a workbench.', [], 'steel_frame'],
    ['bp_compactor', 'Scrap Compactor', 5, 'A hydraulic platen: three scrap in, one sheet of metal out.', ['bp_mech_bench'], 'pipe'],
    ['bp_gen_rig', 'Generator Rig', 5, 'Two salvaged motors run backwards off a fuel drum. Power for the whole base.', ['bp_mech_bench'], 'motor', ['battery']],
    ['bp_turret', 'Pipe Sentry', 7, 'A motor-swivelled nail cannon. Shoots anything that is not a friend.', ['bp_gen_rig'], 'nail_gun'],
  ] },
  { branch: 'device', lane: [2, 'Dominion'], nodes: [
    ['tame_mk1', 'Cortex Valve', 8, 'Schematic: a one-valve mechanical brain for small things (up to 45 vitality).', [], 'brain_mk1', ['electronics_scrap']],
    ['tame_station', 'Labour Directive', 14, 'Thralls take standing orders at a station: guard, haul, crank a generator, tend planters.', ['tame_mk1'], 'wire'],
    ['tame_mk2', 'Twin-Valve Cortex', 22, 'Schematic: a two-valve cortex for mid-sized bodies (up to 110 vitality).', ['tame_mk1'], 'brain_mk2', ['electronics_scrap']],
    ['tame_ride', 'Saddle Protocol', 18, 'Ride a thrall big enough to carry you.', ['tame_mk2'], 'rope'],
    ['tame_pack', 'Hive Uplink', 25, 'Run up to six thralls at once (three without it).', ['tame_station'], 'walkie_talkie'],
    ['tame_overclock', 'Overclock', 30, 'Thralls hit half again as hard and move a quarter faster. They run hot.', ['tame_mk2'], 'battery'],
    ['tame_mk3', 'Titan Lobe', 50, 'Schematic: a three-valve, heat-finned lobe big enough for anything with a skull.', ['tame_mk2'], 'brain_mk3', ['electronics_scrap']],
  ] },
  { branch: 'device', lane: [0, 'Suit scanner'], nodes: [
    ['tool_beam', 'Scanner Beam', 4, 'A focusing lens for the visor emitter: scans reach 18 m and finish faster.', [], 'binoculars'],
    ['scan_deep', 'Deep Scan', 14, 'Longer reach, faster sweeps and half again as much DATA from every scan.', ['tool_beam'], 'data_probe'],
  ] },
];
for (const { branch, lane: [row, label], nodes } of FIELD) {
  lane(branch, row, label);
  nodes.forEach(([key, title, cost, desc, requires, item, alt], col) => {
    if (!researchNode(key)) defNode({ key, branch: key.startsWith('bp_') ? 'blueprint' : key.startsWith('tame_') ? 'tame' : 'scanner', title: title.toUpperCase(), cost, desc, requires: requires.length ? requires : undefined });
    const rn = researchNode(key);
    add({
      key, branch, row, col, title, ranks: 1, rn: [key], costs: [rn?.cost ?? cost],
      req: requires, icon: { kind: 'item', key: item, alt: alt ?? ['scrap_metal'] },
      gives: [(branch === 'build' ? 'blueprint: ' : label === 'Dominion' ? 'schematic: ' : 'scanner firmware: ') + title], desc: rn?.desc ?? desc,
    });
  });
}

// ================================================================== CHIPS (traits, by rank)
const CHIPS: (ChipDef & { row: number; col: number; req: string[]; costs: number[] })[] = [
  { key: 'chip_calm', name: 'Calm Loop', glyph: 'calm', color: 0x6ad0ff, row: 0, col: 0, req: [], costs: [3, 6, 10],
    traits: [['brave'], ['box_breather'], ['iron_nerves']], lines: ['panics less, shakes off bad memories', 'breathing exercises work twice as well', 'never has panic attacks'] },
  { key: 'chip_steady', name: 'Damper Coil', glyph: 'steady', color: 0x9ae86a, row: 0, col: 1, req: ['chip_calm'], costs: [5],
    traits: [['unbothered']], lines: ['stress and unhappiness build 30% slower'] },
  { key: 'chip_recall', name: 'Recall Lattice', glyph: 'recall', color: 0xd88aff, row: 0, col: 2, req: ['chip_steady'], costs: [5, 9],
    traits: [['fast_learner'], ['been_here_before']], lines: ['+30% skill experience', 'lucidity drains 25% slower; the loops never surprise you'] },
  { key: 'chip_night', name: 'Nyctal Lens', glyph: 'eye', color: 0x7aff8a, row: 2, col: 0, req: [], costs: [4],
    traits: [['eagle_eyed']], lines: ['night vision: sees further in the dark, wider view'] },
  { key: 'chip_ear', name: 'Cochlear Tap', glyph: 'ear', color: 0xffc85a, row: 2, col: 1, req: ['chip_night'], costs: [5],
    traits: [['keen_hearing']], lines: ['hears inhabitants from much further away'] },
  { key: 'chip_step', name: 'Footfall Damper', glyph: 'step', color: 0x8ab8ff, row: 2, col: 2, req: ['chip_ear'], costs: [5],
    traits: [['graceful']], lines: ['moves quietly'] },
  { key: 'chip_mend', name: 'Clot Driver', glyph: 'heart', color: 0xff6a6a, row: 4, col: 0, req: [], costs: [4, 7],
    traits: [['fast_healer'], ['resilient']], lines: ['wounds heal faster', 'corruption spreads slower in the body'] },
  { key: 'chip_gut', name: 'Gut Governor', glyph: 'gut', color: 0xe8b04a, row: 4, col: 1, req: ['chip_mend'], costs: [3, 5],
    traits: [['iron_gut'], ['light_eater']], lines: ['rarely gets food poisoning', 'gets hungry less often'] },
  { key: 'chip_mule', name: 'Pack-Mule Relay', glyph: 'mule', color: 0xc8a070, row: 4, col: 2, req: ['chip_gut'], costs: [4, 7],
    traits: [['pocket_hoarder'], ['organized']], lines: ['+2 kg carrying capacity', '+30% container capacity'] },
];
lane('chip', 0, 'Neural'); lane('chip', 2, 'Sensory'); lane('chip', 4, 'Somatic'); lane('chip', 6, 'Sockets');
for (const c of CHIPS) {
  add({
    key: c.key, branch: 'chip', row: c.row, col: c.col, title: c.name, ranks: c.costs.length, costs: c.costs, req: c.req,
    icon: { kind: 'chip', glyph: c.glyph, color: c.color }, gives: c.lines, desc: `A chip for the unit's spine socket. Fit it in the unit room; it goes into every new run.`, chip: c,
  });
}
add({
  key: 'chip_socket', branch: 'chip', row: 6, col: 0, title: 'Socket Bank', ranks: 2, costs: [6, 12], req: [],
  icon: { kind: 'socket' }, gives: ['a second chip socket', 'a third chip socket'], desc: 'More sockets drilled along the unit\'s spine. One chip each.',
});

// ================================================================== LIMBS (the cyberware catalogue)
const LIMB_LAYOUT: Record<string, [number, number]> = {
  scrap_arm: [0, 0], servo_arm: [0, 2], piston_arm: [0, 3],
  scrap_leg: [2, 1], coil_leg: [2, 3],
  vise_hand: [4, 2], tool_hand: [4, 3],
  lamp_optic: [6, 2], ledger_optic: [6, 3],
  trap_jaw: [8, 2],
  gantry_spine: [10, 3], plate_dermis: [10, 4],
};
lane('limb', 0, 'Arms'); lane('limb', 2, 'Legs'); lane('limb', 4, 'Hands'); lane('limb', 6, 'Optics'); lane('limb', 8, 'Jaw'); lane('limb', 10, 'Frame');
for (const d of CYBER_PARTS) {
  const pos = LIMB_LAYOUT[d.key];
  if (!pos) continue;
  // the research node (the same as src/survival/cyber.ts defines, so the menu never needs that module)
  if (d.node && !researchNode(d.node)) defNode({ key: d.node, branch: 'cyber', title: d.name, icon: 'cyber', desc: `${d.good} — ${d.bad}`, cost: d.cost ?? 5, requires: d.requires });
  const req = (d.requires ?? []).map((r) => 'limb_' + r.replace(/^cyber:/, ''));
  add({
    key: 'limb_' + d.key, branch: 'limb', row: pos[0], col: pos[1], title: d.name, ranks: 1, rn: [d.node ?? 'limb_' + d.key], costs: [d.node ? d.cost ?? 5 : 0],
    req: d.key === 'scrap_leg' ? ['limb_scrap_arm'] : req, icon: { kind: 'limb', key: d.key }, gives: [d.good], desc: `${d.desc} ${d.bad}`, limb: d.key,
  });
}

// the design and chip research nodes (branches the watch does not list)
for (const n of NODES) {
  if (n.branch !== 'design' && n.branch !== 'chip') continue;
  n.rn.forEach((k, i) => { if (!researchNode(k)) defNode({ key: k, branch: n.branch, title: n.title + (i ? ' ' + 'I'.repeat(i + 1) : ''), cost: n.costs[i], desc: n.gives[i] ?? n.desc, requires: i ? [n.rn[i - 1]] : n.req.flatMap((r) => BY_KEY.get(r)?.rn.slice(0, 1) ?? []) }); });
}
// a design research node also unlocks the cosmetic itself (the unit room checks profile 'cos:<key>')
bus.on('researchUnlocked', (k: string) => { const n = NODES.find((q) => q.cos && q.rn.includes(k)); if (n?.cos) unlock('cos:' + n.cos); });

// ================================================================== everything else research can buy (data)
// src/game/treeData.ts: the categories (one branch each), the offers registered as data (the economy's
// recipes, building pieces, device upgrades), and every research node no branch above places, sorted
// into a category by its own branch. Re-read whenever something new is registered.
const SKIP_BRANCH = new Set(['design', 'chip', 'cyber', 'limb']);
let synced = -1, syncedNodes = -1;
export function syncTree() {
  const all = researchNodes();
  if (synced === treeDataVersion() && syncedNodes === all.length) return;
  synced = treeDataVersion(); syncedNodes = all.length;
  const placed = new Set(NODES.flatMap((n) => n.rn));
  const laneRow = (branch: Branch, label: string) => {
    const hit = LANES.find((l) => l.branch === branch && l.label === label);
    if (hit) return hit.row;
    const row = LANES.filter((l) => l.branch === branch).reduce((m, l) => Math.max(m, l.row + 2), 0);
    lane(branch, row, label);
    return row;
  };
  const place = (o: { key: string; branch: Branch; lane: string; title: string; desc: string; costs: number[]; requires: string[]; item?: string; alt?: string[]; gives: string[] }) => {
    if (BY_KEY.has(o.key)) return;
    const row = laneRow(o.branch, o.lane);
    const col = NODES.filter((n) => n.branch === o.branch && n.row === row).length;
    const ranks = o.costs.length, rn = Array.from({ length: ranks }, (_, i) => rankKey(o.key, i + 1));
    rn.forEach((k, i) => { if (!researchNode(k)) defNode({ key: k, branch: o.branch, title: o.title.toUpperCase() + (i ? ' ' + 'I'.repeat(i + 1) : ''), cost: o.costs[i], desc: o.gives[i] ?? o.desc, requires: i ? [rn[i - 1]] : o.requires.length ? o.requires.map((q) => BY_KEY.get(q)?.rn[0] ?? q) : undefined }); });
    // the lattice draws a conduit from a requirement that sits on the same branch
    const req = o.requires.map((q) => BY_KEY.get(q)?.key ?? NODES.find((n) => n.rn.includes(q))?.key).filter((q): q is string => !!q && BY_KEY.get(q)!.branch === o.branch);
    const item = [o.item, ...(o.alt ?? [])].find((q) => q && hasItemDef(q));
    add({ key: o.key, branch: o.branch, row, col, title: o.title, ranks, rn, costs: o.costs, req, icon: item ? { kind: 'item', key: item } : { kind: 'chip', glyph: 'recall', color: 0x9ac8ff }, gives: o.gives, desc: o.desc });
    for (const k of rn) placed.add(k);
  };
  for (const o of treeOfferList()) {
    const costs = Array.isArray(o.cost) ? o.cost : Array.from({ length: Math.max(1, o.ranks ?? 1) }, () => o.cost as number);
    const gives = Array.isArray(o.gives) ? o.gives : Array.from({ length: costs.length }, () => (o.gives as string | undefined) ?? o.title);
    if (!treeCategories().some((c) => c.key === o.category)) treeCategory({ key: o.category, name: cap(o.category), sub: 'research', code: o.category.slice(0, 3).toUpperCase() });
    place({ key: o.key, branch: o.category, lane: o.lane ?? cap(o.category), title: o.title, desc: o.desc ?? '', costs, requires: o.requires ?? [], item: o.item, alt: o.alt, gives });
  }
  for (const n of all) {
    if (placed.has(n.key) || SKIP_BRANCH.has(n.branch) || /~\d+$/.test(n.key)) continue;
    const cat = categoryFor(n.branch);
    if (!treeCategories().some((c) => c.key === cat)) treeCategory({ key: cat, name: cap(cat), sub: 'research', code: cat.slice(0, 3).toUpperCase() });
    place({ key: n.key, branch: cat, lane: cat === n.branch ? 'More ' + (treeCategories().find((c) => c.key === cat)?.name ?? cat).toLowerCase() : cap(n.branch), title: titleCase(n.title), desc: n.desc, costs: [n.cost], requires: n.requires ?? [], item: n.icon, gives: [n.title.toLowerCase()] });
  }
  // the branches: every category that has nodes, in order
  const keep = treeCategories().filter((c) => NODES.some((n) => n.branch === c.key));
  BRANCHES.length = 0;
  for (const c of keep) BRANCHES.push({ key: c.key, name: c.name, sub: c.sub, code: c.code });
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const titleCase = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase()) : s);
syncTree();

// ================================================================== reading the tree
export const treeNodes = (b?: Branch) => { syncTree(); return b ? NODES.filter((n) => n.branch === b) : NODES; };
export const treeNode = (k: string) => { syncTree(); return BY_KEY.get(k); };
export const treeLanes = (b: Branch) => { syncTree(); return LANES.filter((l) => l.branch === b); };
/** ranks owned (a free starter node counts as owned) */
export function rankOf(n: TreeNode): number {
  let r = 0;
  for (const k of n.rn) { if (n.branch === 'limb' && n.costs[0] === 0) { r = 1; break; } if (hasUnlock(k)) r++; else break; }
  return r;
}
export const owned = (k: string) => { const n = BY_KEY.get(k); return !!n && rankOf(n) > 0; };

// ================================================================== the plan: staged purchases (undo / confirm)
const plan: { node: string; rank: number; cost: number }[] = [];
const planSubs = new Set<() => void>();
const planChanged = () => { for (const cb of planSubs) cb(); };
export function onPlan(cb: () => void) { planSubs.add(cb); return () => planSubs.delete(cb); }
export const staged = () => plan as readonly { node: string; rank: number; cost: number }[];
export const stagedCost = () => plan.reduce((s, p) => s + p.cost, 0);
/** points left after the plan */
export const pointsLeft = () => researchPoints() - stagedCost();
/** ranks owned or staged */
export function rankPlanned(n: TreeNode): number { return rankOf(n) + plan.filter((p) => p.node === n.key).length; }
export type NodeState = 'owned' | 'max' | 'open' | 'poor' | 'locked';
/** what the next rank needs: 'open' can be staged now */
export function nodeState(n: TreeNode): NodeState {
  const r = rankPlanned(n);
  if (r >= n.ranks) return 'max';
  if (n.req.some((q) => { const m = BY_KEY.get(q); return !m || rankPlanned(m) < 1; })) return 'locked';
  // the research node's own requirements (a recipe that needs two others)
  const rn = researchNode(n.rn[r]);
  if (rn?.requires?.some((q) => !hasUnlock(q) && !plan.some((p) => BY_KEY.get(p.node)?.rn[p.rank - 1] === q))) return 'locked';
  if (rn?.gate && !rn.gate()) return 'locked';
  return pointsLeft() >= n.costs[r] ? 'open' : 'poor';
}
export function stage(k: string): boolean {
  const n = BY_KEY.get(k);
  if (!n || nodeState(n) !== 'open') return false;
  const r = rankPlanned(n);
  plan.push({ node: k, rank: r + 1, cost: n.costs[r] });
  planChanged();
  return true;
}
/** undo the last staged rank */
export function unstage(): boolean { const p = plan.pop(); if (p) planChanged(); return !!p; }
export function clearPlan() { if (plan.length) { plan.length = 0; planChanged(); } }
/** buy everything staged, in order; returns the nodes bought */
export function confirmPlan(): string[] {
  const done: string[] = [];
  for (const p of [...plan]) {
    const n = BY_KEY.get(p.node)!;
    const rk = n.rn[p.rank - 1];
    if (hasUnlock(rk) || buyNode(rk)) done.push(p.node);
  }
  plan.length = 0;
  planChanged();
  return done;
}
/** the research node that will be bought for a staged rank */
export const researchFor = (n: TreeNode, rank: number): ResearchNode | undefined => researchNode(n.rn[rank - 1]);

// ================================================================== the unit's fit
export interface UnitFit { chips: string[]; limbs: Partial<Record<CyberSlot, string>> }
export function fit(): UnitFit {
  const f = file() as any;
  if (!f.fit || typeof f.fit !== 'object') f.fit = { chips: [], limbs: {} };
  if (!Array.isArray(f.fit.chips)) f.fit.chips = [];
  if (!f.fit.limbs || typeof f.fit.limbs !== 'object') f.fit.limbs = {};
  return f.fit as UnitFit;
}
export const chipSockets = () => 1 + rankOf(BY_KEY.get('chip_socket')!);
export const chipNodes = () => NODES.filter((n) => n.chip);
/** chips fitted (only owned ones, at most one per socket) */
export function fittedChips(): string[] { return fit().chips.filter((k) => owned(k)).slice(0, chipSockets()); }
export function setChip(i: number, key: string | null) {
  const F = fit();
  const cur = fittedChips().filter((k) => k !== key);
  if (key && owned(key)) cur.splice(Math.min(i, cur.length), 0, key);
  F.chips = cur.slice(0, chipSockets());
  saveFile();
}
/** traits the fitted chips give (every rank owned so far) */
export function chipTraits(): string[] {
  const out: string[] = [];
  for (const k of fittedChips()) { const n = BY_KEY.get(k)!; const r = rankOf(n); for (let i = 0; i < r; i++) out.push(...(n.chip!.traits[i] ?? [])); }
  return [...new Set(out)];
}
/** can this part go on the unit (researched, or the free starter)? */
export const limbOwned = (part: string) => { const d = cyberDef(part); return !!d && (!d.node || hasUnlock(d.node)); };
export function fittedLimbs(): Partial<Record<CyberSlot, string>> {
  const out: Partial<Record<CyberSlot, string>> = {};
  for (const [s, k] of Object.entries(fit().limbs)) if (k && limbOwned(k) && SLOT_KIND[s as CyberSlot] === cyberDef(k)?.kind) out[s as CyberSlot] = k;
  return out;
}
export function setLimb(slot: CyberSlot, part: string | null) {
  const L = fit().limbs;
  if (!part) delete L[slot];
  else { if (!limbOwned(part) || SLOT_KIND[slot] !== cyberDef(part)?.kind) return; for (const c of slotConflicts(slot)) delete L[c]; L[slot] = part; }
  saveFile();
}
/** a design the unit room may dress the unit in */
export function designOwned(cosKey: string): boolean {
  const c = COSMETIC.get(cosKey);
  if (!c) return false;
  if (cosKey === 'suit_std') return true;
  return isUnlocked('cos:' + cosKey);
}
