// Butchery (round 15): a real harvest. Kneel at a corpse and take it apart properly, as a
// timed action (the progress plate over the unit's head shows the work, nothing else pops
// up): skin it, open the belly and lift out the organs, joint it into cuts, scrape the fat,
// take whatever odd part only that species has, and leave the stripped carcass on the floor.
// Every stage sprays and sounds as it happens and drops what it gives next to you.
//   - a knife is right; an axe or a saw is quicker on big bodies; bare hands (or a shard)
//     work slowly, tear the hide and waste a third of the meat
//   - stop part way and what is cut stays cut; carry on later from the next stage
//   - what comes off is data per species (HARVEST below, or `harvest` on a species def),
//     with a fallback from the body's size and what it bleeds
// Eating it: raw flesh risks food poisoning (the food system), parasites (worms: hungry all
// the time, cramps, sickness, until they pass or antibiotics clear them) and, for anything
// that was a person, your nerve. Cooked (src/cook/cooking.ts) it is safe.
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import { op, defOp } from '../game/ops';
import { TimedAction } from '../actions/action';
import { itemDef, hasItemDef, type Item } from '../items/item';
import { createItem, serializeItem } from '../items/factory';
import { goreOf, KINDS } from '../gore/kinds';
import { partRole } from '../gore/tearing';
import { shake, punch } from '../gfx/juice';
import { bump, mark } from '../build/progress';
import { ModelBuilder } from '../gfx/modelBuilder';
import { worldMaterial } from '../gfx/materials';
import type { Player } from '../entities/player';
import { talentMul } from '../survival/talents';
import { SkillCheck } from '../actions/skillCheck';

