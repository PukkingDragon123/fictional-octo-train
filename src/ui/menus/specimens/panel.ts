// The containment wing's paperwork, on riveted console plates in Alagard
// (the creator's house style, creator/creator.css):
//   openSpecimen(host, key)  one specimen: name, notes, study bar, its power,
//                            complete the study / harvest / equip / deploy as pet
//   openLoadout(host)        the next run: power slots, the pet and its hat and
//                            glow, the suit dye, the milestones
//   openFile(host)           the Meridian file: the numbers, and every commendation
//                            (earned, or locked with a hint)
// One overlay at a time; Esc / B / the backdrop closes it. Every change is
// written to the Meridian file at once (src/game/meridian.ts) and host.onChange()
// lets the wing re-read it.
import './panel.css';
import { FocusNav } from '../nav';
import { sfx } from '../sfx';
import { species } from '../../../creatures/registry';
import { researchPoints } from '../../../game/research';
import { stat, isUnlocked } from '../../../game/profile';
import { ruleLearned } from '../../../creatures/rules';
import {
  catalogue, isDiscovered, isStudied, studyPct, studyCost, researchStudy, powerOf, ownsPower, harvest, PERKS,
  isPetSpecies, canDeploy, loadout, setPower, setPet, equipBlock, slots, MILESTONES, hasMilestone, PET_HATS, PET_TINTS, petItemOwned, setPetLook,
  setWornCos, wornCos, file, studiedCount, discoveredCount, deathCount, STARTER_PET, startingKit,
} from '../../../game/meridian';
import { ACHIEVEMENTS, earned, earnedCount, rewardText, petted } from '../../../game/achievements';
import { COSMETICS } from '../../../game/cosmetics';

