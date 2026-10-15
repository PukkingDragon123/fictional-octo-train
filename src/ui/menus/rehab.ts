// THE REHAB SECTION. Jobs are rehab programmes, filed as manila case files in
// a drawer; traits are conditions, X-ray films clipped to a psych-ward
// lightbox. Every one shows what it gives you (green) and what it costs you
// (red). Picking a programme stamps the file APPROVED; a sealed file is
// stamped DENIED with what it takes to open it. The lever at the side lets
// the Board decide: three reels deal a programme, an asset and a liability.
import { OCCUPATIONS, TRAITS, SKILLS, Occupation, Trait, occupationAvailable, traitAvailable, occupationByKey } from '../../survival/traits';
import { unlockProgress } from '../../survival/unlocks';
import { hasItemDef, itemDef } from '../../items/item';
import { itemIcon } from '../icons';
import { h, esc, sfx, hoverFocus } from './common';
import { toUrl, kitTheme, idPhoto } from '../pixelkit';
import { xrayFilm, xrayOf, stampWord } from './art';

export interface RehabCtx {
  occ: string;
  traits: Set<string>;
  points: () => number;
  onChange: () => void;
  readonly name: string;
  mugshot: () => ImageData | null;
}

const cr = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`;
let stampCache: Record<string, string> = {};
const stampUrl = (w: string, c: number) => (stampCache[w + c] ||= toUrl(stampWord(w, c, 2)));
const filmCache = new Map<string, string>();
const filmUrl = (t: Trait) => {
  let u = filmCache.get(t.key);
  if (!u) { u = toUrl(xrayFilm(xrayOf(t.key), [...t.key].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0, t.cost > 0)); filmCache.set(t.key, u); }
  return u;
};

export function rehabStation(ctx: RehabCtx) {
  stampCache = {};
  const el = h('div', 'rh-wrap');
  const top = h('div', 'rh-top', '<div class="rh-sign"><b>REHAB SECTION</b><span>programmes · conditions · credits</span></div><div class="rh-tip">Every programme and condition gives you something <i class="g">✚</i> and takes something <i class="b">✖</i>. Programmes cost or give credits; assets cost credits, liabilities pay them back. Finish at 0 or above.</div>');
  const cols = h('div', 'rh-cols');
  const left = h('div', 'rh-left');
  const right = h('div', 'rh-right');
  cols.append(left, right);
  el.append(top, cols);

  // ---------------- programmes: the file drawer and the open file
  const drawer = h('div', 'rh-drawer', '<header><b>PROGRAMMES</b><small>case files · drawer 4</small></header>');
  const tray = h('div', 'rh-tray');
  drawer.append(tray);
  const file = h('div', 'rh-file');
  left.append(drawer, file);
  let shown = ctx.occ;
  let photo = '';
  const renderFile = (key: string, stampKind: '' | 'APPROVED' | 'DENIED' = '') => {
    shown = key;
    const o = occupationByKey(key);
    const avail = occupationAvailable(o);
    const chosen = key === ctx.occ;
    const skills = Object.entries(o.skills).map(([k, v]) => `<span>${esc(SKILLS.find((s) => s.key === k)?.name || k)} <i>${'▮'.repeat(v as number)}</i></span>`).join('') || '<span class="none">no prior skills</span>';
    const kit = o.items.filter((k) => hasItemDef(k)).slice(0, 6).map((k) => `<img src="${itemIcon(k, '', 16)}" alt="${esc(itemDef(k).name)}" title="${esc(itemDef(k).name)}">`).join('');
    const prog = avail ? '' : Math.round(unlockProgress('job:' + key) * 100);
    file.innerHTML = `
      <div class="rh-file-tab">PROGRAMME</div>
      <div class="rh-file-head">
        <div class="rh-photo" style="${photo ? `background-image:url(${photo})` : ''}"><i class="clip"></i></div>
        <div class="rh-file-t"><small>SUBJECT · ${esc((ctx.name || 'UNNAMED').toUpperCase())}</small><h3>${esc(o.name)}</h3><em class="${o.points > 0 ? 'pos' : o.points < 0 ? 'neg' : ''}">${cr(o.points)} CREDITS</em></div>
      </div>
      <p class="rh-desc">${esc(o.desc)}</p>
      <div class="rh-line good"><i>✚</i><span>${esc(o.good || '')}</span></div>
      <div class="rh-line bad"><i>✖</i><span>${esc(o.bad || '')}</span></div>
      <div class="rh-skills">${skills}</div>
      ${kit ? `<div class="rh-kit"><small>ISSUED</small>${kit}</div>` : ''}
      ${avail ? '' : `<div class="rh-sealed"><b>SEALED</b><span>${esc(o.unlock?.hint || 'Not yet available.')}</span>${prog ? `<i style="--p:${prog}%"></i>` : ''}</div>`}
      <div class="rh-file-stamp ${stampKind ? 'on' : chosen && avail ? 'on still' : ''}">${stampKind === 'DENIED' || (!avail && stampKind) ? `<img src="${stampUrl('DENIED', 0xc8261e)}" alt="DENIED">` : chosen || stampKind ? `<img src="${stampUrl('APPROVED', 0x2a7a3a)}" alt="APPROVED">` : ''}</div>`;
  };
  const tabs: HTMLButtonElement[] = [];
  OCCUPATIONS.forEach((o) => {
    const avail = occupationAvailable(o);
    const b = h('button', 'rh-ftab' + (avail ? '' : ' locked') + (o.key === ctx.occ ? ' on' : ''), `<span class="n">${esc(o.name)}</span><span class="c ${o.points > 0 ? 'pos' : o.points < 0 ? 'neg' : ''}">${cr(o.points)}</span>${avail ? '' : '<i class="lk"></i>'}`);
    b.type = 'button';
    b.dataset.key = o.key;
    hoverFocus(b, 'hover');
    b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') renderFile(o.key); });
    b.addEventListener('focus', () => renderFile(o.key));
    b.addEventListener('pointerleave', () => { if (document.activeElement !== b) renderFile(ctx.occ); });
    b.onclick = () => {
      if (!avail) { sfx('error'); renderFile(o.key, 'DENIED'); b.classList.remove('deny'); void b.offsetWidth; b.classList.add('deny'); return; }
      if (ctx.occ === o.key) { renderFile(o.key); return; }
      ctx.occ = o.key;
      sfx('stamp');
      tabs.forEach((t) => t.classList.toggle('on', t === b));
      renderFile(o.key, 'APPROVED');
      ctx.onChange();
      refreshFilms();
    };
    tray.append(b);
    tabs.push(b);
  });

  // ---------------- conditions: the lightbox
  const box = h('div', 'rh-lightbox', '<header><b>CONDITIONS</b><small>lightbox 3 · clip a film to take it</small></header>');
  const banks = h('div', 'rh-banks');
  const reader = h('div', 'rh-reader');
  box.append(banks, reader);
  right.append(box);
  const films = new Map<string, HTMLButtonElement>();
  const conflictOf = (t: Trait) => (!ctx.traits.has(t.key) ? TRAITS.find((x) => ctx.traits.has(x.key) && ((t.excl || []).includes(x.key) || (x.excl || []).includes(t.key))) : undefined);
  const read = (t: Trait | null) => {
    if (!t) {
      const picked = [...ctx.traits].map((k) => TRAITS.find((x) => x.key === k)?.name).filter(Boolean);
      reader.innerHTML = `<b class="rh-r-n">${picked.length ? 'ON FILE' : 'NO CONDITIONS ON FILE'}</b><span class="rh-r-list">${picked.length ? esc(picked.join(' · ')) : 'Point at a film to read it. Click to clip it on.'}</span>`;
      return;
    }
    const avail = traitAvailable(t), conflict = conflictOf(t);
    reader.innerHTML = `<b class="rh-r-n">${esc(t.name)} <em class="${t.cost < 0 ? 'neg' : 'pos'}">${cr(-t.cost)} CR</em></b>
      <div class="rh-line good"><i>✚</i><span>${esc(t.good || '')}</span></div>
      <div class="rh-line bad"><i>✖</i><span>${esc(t.bad || '')}</span></div>
      ${!avail ? `<div class="rh-r-warn">SEALED · ${esc(t.unlock?.hint || 'Not yet available.')}</div>` : conflict ? `<div class="rh-r-warn">CONFLICTS WITH ${esc(conflict.name.toUpperCase())}</div>` : ''}`;
  };
  const refreshFilms = () => {
    for (const t of TRAITS) {
      const b = films.get(t.key);
      if (!b) continue;
      const on = ctx.traits.has(t.key);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('blocked', !!conflictOf(t));
    }
  };
  const bank = (title: string, list: Trait[], cls: string) => {
    const s = h('section', 'rh-bank ' + cls, `<h4>${esc(title)}</h4>`);
    const g = h('div', 'rh-films');
    for (const t of list) {
      const avail = traitAvailable(t);
      const b = h('button', 'rh-film' + (avail ? '' : ' locked'), `<img src="${filmUrl(t)}" alt=""><span class="n">${esc(t.name)}</span><span class="c">${cr(-t.cost)}</span><i class="clip"></i>`);
      b.type = 'button';
      b.title = '';
      b.setAttribute('aria-label', `${t.name}, ${t.cost < 0 ? 'costs ' + -t.cost : 'gives ' + t.cost} credits. Good: ${t.good}. Bad: ${t.bad}`);
      hoverFocus(b);
      b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') read(t); });
      b.addEventListener('focus', () => read(t));
      b.onclick = () => {
        read(t);
        if (!avail || conflictOf(t)) { sfx('error'); b.classList.remove('deny'); void b.offsetWidth; b.classList.add('deny'); return; }
        if (ctx.traits.has(t.key)) { ctx.traits.delete(t.key); sfx('back'); }
        else { ctx.traits.add(t.key); sfx('stamp', 0.5); b.classList.remove('clipped'); void b.offsetWidth; b.classList.add('clipped'); }
        refreshFilms();
        ctx.onChange();
      };
      films.set(t.key, b);
      g.append(b);
    }
    s.append(g);
    return s;
  };
  const isNew = (t: Trait) => ['hoarder', 'snitch', 'lifer', 'wrecking_ball', 'sweet_on_sarge', 'gallows_humour', 'fresh_fish', 'born_in_debt', 'band_picker'].includes(t.key);
  banks.append(
    bank('REMITTANCE CONDITIONS · both ways', TRAITS.filter(isNew), 'mixed'),
    bank('ASSETS · cost credits', TRAITS.filter((t) => t.cost < 0 && !isNew(t)), 'assets'),
    bank('LIABILITIES · pay credits', TRAITS.filter((t) => t.cost > 0 && !isNew(t)), 'liabs'),
  );
  box.addEventListener('pointerleave', () => read(null));

  // ---------------- the Board decides (slot machine)
  const lever = h('button', 'rh-lever', '<i></i><b>LET THE BOARD DECIDE</b><small>a programme, an asset, a liability</small>');
  (lever as HTMLButtonElement).type = 'button';
  hoverFocus(lever);
  lever.onclick = () => roll();
  top.append(lever);
  const slot = h('div', 'rh-slot');
  el.append(slot);
  let spinning = false;
  const deal = () => {
    const jobs = OCCUPATIONS.filter(occupationAvailable);
    const assets = TRAITS.filter((t) => t.cost < 0 && traitAvailable(t));
    const liabs = TRAITS.filter((t) => t.cost > 0 && traitAvailable(t));
    const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    for (let i = 0; i < 80; i++) {
      const j = pick(jobs), a = pick(assets), l = pick(liabs);
      if (!j || !a || !l) break;
      if ((a.excl || []).includes(l.key) || (l.excl || []).includes(a.key)) continue;
      if (j.points + a.cost + l.cost < 0) continue;
      return { j, a, l };
    }
    return null;
  };
  const roll = () => {
    if (spinning) return;
    const d = deal();
    if (!d) { sfx('error'); return; }
    spinning = true;
    sfx('confirm');
    lever.classList.remove('pull'); void lever.offsetWidth; lever.classList.add('pull');
    slot.innerHTML = `<div class="rh-slot-in">
      <header><b>THE BOARD DECIDES</b><small>remittance programme assignment</small></header>
      <div class="rh-reels"><div class="rh-reel"><small>PROGRAMME</small><b></b></div><div class="rh-reel"><small>ASSET</small><b></b></div><div class="rh-reel"><small>LIABILITY</small><b></b></div></div>
      <div class="rh-slot-lines"></div>
      <div class="rh-slot-btns"></div></div>`;
    slot.classList.add('on');
    const reels = [...slot.querySelectorAll('.rh-reel b')] as HTMLElement[];
    const pools = [OCCUPATIONS.map((o) => o.name), TRAITS.filter((t) => t.cost < 0).map((t) => t.name), TRAITS.filter((t) => t.cost > 0).map((t) => t.name)];
    const finals = [d.j.name, d.a.name, d.l.name];
    const stopAt = [1100, 1800, 2500].map((t) => performance.now() + t);
    let lastT = 0;
    const spin = (now: number) => {
      if (!slot.isConnected) return;
      let all = true;
      reels.forEach((r, i) => {
        if (now >= stopAt[i]) { if (r.dataset.done !== '1') { r.dataset.done = '1'; r.textContent = finals[i]; r.parentElement!.classList.add('stop'); sfx('stamp', 0.5); } return; }
        all = false;
        const left = stopAt[i] - now;
        const rate = left < 500 ? 140 : left < 900 ? 90 : 50;
        if (now - (Number(r.dataset.t) || 0) > rate) { r.dataset.t = String(now); r.textContent = pools[i][Math.floor(Math.random() * pools[i].length)]; r.classList.remove('roll'); void r.offsetWidth; r.classList.add('roll'); if (now - lastT > 45) { sfx('tick'); lastT = now; } }
      });
      if (!all) { requestAnimationFrame(spin); return; }
      sfx('unlock');
      const lines = slot.querySelector('.rh-slot-lines') as HTMLElement;
      lines.innerHTML = [d.j as Occupation | Trait, d.a, d.l].map((x) => `<div class="rh-line good"><i>✚</i><span>${esc(x.good || '')}</span></div><div class="rh-line bad"><i>✖</i><span>${esc(x.bad || '')}</span></div>`).join('<hr>');
      const btns = slot.querySelector('.rh-slot-btns') as HTMLElement;
      const mk = (label: string, cls: string, fn: () => void) => { const b = h('button', 'rh-sb ' + cls, label); b.type = 'button'; hoverFocus(b); b.onclick = fn; btns.append(b); return b; };
      const accept = mk('ACCEPT ASSIGNMENT', 'ok', () => {
        ctx.occ = d.j.key;
        ctx.traits.clear();
        ctx.traits.add(d.a.key); ctx.traits.add(d.l.key);
        sfx('stamp');
        closeSlot();
        tabs.forEach((t) => t.classList.toggle('on', t.dataset.key === d.j.key));
        renderFile(d.j.key, 'APPROVED');
        refreshFilms(); read(null);
        ctx.onChange();
      });
      mk('SPIN AGAIN', '', () => { closeSlot(); roll(); });
      mk('WALK AWAY', 'no', () => { sfx('back'); closeSlot(); });
      spinning = false;
      accept.focus({ preventScroll: true });
    };
    requestAnimationFrame(spin);
  };
  const closeSlot = () => { slot.classList.remove('on'); slot.innerHTML = ''; spinning = false; };

  // ---------------- api
  renderFile(ctx.occ);
  read(null);
  refreshFilms();
  return {
    el,
    enter() {
      // the subject's mugshot goes on every file
      try { const snap = ctx.mugshot(); if (snap) photo = toUrl(idPhoto(kitTheme(), snap)); } catch { /* no photo */ }
      renderFile(ctx.occ);
      refreshFilms();
      read(null);
    },
    refresh() { refreshFilms(); },
    deny(msg: string) {
      reader.innerHTML = `<b class="rh-r-n">DENIED</b><div class="rh-r-warn">${esc(msg)}</div>`;
      reader.classList.remove('flash'); void reader.offsetWidth; reader.classList.add('flash');
    },
    destroy() { closeSlot(); },
    roll,
  };
}
