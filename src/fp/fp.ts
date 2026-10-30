// First-person close-ups (the watch, the backpack, inspecting an item, eating,
// surgery views) all draw into the renderer's overlay scene (G.pr.overlayScene /
// overlayCamera, rendered pixel-style over the world). Only one owner shows at a
// time: claim the stage, build into your own group, release when done.
//
// Every claim plays a short cut: the world camera dollies in toward the survivor's
// head, cinema bars slide in and the edges darken, while fpBlend() eases 0 -> 1 for
// the owner to drive its own entrance (raise the arm, swing the pack round). Release
// plays it backwards. 'glance' is the light version for looks taken on the move.
//
// A 'full' claim goes all the way into the head: the dive ends in a quick dip to black,
// the world behind the hands switches to the survivor's own eyes (eye.ts) and it comes
// back up on first person. The hands stay hidden until then, so they never float over
// the iso view. Release dips back out and the camera eases away from the head.
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import { eyeEnter, eyeExit, eyeActive } from './eye';

export type FpCinematic = 'full' | 'glance' | 'none';
export interface FpClaimOpts {
  cinematic?: FpCinematic;
  /** full claims: how far the eyes look down (deg); defaults per owner (EYE_PITCH) */
  eyePitch?: number;
}

/** tunables for the cut (eye: full claims go into first person; dive: seconds of push before the blink) */
export const FP_CUT = {
  inSecs: 0.42, outSecs: 0.3, push: 0.42, pitch: 9, glancePush: 0.12, bars: 9, glanceBars: 0, vignette: 1, glanceVignette: 0.35,
  eye: true, divePush: 0.9, dive: 0.2, lidClose: 0.075, lidOpen: 0.24, eyeBars: 7,
};
/** where each owner's eyes rest (deg below the horizon) */
const EYE_PITCH: Record<string, number> = { watch: 32, pack: 36, eat: 26, bench: 30, cook: 30, surgery: 30, trade: 16, dominion: 20 };

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
  // a higher priority steals the stage; so does a full close-up over a passing glance of the same rank
  // (opening the pack while the watch peeks at a message)
  const full = (opts.cinematic ?? 'full') === 'full';
  if (owner && owner !== name && prio <= ownerPrio && !(full && mode !== 'full' && prio === ownerPrio)) return false;
  const prev = owner;
  owner = name; ownerPrio = prio;
  for (const [k, g] of groups) g.visible = k === name;
  fpGroup(name).visible = true;
  G.pr.overlayEnabled = true;
  if (prev && prev !== name) bus.emit('fpLost', prev);
  eyePitch = opts.eyePitch ?? EYE_PITCH[name] ?? 24;
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
// the blink: lid 0 open .. 1 shut; lidGoal; what to do when the lids meet
let lid = 0, lidGoal = 0, atShut: (() => void) | null = null;
let eyePitch = 24, diveT = -1;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** 0..1 eased progress of the current cut-in (1 = fully in first person); drive your entrance with it */
export function fpBlend(): number { return ease(blend); }
/** the raw linear progress, for owners that ease themselves */
export function fpBlendLinear(): number { return blend; }

function ensureBars() {
  if (bars || typeof document === 'undefined') return;
  bars = document.createElement('div');
  bars.className = 'fp-cut';
  bars.innerHTML = '<i class="t"></i><i class="b"></i><i class="v"></i><i class="lt"></i><i class="lb"></i>';
  const st = document.createElement('style');
  st.textContent = `.fp-cut{position:fixed;inset:0;pointer-events:none;z-index:30}
.fp-cut i{position:absolute;left:0;right:0;background:#000;height:0}
.fp-cut .t{top:0}.fp-cut .b{bottom:0}
/* the cut: one quick dip to black (no eyelids) */
.fp-cut .lt{inset:0;height:auto;opacity:0}.fp-cut .lb{display:none}
/* the close-up's edges fall off to a warm black (lamp-lit rooms), harder toward the corners: the eye goes to the lit middle */
.fp-cut .v{inset:0;height:auto;background:radial-gradient(ellipse 72% 68% at 50% 55%,transparent 58%,rgba(8,5,2,.42) 78%,rgba(5,3,1,.74) 100%);opacity:0}`;
  document.head.appendChild(st);
  document.body.appendChild(bars);
}

