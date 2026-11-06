// The codex archive's files (rooms/archive.ts): five drawers, one file per
// thing the Institute keeps a record of, each with pages the research reveals.
//   inhabitants   src/creatures/lore.ts (the inhabitants' field codex) and the
//                 codex species; known once sighted, pages open with research
//   items         anomalous and issued items plus everything a unit has carried
//                 or scanned (src/game/meridian.ts found, profile scan:item:*)
//   places        the levels (src/world/worldGraph.ts) a unit has walked into
//   anomalies     the six zone anomalies of the codex; pages open with research
//   research      the research tools the codex issues, the milestones, the
//                 research tree's purchases and the Meridian file's numbers
// A file nobody has found yet is still in the drawer: its hologram is static.
import { species } from '../../../creatures/registry';
import { entries, entryKnown, entryState, researchPct, notesShown, ANOMALIES, TOOLS, TOOL_KEYS, toolLevel, MILESTONES, hasMilestone, codexStats } from '../../../game/codex';
import { file, deathCount, catalogue, isDiscovered } from '../../../game/meridian';
import { allZoneSpecs } from '../../../world/worldGraph';
import { allItemDefs, hasItemDef, itemDef } from '../../../items/item';
import { unlockedIds } from '../../../game/profile';
import { treeNodes, rankOf, BRANCHES } from '../../../game/unitTree';
import { researchPoints } from '../../../game/research';

export type CatKey = 'inhabitants' | 'items' | 'places' | 'anomalies' | 'research';
export const CATS: { key: CatKey; name: string; code: string; color: number }[] = [
  { key: 'inhabitants', name: 'Inhabitants', code: 'INH', color: 0x8affc8 },
  { key: 'items', name: 'Items', code: 'ITM', color: 0xffd08a },
  { key: 'places', name: 'Places', code: 'PLC', color: 0x8ac8ff },
  { key: 'anomalies', name: 'Anomaly events', code: 'ANM', color: 0xd8a8ff },
  { key: 'research', name: 'Research files', code: 'RSF', color: 0xffa88a },
];
export interface Page { h: string; lines: string[]; locked?: string }
/** what the projector builds: a species rig, an item, a place, a medal */
export type Model = { kind: 'species'; key: string } | { kind: 'item'; key: string } | { kind: 'place'; key: string; depth: number } | { kind: 'medal'; color: number } | { kind: 'none' };
export interface ArchiveFile {
  key: string; cat: CatKey; title: string; code: string;
  /** the class line under the title (rank, class, category) */
  sub: string;
  known: boolean;
  /** 0..100: how much of the file is open */
  pct: number;
  pages: Page[];
  model: Model;
  /** a game sound key the recording plays */
  voice?: string;
  /** 1..10 for the danger bar (inhabitants) */
  danger?: number;
}

