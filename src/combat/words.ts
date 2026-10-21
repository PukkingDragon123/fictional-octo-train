// Free-floating fight text: no boxes, real type (src/ui/fonts.css), a soft
// dark halo (nc-free-text). Key prompts hang beside the body while a struggle
// or a finisher wants them; what just happened (a perfect blow, a counter,
// the name of a finisher) rises off the spot or slams down onto it.
// Pooled elements, positioned every frame from world points.
import * as THREE from 'three';
import { G } from '../game/G';
import './combat.css';

const _p = new THREE.Vector3();
const _s = { x: 0, y: 0, z: 0 };
/** world -> CSS px without allocating (falls back to the renderer's own helper) */
function project(x: number, y: number, z: number) {
  const pr: any = G.pr;
  if (pr && pr.camera && pr.subOffset && typeof pr.margin === 'number') {
    _p.set(x, y, z).project(pr.camera);
    const RW = pr.lowW + pr.margin * 2, RH = pr.lowH + pr.margin * 2;
    _s.x = (((_p.x + 1) / 2) * RW - pr.margin - pr.subOffset.x) * pr.scale / pr.dpr;
    _s.y = window.innerHeight - (((_p.y + 1) / 2) * RH - pr.margin - pr.subOffset.y) * pr.scale / pr.dpr;
    _s.z = _p.z;
  } else {
    const r = pr?.worldToScreen?.(_p.set(x, y, z)) ?? { x: -999, y: -999, z: 2 };
    _s.x = r.x; _s.y = r.y; _s.z = r.z;
  }
  return _s;
}

interface Prompt { el: HTMLDivElement; key: HTMLElement; hint: HTMLElement; k: string; h: string; cls: string; used: boolean }
interface Floater { wrap: HTMLDivElement; x: number; y: number; z: number; until: number }

export class Words {
  root: HTMLDivElement;
  private prompts: Prompt[] = [];
  private n = 0;
  private floats: Floater[] = [];
  /** animation frames since the fight last drew (the game ticks once per frame; more means it is paused or gone) */
  private idle = 0;
  private hidden = false;

  constructor() {
    document.getElementById('nc-combat-words')?.remove();
    this.root = document.createElement('div');
    this.root.id = 'nc-combat-words';
    this.root.className = 'cbw-layer';
    document.body.appendChild(this.root);
    // nothing drives the layer while the game is paused or gone: hide it then
    const watch = () => {
      const stale = !G || (G as any).paused || ++this.idle > 3;
      if (stale !== this.hidden) { this.hidden = stale; this.root.style.visibility = stale ? 'hidden' : ''; }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  }

  begin() { this.n = 0; this.idle = 0; }

  /**
   * A key prompt this frame at a world point: `key` in sign letters ("SPACE", "E", "TAP"),
   * `hint` underneath in pen ("hammer it"). cls: '' | 'hot' (its turn) | 'dim' | 'hurry' | 'go'.
   */
  prompt(key: string, hint: string, x: number, y: number, z: number, cls = '', scale = 1) {
    let P = this.prompts[this.n];
    if (!P) {
      const el = document.createElement('div');
      el.className = 'cbw-p nc-free-text';
      const k = document.createElement('b'), h = document.createElement('i');
      el.append(k, h);
      this.root.appendChild(el);
      P = { el, key: k, hint: h, k: '', h: '', cls: '', used: false };
      this.prompts.push(P);
    }
    this.n++;
    if (P.k !== key) { P.k = key; P.key.textContent = key; }
    if (P.h !== hint) { P.h = hint; P.hint.textContent = hint; P.hint.style.display = hint ? '' : 'none'; }
    if (P.cls !== cls) { P.cls = cls; P.el.className = 'cbw-p nc-free-text' + (cls ? ' ' + cls : ''); }
    const s = project(x, y, z);
    P.el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
    if (!P.used) { P.used = true; P.el.style.display = ''; }
  }

  /** what just happened, rising off a world point: cls 'ev' (+ a tint: perfect, counter, crit, down, dodge, free, bad) or 'fin' (a finisher's name) */
  pop(text: string, x: number, y: number, z: number, cls = 'ev', dur = 1.0) {
    if (this.floats.length > 8) { const f = this.floats.shift()!; f.wrap.remove(); }
    const wrap = document.createElement('div');
    wrap.className = 'cbw-f';
    const s = document.createElement('span');
    s.className = 'nc-free-text cbw-' + cls.split(' ').join(' cbw-');
    s.textContent = text;
    s.style.animationDuration = dur + 's';
    wrap.appendChild(s);
    this.root.appendChild(wrap);
    this.floats.push({ wrap, x, y, z, until: performance.now() + dur * 1000 });
  }

  end() {
    for (let i = this.n; i < this.prompts.length; i++) { const P = this.prompts[i]; if (P.used) { P.used = false; P.el.style.display = 'none'; } }
    const now = performance.now();
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      if (now > f.until) { f.wrap.remove(); this.floats.splice(i, 1); continue; }
      const s = project(f.x, f.y, f.z);
      f.wrap.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
    }
  }
}