type Tool = 'knife' | 'saw' | 'axe' | 'hands';
/** [item, count, chance (default 1)] */
export type HarvestYield = [string, number, number?];
export interface HarvestDef {
  flesh?: HarvestYield[]; organs?: HarvestYield[]; fat?: HarvestYield[]; hide?: HarvestYield[]; bones?: HarvestYield[]; odd?: HarvestYield[];
  /** it was a person: it costs the butcher something, and eating it more */
  human?: boolean;
  /** base seconds with a knife */
  time?: number;
  /** what is left: a stripped carcass of bone and meat, a torn sponge husk, an empty skin / shell */
  carcass?: 'flesh' | 'sponge' | 'husk';
}
const O3: HarvestYield[] = [['organ_heart', 1], ['organ_liver', 1], ['organ_offal', 1]];
/** what each kind of thing gives up (the rest fall back on size and blood) */
export const HARVEST: Record<string, HarvestDef> = {
  hum_possum: { flesh: [['possum_meat', 2]], organs: [['organ_heart', 1], ['organ_liver', 1, 0.6]], fat: [['fat_raw', 1, 0.5]], hide: [['mangy_hide', 1]], bones: [['bone', 1]], time: 9 },
  driller: { human: true, flesh: [['driller_cheek', 2], ['cut_gristle', 2]], organs: O3, fat: [['fat_raw', 1]], bones: [['bone', 2], ['long_bone', 1, 0.5]], odd: [['driller_tooth', 4], ['driller_tooth', 2, 0.5]], time: 22 },
  hermit: { human: true, flesh: [['cut_gristle', 2]], organs: [['organ_heart', 1], ['organ_offal', 1]], fat: [['fat_raw', 1, 0.5]], bones: [['bone', 2]], odd: [['partition_board', 2], ['partition_board', 1, 0.4]], time: 18 },
  still_life: { odd: [['sponge_chunk', 3], ['sponge_chunk', 2, 0.6], ['part_tallow', 1]], carcass: 'sponge', time: 10 },
  gummy_bear: { flesh: [['meat_raw', 2], ['flesh_strips', 2]], organs: O3, fat: [['fat_raw', 2]], hide: [['matted_fur', 1]], bones: [['bone', 2]], odd: [['ledge_gel', 2]], time: 20 },
  bumble_bee: { flesh: [['small_meat_raw', 1]], odd: [['bee_fuzz', 2]], carcass: 'husk', time: 8 },
  queen_bee: { flesh: [['meat_raw', 3], ['flesh_strips', 3]], organs: O3, fat: [['fat_raw', 3]], odd: [['bee_fuzz', 3], ['royal_jelly', 1, 0.5]], carcass: 'husk', time: 30 },
  whip_rat: { flesh: [['meat_raw', 1], ['flesh_strips', 1]], organs: [['organ_heart', 1]], hide: [['mangy_hide', 1]], bones: [['bone', 1]], odd: [['rat_incisor', 2], ['rat_eyestalk', 1, 0.6], ['rat_hand', 1, 0.5]], time: 12 },
  stilt_gull: { flesh: [['bird_meat_raw', 3]], organs: [['organ_heart', 1], ['organ_offal', 1]], fat: [['fat_raw', 1, 0.5]], bones: [['bone', 2], ['long_bone', 1]], time: 14 },
  tallow_pigeon: { flesh: [['bird_meat_raw', 1]], odd: [['part_tallow', 1]], time: 7 },
  moon_calf: { flesh: [['moon_meat', 2], ['flesh_strips', 1]], organs: O3, fat: [['fat_raw', 1]], hide: [['hide_raw', 1]], bones: [['bone', 2]], time: 16 },
  moon_strider: { flesh: [['moon_meat', 3]], hide: [['hide_raw', 1]], bones: [['long_bone', 1], ['bone', 2]], time: 18 },
  strider: { human: true, flesh: [['cut_gristle', 3]], organs: O3, bones: [['bone', 2]], odd: [['strider_tendon', 2], ['strider_skin', 1], ['long_bone', 2]], time: 28 },
  hollow: { human: true, flesh: [['cut_gristle', 1]], organs: [['organ_heart', 1]], odd: [['part_static_node', 1]], time: 14 },
  lifeguard: { human: true, flesh: [['cut_gristle', 2]], organs: O3, odd: [['part_drowned_lung', 1]], time: 16 },
  bee_keeper: { flesh: [['cut_gristle', 1]], odd: [['bee_fuzz', 2], ['part_tallow', 1], ['sponge_chunk', 1]], carcass: 'sponge', time: 14 },
  lumenmoth: { odd: [['part_glow_sac', 1], ['glow_dust', 2]], carcass: 'husk', time: 4 },
  mulcher: { flesh: [['small_meat_raw', 1, 0.6]], carcass: 'husk', time: 5 },
  paper_grazer: { flesh: [['small_meat_raw', 1]], hide: [['paper', 1, 0.5]], time: 6 },
  seated: { human: true, flesh: [['cut_gristle', 1]], odd: [['sponge_chunk', 1, 0.5]], time: 12 },
};
/** never: the children of the Ball House, the sovereign, nests, eggs, living pieces of a game */
const NEVER = /^(timmy|king_in_yellow|gull_nest|mulcher_clutch|chess_|mulcher_ball)/;
const FLESH = new Set(['red', 'dark', 'pale', 'oil', 'glow']);

export function harvestOf(sp: any): HarvestDef | null {
  if (!sp || NEVER.test(sp.key)) return null;
  const own = sp.harvest as HarvestDef | undefined;
  if (own) return own;
  if (HARVEST[sp.key]) return HARVEST[sp.key];
  const g = goreOf(sp), r = sp.radius ?? 0.4;
  if (g.blood === 'stuffing') return { odd: [['rag', 2], ['cotton_balls', 2, 0.6]], carcass: 'husk', time: 6 };
  if (!FLESH.has(g.blood)) return null;
  const n = Math.max(1, Math.min(5, Math.round(r * 6)));
  return {
    flesh: [[(sp.meat?.[0]?.[0] as string) ?? 'flesh_strips', Math.max(1, Math.ceil(n * 0.6))], ['flesh_strips', Math.max(1, Math.floor(n * 0.5)), 0.8]],
    organs: r > 0.25 ? O3 : [['organ_heart', 1, 0.5]], fat: r > 0.35 ? [['fat_raw', 1]] : undefined, hide: r > 0.35 ? [['hide_raw', 1]] : undefined,
    bones: [['bone', Math.max(1, Math.round(n / 2))]], time: 6 + r * 28,
  };
}

