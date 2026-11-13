// The research lab's paperwork, on riveted console plates in Alagard (the
// creator's house style, creator/creator.css):
//   openCodex(host)        every entry: its state, research %, what it pays
//   openEntry(host, key)   one entry: the notes the research has revealed, the
//                          samples banked, its prize tool; process a sample of it
//   openFridge(host)       the banked samples: pick one for the benches
//   openReq(host)          the requisition: research tools for the next run,
//                          the suit dye, the milestones
//   openFile(host)         the Meridian file: the numbers, every commendation
// One overlay at a time; Esc / B / the backdrop closes it. Every change is
// written to the Meridian file at once and host.onChange() lets the room re-read it.
import './panel.css';
import { FocusNav } from '../nav';
import { sfx } from '../sfx';
import { researchPoints } from '../../../game/research';
import { stat, isUnlocked } from '../../../game/profile';
import { file, wornCos, setWornCos, deathCount } from '../../../game/meridian';
import {
  entries, entry, entryState, researchPct, sampledCount, notesShown, codexStats, bank, KIND_NAME, KIND_GAMES, TOOLS, TOOL_KEYS, toolLevel, req, reqSlots, setReq,
  MILESTONES, hasMilestone, startingKit, type Sample, type ToolKey, type EntryState,
} from '../../../game/codex';
import { ACHIEVEMENTS, earned, earnedCount, rewardText } from '../../../game/achievements';
import { COSMETICS } from '../../../game/cosmetics';
import { itemDef, hasItemDef } from '../../../items/item';

export interface PanelHost { root: HTMLElement; onChange: () => void; onClose?: () => void; onProcess?: (s: Sample) => void }

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c]);
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
const STATE_NAME: Record<EntryState, string> = { unknown: 'UNKNOWN', discovered: 'DISCOVERED', sampled: 'SAMPLED', researching: 'RESEARCHING', complete: 'COMPLETE' };

let cur: { over: HTMLElement; nav: FocusNav; host: PanelHost } | null = null;
export function panelOpen() { return !!cur; }
export function closePanel(quiet = false) {
  if (!cur) return;
  const c = cur; cur = null;
  c.nav.destroy();
  c.over.classList.remove('on');
  setTimeout(() => c.over.remove(), 160);
  if (!quiet) sfx('back');
  c.host.onClose?.();
}
/** round 17: the band desktop hosts these panels inside its windows: the panel goes into this element instead of a veil */
let embedIn: HTMLElement | null = null;
export function setPanelEmbed(el: HTMLElement | null) { embedIn = el; }
function frame(host: PanelHost, title: string, sub: string, cls = ''): HTMLElement {
  if (cur) { const c = cur; cur = null; c.nav.destroy(); c.over.remove(); }
  const over = document.createElement('div');
  over.className = 'mx-over ' + cls + (embedIn ? ' mx-embed' : '');
  over.innerHTML = `<div class="mx-pan" role="dialog" aria-label="${esc(title)}"><div class="mx-head"><b>${esc(title)}</b><small>${esc(sub)}</small><button type="button" class="mx-x" aria-label="Close (Esc)">✕</button></div><div class="mx-body"></div></div>`;
  over.addEventListener('pointerdown', (e) => { if (e.target === over) closePanel(); });
  over.querySelector('.mx-x')!.addEventListener('click', () => closePanel());
  (embedIn && embedIn.isConnected ? embedIn : document.body).append(over);
  requestAnimationFrame(() => over.classList.add('on'));
  const nav = new FocusNav(over, { onBack: () => closePanel(), autofocus: true });
  cur = { over, nav, host };
  return over.querySelector('.mx-body') as HTMLElement;
}
function btn(label: string, fn: () => void, o: { cls?: string; off?: string | null; small?: string } = {}): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'mx-btn ' + (o.cls ?? '');
  b.innerHTML = `<span>${esc(label)}</span>${o.small ? `<small>${esc(o.small)}</small>` : ''}`;
  if (o.off) { b.disabled = true; b.title = o.off; }
  b.addEventListener('click', () => { if (!b.disabled) fn(); });
  return b;
}
const el = (tag: string, cls: string, html = '') => { const e = document.createElement(tag); e.className = cls; e.innerHTML = html; return e; };
const rpLine = () => el('div', 'mx-rp', `<span>RESEARCH POINTS</span><b>${researchPoints()}</b>`);
const bar = (label: string, pct: number, cls = '') => el('div', 'mx-bar ' + cls, `<span>${esc(label)}</span><i style="--p:${pct}%"></i><b>${pct}%</b>`);
function statsRow(): HTMLElement {
  const st = codexStats();
  return el('div', 'mx-nums cx-stats', ([['DISCOVERED', `${st.discovered}/${st.total}`], ['SAMPLED', st.sampled], ['RESEARCHED', st.researched], ['COMPLETE', st.complete]] as [string, string | number][]).map(([k, v]) => `<div><small>${k}</small><b>${esc(v)}</b></div>`).join(''));
}

