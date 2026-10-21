// AUGMENT BAY 03 — the character creator's last stop. After the look (and the
// gender press) the menus call startSurgery(app, onDone): a robot gantry
// carries the subject onto the operating table (stage.ts). Click an arm, a
// hand, a leg, the eyes, the jaw, the spine or the skin to swap the flesh for
// hardware (only the Scrapjack Arm to begin with; the rest is researched on
// the watch, branch 'cyber', or found in a run); click the brain to install
// WARES: programmes as chips (the occupations) and conditions as wares (the
// traits), each with what it gives and what it costs, paid in ware credits.
// SEAL & DISCHARGE hands back {occupation, traits, cyber}; the loadout is also
// left for the next new survivor (src/survival/cyber.ts setPendingLoadout).
import type { Appearance, Outfit } from '../../entities/humanRig';
import { OCCUPATIONS, TRAITS, SKILLS, Occupation, Trait, occupationAvailable, traitAvailable, occupationByKey, chipCode, wareCode } from '../../survival/traits';
import { unlockProgress } from '../../survival/unlocks';
import { CYBER_SLOTS, CyberSlot, SLOT_CODE, SLOT_NAME, SLOT_KIND, partsFor, cyberDef, slotConflicts, CyberDef } from '../../survival/cyberParts';
import { partUnlocked, partHint, setPendingLoadout } from '../../survival/cyber';
import { researchPoints } from '../../game/research';
import { Player } from '../../entities/player';
import { hasItemDef } from '../../items/item';
import { SurgeryStage, Pick } from './stage';
import { csfx } from './audio';
import './surgery.css';

export interface SurgeryResult { occupation: string; traits: string[]; cyber: Record<string, string> }
export interface SurgeryOpts {
  /** the subject's name / number for the header */
  name?: string;
  /** what the subject wears on the table (default: the jumpsuit look the caller passes, or underwear) */
  outfit?: Outfit;
  occupation?: string; traits?: string[]; cyber?: Record<string, string>;
  /** where to mount (default document.body) */
  host?: HTMLElement;
}