// the inhabitants' field codex (another worker's file: read it if it is there)
type Lore = { id: string; name: string; rank: string; class: string; summary: string; biology: string; behaviour: string; habitat: string; lore: string; harvest: { item: string; how: string }[]; danger: number };
const LORE_MOD = import.meta.glob('../../../creatures/lore.ts', { eager: true }) as Record<string, { INHABITANTS?: Lore[]; RANK_INFO?: Record<string, { label: string; numeral: string; gloss: string }> }>;
const loreMod = () => Object.values(LORE_MOD)[0] ?? {};
const LOCK = (n: number) => `research ${n}% to open this page`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ================================================================== inhabitants
function inhabitants(): ArchiveFile[] {
  const L = loreMod().INHABITANTS ?? [];
  const RI = loreMod().RANK_INFO ?? {};
  const byId = new Map(L.map((l) => [l.id, l]));
  const codex = new Map(entries().filter((e) => e.kind === 'species').map((e) => [e.key, e]));
  const keys = [...new Set([...catalogue().map((s: any) => s.key as string), ...L.map((l) => l.id)])];
  const out: ArchiveFile[] = [];
  for (const key of keys) {
    const l = byId.get(key), e = codex.get(key), sp: any = species(key);
    if (!l && !e) continue;
    const known = e ? entryKnown(key) : isDiscovered(key);
    const st = e ? entryState(key) : 'unknown';
    const pct = st === 'complete' ? 100 : e ? researchPct(key) : 0;
    const name = l?.name ?? e?.name ?? key;
    const rank = l ? (RI[l.rank]?.label ?? l.rank.toUpperCase()) : '';
    const sub = [rank && `${RI[l!.rank]?.numeral ?? ''} ${rank}`.trim(), l?.class ?? e?.cls].filter(Boolean).join(' · ');
    const pages: Page[] = [];
    if (l) {
      pages.push({ h: 'Summary', lines: [l.summary, RI[l.rank]?.gloss ?? ''].filter(Boolean) });
      pages.push({ h: 'Biology', lines: [l.biology], locked: pct < 25 && st !== 'sampled' ? LOCK(25) : undefined });
      pages.push({ h: 'Behaviour', lines: [l.behaviour, sp?.rule ? `Rule: ${sp.rule.name}. ${sp.rule.text}` : ''].filter(Boolean), locked: pct < 50 ? LOCK(50) : undefined });
      pages.push({ h: 'Habitat & harvest', lines: [l.habitat, ...l.harvest.map((h) => `${hasItemDef(h.item) ? itemDef(h.item).name : h.item}: ${h.how}`)], locked: pct < 75 ? LOCK(75) : undefined });
      pages.push({ h: 'Lore', lines: [l.lore], locked: pct < 100 ? 'complete the entry to open the lore' : undefined });
    } else if (e) {
      const n = notesShown(key);
      pages.push({ h: 'Field notes', lines: e.notes.slice(0, Math.max(1, n)) });
      if (e.notes.length > Math.max(1, n)) pages.push({ h: 'Further notes', lines: [], locked: LOCK(Math.round(((n + 1) / e.notes.length) * 100)) });
    }
    out.push({
      key, cat: 'inhabitants', title: name, code: e?.code || sp?.code || key.toUpperCase(), sub, known, pct, pages,
      model: sp ? { kind: 'species', key } : { kind: 'none' }, voice: sp?.sounds?.idle ?? sp?.sounds?.call, danger: l?.danger ?? Math.min(10, (e?.threat ?? 1) * 2),
    });
  }
  // the dangerous ones last, the unknown ones after the known within each rank
  return out.sort((a, b) => (a.danger ?? 0) - (b.danger ?? 0) || a.title.localeCompare(b.title));
}

// ================================================================== items
function items(): ArchiveFile[] {
  const found = file().found ?? {};
  const scanned = new Set([...unlockedIds('scan:item:'), ...unlockedIds('scan:artefact:')].map((s) => s.split(':').slice(2).join(':')));
  const tools = new Set(TOOL_KEYS.map((k) => TOOLS[k].item));
  const keys = new Set<string>();
  for (const d of allItemDefs()) if (d.cat === 'anomaly' || tools.has(d.key) || (d as any).anomaly) keys.add(d.key);
  for (const k of Object.keys(found)) keys.add(k);
  for (const k of scanned) keys.add(k);
  const out: ArchiveFile[] = [];
  for (const k of keys) {
    if (!hasItemDef(k)) continue;
    const d = itemDef(k);
    if (k.startsWith('sample_')) continue;
    const known = !!found[k] || scanned.has(k);
    const tags = (d.tags ?? []).filter((t: string) => !t.startsWith('#')).slice(0, 5);
    out.push({
      key: 'item:' + k, cat: 'items', title: d.name, code: `${d.cat.toUpperCase()} · ${k.toUpperCase().slice(0, 14)}`, sub: `${cap(d.cat)} · ${d.weight} kg`, known, pct: known ? 100 : 0,
      pages: [
        { h: 'Description', lines: [d.desc || 'No description on file.'] },
        { h: 'Specification', lines: [`Category: ${cap(d.cat)}`, `Weight: ${d.weight} kg`, tags.length ? `Tags: ${tags.join(', ')}` : '', scanned.has(k) ? 'Scanned in the field.' : '', found[k] ? 'Carried by a unit.' : ''].filter(Boolean) },
      ],
      model: { kind: 'item', key: k },
    });
  }
  const rankCat = (f: ArchiveFile) => (f.known ? 0 : 1);
  return out.sort((a, b) => rankCat(a) - rankCat(b) || a.title.localeCompare(b.title)).slice(0, 160);
}

// ================================================================== places
function places(): ArchiveFile[] {
  const visits = file().places ?? {};
  return allZoneSpecs().filter((z) => !z.key.startsWith('intro')).map((z) => {
    const n = visits[z.key] || 0;
    const known = n > 0 || z.key === 'lobby';
    return {
      key: 'place:' + z.key, cat: 'places' as CatKey, title: z.name, code: `LEVEL · ${z.key.toUpperCase()}`, sub: `Depth ${z.depth ?? 0} · ${z.W} × ${z.H} m`, known, pct: known ? 100 : 0,
      pages: [
        { h: 'Survey', lines: [z.blurb || 'The survey team did not come back with a description.'] },
        { h: 'Record', lines: [`Walked into ${n} time${n === 1 ? '' : 's'} by units on file.`, `Simulation depth ${z.depth ?? 0}: ${(z.depth ?? 0) < 2 ? 'stable' : (z.depth ?? 0) < 5 ? 'drifting' : 'collapsing at the edges'}.`] },
      ],
      model: { kind: 'place' as const, key: z.key, depth: z.depth ?? 0 },
    };
  }).sort((a, b) => (a.known === b.known ? 0 : a.known ? -1 : 1));
}

