// Creature rules. Every species obeys one thing you can learn and then use
// (SpeciesDef.rule: a short name, the rule, a first-sighting hint). You learn
// a rule by scanning the creature, by seeing it act on the rule (species call
// ruleShown() on the host; LEARN below reads replicated state), by living
// through its hunt, or by watching it long enough. Learned rules persist in
// the profile, pay a few research points and are listed for the watch.
//
// Bus: 'ruleLearned' { key, species, name, text, how }.
import { G } from '../game/G';
import { bus } from '../core/events';
import { species as getSpecies, allSpecies } from './registry';
import type { Creature } from './creature';
import type { SpeciesDef, CreatureRule } from './species';
import type { Player } from '../entities/player';
import { defQuest } from '../game/quests';
// the profile touches window at load: fetched lazily so content tools running in node (zonecheck) can import species
type ProfileMod = typeof import('../game/profile');
type ResearchMod = typeof import('../game/research');
let PROF: ProfileMod | null = null, RES: ResearchMod | null = null;
if (typeof window !== 'undefined' && typeof (window as any).addEventListener === 'function') {
  import('../game/profile').then((m) => { PROF = m; }).catch(() => {});
  import('../game/research').then((m) => { RES = m; }).catch(() => {});
}
const stat = (k: string) => PROF?.stat(k) ?? 0;
const addStat = (k: string, n: number) => PROF?.addStat(k, n);
const grantResearch = (n: number, why: string) => RES?.grantResearch(n, why);
import { dreadOnFrame } from './dread';

export type RuleHow = 'scan' | 'witness' | 'survived' | 'watched' | 'dev';

const spOf = (key: string) => getSpecies(key) as unknown as SpeciesDef | undefined;
export const ruleOf = (key: string): CreatureRule | undefined => spOf(key)?.rule;
export const ruleLearned = (key: string) => stat('rule_' + key) > 0;
/** species keys whose rule this profile knows */
export function learnedRules(): string[] { return allSpecies().filter((s) => (s as any).rule && ruleLearned(s.key)).map((s) => s.key); }
/** every rule, learned or not (for the watch's field notes) */
export function allRules(): { key: string; species: string; rule: CreatureRule; learned: boolean }[] {
  return allSpecies().filter((s) => (s as any).rule).map((s) => ({ key: s.key, species: (s as any).name as string, rule: (s as any).rule as CreatureRule, learned: ruleLearned(s.key) }));
}

/** learn a species' rule (local profile); false if it has none or it was known */
export function learnRule(key: string, how: RuleHow): boolean {
  const sp = spOf(key);
  const r = sp?.rule;
  if (!sp || !r || !PROF || ruleLearned(key)) return false;
  addStat('rule_' + key, 1);
  addStat('rules_learned', 1);
  grantResearch(3, 'Rule learned: ' + sp.name);
  bus.emit('ruleLearned', { key, species: sp.name, name: r.name, text: r.text, how });
  // no info panel: the survivor mutters it to themselves (the watch's field notes carry the full rule)
  const p = G.local;
  if (p) {
    const lead = how === 'survived' ? 'Lived through that. ' : how === 'watched' ? 'Watched it long enough. ' : how === 'witness' ? 'There. ' : '';
    bus.emit('think', p, `${lead}${r.name.charAt(0) + r.name.slice(1).toLowerCase()}. That is its rule.`);
    G.audio?.ui?.('scanDone');
  }
  return true;
}

/**
 * Host: the creature just acted on its rule (fled the beam, stopped at the
 * threshold, shattered on a wall). Peers that can see it learn the rule.
 */
export function ruleShown(c: Creature) {
  let n = c.mem.net;
  if (!n || typeof n !== 'object') { n = {}; c.mem.net = n; }
  c.mem.netMem = n;
  n.rw = ((n.rw | 0) + 1) % 1000;
}

