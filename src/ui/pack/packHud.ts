// The pack's readout (round 18b): a small housing of the institute's olive machine kit at the top right of the
// first-person backpack scene (src/ui/inventory.ts), so the load and the thing under the hand read at a glance
// while the 3D pack stays the main view. A KG gauge whose needle swings with the load (and the kilos beside it),
// then the hovered thing: its icon, its name in raised yellow letters, its weight, and its condition as a row of
// little glass lamps. Nothing when nothing is hovered but the load.
import { G } from '../../game/G';
import { itemName, itemWeight, itemDef, freshness, type Item } from '../../items/item';
import { itemIconFor, iconResCss } from '../icons';
import { mxOk } from '../machine/core';
import { mxFrame, panelSpec, mxGauge, type MxGauge } from '../machine/kit';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);

/** a row of five small glass lamps: lit amber-green by condition, a dull red when it is nearly gone */
function lamps(cond: number): HTMLCanvasElement {
  const n = 5, S = 9, cv = document.createElement('canvas');
  cv.width = n * (S + 3); cv.height = S + 2; cv.className = 'phud-lamps';
  const c = cv.getContext('2d')!;
  const lit = Math.max(0, Math.min(n, Math.round(cond * n)));
  const col = cond < 0.25 ? ['#ff7a54', '#c8402a', '#6a1a10'] : cond < 0.55 ? ['#ffe08a', '#d8a030', '#6a4a10'] : ['#d8ff9a', '#8ac83a', '#2a4a10'];
  for (let i = 0; i < n; i++) {
    const x = i * (S + 3);
    // the brass bezel, the glass, a highlight
    c.fillStyle = '#2a2414'; c.fillRect(x, 1, S, S);
    c.fillStyle = '#8a7a44'; c.fillRect(x + 1, 0, S - 2, 1); c.fillRect(x, 1, 1, S - 1);
    const on = i < lit;
    c.fillStyle = on ? col[2] : '#1a1c14'; c.fillRect(x + 1, 2, S - 2, S - 2);
    c.fillStyle = on ? col[1] : '#2a2c22'; c.fillRect(x + 2, 3, S - 4, S - 4);
    if (on) { c.fillStyle = col[0]; c.fillRect(x + 3, 3, 2, 2); }
    else { c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(x + 2, 3, 1, 1); }
  }
  return cv;
}

export class PackHud {
  readonly el = document.createElement('div');
  private gauge: MxGauge | null = null;
  private kg = document.createElement('em');
  private item = document.createElement('div');
  private framed = false;
  private sig = '';

  constructor() {
    this.el.className = 'phud';
    const top = document.createElement('div'); top.className = 'phud-load';
    this.gauge = mxGauge(46, 0, 'KG');
    if (this.gauge) top.append(this.gauge);
    top.append(this.kg);
    this.el.append(top, this.item);
    this.item.className = 'phud-item';
    const st = document.createElement('style');
    st.textContent = `.phud{position:fixed;z-index:31;right:18px;top:calc(7vh + 14px);width:212px;padding:10px 14px 12px;font-family:var(--font-new);pointer-events:none;opacity:0;transform:translateX(24px);transition:opacity .2s ease,transform .3s cubic-bezier(.3,1.4,.5,1);user-select:none}
.phud,.phud *{border-radius:0!important}
.phud.on{opacity:1;transform:none}
.phud-load{position:relative;display:flex;align-items:center;gap:8px;height:56px}
.phud-load .mxg-cv{flex:none;image-rendering:pixelated}
.phud em{font-style:normal;font-size:22px;line-height:1;color:#f2d65a;white-space:nowrap;text-shadow:1px 1px 0 #14160c,-1px 0 0 #14160c,0 -1px 0 #14160c,0 2px 0 #0b0c0a}
.phud em small{font-size:15px;color:#c8c08a}
.phud em.over{color:#ff8a5a}
.phud-item{position:relative;display:grid;grid-template-columns:40px 1fr;column-gap:8px;align-items:center;min-height:0;max-height:0;overflow:hidden;transition:max-height .18s ease,margin .18s ease}
.phud-item.on{max-height:80px;margin-top:8px}
.phud-item img{grid-row:span 3;width:40px;height:40px;image-rendering:pixelated;filter:drop-shadow(1px 2px 0 rgba(0,0,0,.6))}
.phud-item b{font-weight:normal;font-size:17px;line-height:18px;color:#f6e6b0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:1px 1px 0 #14160c,-1px 0 0 #14160c,0 -1px 0 #14160c,0 2px 0 #0b0c0a}
.phud-item i{font-style:normal;font-size:14px;line-height:16px;color:#c8c08a;text-shadow:1px 1px 0 #0b0c0a}
.phud-lamps{image-rendering:pixelated;margin-top:2px}
@media (max-width:700px){.phud{right:8px;width:184px;top:calc(7vh + 6px)}.phud-item b{font-size:15px}}`;
    this.el.append(st);
  }

  show(on: boolean) {
    if (on && !this.el.isConnected) document.body.append(this.el);
    if (on && !this.framed && mxOk()) {
      this.framed = true;
      this.el.classList.add('mx');
      try { mxFrame(this.el, (w, h) => { const sp = panelSpec(w, h, { seed: 87, hazard: false, vents: false, glands: 0, lamps: [] }); sp.depth = 7; return sp; }, { pad: 8 }); } catch (e) { console.warn('pack hud frame', e); }
    }
    requestAnimationFrame(() => this.el.classList.toggle('on', on));
  }

  /** the load: kilos carried against what the unit can carry */
  load(w: number, cap: number) {
    const k = w / Math.max(0.1, cap);
    this.gauge?.set(Math.min(1, k * 0.85));
    this.kg.innerHTML = `${w.toFixed(1)}<small> / ${cap.toFixed(0)} kg</small>`;
    this.kg.classList.toggle('over', k > 1);
  }

  /** the thing under the hand (null: none) */
  hover(it: Item | null, n = 1) {
    const sig = it ? it.uid + ':' + n + ':' + (it.cond ?? 1).toFixed(2) : '';
    if (sig === this.sig) return;
    this.sig = sig;
    if (!it) { this.item.classList.remove('on'); return; }
    const d = itemDef(it.key);
    const tracked = !!(d.durability || d.weapon || d.clothing || d.food || d.uses !== undefined);
    const fr = d.food ? freshness(it) : 'none';
    const cond = d.food ? (fr === 'rotten' ? 0.1 : fr === 'stale' ? 0.45 : 0.95) : it.uses !== undefined && !d.durability ? it.uses : it.cond ?? 1;
    this.item.innerHTML = `<img src="${itemIconFor(it, iconResCss(40))}" alt=""><b>${esc(itemName(it))}${n > 1 ? ` <i>x${n}</i>` : ''}</b><i>${(itemWeight(it) * n).toFixed(2)} kg</i>`;
    if (tracked) this.item.append(lamps(cond));
    this.item.classList.add('on');
    void G;
  }

  dispose() { this.el.remove(); }
}