// ------------------------------------------------------------------ the work
interface Stage { id: 'skin' | 'open' | 'joint' | 'fat' | 'odd' | 'strip'; label: string; give: HarvestYield[] }
function stagesOf(h: HarvestDef, tool: Tool): Stage[] {
  const out: Stage[] = [];
  if (h.hide?.length) out.push({ id: 'skin', label: 'skinning', give: tool === 'hands' ? [] : h.hide });
  if (h.organs?.length) out.push({ id: 'open', label: 'opening it', give: h.organs });
  if (h.flesh?.length || h.bones?.length) out.push({ id: 'joint', label: 'jointing', give: [...(h.flesh ?? []).map(([k, n, ch]) => [k, tool === 'hands' ? Math.max(1, Math.round(n * 0.65)) : n, ch] as HarvestYield), ...(h.bones ?? [])] });
  if (h.fat?.length) out.push({ id: 'fat', label: 'scraping the fat', give: h.fat });
  if (h.odd?.length) out.push({ id: 'odd', label: h.carcass === 'sponge' ? 'tearing it apart' : 'taking the rest', give: h.odd });
  out.push({ id: 'strip', label: 'stripping it', give: [] });
  return out;
}

/** every peer: a stage done on that body (and, at the end, the carcass) */
defOp('harvestStage', (a: { id: string; st: string; done?: boolean; kind?: string }) => {
  const c = G.creatures?.creatures?.get?.(a.id); if (!c) return;
  const done: string[] = c.mem.hv = [...(c.mem.hv || [])];
  if (!done.includes(a.st)) done.push(a.st);
  if (a.done && !c.butchered) { c.butchered = true; c.mem.carcass = a.kind || 'flesh'; G.creatures?.onButcher?.(c); }
});
// (old saves and peers may still send the round-13 cut op)
defOp('butcherCut', (a: { id: string; part: string; done?: boolean }) => {
  const c = G.creatures?.creatures?.get?.(a.id); if (!c) return;
  if (a.done && !c.butchered) { c.butchered = true; G.creatures?.onButcher?.(c); }
});