/** close the lids, run `mid` while they are shut, open them again */
function blink(mid: () => void) {
  atShut = mid; lidGoal = 1;
}
function hideHands(on: boolean) { if (G.pr) (G.pr as unknown as { hideOverlay: boolean }).hideOverlay = on; }

function cut(m: FpCinematic, entering: boolean, handover: boolean) {
  if (entering) mode = m;
  const wantEye = FP_CUT.eye && entering && m === 'full' && !!G.local;
  // leaving the eyes (release, or a full look turning into a glance / prop): blink back out
  if (!wantEye && (eyeActive() || diveT >= 0 || lidGoal === 1)) {
    diveT = -1;
    ensureBars();
    blink(() => { eyeExit(); hideHands(false); G.camera?.pushIn?.(entering && m === 'glance' ? FP_CUT.glancePush : 0, FP_CUT.outSecs); });
  }
  if (m === 'none') { blend = goal = entering ? 1 : 0; paint(); if (lidGoal || lid) kick(); return; }
  ensureBars();
  goal = entering ? 1 : 0;
  // handing the stage from one owner to another: no dolly back out and in again
  if (handover) blend = Math.max(blend, 0.6);
  const glance = m === 'glance';
  const reduce = !!(G as unknown as { camera?: { comfort?: boolean } }).camera?.comfort;
  if (wantEye) {
    if (lidGoal === 1) {
      // a blink out is under way (one close-up handing back to another): turn it into a blink
      // that stays in the eyes, instead of letting the shut lids drop us back to the iso view
      diveT = -1;
      atShut = () => { eyeEnter({ pitchDeg: eyePitch }); hideHands(false); };
    } else if (!eyeActive()) {
      // dive at the head, then blink into the eyes; the hands wait behind the lids
      G.camera?.pushIn?.(FP_CUT.divePush * (reduce ? 0.6 : 1), FP_CUT.dive + FP_CUT.lidClose, FP_CUT.pitch);
      hideHands(true);
      diveT = 0;
    } else eyeEnter({ pitchDeg: eyePitch });
  } else if (entering) {
    if (!eyeActive() && lidGoal === 0) G.camera?.pushIn?.(glance ? FP_CUT.glancePush : FP_CUT.push * (reduce ? 0.5 : 1), FP_CUT.inSecs, glance ? 0 : FP_CUT.pitch);
  } else if (!eyeActive() && lidGoal === 0) G.camera?.pushIn?.(0, FP_CUT.outSecs);
  kick();
}

function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); } }

function step(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const secs = goal > blend ? FP_CUT.inSecs : FP_CUT.outSecs;
  blend = goal > blend ? Math.min(goal, blend + dt / secs) : Math.max(goal, blend - dt / secs);
  // the dive ends in a blink into the eyes
  if (diveT >= 0) {
    diveT += dt;
    if (diveT >= FP_CUT.dive) {
      diveT = -1;
      blink(() => { if (owner && mode === 'full') { eyeEnter({ pitchDeg: eyePitch }); } hideHands(false); });
    }
  }
  if (lidGoal === 1) {
    lid = Math.min(1, lid + dt / FP_CUT.lidClose);
    if (lid >= 1) { const f = atShut; atShut = null; lidGoal = 0; f?.(); }
  } else if (lid > 0) lid = Math.max(0, lid - dt / FP_CUT.lidOpen);
  paint();
  raf = blend === goal && diveT < 0 && lid === 0 && lidGoal === 0 ? 0 : requestAnimationFrame(step);
}

function paint() {
  if (!bars) return;
  const k = ease(blend);
  // 'none' claims (props held while you keep playing) show no bars or vignette
  const h = mode === 'none' ? 0 : (mode === 'glance' ? FP_CUT.glanceBars : eyeActive() ? FP_CUT.eyeBars : FP_CUT.bars) * k;
  (bars.children[0] as HTMLElement).style.height = h + 'vh';
  (bars.children[1] as HTMLElement).style.height = h + 'vh';
  // a dip to black, not eyelids
  (bars.children[3] as HTMLElement).style.opacity = String(Math.min(1, lid * 1.15));
  (bars.children[2] as HTMLElement).style.opacity = String(mode === 'none' ? 0 : (mode === 'glance' ? FP_CUT.glanceVignette : FP_CUT.vignette) * k);
}