export interface PanelHost { root: HTMLElement; onChange: () => void; onClose?: () => void }

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c]);
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

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
function frame(host: PanelHost, title: string, sub: string, cls = ''): HTMLElement {
  const keep = cur?.over.scrollTop;
  closePanel(true);
  const over = document.createElement('div');
  over.className = 'mx-over ' + cls;
  over.innerHTML = `<div class="mx-pan" role="dialog" aria-label="${esc(title)}"><div class="mx-head"><b>${esc(title)}</b><small>${esc(sub)}</small><button type="button" class="mx-x" aria-label="Close (Esc)">✕</button></div><div class="mx-body"></div></div>`;
  over.addEventListener('pointerdown', (e) => { if (e.target === over) closePanel(); });
  over.querySelector('.mx-x')!.addEventListener('click', () => closePanel());
  // on the body (above the room's guide and its captions)
  document.body.append(over);
  requestAnimationFrame(() => over.classList.add('on'));
  const nav = new FocusNav(over, { onBack: () => closePanel(), autofocus: true });
  cur = { over, nav, host };
  void keep;
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

// ================================================================== a specimen
export function openSpecimen(host: PanelHost, key: string) {
  if (key === 'hush' && !species('hush')) return;
  const sp: any = species(key);
  if (!sp) return;
  const disc = isDiscovered(key), st = isStudied(key), pct = studyPct(key), pw = powerOf(key);
  const code = String(sp.code ?? '').split('//');
  const body = frame(host, disc ? String(sp.name) : 'Uncatalogued', disc ? `${code[0]?.trim() ?? ''}${code[1] ? ' · ' + code[1].trim() : ''}` : 'an empty cell', 'mx-side');
  const redo = () => { host.onChange(); openSpecimen(host, key); };
  if (!disc) {
    body.append(el('p', 'mx-p', 'Nothing has been filed for this cell yet. See one in the field, or scan it, and the Institute will move one in.'));
    body.append(el('div', 'mx-q', '?'));
    body.append(rpLine());
    return;
  }
  const threat = sp.threat ?? 0;
  body.append(el('div', 'mx-tags', `<span class="t${Math.min(5, threat)}">THREAT ${threat}</span><span>${esc(String(sp.scan?.cls ?? 'Entity').toUpperCase())}</span>${isPetSpecies(key) ? '<span class="pet">PET</span>' : ''}`));
  body.append(el('div', 'mx-bar', `<span>STUDIED</span><i style="--p:${pct}%"></i><b>${pct}%</b>`));
  const notes: string[] = [...(sp.scan?.notes ?? [])].slice(0, pct >= 60 ? 4 : pct >= 25 ? 2 : 1);
  if (sp.rule && (ruleLearned(key) || st)) notes.push(`RULE · ${sp.rule.name}: ${sp.rule.text}`);
  const ul = el('ul', 'mx-notes');
  for (const n of notes) { const li = document.createElement('li'); li.textContent = n; ul.append(li); }
  if (pct < 60) { const li = document.createElement('li'); li.className = 'mx-dim'; li.textContent = 'More notes as the study goes on: sightings, scans, its rule, kills.'; ul.append(li); }
  body.append(ul);
  const scans = stat(`scan_n:creature:${key}`);
  body.append(el('div', 'mx-small', `${scans ? `scanned ${scans}×` : isUnlocked('scan:creature:' + key) ? 'scanned' : 'never scanned'} · seen ${file().seen[key] ?? (key === STARTER_PET ? 1 : 0)}×`));
  const acts = el('div', 'mx-acts');
  if (!st) {
    const cost = studyCost(key);
    acts.append(btn(`Complete the study`, () => { if (researchStudy(key)) { sfx('unlock'); redo(); } else sfx('error'); }, { small: `${cost} RP`, cls: 'go', off: researchPoints() < cost ? `needs ${cost} RP` : null }));
  }
  // the power
  if (pw) {
    const box = el('div', 'mx-power' + (st ? ' lit' : ''), `<small>HARVESTABLE POWER</small><b>${esc(pw.name)}</b><span>${esc(pw.text)}</span>`);
    body.append(box);
    if (st && !ownsPower(key)) acts.append(btn('Harvest', () => { if (harvest(key)) { sfx('unlock'); redo(); } else sfx('error'); }, { small: `${pw.cost} RP`, cls: 'go', off: researchPoints() < pw.cost ? `needs ${pw.cost} RP` : null }));
    if (ownsPower(key)) {
      const on = loadout().powers.includes(key), why = on ? null : equipBlock(key);
      acts.append(btn(on ? 'Unequip power' : 'Equip power', () => { setPower(key, !on); sfx(on ? 'toggle' : 'confirm'); redo(); }, { off: why, small: why ?? (on ? 'in the loadout' : `${loadout().powers.length}/${slots()} slots`) }));
    }
    if (!st) box.append(el('em', '', 'Study it to 100% to harvest this.'));
  }
  if (isPetSpecies(key)) {
    const dep = loadout().pet === key;
    acts.append(btn(dep ? 'Recall pet' : 'Deploy as pet', () => { setPet(dep ? null : key); sfx(dep ? 'toggle' : 'confirm'); redo(); }, { off: canDeploy(key) ? null : 'study it first', small: dep ? 'comes on the next run' : 'one pet per run', cls: dep ? '' : 'go' }));
  }
  if (key === STARTER_PET) acts.append(btn('Pet her', () => { petted(); sfx('tick'); host.onChange(); }, { small: 'through the glass' }));
  body.append(acts);
  body.append(rpLine());
}

// ================================================================== the loadout
export function openLoadout(host: PanelHost) {
  const body = frame(host, 'Loadout', 'for the next run', 'mx-wide');
  const redo = () => { host.onChange(); openLoadout(host); };
  const L = loadout();
  // power slots
  body.append(el('h3', 'mx-h', `POWERS <small>${L.powers.length} / ${slots()} slots</small>`));
  const slotsRow = el('div', 'mx-slots');
  for (let i = 0; i < 3; i++) {
    const k = L.powers[i], pw = k ? powerOf(k) : null, open = i < slots();
    const s = el('div', 'mx-slot' + (pw ? ' full' : '') + (open ? '' : ' shut'), pw ? `<b>${esc(pw.name)}</b><small>${esc(PERKS[pw.perk]?.name ?? '')}</small>` : open ? '<small>empty</small>' : `<small>${esc(MILESTONES.find((m) => m.key === (i === 1 ? 'slot2' : 'slot3'))?.need ?? 'locked')}</small>`);
    slotsRow.append(s);
  }
  body.append(slotsRow);
  const owned = catalogue().filter((s) => ownsPower(s.key));
  if (!owned.length) body.append(el('p', 'mx-p mx-dim', 'No powers harvested yet. Study a specimen to 100% in its cell, then harvest its power.'));
  const grid = el('div', 'mx-grid');
  for (const s of owned) {
    const pw = powerOf(s.key)!, on = L.powers.includes(s.key), why = on ? null : equipBlock(s.key);
    grid.append(btn(pw.name, () => { setPower(s.key, !on); sfx(on ? 'toggle' : 'confirm'); redo(); }, { cls: on ? 'on' : '', off: why, small: on ? 'equipped' : why ?? pw.text }));
  }
  body.append(grid);
  // the pet
  body.append(el('h3', 'mx-h', 'PET <small>one per run</small>'));
  const pets = el('div', 'mx-grid');
  pets.append(btn('No pet', () => { setPet(null); sfx('toggle'); redo(); }, { cls: !L.pet ? 'on' : '' }));
  for (const s of catalogue().filter((q) => isPetSpecies(q.key) && isDiscovered(q.key))) {
    const ok = canDeploy(s.key);
    pets.append(btn(String(s.name), () => { setPet(s.key); sfx('confirm'); redo(); }, { cls: L.pet === s.key ? 'on' : '', off: ok ? null : 'study it first', small: L.pet === s.key ? 'deployed' : ok ? 'deploy' : `${studyPct(s.key)}% studied` }));
  }
  body.append(pets);
  if (L.pet === STARTER_PET) {
    const look = el('div', 'mx-grid mx-tight');
    look.append(btn('Bare head', () => { setPetLook(null, L.petTint); sfx('tick'); redo(); }, { cls: !L.petHat ? 'on' : '' }));
    for (const h of PET_HATS) look.append(btn(h.name, () => { setPetLook(h.key, L.petTint); sfx('tick'); redo(); }, { cls: L.petHat === h.key ? 'on' : '', off: petItemOwned(h.key) ? null : 'a commendation reward' }));
    for (const t of PET_TINTS) { const b = btn(t.name, () => { setPetLook(L.petHat, t.key); sfx('tick'); redo(); }, { cls: (L.petTint ?? 'tint_teal') === t.key ? 'on' : '', off: petItemOwned(t.key) ? null : 'a commendation reward' }); b.style.setProperty('--sw', hex(t.color)); b.classList.add('sw'); look.append(b); }
    body.append(look);
  }
  // the suit dye (commendations)
  const dyes = COSMETICS.filter((c) => c.locked && c.slot === 'suit');
  const worn = wornCos()[0] ?? null;
  body.append(el('h3', 'mx-h', 'SUIT DYE <small>worn into the next intake</small>'));
  const dg = el('div', 'mx-grid mx-tight');
  dg.append(btn('Programme yellow', () => { setWornCos([]); sfx('tick'); redo(); }, { cls: !worn ? 'on' : '' }));
  for (const d of dyes) { const b = btn(d.name, () => { setWornCos([d.key]); sfx('tick'); redo(); }, { cls: worn === d.key ? 'on' : '', off: isUnlocked('cos:' + d.key) ? null : 'a commendation reward' }); b.style.setProperty('--sw', hex(d.color)); b.classList.add('sw'); dg.append(b); }
  body.append(dg);
  // milestones
  body.append(el('h3', 'mx-h', 'MILESTONES'));
  const ms = el('div', 'mx-list');
  for (const m of MILESTONES) ms.append(el('div', 'mx-li' + (hasMilestone(m.key) ? ' done' : ''), `<b>${esc(m.name)}</b><span>${esc(hasMilestone(m.key) ? m.text : m.need)}</span>`));
  body.append(ms);
  const kit = startingKit();
  if (kit.length) body.append(el('div', 'mx-small', 'starting kit: ' + esc(kit.join(', ').replace(/_/g, ' '))));
  body.append(rpLine());
}

// ================================================================== the Meridian file
export function openFile(host: PanelHost) {
  const body = frame(host, 'The Meridian file', 'your record with the Institute', 'mx-wide');
  const f = file();
  const n = catalogue().length;
  const nums: [string, string | number][] = [
    ['RP NOW', researchPoints()], ['RP EARNED', stat('rp_total')], ['RUNS', f.runs], ['DEATHS', deathCount()],
    ['DISCOVERED', `${discoveredCount()} / ${n}`], ['STUDIED', `${studiedCount()} / ${n}`], ['POWERS', f.powers.length], ['COMMENDATIONS', `${earnedCount()} / ${ACHIEVEMENTS.length}`],
  ];
  body.append(el('div', 'mx-nums', nums.map(([k, v]) => `<div><small>${k}</small><b>${esc(v)}</b></div>`).join('')));
  if (f.killers.length) body.append(el('div', 'mx-small', 'last runs ended by: ' + esc(f.killers.slice(-3).join(' · '))));
  body.append(el('h3', 'mx-h', 'COMMENDATIONS'));
  const list = el('div', 'mx-ach');
  for (const a of ACHIEVEMENTS) {
    const got = earned(a.key);
    list.append(el('div', 'mx-a' + (got ? ' got' : ''), `<i></i><b>${esc(got ? a.name : '???')}</b><span>${esc(got ? a.text : 'Hint: ' + a.hint)}</span><em>${esc(rewardText(a.reward))}</em>`));
  }
  body.append(list);
}
