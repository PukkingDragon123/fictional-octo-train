// Talking to a tribe: walk up, press E (or tap the tag over their head). The
// barter cloth unrolls: their wares on one side, your pack on the other, the
// tab chalked on a slate, their standing burned into a strip of leather.
// Tabs: BARTER (click to buy / sell), WORK (their jobs for the watch), JOIN.
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import { pop } from '../gfx/juice';
import { itemDef } from '../items/item';
import type { Item } from '../items/item';
import { itemIcon, itemIconFor } from '../ui/icons';
import { questDefs } from '../game/quests';
import { op } from '../game/ops';
import type { Creature } from '../creatures/creature';
import { TRIBES, type TribeKey } from './defs';
import { bark, memberName, tribeOfCreature } from './npc';
import type { TribeSystem } from './tribes';
import { RECRUIT_COST, RECRUIT_REP } from './tribes';

const tv = new THREE.Vector3();
const SIGIL: Record<TribeKey, string> = {
  tally: '<svg viewBox="0 0 24 24"><path d="M4 3v18M8 3v18M12 3v18M16 3v18M2 18L22 6" stroke="currentColor" stroke-width="2.4" fill="none"/></svg>',
  wax: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="13" rx="7" ry="9" stroke="currentColor" stroke-width="2.2" fill="none"/><path d="M9 11h1M14 11h1M10 17h4" stroke="currentColor" stroke-width="2"/><path d="M12 1v3" stroke="#ffb040" stroke-width="2.4"/></svg>',
  turnkey: '<svg viewBox="0 0 24 24"><path d="M4 3h16v10c0 5-4 8-8 9-4-1-8-4-8-9z" stroke="currentColor" stroke-width="2.2" fill="none"/><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="2.2"/></svg>',
  cog: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2.2" fill="none"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4M4 4l3 3M17 17l3 3M20 4l-3 3M7 17l-3 3" stroke="currentColor" stroke-width="2.4"/></svg>',
};

export class TradeUI {
  private prompt: HTMLDivElement;
  private panel: HTMLDivElement;
  private toasts: HTMLDivElement;
  private c: Creature | null = null;
  private tab: 'barter' | 'work' | 'join' = 'barter';
  private focus: Creature | null = null;