const TOOL_MUL: Record<Tool, number> = { knife: 1, saw: 0.85, axe: 0.9, hands: 2.3 };
class HarvestAction extends TimedAction {
  private st: Stage[];
  private at = 0;
  private fxT = 0;
  constructor(p: Player, private c: any, private h: HarvestDef, private tool: Tool, private it: Item | null, private B: Butchery) {
    super(p);
    const done: string[] = c.mem.hv || [];
    this.st = stagesOf(h, tool).filter((s) => !done.includes(s.id));
    const big = (c.radius ?? 0.4) > 0.45;
    const mul = TOOL_MUL[tool] * (tool === 'axe' || tool === 'saw' ? (big ? 0.85 : 1.25) : 1) * (1 - Math.min(0.35, p.body.skill('trapping') * 0.04)) * talentMul(p.body, 'butcher');
    this.duration = Math.max(3, (h.time ?? 12) * mul * (this.st.length / Math.max(1, stagesOf(h, tool).length)));
    this.name = 'Butcher ' + (c.scanned ? String(c.sp.name) : 'the body').toLowerCase();
    this.anim = 'loot';
    // round 17: each stage ends on a cut: stop the needle in the green (a blade only; bare hands just tear)
    if (tool !== 'hands' && this.st.length) {
      const n = this.st.length;
      this.check = new SkillCheck({ kind: 'tap', at: this.st.map((_, i) => (i + 0.72) / n), band: 0.2, speed: 1.25,
        ease: (1 + p.body.skill('trapping') * 0.06) / Math.sqrt(talentMul(p.body, 'butcher')), glyph: 'CUT',
        sounds: { hit: 'flesh_cut', perfect: 'flesh_cut', miss: 'gore_squelch' } });
    }
    this.face = { x: c.x, z: c.z };
    this.sound = undefined;
  }
  isValid() { return !this.c.butchered && !!this.c.dead && this.p.zoneKey === this.c.zoneKey && Math.hypot(this.p.x - this.c.x, this.p.z - this.c.z) < 2.6; }
  start() {
    if (this.tool !== 'hands' && this.it && this.p.handR !== this.it && !this.p.handR) this.p.equip(this.it, 'R');
    if (this.p.isLocal) bus.emit('think', this.p, this.h.human ? 'It looks like a person. I am going to do this anyway.' : this.tool === 'hands' ? 'No blade. Fingers and teeth, then. This will be slow and ugly.' : this.st[0]?.id === 'skin' ? 'Skin first. Then open it up.' : 'Open it up and take what is worth taking.');
  }
  update(dt: number) {
    const k = this.progress * this.st.length;
    while (this.at < this.st.length - 1 && k >= this.at + 1) this.finishStage(this.st[this.at++]);
    // the sound and the spray of the work itself, all the way through
    this.fxT -= dt;
    if (this.fxT <= 0) {
      const s = this.st[Math.min(this.at, this.st.length - 1)];
      this.fxT = this.tool === 'hands' ? 0.9 : this.tool === 'saw' ? 0.45 : 0.7;
      this.workFx(s, false);
    }
  }
  perform() {
    while (this.at < this.st.length) this.finishStage(this.st[this.at++]);
  }
  private workFx(s: Stage, big: boolean) {
    const c = this.c, gd = goreOf(c.sp), K = KINDS[gd.blood], tint = gd.tint ?? K.tint;
    const a = Math.atan2(c.z - this.p.z, c.x - this.p.x) + (Math.random() - 0.5) * 1.6;
    const x = c.x + (Math.random() - 0.5) * (c.radius ?? 0.4), z = c.z + (Math.random() - 0.5) * (c.radius ?? 0.4);
    if (G.gore && K.key !== 'none') {
      G.gore.jet(K, tint, x, 0.18, z, Math.cos(a), Math.sin(a), big ? 18 : 4, big ? 2.6 : 1.4, 0.7, 1.0, 0.026, 0.07);
      if (big && (s.id === 'open' || s.id === 'odd')) G.gore.bits(K, tint, x, 0.2, z, Math.cos(a), Math.sin(a), 10, 1.8);
      if (big) G.gore.lensNear(x, z, 0.5, K);
    }
    const snd = this.tool === 'saw' ? 'saw' : this.tool === 'axe' ? 'hit_blade' : this.tool === 'hands' ? 'gore_tear' : s.id === 'skin' ? 'rip' : s.id === 'open' ? 'gore_squelch' : s.id === 'joint' ? 'flesh_cut' : 'flesh_cut';
    G.audio?.at?.(this.h.carcass === 'sponge' ? 'tc_squish' : snd, c.x, c.z, big ? 0.9 : 0.5);
    if (big && s.id === 'joint') G.audio?.at?.('bone_crunch', c.x, c.z, 0.8);
  }
  private finishStage(s: Stage) {
    const c = this.c, p = this.p, z = G.getZone(c.zoneKey);
    this.workFx(s, true);
    // the cut that ended this stage: clean ones save more, a botched one wastes some
    const cut = this.check?.marks[this.st.indexOf(s)] ?? '';
    if (p.isLocal) { shake(this.tool === 'axe' ? 0.22 : 0.1); punch(0.04, 0.2); }
    // jointing takes the limbs off for real
    if (s.id === 'joint') {
      const gd = goreOf(c.sp), limbs = (gd.sever || []).filter((n: string) => { const r = partRole(n, gd.head); return r === 'leg' || r === 'arm' || r === 'tail'; }).slice(0, 4);
      if (limbs.length) try { G.gore?.creatureSevered?.(c, limbs, { kind: this.tool === 'axe' ? 'axe' : 'blade', fx: p.x, fz: p.z, dmg: 30, crit: false } as any); } catch { /* the body has no such parts */ }
    }
    s.give.forEach(([key, n0, ch0], gi) => {
      if (!hasItemDef(key)) return;
      const n = n0 + (cut === 'perfect' && gi === 0 && ch0 === undefined ? 1 : 0) - (cut === 'miss' && gi === 0 && (n0 > 1 || Math.random() < 0.5) ? 1 : 0);
      const ch = ch0 === undefined ? undefined : cut === 'hit' || cut === 'perfect' ? Math.min(1, ch0 + 0.2) : cut === 'miss' ? ch0 * 0.6 : ch0;
      for (let i = 0; i < n; i++) {
        if (ch !== undefined && Math.random() > ch) continue;
        const it = createItem(key);
        const ang = Math.atan2(p.z - c.z, p.x - c.x) + (Math.random() - 0.5) * 2.2, sp = 0.6 + Math.random() * 0.9;
        op('dropFloor', { z: z.key, item: serializeItem(it), x: c.x, zz: c.z, y: 0.35, v: [Math.cos(ang) * sp, 1.2 + Math.random() * 1.0, Math.sin(ang) * sp] });
        if (itemDef(key).tags?.includes('weirdpart')) bump('butcher_part');
      }
    });
    const last = s.id === 'strip';
    op('harvestStage', { id: c.id, st: s.id, done: last, kind: this.h.carcass ?? 'flesh' });
    if (this.it) this.it.cond = Math.max(0, this.it.cond - (this.tool === 'knife' ? 0.012 : 0.006) * (cut === 'miss' ? 2 : 1));
    p.body.addXp('trapping', last ? 6 : 2);
    if (this.h.human) { p.body.stress = Math.min(100, (p.body.stress ?? 0) + 4); p.body.unhappy = Math.min(100, (p.body.unhappy ?? 0) + 3); }
    if ([...p.worn.values()].length) for (const w of p.worn.values()) w.bloody = Math.min(1, (w.bloody ?? 0) + (this.h.carcass === 'sponge' ? 0 : 0.08));
    if (last) {
      G.gore?.pool?.(z, c.x, c.z, 0.6 + (c.radius ?? 0.4), KINDS[goreOf(c.sp).blood], goreOf(c.sp).tint ?? KINDS[goreOf(c.sp).blood].tint);
      bump('butcher_full'); mark('butcher:any');
      if (p.isLocal) bus.emit('think', p, this.h.human ? 'Done. I need to wash my hands. For a long time.' : this.h.carcass === 'sponge' ? 'Nothing in it but sponge and that wax smell.' : 'Stripped to the bone. That is all of it worth taking.');
      bus.emit('corpseButchered', p, c);
    }
    bus.emit('inventoryChanged', p);
    void this.B;
  }
}