// ================================================================== the codex
export function openCodex(host: PanelHost) {
  const st = codexStats();
  const body = frame(host, 'The codex', `${st.pct}% researched · ${st.complete} of ${st.total} entries complete`, 'mx-wide');
  body.append(statsRow(), bar('CODEX', st.pct, 'cx-big'));
  body.append(el('p', 'mx-p mx-dim', 'Collect samples in a run (Take sample on a body that is dead, down or stunned, or on an anomaly), bank them at a Remittance Press or carry them out, then work them at the benches here. A complete entry issues a research tool for your next run.'));
  const grid = el('div', 'cx-grid');
  for (const e of entries()) {
    const s = entryState(e.key), pct = researchPct(e.key), known = s !== 'unknown';
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'cx-card ' + s;
    b.innerHTML = `<i class="cx-st"></i><b>${esc(known ? e.name : '???')}</b><small>${esc(known ? (e.code.split('//')[0] || e.cls).trim() : e.kind === 'anomaly' ? 'an anomaly' : 'a specimen')}</small><span class="cx-pb" style="--p:${pct}%"></span><em>${STATE_NAME[s]}${pct ? ' · ' + pct + '%' : ''}</em>`;
    b.addEventListener('click', () => { sfx('tick'); openEntry(host, e.key); });
    grid.append(b);
  }
  body.append(grid, rpLine());
}

// ================================================================== one entry
export function openEntry(host: PanelHost, key: string) {
  const e = entry(key);
  if (!e) return;
  const s = entryState(key), known = s !== 'unknown', pct = researchPct(key);
  const body = frame(host, known ? e.name : 'Uncatalogued', known ? `${e.code.split('//').map((q) => q.trim()).filter(Boolean).join(' · ')}` : 'not met yet', 'mx-side');
  if (!known) {
    body.append(el('div', 'mx-q', '?'));
    body.append(el('p', 'mx-p', e.kind === 'anomaly' ? 'An anomaly nobody has sampled. Find an item that carries it in a run and take a residue sample.' : 'Something nobody has filed yet. Meet it, or scan it, in a run.'));
    body.append(btn('Back to the codex', () => openCodex(host)));
    return;
  }
  body.append(el('div', 'mx-tags', `<span class="t${Math.min(5, e.threat)}">THREAT ${e.threat}</span><span>${esc(e.cls.toUpperCase())}</span><span class="cx-s ${s}">${STATE_NAME[s]}</span>`));
  body.append(bar('RESEARCH', pct));
  const shown = notesShown(key);
  const notes = el('ul', 'mx-notes');
  e.notes.forEach((n, i) => notes.append(el('li', i < shown ? '' : 'cx-locked', i < shown ? esc(n) : `▒▒▒▒▒▒ ▒▒▒ ▒▒▒▒▒ · ${Math.round(((i + 1) / e.notes.length) * 100)}% research`)));
  body.append(el('h3', 'mx-h', 'FIELD NOTES <small>revealed by research</small>'), notes);
  const mine = bank().filter((q) => q.src === key);
  body.append(el('div', 'mx-small', `samples banked ever: ${sampledCount(key)} · in the fridge now: ${mine.length} · gives ${e.gives.map((k) => KIND_NAME[k].toLowerCase()).join(' / ')}`));
  // the prize
  const t = TOOLS[e.tool], lvl = toolLevel(e.tool);
  body.append(el('div', 'mx-power' + (s === 'complete' ? ' lit' : ''), `<small>${s === 'complete' ? 'PRIZE ISSUED' : 'COMPLETE IT FOR'}</small><b>${esc(t.name)}</b><span>${esc(t.text)}</span><em>${lvl ? `your issue: level ${lvl}/3` : 'not issued yet'} · each completed entry for it raises the issue</em>`));
  const acts = el('div', 'mx-acts');
  if (mine.length) acts.append(btn(`Process a sample (${mine.length})`, () => { closePanel(true); host.onProcess?.(mine.sort((a, b) => b.q - a.q)[0]); }, { cls: 'go', small: KIND_GAMES[mine[0].kind].join(' · ') }));
  acts.append(btn('Back to the codex', () => openCodex(host)));
  body.append(acts);
}