  constructor(private T: TribeSystem) {
    this.prompt = document.createElement('div');
    this.prompt.className = 'tr-prompt';
    this.prompt.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (this.focus) this.open(this.focus); });
    this.panel = document.createElement('div');
    this.panel.className = 'tr-panel';
    this.panel.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.panel.addEventListener('wheel', (e) => e.stopPropagation());
    this.toasts = document.createElement('div');
    this.toasts.className = 'tr-toasts';
    document.body.append(this.prompt, this.panel, this.toasts);
    window.addEventListener('keydown', (e) => { if (this.c && e.code === 'Escape') { e.stopPropagation(); this.close(); } }, true);
    bus.on('tribeTab', () => this.c && this.render());
    bus.on('tribeRep', () => this.c && this.render());
  }

  get isOpen() { return !!this.c; }

  private findFocus(): Creature | null {
    const p = G.local; if (!p) return null;
    const ok = (c: Creature | undefined | null) => !!c && !c.dead && !G.dominion?.isDowned?.(c) && c.zoneKey === p.zoneKey && !!tribeOfCreature(c) && Math.hypot(c.x - p.x, c.z - p.z) < 2.8;
    const h = G.ui?.hover;
    if (h?.kind === 'creature' && ok(h.c)) return h.c;
    let best: Creature | null = null, bd = 2.4;
    for (const c of (G.creatures?.creatures?.values?.() || []) as Iterable<Creature>) { if (!ok(c)) continue; const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd) { bd = d; best = c; } }
    return best;
  }

  update(dt: number) {
    void dt;
    const p = G.local, inp = G.input; if (!p) return;
    this.focus = this.findFocus();
    if (!inp.textFocus && inp.hit('interact') && !G.dominion?.ui?.open) {
      if (this.c) this.close();
      else if (this.focus && !G.dominion?.riding?.()) this.open(this.focus);
    }
    // the tag over their head
    const f = this.focus;
    if (f && !this.c) {
      const t = tribeOfCreature(f)!;
      const hostile = this.T.hostile(t) || f.state === 'chase' || f.state === 'attack';
      const mine = f.tamedBy === p.id;
      const txt = hostile ? `${memberName(f).toUpperCase()} — HOSTILE` : `E  ${mine ? 'TALK' : 'TALK · TRADE'}  ${memberName(f).toUpperCase()}`;
      if (this.prompt.textContent !== txt) this.prompt.textContent = txt;
      this.prompt.classList.toggle('hostile', hostile);
      this.prompt.style.setProperty('--tc', TRIBES[t].css);
      this.prompt.style.display = 'block';
      const s = G.pr.worldToScreen(tv.set(f.x, f.y + f.height + 0.35, f.z));
      this.prompt.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px) translate(-50%, -100%)`;
    } else this.prompt.style.display = 'none';
    if (this.c) {
      const c = this.c;
      if (c.dead || c.zoneKey !== p.zoneKey || Math.hypot(c.x - p.x, c.z - p.z) > 4.5 || p.body.dead) this.close();
      else if (this.T.hostile(tribeOfCreature(c)!) && !c.tamedBy) { this.close(); bark(c, 'hostile', true); }
    }
  }

  open(c: Creature) {
    const t = tribeOfCreature(c); if (!t) return;
    if (this.T.hostile(t) && !c.tamedBy) { bark(c, 'hostile', true); bus.emit('think', G.local, 'They are not in a talking mood.'); return; }
    this.c = c; this.tab = 'barter';
    this.T.meet(t);
    bark(c, 'trade', true);
    this.render();
    this.panel.classList.add('on');
    pop(this.panel, 1.03);
    G.audio?.ui?.('bagOpen', 0.4);
  }

  close() {
    if (!this.c) return;
    const c = this.c; this.c = null;
    this.panel.classList.remove('on');
    if (!c.dead) bark(c, 'bye', true);
    G.audio?.ui?.('bagClose', 0.35);
  }

  toast(title: string, sub: string, kind: 'up' | 'down') {
    const d = document.createElement('div');
    d.className = 'tr-toast ' + kind;
    d.innerHTML = `<b></b><i></i>`;
    (d.querySelector('b') as HTMLElement).textContent = title;
    (d.querySelector('i') as HTMLElement).textContent = sub;
    this.toasts.append(d);
    setTimeout(() => d.classList.add('out'), 2800);
    setTimeout(() => d.remove(), 3400);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
  }

  // ---------------------------------------------------------------- the cloth
  private render() {
    const c = this.c; if (!c) return;
    const p = G.local!;
    const t = tribeOfCreature(c)!, TD = TRIBES[t];
    const rep = this.T.rep(t), st = this.T.standing(t), tab = this.T.tab(t);
    const repPct = (rep + 100) / 2;
    this.panel.style.setProperty('--tc', TD.css);
    const tabs = (['barter', 'work', 'join'] as const).map((k) => `<button class="tr-tab ${this.tab === k ? 'on' : ''}" data-tab="${k}">${k.toUpperCase()}</button>`).join('');
    let body = '';
    if (this.tab === 'barter') {
      const wares = this.T.wares(t).map((k) => { const pr = this.T.buyPrice(t, k); const can = tab >= pr; return `<button class="tr-item ${can ? '' : 'poor'}" data-buy="${k}" title="${esc(itemDef(k).desc || '')}"><img src="${itemIcon(k, '', 32)}"><span>${esc(itemDef(k).name)}</span><em>${pr}</em></button>`; }).join('');
      const mine = this.sellable(p).map((it) => { const v = this.T.sellPrice(t, it); const w = this.T.wanted(t, it); return `<button class="tr-item ${w ? 'want' : ''}" data-sell="${it.uid}"><img src="${itemIconFor(it, 32)}"><span>${esc(itemDef(it.key).name)}</span><em>+${v}</em></button>`; }).join('');
      body = `<div class="tr-cols"><div class="tr-col"><h4>THEIR CLOTH</h4><div class="tr-grid">${wares || '<p class="tr-empty">Nothing they will part with. Yet.</p>'}</div></div>
        <div class="tr-col"><h4>YOUR PACK <small>(gold = they want it)</small></h4><div class="tr-grid">${mine || '<p class="tr-empty">Nothing they would take.</p>'}</div></div></div>`;
    } else if (this.tab === 'work') {
      const qs = questDefs().filter((q) => q.category === 'tribe' && q.giver === TD.name.toUpperCase());
      const status = (k: string) => (G.watch?.questStatus?.(k) as string | undefined) ?? (G.missions?.flags?.has?.('quest:done:' + k) ? 'done' : '');
      body = `<div class="tr-work">${qs.map((q) => {
        const s = status(q.key);
        const locked = (q.requires || []).some((r) => r.startsWith('flag:') ? !G.missions?.flags?.has?.(r.slice(5)) : status(r) !== 'done');
        const rw = [q.reward?.rp ? `${q.reward.rp} RP` : '', ...(q.reward?.items || []).map(([k, n]) => `${n > 1 ? n + '× ' : ''}${itemDef(k).name}`), ...(q.reward?.unlock || []).map((u) => 'schematic')].filter(Boolean).join(' · ');
        return `<div class="tr-job ${s} ${locked ? 'locked' : ''}"><b>${esc(q.title)}</b><p>${esc(q.desc)}</p><small>${esc(rw)}</small>${s === 'done' ? '<i>DONE</i>' : s === 'ready' ? '<i>READY</i>' : s === 'active' ? '<i>ON YOUR WATCH</i>' : locked ? '<i>LATER</i>' : `<button data-quest="${q.key}">TAKE THE JOB</button>`}</div>`;
      }).join('')}</div>`;
    } else {
      const rs = this.T.recruits(p.id);
      const mine = c.tamedBy === p.id;
      body = `<div class="tr-join">${mine
        ? `<p>${esc(memberName(c))} walks with you.</p><button data-dismiss="1">SEND THEM HOME</button>`
        : `<p>With standing of <b>FRIENDLY</b> or better and <b>${RECRUIT_COST}</b> on the tab, one of them will walk with you, fight beside you and keep watch. (${rs.length}/2 walking with you)</p>
           <button data-recruit="1" ${this.T.canRecruit(t) ? '' : 'disabled'}>${rep < RECRUIT_REP ? 'THEY DO NOT TRUST YOU ENOUGH' : tab < RECRUIT_COST ? 'NOT ENOUGH ON THE TAB' : rs.length >= 2 ? 'YOU HAVE ENOUGH COMPANY' : 'ASK ' + esc(memberName(c).toUpperCase()) + ' TO COME'}</button>`}</div>`;
    }
    this.panel.innerHTML = `
      <div class="tr-head"><span class="tr-sigil">${SIGIL[t]}</span><div class="tr-name"><b>${esc(TD.name.toUpperCase())}</b><i>${esc(memberName(c))} · ${esc(TD.lore.cls)}</i></div>
        <div class="tr-slate"><small>YOUR TAB</small><b>${tab}</b></div><button class="tr-x" data-close="1">✕</button></div>
      <div class="tr-rep ${st.cls}"><span style="width:${repPct.toFixed(1)}%"></span><b>${st.label}</b><em>${rep > 0 ? '+' : ''}${Math.round(rep)}</em></div>
      <div class="tr-tabs">${tabs}</div>
      <div class="tr-body">${body}</div>`;
    this.panel.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { this.tab = (b as HTMLElement).dataset.tab as any; G.audio?.ui?.('tab', 0.4); this.render(); }));
    this.panel.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.close()));
    this.panel.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => {
      const k = (b as HTMLElement).dataset.buy!;
      if (this.T.buy(t, k)) { pop(b as HTMLElement, 1.12); this.render(); }
      else { bark(c, 'trade', true); (b as HTMLElement).animate([{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], { duration: 160 }); }
    }));
    this.panel.querySelectorAll('[data-sell]').forEach((b) => b.addEventListener('click', () => {
      const uid = Number((b as HTMLElement).dataset.sell);
      const it = p.allItems().find((i: Item) => i.uid === uid);
      if (it && this.T.sell(t, it) > 0) this.render();
    }));
    this.panel.querySelectorAll('[data-quest]').forEach((b) => b.addEventListener('click', () => {
      const k = (b as HTMLElement).dataset.quest!;
      const w = G.watch;
      const ok = w?.acceptQuest?.(k) ?? w?.quests?.accept?.(k) ?? w?.accept?.(k);
      bus.emit('questOffer', { key: k, giver: TD.name.toUpperCase(), accepted: ok !== false });
      bus.emit('think', p, 'The job goes up on the watch.');
      G.audio?.ui?.('click', 0.5);
      this.render();
    }));
    this.panel.querySelector('[data-recruit]')?.addEventListener('click', () => { if (this.T.recruit(c)) { this.close(); bus.emit('think', p, `${memberName(c)} falls in behind me.`); } });
    this.panel.querySelector('[data-dismiss]')?.addEventListener('click', () => { op('tribeRecruit', { id: c.id, by: '' }); this.close(); });
  }

  /** what the survivor could hand over (not worn, not in hand, not an open bag, worth something) */
  private sellable(p: any): Item[] {
    const out: Item[] = [];
    for (const it of p.allItems() as Item[]) {
      if (p.isWorn?.(it) || p.handR === it || p.handL === it || (it.inv && it.inv.items.length)) continue;
      if (itemDef(it.key).tags?.includes('mission')) continue;
      if (this.T.sellPrice(tribeOfCreature(this.c!)!, it) <= 0) continue;
      out.push(it);
      if (out.length >= 30) break;
    }
    return out;
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]!));