// ------------------------------------------------------------------ the carcass left behind
const CARCASS = new Map<string, THREE.BufferGeometry>();
function carcassGeo(kind: string, len: number): THREE.BufferGeometry {
  const L = Math.round(len * 10) / 10, key = kind + ':' + L;
  let g = CARCASS.get(key);
  if (g) return g;
  const mb = new ModelBuilder();
  const BONE = { color: 0xe8dcc4 }, MEAT = { color: 0x8a1e22 }, DARK = { color: 0x4a0c10 };
  if (kind === 'sponge') {
    // a collapsed wax rind, torn open, with sponge pulled out of it in lumps
    for (let i = 0; i < 9; i++) {
      const a = i * 2.39, r = (i / 9) * L * 0.35;
      mb.push().translate(Math.cos(a) * r, 0.03, Math.sin(a) * r * 0.6).rotateY(a).rotateX((i % 3 - 1) * 0.4);
      mb.box(0, 0, 0, 0.12 + (i % 4) * 0.03, 0.05, 0.08 + (i % 3) * 0.03, 'i_hv_sponge', { uvScale: 2 });
      mb.pop();
    }
    mb.box(0, 0.01, 0, L * 0.7, 0.02, L * 0.28, 'white', { color: 0xd8c8a0 });
  } else if (kind === 'husk') {
    // an emptied skin: flattened, split down the middle
    mb.box(0, 0.015, 0, L * 0.8, 0.03, L * 0.32, 'white', { color: 0x6a5a4a });
    mb.box(0, 0.032, 0, L * 0.7, 0.008, L * 0.05, 'white', DARK);
  } else {
    // the spine, the ribs (each in three bent pieces) over a hollowed cavity, the pelvis, scraps of meat left on
    const n = Math.max(5, Math.round(L * 10));
    for (let i = 0; i < n; i++) { const x = -L * 0.45 + (i / (n - 1)) * L * 0.9; mb.box(x, 0.04, 0, L * 0.06, 0.035, 0.035, 'white', BONE); if (i % 2) mb.box(x, 0.06, 0, L * 0.02, 0.025, 0.012, 'white', BONE); }
    const ribs = Math.max(4, Math.round(L * 6));
    for (let i = 0; i < ribs; i++) {
      const x = -L * 0.05 + (i / ribs) * L * 0.38, w = L * 0.2 * (1 - Math.abs(i / ribs - 0.4));
      for (const k of [-1, 1]) {
        mb.push().translate(x, 0.05, 0).rotateX(k * 0.2);
        mb.box(0, 0.04, k * w * 0.4, 0.016, 0.014, w * 0.8, 'white', BONE);
        mb.box(0, 0.015, k * w * 0.95, 0.016, 0.05, 0.016, 'white', BONE);
        if (i % 2) mb.box(0, 0.035, k * w * 0.5, 0.03, 0.02, w * 0.3, 'white', MEAT);
        mb.pop();
      }
    }
    mb.box(-L * 0.4, 0.035, 0, L * 0.12, 0.05, L * 0.18, 'white', BONE);
    mb.box(L * 0.48, 0.05, 0, L * 0.12, 0.08, L * 0.1, 'white', BONE);
    mb.box(0, 0.012, 0, L * 0.8, 0.02, L * 0.3, 'white', DARK);
    for (let i = 0; i < 5; i++) mb.box(-L * 0.3 + i * L * 0.14, 0.03, (i % 2 ? 1 : -1) * L * 0.08, L * 0.07, 0.03, L * 0.05, 'white', MEAT);
  }
  g = mb.build();
  CARCASS.set(key, g);
  return g;
}

