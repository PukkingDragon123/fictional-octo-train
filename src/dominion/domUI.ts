// What you can do to a body or a thrall, shown on the thing itself: a manila
// tag hangs over a downed creature you could open ("E OPEN THE SKULL", or what
// you lack) and a stamped metal tag over your own thralls ("E MULE-01"). E on
// a thrall brings up the bakelite remote (./remote.ts). K orders the pack:
// on a creature, sic them all; on the floor, post them there; on nothing,
// call them back.
import { G } from '../game/G';
import { bus } from '../core/events';
import type { Creature } from '../creatures/creature';
import type { DominionSystem } from './dominion';
import { domBlock, tierNeeded } from './brains';
import { WorldTag } from '../scan/pix';
import { Remote } from './remote';

export class DomUI {
  private tag = new WorldTag(120, 18);
  remote: Remote;
  private focus: { c: Creature; kind: 'op' | 'orders' } | null = null;

  constructor(private d: DominionSystem) {
    this.remote = new Remote(d);
  }

  get open() { return this.remote.open; }

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
      // downed bodies first: that is the urgent one
      const score = Math.hypot(c.x - p.x, c.z - p.z) - c.radius - (f.kind === 'op' ? 1 : 0);
      if (score < bd) { bd = score; best = f; }
    }
    return best;
  }

  private act() {
    const f = this.focus; if (!f) return;
    if (f.kind === 'op') this.d.operate(f.c);
    else if (this.remote.forId === f.c.id) this.remote.close();
    else this.remote.show(f.c);
  }

  update(dt: number) {
    const p = G.local, inp = G.input;
    if (!p) return;
    this.focus = this.findFocus();
    if (!inp.textFocus && inp.hit('interact')) {
      const ride = this.d.riding();
      if (this.remote.open) this.remote.close();
      else if (ride) { this.d.ride(ride.id, false); bus.emit('think', p, 'Off.'); }
      else if (this.focus) this.act();
    }
    if (!inp.textFocus && inp.hit('command')) this.commandKey();
    this.drawTag();
    this.remote.update(dt);
  }

  private drawTag() {
    const f = this.focus;
    if (!f || this.remote.open) { this.tag.hide(); return; }
    const c = f.c;
    if (f.kind === 'op') {
      const b = this.d.brainFor(c);
      const tool = G.local!.findTool('#saw') || G.local!.findTool('#sharp');
      const need = ['ONE-VALVE', 'TWIN-VALVE', 'TITAN'][tierNeeded(c) - 1];
      const y = c.y + c.height * 0.6 + 0.3;
      if (!b) this.tag.show(c.x, y, c.z, `NEEDS A ${need} CORTEX`, 'dim', '');
      else if (!tool) this.tag.show(c.x, y, c.z, 'NEEDS A BLADE', 'dim', '');
      else this.tag.show(c.x, y, c.z, 'OPEN THE SKULL', 'red');
    } else this.tag.show(c.x, c.y + c.height + 0.2, c.z, (c.mem.dom?.name || 'THRALL').toUpperCase(), 'metal');
  }

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