const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c]);
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
/** the Remittance jumpsuit and slip-ons, dressed the game's own way (a throwaway Player-shaped object) */
function jumpsuitOutfit(): Outfit {
  const fake: any = { worn: new Map(), handR: null, handL: null, lightItem: null, outfitDirty: false, cond: null };
  for (const k of ['prison_jumpsuit', 'canvas_slipons']) {
    if (!hasItemDef(k)) continue;
    try { Player.prototype.wear.call(fake, { uid: 0, key: k, cond: 1, age: 0 } as any); } catch { /* not wearable */ }
  }
  try { return Player.prototype.computeOutfit.call(fake); } catch { return {}; }
}
const cr = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`;
const pct = (v: number) => `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}%`;

/** the stat chips under a part's name */
function fxChips(d: CyberDef): string {
  const f = d.fx, out: string[] = [];
  const chip = (txt: string, good: boolean) => out.push(`<i class="${good ? 'g' : 'b'}">${txt}</i>`);
  if (f.attack) chip(`ATK ${pct(f.attack)}`, f.attack > 0);
  if (f.action) chip(`HANDS ${pct(-f.action)}`, f.action < 0);
  if (f.aim) chip(`AIM ${pct(f.aim)}`, f.aim > 0);
  if (f.move) chip(`SPD ${pct(f.move)}`, f.move > 0);
  if (f.carry) chip(`CARRY +${f.carry}KG`, true);
  if (f.kick) chip(`SHOVE ${pct(f.kick)}`, true);
  if (f.armor) chip(`ARMOUR ${Math.round(f.armor * 100)}%`, true);
  if (f.noise) chip(`NOISE ${f.noise}`, false);
  if (f.rust) chip('RUSTS', false);
  if (f.drain) chip(`CELL −${f.drain}%/H`, false);
  if (f.cold) chip('COLD', false);
  chip(`${d.weight}KG`, false);
  return out.join('');
}

export function startSurgery(app: Appearance, onDone: (r: SurgeryResult | null) => void, opts: SurgeryOpts = {}): { close: () => void; el: HTMLElement } {
  let occ = opts.occupation && occupationAvailable(occupationByKey(opts.occupation)) ? opts.occupation : 'unemployed';
  const traits = new Set((opts.traits || []).filter((k) => { const t = TRAITS.find((x) => x.key === k); return !!t && traitAvailable(t); }));
  const points = () => { let p = occupationByKey(occ).points; for (const k of traits) p += TRAITS.find((x) => x.key === k)?.cost ?? 0; return p; };
  let closed = false;

  const root = h('div', 'sg-root');
  const view = h('div', 'sg-view');
  const tags = h('div', 'sg-tags');
  const head = h('header', 'sg-head', `
    <div class="sg-logo"><b class="sg-glitch" data-t="AUGMENT BAY 03">AUGMENT BAY 03</b><span>MERIDIAN INSTITUTE · REMITTANCE PROGRAMME · SUBJECT ${esc((opts.name || 'UNNAMED').toUpperCase())} · CONSENT: ASSUMED</span></div>
    <div class="sg-meter sg-cred"><span>WARE CREDITS</span><b>0</b></div>
    <div class="sg-meter sg-rp"><span>RESEARCH</span><b>${researchPoints()} RP</b></div>`);
  const left = h('aside', 'sg-left');
  const panel = h('aside', 'sg-panel');
  const foot = h('footer', 'sg-foot');
  const hint = h('div', 'sg-hint', 'Click a limb to swap it for hardware · click the <b>brain</b> to install wares');
  const rnd = h('button', 'sg-btn sg-ghost', '⟲ LET THE MACHINE DECIDE');
  const go = h('button', 'sg-btn sg-go', 'SEAL &amp; DISCHARGE ▸');
  foot.append(hint, rnd, go);
  const fx = h('div', 'sg-fx');
  const stamp = h('div', 'sg-stamp', 'DISCHARGED');
  root.append(view, fx, tags, head, left, panel, foot, stamp);
  (opts.host || document.body).append(root);

  const stage = new SurgeryStage(view, 'intake');
  const outfit: Outfit = opts.outfit || jumpsuitOutfit();
  const sev: string[] = [];
  const load: Record<string, string> = {};
  for (const [s, k] of Object.entries(opts.cyber || {})) { const d = cyberDef(k); if (d && partUnlocked(d)) load[s] = k; }
  stage.setSubject(app, outfit, load as any, sev);
  stage.setRack(CYBER_SLOTS.filter((s) => s === 'arm_r' || s === 'leg_r' || s === 'hand_r' || s === 'eyes').flatMap((s) => partsFor(s).map((d) => ({ key: d.key, slot: s, unlocked: partUnlocked(d) }))));

  // ---------------- markers on the body
  const PICKS: Pick[] = [...CYBER_SLOTS, 'brain'];
  const marks = new Map<Pick, HTMLButtonElement>();
  const markLabel = (p: Pick) => {
    if (p === 'brain') return `<b>BRAIN</b><small>${esc(occupationByKey(occ).name)} · ${traits.size} WARE${traits.size === 1 ? '' : 'S'}</small>`;
    const k = stage.load[p]; const d = cyberDef(k);
    return `<b>${SLOT_CODE[p]}</b><small>${d ? esc(d.name) : 'FLESH'}</small>`;
  };
  for (const p of PICKS) {
    const b = h('button', `sg-mark${p === 'brain' ? ' brain' : ''}`) as HTMLButtonElement;
    b.innerHTML = markLabel(p);
    b.setAttribute('aria-label', p === 'brain' ? 'Brain: install wares' : `${SLOT_NAME[p as CyberSlot]}: swap hardware`);
    b.addEventListener('click', (e) => { e.stopPropagation(); open(p); });
    b.addEventListener('pointerenter', () => { stage.setHover(p); csfx('cy_beep', 0.12); });
    b.addEventListener('pointerleave', () => stage.setHover(null));
    tags.append(b); marks.set(p, b);
  }
  stage.onHover = (p) => { for (const [k, b] of marks) b.classList.toggle('hot', k === p); view.style.cursor = p ? 'pointer' : ''; };
  view.addEventListener('click', (e) => {
    if (stage.busy) { stage.hurry = true; return; }
    const r = view.getBoundingClientRect();
    const p = stage.pickAt(e.clientX - r.left, e.clientY - r.top);
    if (p) open(p); else if (selected) open(null);
  });
  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    root.classList.toggle('busy', stage.busy);
    for (const [p, b] of marks) {
      const s = stage.toScreen(stage.anchor(p));
      if (!s) { b.style.display = 'none'; continue; }
      b.style.display = '';
      b.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px)`;
    }
  };
  raf = requestAnimationFrame(tick);

  // ---------------- left: the readout
  const renderLeft = () => {
    const o = occupationByKey(occ);
    const rows = CYBER_SLOTS.map((s) => { const d = cyberDef(stage.load[s]); return `<li class="${d ? 'hw' : ''}"><span>${SLOT_CODE[s]}</span><b>${d ? esc(d.name) : 'flesh'}</b></li>`; }).join('');
    const wares = [...traits].map((k) => TRAITS.find((t) => t.key === k)).filter(Boolean).map((t) => `<li class="${t!.cost > 0 ? 'neg' : 'pos'}"><span>${wareCode(t!)}</span><b>${esc(t!.name)}</b></li>`).join('') || '<li class="none"><b>no wares</b></li>';
    left.innerHTML = `
      <section><h3>VITALS</h3><div class="sg-vit"><span>SEDATION</span><b>${stage.busy ? '12%' : '31%'}</b></div><div class="sg-vit"><span>RESTRAINTS</span><b>LOCKED</b></div></section>
      <section><h3>HARDWARE</h3><ul class="sg-list">${rows}</ul></section>
      <section><h3>PROGRAMME</h3><ul class="sg-list"><li class="chip"><span>${chipCode(o)}</span><b>${esc(o.name)}</b></li></ul></section>
      <section><h3>WARES</h3><ul class="sg-list">${wares}</ul></section>`;
  };
  const credEl = head.querySelector('.sg-cred b') as HTMLElement;
  const refresh = () => {
    const p = points();
    credEl.textContent = cr(p);
    head.querySelector('.sg-cred')!.classList.toggle('bad', p < 0);
    go.classList.toggle('off', p < 0);
    for (const [k, b] of marks) b.innerHTML = markLabel(k);
    for (const [k, b] of marks) b.classList.toggle('on', k === selected);
    for (const s of CYBER_SLOTS) marks.get(s)!.classList.toggle('hw', !!stage.load[s]);
    renderLeft();
  };

  // ---------------- the panel
  let selected: Pick | null = null;
  let brainTab: 'chips' | 'wares' = 'chips';
  let wareTab: 'assets' | 'liabilities' = 'assets';
  const open = (p: Pick | null) => {
    if (stage.busy) return;
    selected = p;
    stage.select(p);
    panel.classList.toggle('on', !!p);
    root.classList.toggle('panel', !!p);
    if (p) csfx('cy_servo', 0.25);
    renderPanel();
    refresh();
  };
  const renderPanel = () => {
    panel.innerHTML = '';
    if (!selected) return;
    const close = h('button', 'sg-x', '✕');
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => open(null));
    if (selected === 'brain') { renderBrain(close); return; }
    const slot = selected as CyberSlot;
    const cur = stage.load[slot];
    const blockedBy = slotConflicts(slot).find((s) => !!stage.load[s]);
    panel.append(close, h('div', 'sg-ph', `<small>${SLOT_CODE[slot]} //</small><b>${esc(SLOT_NAME[slot].toUpperCase())}</b><span>CURRENT: ${cur ? esc(cyberDef(cur)!.name.toUpperCase()) : 'FLESH'}</span>`));
    if (blockedBy) panel.append(h('div', 'sg-note', `The ${esc(cyberDef(stage.load[blockedBy])!.name)} on the ${esc(SLOT_NAME[blockedBy].toLowerCase())} already replaces this. Fitting here takes it off.`));
    const list = h('div', 'sg-cards');
    // flesh
    const fl = h('div', `sg-card flesh${!cur ? ' cur' : ''}`, `<header><b>FLESH</b><small>ORIGINAL · VAT-GROWN ON REQUEST</small></header><p class="g">✚ What you were born with. Bleeds, heals, feels.</p><p class="b">✖ Nothing special.</p>`);
    if (cur) { const b = h('button', 'sg-btn sg-small', 'RESTORE FLESH'); b.addEventListener('click', () => doSwap(slot, null)); fl.append(b); }
    else fl.append(h('div', 'sg-tag', 'IN USE'));
    list.append(fl);
    for (const d of partsFor(slot)) {
      const un = partUnlocked(d), on = cur === d.key;
      const c = h('div', `sg-card${on ? ' cur' : ''}${un ? '' : ' locked'}`, `
        <header><b>${esc(d.name)}</b><small>${esc(d.maker)} · TIER ${'▮'.repeat(d.tier + 1)}${'▯'.repeat(3 - d.tier)}</small></header>
        <div class="sg-fxc">${fxChips(d)}</div>
        <p class="g">✚ ${esc(d.good)}</p><p class="b">✖ ${esc(d.bad)}</p>`);
      c.style.setProperty('--glow', '#' + d.glow.toString(16).padStart(6, '0'));
      if (on) c.append(h('div', 'sg-tag', 'INSTALLED'));
      else if (un) { const b = h('button', 'sg-btn sg-small', 'INSTALL ▸'); b.addEventListener('click', () => doSwap(slot, d.key)); c.append(b); }
      else c.append(h('div', 'sg-lock', `<b>⛒ LOCKED</b><span>${esc(partHint(d))}</span>`));
      list.append(c);
    }
    panel.append(list);
  };
  const doSwap = async (slot: CyberSlot, key: string | null) => {
    if (stage.busy) return;
    // a whole arm replaces a fitted hand (and the other way round)
    for (const s of slotConflicts(slot)) if (stage.load[s]) { await stage.swap(s, null); }
    panel.classList.remove('on');
    root.classList.add('cutting');
    await stage.swap(slot, key);
    root.classList.remove('cutting');
    if (!closed) { panel.classList.add('on'); renderPanel(); refresh(); }
  };

  // ---------------- the brain: programme chips and condition wares
  const renderBrain = (close: HTMLElement) => {
    const p = points();
    panel.append(close, h('div', 'sg-ph brain', `<small>CORTEX //</small><b>WARES</b><span>CREDITS <i class="${p < 0 ? 'bad' : ''}">${cr(p)}</i> · finish at 0 or above</span>`));
    const tabs = h('div', 'sg-tabs');
    for (const [k, l] of [['chips', 'PROGRAMME CHIPS'], ['wares', 'CONDITION WARES']] as const) {
      const b = h('button', `sg-tab${brainTab === k ? ' on' : ''}`, l);
      b.addEventListener('click', () => { brainTab = k; csfx('cy_beep', 0.2); renderPanel(); });
      tabs.append(b);
    }
    panel.append(tabs);
    const list = h('div', 'sg-cards');
    if (brainTab === 'chips') {
      for (const o of OCCUPATIONS) list.append(chipCard(o));
    } else {
      const sub = h('div', 'sg-tabs sub');
      for (const [k, l] of [['assets', 'ASSETS (cost credits)'], ['liabilities', 'LIABILITIES (pay credits)']] as const) {
        const b = h('button', `sg-tab${wareTab === k ? ' on' : ''}`, l);
        b.addEventListener('click', () => { wareTab = k; renderPanel(); });
        sub.append(b);
      }
      panel.append(sub);
      for (const t of TRAITS.filter((x) => (wareTab === 'assets' ? x.cost <= 0 : x.cost > 0))) list.append(wareCard(t));
    }
    panel.append(list);
  };
  const skillLine = (o: Occupation) => Object.entries(o.skills).map(([k, v]) => `${esc(SKILLS.find((s) => s.key === k)?.name || k)} ${'▮'.repeat(v as number)}`).join(' · ');
  const chipCard = (o: Occupation) => {
    const av = occupationAvailable(o), on = occ === o.key;
    const c = h('div', `sg-card chip${on ? ' cur' : ''}${av ? '' : ' locked'}`, `
      <header><b>${esc(o.name)}</b><small>${chipCode(o)} · ${cr(o.points)} CR${skillLine(o) ? ' · ' + skillLine(o) : ''}</small></header>
      <p class="g">✚ ${esc(o.good || o.desc)}</p><p class="b">✖ ${esc(o.bad || '')}</p>`);
    if (on) c.append(h('div', 'sg-tag', 'SLOTTED'));
    else if (av) { const b = h('button', 'sg-btn sg-small', 'SLOT CHIP'); b.addEventListener('click', () => { occ = o.key; csfx('cy_bolt', 0.35); stage.shake(0.1); renderPanel(); refresh(); }); c.append(b); }
    else { const pr = Math.round(unlockProgress('job:' + o.key) * 100); c.append(h('div', 'sg-lock', `<b>⛒ ENCRYPTED</b><span>${esc(o.unlock?.hint || '')}</span><em style="--p:${pr}%">${pr}%</em>`)); }
    return c;
  };
  const conflictOf = (t: Trait) => (!traits.has(t.key) ? TRAITS.find((x) => traits.has(x.key) && ((t.excl || []).includes(x.key) || (x.excl || []).includes(t.key))) : undefined);
  const wareCard = (t: Trait) => {
    const av = traitAvailable(t), on = traits.has(t.key), cf = conflictOf(t);
    const c = h('div', `sg-card ware${on ? ' cur' : ''}${av ? '' : ' locked'}${cf ? ' clash' : ''}`, `
      <header><b>${esc(t.name)}</b><small>${wareCode(t)} · ${cr(t.cost)} CR</small></header>
      <p class="g">✚ ${esc(t.good || '')}</p><p class="b">✖ ${esc(t.bad || '')}</p>`);
    if (!av) { const pr = Math.round(unlockProgress('trait:' + t.key) * 100); c.append(h('div', 'sg-lock', `<b>⛒ ENCRYPTED</b><span>${esc(t.unlock?.hint || '')}</span><em style="--p:${pr}%">${pr}%</em>`)); }
    else if (cf) c.append(h('div', 'sg-lock', `<b>⚠ CONFLICT</b><span>Clashes with ${esc(cf.name)}.</span>`));
    else {
      const b = h('button', `sg-btn sg-small${on ? ' sg-ghost' : ''}`, on ? 'EJECT' : 'INSTALL');
      b.addEventListener('click', () => { if (on) { traits.delete(t.key); csfx('cy_hiss', 0.3); } else { traits.add(t.key); csfx('cy_bolt', 0.3); } renderPanel(); refresh(); });
      c.append(b);
    }
    return c;
  };

  // ---------------- the machine decides
  rnd.addEventListener('click', () => {
    if (stage.busy) return;
    const jobs = OCCUPATIONS.filter(occupationAvailable);
    const pos = TRAITS.filter((t) => traitAvailable(t) && t.cost < 0), neg = TRAITS.filter((t) => traitAvailable(t) && t.cost > 0);
    for (let tries = 0; tries < 40; tries++) {
      const o = jobs[Math.floor(Math.random() * jobs.length)];
      const a = pos[Math.floor(Math.random() * pos.length)], l = neg[Math.floor(Math.random() * neg.length)];
      if (!o || !a || !l || (a.excl || []).includes(l.key)) continue;
      if (o.points + a.cost + l.cost < 0) continue;
      occ = o.key; traits.clear(); traits.add(a.key); traits.add(l.key);
      break;
    }
    csfx('cy_spark', 0.4); stage.shake(0.2);
    if (selected === 'brain') renderPanel();
    refresh();
  });

  // ---------------- discharge
  go.addEventListener('click', async () => {
    if (stage.busy || closed) return;
    if (points() < 0) {
      csfx('cy_powerdown', 0.5);
      go.classList.remove('deny'); void go.offsetWidth; go.classList.add('deny');
      brainTab = 'wares'; open('brain');
      return;
    }
    closed = true;
    open(null);
    root.classList.add('done');
    csfx('cy_hiss', 0.7);
    setTimeout(() => { stamp.classList.add('on'); csfx('cy_thunk', 0.9); stage.shake(0.3); }, 450);
    const cyber: Record<string, string> = { ...stage.load } as Record<string, string>;
    setPendingLoadout(cyber as any);
    setTimeout(() => { finish({ occupation: occ, traits: [...traits], cyber }); }, 1700);
  });

  const finish = (r: SurgeryResult | null) => {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey, true);
    stage.dispose();
    root.remove();
    onDone(r);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || closed) return;
    e.preventDefault(); e.stopPropagation();
    if (selected) { open(null); return; }
    if (root.querySelector('.sg-leave')) return;
    const box = h('div', 'sg-leave', '<b>LEAVE THE BAY?</b><span>Nothing fitted here is kept.</span>');
    const yes = h('button', 'sg-btn sg-small', 'LEAVE'), no = h('button', 'sg-btn sg-small sg-ghost', 'STAY');
    yes.addEventListener('click', () => { closed = true; finish(null); });
    no.addEventListener('click', () => box.remove());
    box.append(yes, no); root.append(box);
  };
  window.addEventListener('keydown', onKey, true);

  refresh();
  root.classList.add('intro');
  stage.intro().then(() => { root.classList.remove('intro'); csfx('cy_powerup', 0.5); });
  if (import.meta.env.DEV) (window as any).__surgery = { stage, open, swap: doSwap, go: () => go.click(), get occ() { return occ; }, traits };
  return { close: () => { if (!closed) { closed = true; finish(null); } }, el: root };
}

export { SLOT_KIND };