// ------------------------------------------------------------------ the system
export class Butchery {
  /** kept for the cook system's input capture: the harvest is an ordinary timed action, so never set */
  active: null = null;
  private carcasses = new Map<string, THREE.Mesh>();
  private mat: THREE.Material | null = null;
  private wormT = 30;

  constructor() {
    bus.on('consumed', (p: Player, key: string, it?: Item) => this.ate(p, key, it));
  }

  /** a blade in hand first, then anything sharp in the pack; null = bare hands */
  toolOf(p: Player): { tool: Tool; it: Item } | null {
    const kindOf = (it: Item | null | undefined): Tool | null => {
      if (!it) return null;
      const d = itemDef(it.key), t = d.tags || [];
      if (t.includes('saw')) return 'saw';
      if (t.includes('axe') || d.weapon?.kind === 'axe') return 'axe';
      if (t.includes('knife') || t.includes('sharp') || d.weapon?.kind === 'blade') return 'knife';
      return null;
    };
    for (const it of [p.handR, p.handL]) { const k = kindOf(it); if (k) return { tool: k, it: it! }; }
    for (const it of p.allItems()) { const k = kindOf(it); if (k) return { tool: k, it }; }
    return null;
  }

  canButcher(c: any) { return !!c?.dead && !c.butchered && !c.sp?.flags?.noCorpse && goreOf(c.sp).blood !== 'none' && !!harvestOf(c.sp); }

  /** start (or carry on) taking a corpse apart; without `bare`, only with a blade (E on a body loots it otherwise) */
  start(p: Player, c: any, bare = false): boolean {
    if (!this.canButcher(c)) return false;
    const t = this.toolOf(p);
    if (!t && !bare) return false;
    const h = harvestOf(c.sp)!;
    p.actions.clear();
    p.actions.add(new HarvestAction(p, c, h, t?.tool ?? 'hands', t?.it ?? null, this));
    return true;
  }
  stop() { /* the action stops itself (moving, a menu, the body taken away) */ }

  update() {
    const dt = G.dt ?? 1 / 60;
    this.carcassStep();
    this.wormStep(dt);
  }

