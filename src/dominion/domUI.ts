// The thrall remote: a floating prompt over whatever you can act on ([E] open
// the skull / [E] orders), a rugged command card for one thrall (follow,
// stay, guard, ride, cargo, stations, shut down) and the K key for the pack:
// K on a creature sics every follower on it, K on the floor posts them there,
// K on nothing calls them back.
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import { hasUnlock } from '../game/research';
import { pop } from '../gfx/juice';
import type { Creature } from '../creatures/creature';
import type { DominionSystem, StationKind } from './dominion';
import { domBlock, brainTier, tierNeeded } from './brains';

const tv = new THREE.Vector3();

export class DomUI {
  private prompt: HTMLDivElement;
  private card: HTMLDivElement;
  private cardFor: string | null = null;
  private focus: { c: Creature; kind: 'op' | 'orders' } | null = null;

  constructor(private d: DominionSystem) {
    this.prompt = document.createElement('div');
    this.prompt.className = 'dom-prompt';
    this.prompt.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.act(); });
    this.card = document.createElement('div');
    this.card.className = 'dom-card';
    this.card.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.append(this.prompt, this.card);
    window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && this.cardFor) { this.close(); e.stopPropagation(); } }, true);
  }

  get open() { return !!this.cardFor; }

  /** what the local survivor could act on right now */
  private findFocus(): { c: Creature; kind: 'op' | 'orders' } | null {
    const p = G.local; if (!p || this.d.surgery.active) return null;
    const ok = (c: Creature | null | undefined): { c: Creature; kind: 'op' | 'orders' } | null => {
      if (!c || c.dead || c.zoneKey !== p.zoneKey) return null;
      const dist = Math.hypot(c.x - p.x, c.z - p.z) - c.radius;
      if (dist > 2.6) return null;
      const r = this.d.rec(c);
      if (r && r.owner === p.id) return { c, kind: 'orders' };
      if (this.d.isDowned(c) && !domBlock(c)) return { c, kind: 'op' };
      return null;
    };
    const h = G.ui?.hover;
    const hf = h?.kind === 'creature' ? ok(h.c) : null;
    if (hf) return hf;
    let best: { c: Creature; kind: 'op' | 'orders' } | null = null, bd = 2.2;
    for (const c of (G.creatures?.creatures?.values?.() || []) as Iterable<Creature>) {
      const f = ok(c); if (!f) continue;
      const dd = Math.hypot(c.x - p.x, c.z - p.z) - c.radius;
      // downed bodies first: that is the urgent one
      const score = dd - (f.kind === 'op' ? 1 : 0);
      if (score < bd) { bd = score; best = f; }
    }
    return best;
  }

  private act() {
    const f = this.focus; if (!f) return;
    if (f.kind === 'op') this.d.operate(f.c);
    else if (this.cardFor === f.c.id) this.close();
    else this.openCard(f.c);
  }

  update(dt: number) {
    void dt;
    const p = G.local, inp = G.input;
    if (!p) return;
    this.focus = this.findFocus();
    // E: act on the focus (riding: E gets off)
    if (!inp.textFocus && inp.hit('interact')) {
      const ride = this.d.riding();
      if (ride && !this.cardFor) { this.d.ride(ride.id, false); bus.emit('think', p, 'Off.'); }
      else if (this.focus) this.act();
    }
    if (!inp.textFocus && inp.hit('command' as any)) this.commandKey();
    this.drawPrompt();
    if (this.cardFor) {
      const c = this.d.creature(this.cardFor);
      if (!c || c.dead || c.zoneKey !== p.zoneKey || Math.hypot(c.x - p.x, c.z - p.z) > 5 || !this.d.rec(c)) this.close();
      else this.place(this.card, c, 1.25, true);
    }
  }

  private drawPrompt() {
    const f = this.focus;
    if (!f || (this.cardFor && f.kind === 'orders')) { this.prompt.style.display = 'none'; return; }
    let txt = '', dim = false;
    if (f.kind === 'op') {
      const b = this.d.brainFor(f.c);
      const tool = G.local!.findTool('#saw') || G.local!.findTool('#sharp');
      const need = brainTier(tierNeeded(f.c)).name;
      txt = !b ? `NEEDS ${need.toUpperCase()}` : !tool ? 'NEEDS A BLADE' : `E  OPEN THE SKULL`;
      dim = !b || !tool;
    } else txt = `E  ${(f.c.mem.dom?.name || 'THRALL').toUpperCase()}`;
    if (this.prompt.textContent !== txt) this.prompt.textContent = txt;
    this.prompt.classList.toggle('dim', dim);
    this.prompt.classList.toggle('op', f.kind === 'op');
    this.prompt.style.display = 'block';
    this.place(this.prompt, f.c, 0.4);
  }

  private place(el: HTMLElement, c: Creature, up: number, clamp = false) {
    const s = G.pr.worldToScreen(tv.set(c.x, c.y + c.height + up * 0.4, c.z));
    let x = s.x, y = s.y;
    if (clamp) { const w = el.offsetWidth || 220, h = el.offsetHeight || 200; x = Math.max(w / 2 + 8, Math.min(innerWidth - w / 2 - 8, x)); y = Math.max(h + 8, Math.min(innerHeight - 8, y)); }
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
  }

  // ---------------------------------------------------------------- the command card
  openCard(c: Creature) {
    const r = this.d.rec(c); if (!r) return;
    this.cardFor = c.id;
    const btn = (k: string, label: string, on = false, dis = '') => `<button data-k="${k}" class="${on ? 'on' : ''}" ${dis ? `disabled title="${dis}"` : ''}>${label}</button>`;
    const st = hasUnlock('tame_station');
    const ride = this.d.canRide(c);
    const hp = Math.round((c.hp / c.sp.hp) * 100);
    this.card.innerHTML = `
      <div class="dc-head"><span class="dc-led t${r.tier}"></span><b>${r.name}</b><i>${c.sp.name} // MK-${'I'.repeat(r.tier)}</i></div>
      <div class="dc-lcd">BODY ${hp}% · ${r.mode === 'station' && r.station ? 'STATION: ' + r.station.kind.toUpperCase() : r.mode.toUpperCase()}${r.rider ? ' · RIDDEN' : ''}</div>
      <div class="dc-row">${btn('follow', 'FOLLOW', r.mode === 'follow')}${btn('stay', 'STAY', r.mode === 'stay')}${btn('guard', 'GUARD HERE', r.mode === 'guard')}</div>
      <div class="dc-row">${btn('ride', r.rider ? 'DISMOUNT' : 'RIDE', !!r.rider, ride ? '' : hasUnlock('tame_ride') ? 'too small to ride' : 'research SADDLE PROTOCOL')}${btn('cargo', 'CARGO')}</div>
      <div class="dc-sub">STATION ${st ? '' : '<em>— research LABOUR DIRECTIVE</em>'}</div>
      <div class="dc-row">${(['guard', 'haul', 'power', 'farm'] as StationKind[]).map((k) => btn('st:' + k, k.toUpperCase(), r.station?.kind === k, st ? '' : 'locked')).join('')}</div>
      <div class="dc-row end">${btn('release', 'SHUT DOWN')}${btn('close', 'CLOSE')}</div>`;
    this.card.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => this.cardAction(c, (b as HTMLElement).dataset.k!)));
    this.card.style.display = 'block';
    pop(this.card, 1.05);
    G.audio?.ui?.('dom_order', 0.4);
  }

  private cardAction(c: Creature, k: string) {
    const r = this.d.rec(c); if (!r) return this.close();
    const p = G.local!;
    G.audio?.ui?.('dom_order', 0.4);
    if (k === 'close') return this.close();
    if (k === 'follow') this.d.command(c.id, 'follow');
    else if (k === 'stay') this.d.command(c.id, 'stay', { x: c.x, z: c.z });
    else if (k === 'guard') this.d.command(c.id, 'guard', { x: p.x, z: p.z });
    else if (k === 'ride') { this.d.ride(c.id, !r.rider); this.close(); bus.emit('think', p, r.rider ? 'Off.' : 'Up I go. Steer with my knees, apparently.'); return; }
    else if (k === 'cargo') { this.close(); const inv = c.inv; if (inv) { if (G.pack?.focus) G.pack.focus(inv); else G.ui?.inventory?.focus?.(inv); } return; }
    else if (k.startsWith('st:')) { const kind = k.slice(3) as StationKind; this.d.assign(c.id, r.station?.kind === kind ? null : kind); }
    else if (k === 'release') {
      if (!this.card.dataset.sure) { this.card.dataset.sure = '1'; const b = this.card.querySelector('[data-k="release"]'); if (b) b.textContent = 'SURE?'; return; }
      this.d.release(c.id); this.close(); bus.emit('think', p, 'The lights go out behind its eyes. The cortex should still be in there.'); return;
    }
    // reflect the new state
    setTimeout(() => { if (this.cardFor === c.id) this.openCard(c); }, 30);
  }

  close() { this.cardFor = null; this.card.style.display = 'none'; delete this.card.dataset.sure; }

  // ---------------------------------------------------------------- K: the pack
  private commandKey() {
    const p = G.local!;
    const mine = this.d.mine().filter((r) => r.mode !== 'station');
    if (!mine.length) { bus.emit('think', p, 'Nobody to order around.'); return; }
    const h = G.ui?.hover;
    G.audio?.ui?.('dom_order', 0.5);
    if (h?.kind === 'creature' && h.c && !h.c.dead && !this.d.rec(h.c)) {
      const n = this.d.sic(h.c);
      bus.emit('subtitle', { who: p.name, text: ['Take it.', 'Kill.', 'That one.', 'Get it!'][Math.floor(Math.random() * 4)], style: 'self', x: p.x, y: 1.9, z: p.z });
      bus.emit('think', p, `${n} of them turn toward it at once.`);
      return;
    }
    const w = G.pr.screenToWorld(G.input.mouseX, G.input.mouseY, 0);
    if (h && w && Math.hypot(w.x - p.x, w.z - p.z) > 1.5 && Math.hypot(w.x - p.x, w.z - p.z) < 30) {
      for (const r of mine) this.d.command(r.id, 'guard', { x: w.x, z: w.z, target: null });
      bus.emit('think', p, 'Hold there.');
      return;
    }
    for (const r of mine) this.d.command(r.id, 'follow', { target: null });
    bus.emit('think', p, 'Heel.');
  }
}
