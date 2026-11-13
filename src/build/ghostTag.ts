// The build ghost's words, floating under it in the world (round 16, trimmed in
// round 17): the piece's name, a small padlock when its blueprint is not known,
// and its salvage as small item icons with have/need counts (red when short).
// Nothing else: where to learn a blueprint lives on the clipboard, the reason a
// spot is refused is the red ghost (and a thought when you click). The key caps
// (R turn, Tab shelf, X take down, Esc put away) show for the first few times the
// kit is taken out, then hide; Settings > Interface > "Build key hints" keeps them.
// Drawn in the world prompt's own type (#wprompt .wp-tag, src/ui/worldPrompt.css).
import * as THREE from 'three';
import { G } from '../game/G';
import { itemIcon } from '../ui/icons';
import { uiSettings } from '../ui/menus/settings';

export interface TagCost { key: string; have: number; need: number; /** a refund line: "+n" */ give?: boolean }
export interface TagState {
  key: string;
  /** a short word in front of the name (an arrow for an upgrade, a percentage for a frame) */
  pre?: string;
  name: string;
  locked?: boolean;
  cost?: TagCost[];
  at: { x: number; y: number; z: number };
}

const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
const _v = new THREE.Vector3();
/** a 7 x 8 pixel padlock */
const LOCK = `<svg class="bld-lock" viewBox="0 0 7 8" shape-rendering="crispEdges" aria-label="blueprint needed"><path fill="#e08a5a" d="M2 0h3v1h1v3h1v4H0V4h1V1h1zm0 1v3h3V1zM3 5h1v2H3z"/></svg>`;
const HINT_KEY = 'noclip.buildHintUses';
const HINT_USES = 4;

/** the kit came out again: count it (the key caps retire after a few) */
export function noteBuildOpen() { try { localStorage.setItem(HINT_KEY, String(hintUses() + 1)); } catch { /* storage blocked */ } }
const hintUses = () => { try { return Number(localStorage.getItem(HINT_KEY)) || 0; } catch { return 0; } };
const showKeys = () => !!uiSettings().buildHints || hintUses() <= HINT_USES;

export class GhostTag {
  private el: HTMLDivElement | null = null;
  private sig = '';
  private x = 0; private y = 0; private placed = false;
  private w = 0; private h = 0;

  private ensure(): HTMLDivElement | null {
    if (this.el?.isConnected) return this.el;
    const host = document.getElementById('wprompt');
    if (!host) return null;
    const el = document.createElement('div');
    el.className = 'wp-tag prim bld-tag';
    el.style.pointerEvents = 'none';
    host.appendChild(el);
    this.el = el; this.sig = ''; this.placed = false;
    return el;
  }

  update(dt: number, s: TagState | null) {
    const el = this.ensure();
    if (!el) return;
    if (!s) { el.classList.remove('vis'); this.placed = false; return; }
    const touch = !!document.getElementById('wprompt')?.classList.contains('touch');
    const keys = !touch && showKeys();
    const sig = JSON.stringify([s.key, s.pre, s.name, s.locked, s.cost, keys]);
    if (sig !== this.sig) {
      this.sig = sig;
      const canIcon = !!(G as unknown as { pr?: { renderer?: unknown } })?.pr?.renderer;
      let h = `<div class="wp-in"><div class="wp-head${s.locked ? ' no' : ''}">${s.locked ? LOCK : ''}${s.pre ? `<span class="wp-v">${esc(s.pre)}</span> ` : ''}<span class="wp-n">${esc(s.name)}</span></div>`;
      if (s.cost?.length) {
        h += '<div class="bld-cost">' + s.cost.map((c) => {
          const ok = c.give || c.have >= c.need;
          const ic = canIcon ? `<img src="${itemIcon(c.key, '', 16)}" alt="">` : '';
          return `<span class="bld-c ${ok ? 'ok' : 'no'}">${ic}${c.give ? '+' + c.need : `${Math.min(c.have, 99)}/${c.need}`}</span>`;
        }).join('') + '</div>';
      }
      if (keys) h += '<div class="bld-keys"><span class="bld-kc">R ↻</span><span class="bld-kc">Tab</span><span class="bld-kc">X</span><span class="bld-kc">Esc</span></div>';
      el.innerHTML = h + '</div>';
      this.w = el.offsetWidth; this.h = el.offsetHeight;
    }
    const pr = (G as unknown as { pr?: { worldToScreen?: (v: THREE.Vector3) => { x: number; y: number; z: number } } }).pr;
    if (!pr?.worldToScreen) return;
    const sc = pr.worldToScreen(_v.set(s.at.x, s.at.y, s.at.z));
    const W = window.innerWidth, H = window.innerHeight, M = 8;
    const ok = sc.z < 1;
    // under the ghost's foot, beside the cursor: clear of the task banner and the HUD up top
    let tx = sc.x - this.w / 2, ty = sc.y + 22;
    tx = Math.max(M, Math.min(W - this.w - M, tx)); ty = Math.max(M, Math.min(H - this.h - M, ty));
    const k = 1 - Math.exp(-dt * 22);
    if (!this.placed) { this.x = tx; this.y = ty; this.placed = true; } else { this.x += (tx - this.x) * k; this.y += (ty - this.y) * k; }
    el.style.transform = `translate3d(${Math.round(this.x)}px, ${Math.round(this.y)}px, 0)`;
    el.classList.toggle('vis', ok);
  }

  hide() { this.el?.classList.remove('vis'); this.placed = false; }
}