  /** a stripped body: the carcass mesh in place of the rig */
  private carcassStep() {
    const p = G.local, cs = G.creatures; if (!p || !cs) return;
    const seen = new Set<string>();
    for (const c of cs.creatures.values() as IterableIterator<any>) {
      if (!c.butchered || !c.dead || c.zoneKey !== p.zoneKey || !c.mem.carcass) continue;
      seen.add(c.id);
      let m = this.carcasses.get(c.id);
      if (!m) {
        const len = Math.max(0.35, Math.min(2.2, Math.max((c.radius ?? 0.4) * 2.4, (c.height ?? 1) * 0.55)));
        this.mat ??= worldMaterial({});
        m = new THREE.Mesh(carcassGeo(c.mem.carcass, len), this.mat);
        m.receiveShadow = true; m.castShadow = true;
        m.position.set(c.x, 0.002, c.z); m.rotation.y = Math.PI / 2 - c.facing;
        G.pr.scene.add(m);
        this.carcasses.set(c.id, m);
      }
      c.mem.gibbed = true;
      if (c.rig) c.rig.body.visible = false;
    }
    for (const [id, m] of this.carcasses) if (!seen.has(id)) { G.pr.scene.remove(m); this.carcasses.delete(id); }
  }

  // ---------------------------------------------------------------- eating it
  private ate(p: Player, key: string, it?: Item) {
    if (!p?.isLocal || !key || !hasItemDef(key)) return;
    const d = itemDef(key), tags = d.tags || [];
    const b = p.body as any;
    // medicine clears worms
    if (tags.includes('antibiotic') || /antibiotic|dewormer/.test(key)) { if (b.worms > 0) { b.worms = 0; bus.emit('think', p, 'The cramps are going. Whatever was in there is dying.'); } return; }
    if (!d.food || !(tags.includes('rawmeat') || tags.includes('rawflesh') || d.food.ingredient === 'meat')) return;
    const cooked = !!it && (it.cooked ?? 0) >= 1 && (it.cooked ?? 0) < 1.6;
    const raw = !!d.food.raw && !cooked;
    const longpig = tags.includes('longpig');
    if (longpig) {
      b.stress = Math.min(100, (b.stress ?? 0) + (raw ? 6 : 3));
      b.lucidity = Math.max(0, (b.lucidity ?? 100) - (raw ? 5 : 2));
      if (Math.random() < 0.35) bus.emit('think', p, raw ? 'It is warm and it is a person and I am chewing.' : 'Do not think about what it was. Chew.');
    }
    if (!raw) return;
    // raw: worms, if the animal carried them
    const ch = (tags.includes('parasites') ? 0.4 : 0.12) * (p.body.has?.('iron_gut') ? 0.5 : 1);
    if (Math.random() < ch) {
      const was = b.worms ?? 0;
      b.worms = Math.min(1, was + 0.45);
      if (!was) bus.emit('think', p, 'Something moved in that. I felt it go down.');
    } else if (Math.random() < 0.3) bus.emit('think', p, ['Raw. Slick and cold and iron.', 'I should have cooked that.', 'My stomach is not happy about that.'][Math.floor(Math.random() * 3)]);
  }
  /** worms: hungry all the time, cramps, a creeping sickness, until they pass (or antibiotics) */
  private wormStep(dt: number) {
    const p = G.local; if (!p || p.body.dead) return;
    const b = p.body as any;
    if (!(b.worms > 0)) return;
    b.hunger = Math.min(100, b.hunger + dt * 0.045 * b.worms);
    b.worms = Math.max(0, b.worms - dt / 720);
    this.wormT -= dt;
    if (this.wormT <= 0) {
      this.wormT = 50 + Math.random() * 50;
      b.sickness = Math.min(100, (b.sickness ?? 0) + 4 * b.worms);
      b.unhappy = Math.min(100, (b.unhappy ?? 0) + 3);
      bus.emit('think', p, ['Cramps. Something in my gut is eating what I eat.', 'I am starving and I ate an hour ago. Worms. It has to be.', 'My stomach is MOVING.'][Math.floor(Math.random() * 3)]);
    }
    if (b.worms <= 0) bus.emit('think', p, 'The cramps have stopped. I think they are gone.');
  }
}