// ================================================================== the fridge
export function openFridge(host: PanelHost) {
  const s = bank();
  const body = frame(host, 'Sample fridge', s.length ? `${s.length} sample${s.length > 1 ? 's' : ''} banked · pick one for the benches` : 'empty', 'mx-side');
  if (!s.length) {
    body.append(el('p', 'mx-p', 'Nothing in the fridge. In a run: knock something down (a sedative dart, the foam, a good hit) or find a body, and Take sample. Anomalous items give residue. Feed samples to a Remittance Press to tube them here, or carry them out of the building. Die with them and they are lost.'));
    body.append(btn('The codex', () => openCodex(host)));
    return;
  }
  const list = el('div', 'cx-samples');
  for (const q of [...s].sort((a, b) => researchPct(a.src) - researchPct(b.src) || b.q - a.q)) {
    const e = entry(q.src);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'cx-sample k-' + q.kind;
    b.innerHTML = `<i></i><b>${esc(KIND_NAME[q.kind])} · ${esc(e?.name ?? q.src)}</b><small>quality ${Math.round(q.q * 100)}% · ${esc(KIND_GAMES[q.kind].join(' → '))}</small><em>${researchPct(q.src)}% researched</em>`;
    b.addEventListener('click', () => { sfx('confirm'); closePanel(true); host.onProcess?.(q); });
    list.append(b);
  }
  body.append(list);
  body.append(el('div', 'mx-small', 'three bench tests per sample · better results, more research · Esc skips a test at a cost'));
}