// ================================================================== anomaly events
function anomalies(): ArchiveFile[] {
  const itemFor = (a: string) => allItemDefs().find((d: any) => d.anomaly === a)?.key;
  return ANOMALIES.map((a) => {
    const key = 'anom:' + a.key, known = entryKnown(key), pct = researchPct(key), n = Math.max(1, notesShown(key));
    const it = itemFor(a.key);
    return {
      key, cat: 'anomalies' as CatKey, title: a.name, code: a.code, sub: `${a.cls} · threat ${a.threat}`, known, pct,
      pages: [
        { h: 'Observation', lines: a.notes.slice(0, Math.min(2, n)) },
        { h: 'Analysis', lines: a.notes.slice(2, Math.max(2, n)), locked: n <= 2 ? LOCK(75) : undefined },
        { h: 'Application', lines: [`Completing this entry issues the ${TOOLS[a.tool].name}.`, TOOLS[a.tool].text], locked: pct < 100 ? 'complete the entry' : undefined },
      ],
      model: it ? { kind: 'item' as const, key: it } : { kind: 'none' as const },
    };
  });
}

// ================================================================== research files
function research(): ArchiveFile[] {
  const out: ArchiveFile[] = [];
  const st = codexStats(), f = file();
  out.push({
    key: 'rsf:meridian', cat: 'research', title: 'The Meridian file', code: 'RSF-000 // UNIT PROGRAMME', sub: 'Operator record', known: true, pct: 100,
    pages: [
      { h: 'The programme', lines: [`Units deployed: ${f.runs}. Units lost: ${deathCount()}.`, `Research points banked: ${researchPoints()}.`, f.killers.length ? `Recent losses: ${f.killers.slice(-3).join(', ')}.` : 'No losses on file.'] },
      { h: 'The codex', lines: [`Discovered ${st.discovered} of ${st.total}. Sampled ${st.sampled}. Complete ${st.complete}.`, `Overall research ${st.pct}%.`, `${st.samples} sample${st.samples === 1 ? '' : 's'} in the cold store.`] },
      { h: 'The research tree', lines: BRANCHES.map((b) => { const ns = treeNodes(b.key); const o = ns.filter((n) => rankOf(n) > 0).length; return `${b.name}: ${o} of ${ns.length} researched.`; }) },
    ],
    model: { kind: 'medal', color: 0xffd070 },
  });
  for (const k of TOOL_KEYS) {
    const t = TOOLS[k], lvl = toolLevel(k);
    out.push({
      key: 'rsf:tool:' + k, cat: 'research', title: t.name, code: `RSF-TOOL // ${k.toUpperCase()}`, sub: lvl ? `Issue ${lvl}` : 'Not issued', known: lvl > 0, pct: lvl ? 100 : 0,
      pages: [{ h: 'Issue', lines: [t.text, lvl ? `Carried at issue ${lvl}: ${t.count(lvl)} per run.` : 'Complete a codex entry to issue it.'] }],
      model: hasItemDef(t.item) ? { kind: 'item', key: t.item } : { kind: 'medal', color: t.color },
    });
  }
  for (const m of MILESTONES) {
    const got = hasMilestone(m.key);
    out.push({ key: 'rsf:ms:' + m.key, cat: 'research', title: m.name, code: `RSF-MS // ${m.key.toUpperCase()}`, sub: got ? 'Awarded' : m.need, known: got, pct: got ? 100 : 0, pages: [{ h: 'Commendation', lines: [m.text, `Requirement: ${m.need}.`] }], model: { kind: 'medal', color: got ? 0xffd070 : 0x8a8a8a } });
  }
  return out;
}

export function archiveFiles(cat: CatKey): ArchiveFile[] {
  try {
    switch (cat) {
      case 'inhabitants': return inhabitants();
      case 'items': return items();
      case 'places': return places();
      case 'anomalies': return anomalies();
      default: return research();
    }
  } catch (e) { console.warn('archive', cat, e); return []; }
}
export function catCounts(cat: CatKey): { known: number; total: number } {
  const fs = archiveFiles(cat);
  return { known: fs.filter((f) => f.known).length, total: fs.length };
}
