// First-person close-ups (the watch, the backpack, inspecting an item, eating,
// surgery views) all draw into the renderer's overlay scene (G.pr.overlayScene /
// overlayCamera, rendered pixel-style over the world). Only one owner shows at a
// time: claim the stage, build into your own group, release when done.
//
// Every claim plays a short cut: the world camera dollies in toward the survivor's
// head, cinema bars slide in and the edges darken, while fpBlend() eases 0 -> 1 for
// the owner to drive its own entrance (raise the arm, swing the pack round). Release
// plays it backwards. 'glance' is the light version for looks taken on the move.
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';

export type FpCinematic = 'full' | 'glance' | 'none';
export interface FpClaimOpts { cinematic?: FpCinematic }

/** tunables for the cut */
export const FP_CUT = { inSecs: 0.42, outSecs: 0.3, push: 0.42, pitch: 9, glancePush: 0.12, bars: 9, glanceBars: 0 };

let owner: string | null = null;
let ownerPrio = 0;
let mode: FpCinematic = 'none';
const groups = new Map<string, THREE.Group>();

/** your group in the overlay scene; it is only visible while you own the stage */
export function fpGroup(name: string): THREE.Group {
  let g = groups.get(name);
  if (!g) {
    g = new THREE.Group();
    g.name = 'fp:' + name;
    g.visible = owner === name;
    groups.set(name, g);
    G.pr.overlayScene.add(g);
  }
  return g;
}

/** take the stage (a higher priority steals it; the loser gets bus 'fpLost' (name)) */
export function fpClaim(name: string, prio = 0, opts: FpClaimOpts = {}): boolean {
  if (owner && owner !== name && prio <= ownerPrio) return false;
  const prev = owner;
  owner = name; ownerPrio = prio;
  for (const [k, g] of groups) g.visible = k === name;
  fpGroup(name).visible = true;
  G.pr.overlayEnabled = true;
  if (prev && prev !== name) bus.emit('fpLost', prev);
  cut(opts.cinematic ?? 'full', true, !!prev);
  bus.emit('fpChange', name);
  return true;
}

export function fpRelease(name: string) {
  if (owner !== name) return;
  owner = null; ownerPrio = 0;
  const g = groups.get(name); if (g) g.visible = false;
  G.pr.overlayEnabled = false;
  cut(mode, false, false);
  bus.emit('fpChange', null);
}

export function fpOwner(): string | null { return owner; }
export function fpCamera(): THREE.PerspectiveCamera { return G.pr.overlayCamera; }

// ---------------------------------------------------------------- the cut
let blend = 0, goal = 0, raf = 0, last = 0;
let bars: HTMLDivElement | null = null;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** 0..1 eased progress of the current cut-in (1 = fully in first person); drive your entrance with it */
export function fpBlend(): number { return ease(blend); }
/** the raw linear progress, for owners that ease themselves */
export function fpBlendLinear(): number { return blend; }

function ensureBars() {
  if (bars || typeof document === 'undefined') return;
  bars = document.createElement('div');
  bars.className = 'fp-cut';
  bars.innerHTML = '<i class="t"></i><i class="b"></i><i class="v"></i>';
  const st = document.createElement('style');
  st.textContent = `.fp-cut{position:fixed;inset:0;pointer-events:none;z-index:30}
.fp-cut i{position:absolute;left:0;right:0;background:#000;height:0}
.fp-cut .t{top:0}.fp-cut .b{bottom:0}
.fp-cut .v{inset:0;height:auto;background:radial-gradient(ellipse at 50% 55%,transparent 52%,rgba(0,0,0,.62) 100%);opacity:0}`;
  document.head.appendChild(st);
  document.body.appendChild(bars);
}

function cut(m: FpCinematic, entering: boolean, handover: boolean) {
  if (entering) mode = m;
  if (m === 'none') { blend = goal = entering ? 1 : 0; paint(); return; }
  ensureBars();
  goal = entering ? 1 : 0;
  // handing the stage from one owner to another: no dolly back out and in again
  if (handover) blend = Math.max(blend, 0.6);
  const glance = m === 'glance';
  const reduce = !!(G as unknown as { camera?: { comfort?: boolean } }).camera?.comfort;
  if (entering) G.camera?.pushIn?.(glance ? FP_CUT.glancePush : FP_CUT.push * (reduce ? 0.5 : 1), FP_CUT.inSecs, glance ? 0 : FP_CUT.pitch);
  else G.camera?.pushIn?.(0, FP_CUT.outSecs);
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); }
}

function step(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const secs = goal > blend ? FP_CUT.inSecs : FP_CUT.outSecs;
  blend = goal > blend ? Math.min(goal, blend + dt / secs) : Math.max(goal, blend - dt / secs);
  paint();
  raf = blend === goal ? 0 : requestAnimationFrame(step);
}

function paint() {
  if (!bars) return;
  const k = ease(blend);
  // 'none' claims (props held while you keep playing) show no bars or vignette
  const h = mode === 'none' ? 0 : (mode === 'glance' ? FP_CUT.glanceBars : FP_CUT.bars) * k;
  (bars.children[0] as HTMLElement).style.height = h + 'vh';
  (bars.children[1] as HTMLElement).style.height = h + 'vh';
  (bars.children[2] as HTMLElement).style.opacity = String(mode === 'none' ? 0 : (mode === 'glance' ? 0.35 : 1) * k);
}
