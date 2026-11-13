// The build ghost's words, floating over it in the world (round 16): what the
// piece is, what it costs against what you have (crates in the camp count),
// and the keys. Drawn in the world prompt's own type (#wprompt .wp-tag,
// src/ui/worldPrompt.css): no box, no panel, it follows the ghost like the
// "[E] Search: Filing Cabinet" labels follow furniture.
import * as THREE from 'three';
import { G } from '../game/G';

export interface TagLine { text: string; ok?: boolean }
export interface TagState {
  key: string;
  head: string;
  name: string;
  /** greyed head + this reason under it */
  why?: string;
  /** the salvage line: one entry per material */
  cost?: TagLine[];
  /** the keys line */
  keys?: [string, string][];
  at: { x: number; y: number; z: number };
}

const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
const _v = new THREE.Vector3();

export class GhostTag {
  private el: HTMLDivElement | null = null;
  private sig = '';
  private x = 0; private y = 0; private placed = false;
  private w = 0; private h = 0;
  private at = { x: 0, y: 0, z: 0 };

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
    const sig = (touch ? 'T' : 'D') + JSON.stringify([s.key, s.head, s.name, s.why, s.cost, s.keys]);
    if (sig !== this.sig) {
      this.sig = sig;
      const cap = (k: string) => (touch || !k ? '' : `<b class="wp-key">[${esc(k)}]</b>`);
      const words = s.head ? `<span class="wp-v">${esc(s.head)}:</span> <span class="wp-n">${esc(s.name)}</span>` : `<span class="wp-n">${esc(s.name)}</span>`;
      let h = `<div class="wp-in"><div class="wp-head${s.why ? ' no' : ''}">${s.why ? '' : cap(touch ? '' : 'LMB')}${words}</div>`;
      if (s.why) h += `<div class="wp-why">${esc(s.why)}</div>`;
      if (s.cost?.length) h += `<div class="wp-subs bld-cost">${s.cost.map((c) => `<span class="wp-sub ${c.ok ? 'ok' : 'no'}">${esc(c.text)}</span>`).join('')}</div>`;
      if (s.keys?.length && !touch) h += `<div class="wp-subs bld-keys">${s.keys.map(([k, l]) => `<span class="wp-sub">${cap(k)}${esc(l)}</span>`).join('')}</div>`;
      el.innerHTML = h + '</div>';
      this.w = el.offsetWidth; this.h = el.offsetHeight;
    }
    this.at = s.at;
    const pr = (G as unknown as { pr?: { worldToScreen?: (v: THREE.Vector3) => { x: number; y: number; z: number } } }).pr;
    if (!pr?.worldToScreen) return;
    const sc = pr.worldToScreen(_v.set(this.at.x, this.at.y, this.at.z));
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