// ================================================================== the requisition
export function openReq(host: PanelHost) {
  const body = frame(host, 'Requisition', 'research tools for the next run', 'mx-wide');
  const redo = () => { host.onChange(); openReq(host); };
  const picked = req(), n = reqSlots();
  const slots = el('div', 'mx-slots');
  for (let i = 0; i < 3; i++) {
    const k = picked[i];
    if (i >= n) slots.append(el('div', 'mx-slot shut', `<b>LOCKED</b><small>${i === 1 ? 'complete 4 entries' : 'complete 10 entries'}</small>`));
    else if (k) slots.append(el('div', 'mx-slot full', `<b>${esc(TOOLS[k].name)}</b><small>×${TOOLS[k].count(toolLevel(k))} · level ${toolLevel(k)}</small>`));
    else slots.append(el('div', 'mx-slot', '<b>EMPTY SLOT</b><small>pick a tool below</small>'));
  }
  body.append(el('h3', 'mx-h', `KIT SLOTS <small>${picked.length}/${n} packed</small>`), slots);
  const grid = el('div', 'cx-tools');
  for (const k of TOOL_KEYS as ToolKey[]) {
    const t = TOOLS[k], lvl = toolLevel(k), on = picked.includes(k);
    const from = entries().filter((e) => e.tool === k);
    const done = from.filter((e) => entryState(e.key) === 'complete').length;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'cx-tool' + (lvl ? '' : ' locked') + (on ? ' on' : '');
    b.style.setProperty('--tc', hex(t.color));
    b.innerHTML = `<i></i><b>${esc(t.name)}</b><small>${lvl ? `level ${lvl}/3 · ×${t.count(lvl)} per run${t.passive ? ' · works carried' : ''}` : `locked · complete: ${esc(from.filter((e) => entryState(e.key) !== 'unknown').slice(0, 2).map((e) => e.name).join(', ') || 'an entry not met yet')}`}</small><span>${esc(t.text)}</span><em>${done}/${from.length} entries for it complete${on ? ' · PACKED' : ''}</em>`;
    if (!lvl) b.disabled = true;
    b.addEventListener('click', () => {
      if (on) { setReq(k, false); sfx('toggle'); redo(); return; }
      if (!setReq(k, true)) { sfx('error'); return; }
      sfx('confirm'); redo();
    });
    grid.append(b);
  }
  body.append(el('h3', 'mx-h', 'RESEARCH TOOLS <small>real items · your starting kit</small>'), grid);
  const kit = startingKit();
  body.append(el('div', 'mx-small', kit.length ? 'next run starts with: ' + esc(kitText(kit)) : 'next run starts with the issue kit only'));
  // the suit dye (commendations and codex milestones)
  const dyes = COSMETICS.filter((c) => c.locked && c.slot === 'suit');
  const worn = wornCos()[0] ?? null;
  body.append(el('h3', 'mx-h', 'SUIT DYE <small>worn into the next intake</small>'));
  const dg = el('div', 'mx-grid mx-tight');
  dg.append(btn('Programme yellow', () => { setWornCos([]); sfx('tick'); redo(); }, { cls: !worn ? 'on' : '' }));
  for (const d of dyes) { const b = btn(d.name, () => { setWornCos([d.key]); sfx('tick'); redo(); }, { cls: worn === d.key ? 'on' : '', off: isUnlocked('cos:' + d.key) ? null : 'a commendation or codex reward' }); b.style.setProperty('--sw', hex(d.color)); b.classList.add('sw'); dg.append(b); }
  body.append(dg);
  body.append(el('h3', 'mx-h', 'MILESTONES'));
  const ms = el('div', 'mx-list');
  for (const m of MILESTONES) ms.append(el('div', 'mx-li' + (hasMilestone(m.key) ? ' done' : ''), `<b>${esc(m.name)}</b><span>${esc(hasMilestone(m.key) ? m.text : m.need + ' · ' + m.text)}</span>`));
  body.append(ms, rpLine());
}
function kitText(keys: string[]): string {
  const n = new Map<string, number>();
  for (const k of keys) n.set(k, (n.get(k) ?? 0) + 1);
  return [...n].map(([k, c]) => `${hasItemDef(k) ? itemDef(k).name : k.replace(/_/g, ' ')}${c > 1 ? ' ×' + c : ''}`).join(', ');
}

// ================================================================== the Meridian file
export function openFile(host: PanelHost) {
  const body = frame(host, 'The Meridian file', 'your record with the Institute', 'mx-wide');
  const f = file();
  const st = codexStats();
  const nums: [string, string | number][] = [
    ['RP NOW', researchPoints()], ['RP EARNED', stat('rp_total')], ['RUNS', f.runs], ['DEATHS', deathCount()],
    ['CODEX', `${st.pct}%`], ['COMPLETE', `${st.complete} / ${st.total}`], ['PROCESSED', f.n.processed || 0], ['COMMENDATIONS', `${earnedCount()} / ${ACHIEVEMENTS.length}`],
  ];
  body.append(el('div', 'mx-nums', nums.map(([k, v]) => `<div><small>${k}</small><b>${esc(v)}</b></div>`).join('')));
  const last = f.last;
  if (last) { const d = last.discovered?.length ?? 0, bk = last.banked ?? 0, lo = last.lost ?? 0; body.append(el('div', 'mx-small', `last run: ${d} new entr${d === 1 ? 'y' : 'ies'} · ${bk} sample${bk === 1 ? '' : 's'} banked · ${lo} lost on the body`)); }
  if (f.killers.length) body.append(el('div', 'mx-small', 'last runs ended by: ' + esc(f.killers.slice(-3).join(' · '))));
  body.append(el('h3', 'mx-h', 'COMMENDATIONS'));
  const list = el('div', 'mx-ach');
  for (const a of ACHIEVEMENTS) {
    const got = earned(a.key);
    list.append(el('div', 'mx-a' + (got ? ' got' : ''), `<i></i><b>${esc(got ? a.name : '???')}</b><span>${esc(got ? a.text : 'Hint: ' + a.hint)}</span><em>${esc(rewardText(a.reward))}</em>`));
  }
  body.append(list);
}