// ------------------------------------------------------------------ learning by watching (every peer)
type Pred = (c: Creature, p: Player, d: number) => boolean;
const fleeing: Pred = (c, _p, d) => c.state === 'flee' && d < 14;
/** rules that show in replicated state alone (the newer species call ruleShown instead) */
const LEARN: Record<string, Pred> = {
  gloam: fleeing, echo: fleeing, stilt_doe: fleeing, wrongbird: fleeing, ventling: (c, p, d) => (c.state === 'flee' || c.state === 'hide') && d < 10,
  grinhound: (c, p, d) => c.state === 'flee' && d < 12,
  lumenmoth: (c, p, d) => d < 4 && p.flashlightOn,
  lamplighter: (c, _p, d) => c.state === 'hide' && d < 10,
  hollow: (c, p, d) => d < 6 && c.state === 'idle' && !p.flashlightOn,
};
const HUNTING = new Set(['chase', 'attack']);
const expo = new Map<string, number>();
const hunted = new Map<string, number>();
const seenN = new Map<string, number>();
let pollT = 0;

dreadOnFrame((dt) => {
  pollT -= dt;
  if (pollT > 0) return;
  const step = 0.4;
  pollT = step;
  const p = G.local, cs = G.creatures;
  if (!p || !cs || p.body.dead) return;
  for (const c of cs.creatures.values() as IterableIterator<Creature>) {
    if (c.zoneKey !== p.zoneKey || !c.sp.rule) continue;
    const key = c.sp.key;
    const n = c.mem.netMem || c.mem.net || {};
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    // a demonstration from the host
    const rw = n.rw | 0;
    const prev = seenN.get(c.id);
    seenN.set(c.id, rw);
    if (ruleLearned(key) || c.dead) continue;
    const vis = c.visibleToLocal && c.state !== 'disguised';
    if (prev !== undefined && rw !== prev && vis && d < 20) { learnRule(key, 'witness'); continue; }
    const pred = LEARN[key];
    if (pred && vis && pred(c, p, d)) { learnRule(key, 'witness'); continue; }
    // living through its hunt
    if (HUNTING.has(c.state) && d < 10) hunted.set(c.id, G.time);
    else {
      const t = hunted.get(c.id);
      if (t !== undefined) {
        if (G.time - t > 25) hunted.delete(c.id);
        else if (d > 7 && !p.body.downed) { hunted.delete(c.id); learnRule(key, 'survived'); continue; }
      }
    }
    // watching it, lit and close, for long enough
    if (vis && d < 14) {
      const e = (expo.get(key) ?? 0) + step;
      expo.set(key, e);
      if (e > 45) learnRule(key, 'watched');
    }
  }
});

// a scan always teaches it
bus.on('scanned', (c: Creature) => { if (c?.sp) learnRule(c.sp.key, 'scan'); });
// the first sighting in a session: a hint, if it has one and you do not know it yet
const told = new Set<string>();
bus.on('creatureSeen', (c: Creature) => {
  const r = c?.sp?.rule;
  if (!r?.tell || told.has(c.sp.key) || ruleLearned(c.sp.key) || !G.local) return;
  told.add(c.sp.key);
  setTimeout(() => { if (G.local) bus.emit('think', G.local, r.tell!); }, 900);
});
bus.on('enterZone', () => { hunted.clear(); seenN.clear(); });

// ------------------------------------------------------------------ research quests
defQuest({
  key: 'field_rules', title: 'Field Notes', giver: 'MERIDIAN R&D', category: 'research',
  desc: 'Everything down here obeys one rule. Learn five of them: scan them, watch them, or live through them.',
  objectives: [{ id: 'rules', text: 'Learn 5 creature rules', check: () => { const n = learnedRules().length; return n >= 5 ? true : n / 5; } }],
  reward: { rp: 15 },
});
defQuest({
  key: 'field_rules_2', title: 'Bestiary', giver: 'MERIDIAN R&D', category: 'research', requires: ['field_rules'],
  desc: 'R&D wants the full set. Learn the rules of fifteen different things and come back alive.',
  objectives: [{ id: 'rules', text: 'Learn 15 creature rules', check: () => { const n = learnedRules().length; return n >= 15 ? true : n / 15; } }],
  reward: { rp: 40 },
});

if (import.meta.env.DEV && typeof window !== 'undefined') (window as any).__rules = { allRules, learnRule, learnedRules, ruleOf };
