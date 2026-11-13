// THE PANIC STATE (round 17): when the unit is too frightened to do fiddly things. Built on what the game
// already tracks: the body's panic (body.ts), its health and blood, a sudden jump in panic (a loud scare),
// and the inhabitants (an inhabitant chasing or attacking the unit, or one hunting close by).
//
//   isPanicked(p?)        is the unit panicking now (the local unit by default)
//   panicWhy(p?)          why: 'hunted' | 'panic' | 'scare' | 'hurt' | null
//   huntedBy(p?)          the inhabitant hunting the unit, if any
//   panicLocks(action)    is this action locked by the panic: 'watch' | 'craft' | 'build' | 'read' | 'press'
//   panicFumble(action)   the cue for a locked action: a denial sound, the body console's heart kicks and its
//                         readout flashes, bus 'panicFumble' (action) for whoever shows more (the band's shaky
//                         raise). No text box.
//
// Scripted browsers (the walkthrough) are never locked unless a test forces it: window.__panic = true / false.
import { G } from './G';
import { bus } from '../core/events';
import type { Player } from '../entities/player';
import type { Creature } from '../creatures/creature';
import { isThreat } from '../creatures/behaviors_b';
import { sfx } from '../ui/menus/sfx';

export type PanicAction = 'watch' | 'craft' | 'build' | 'read' | 'press';
export type PanicWhy = 'hunted' | 'panic' | 'scare' | 'hurt';

/** panic at or above this locks the fiddly things */
const PANIC_AT = 65;
/** an inhabitant this close, chasing or attacking the unit, counts as hunting it (tiles) */
const HUNT_R = 16;
/** any threat this close and on the attack, whoever it is after */
const NEAR_R = 7;

// a scare: panic jumping by this much within a second locks for a few seconds
let lastPanic = 0, lastT = 0, scareUntil = 0;
function scareCheck(p: Player) {
  const now = performance.now();
  const v = p.body?.panic ?? 0;
  if (now - lastT > 250) {
    const dt = Math.max(0.25, (now - lastT) / 1000);
    if (lastT && (v - lastPanic) / dt > 18) scareUntil = now + 3000;
    lastPanic = v; lastT = now;
  }
  return now < scareUntil;
}

export function huntedBy(p: Player | null | undefined = G.local): Creature | null {
  const cs = (G as any).creatures?.creatures as Map<string, Creature> | undefined;
  if (!p || !cs) return null;
  let best: Creature | null = null, bd = Infinity;
  for (const c of cs.values()) {
    if (c.zoneKey !== p.zoneKey || c.dead || !isThreat(c)) continue;
    const on = c.state === 'chase' || c.state === 'attack';
    if (!on) continue;
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    const mine = c.targetId === p.id;
    if ((mine && d < HUNT_R) || d < NEAR_R) { if (d < bd) { bd = d; best = c; } }
  }
  return best;
}

export function panicWhy(p: Player | null | undefined = G.local): PanicWhy | null {
  const force = (window as any).__panic;
  if (force === true) return 'panic';
  if (force === false) return null;
  if (typeof navigator !== 'undefined' && navigator.webdriver) return null;
  if (!p || !p.body || p.body.dead) return null;
  const b = p.body as any;
  if (huntedBy(p)) return 'hunted';
  if ((b.panic ?? 0) >= PANIC_AT) return 'panic';
  if (scareCheck(p)) return 'scare';
  if ((b.health ?? 100) < 22 || (b.blood ?? 100) < 38) return 'hurt';
  return null;
}
export const isPanicked = (p: Player | null | undefined = G.local) => panicWhy(p) !== null;

const LOCKS: Record<PanicAction, boolean> = { watch: true, craft: true, build: true, read: true, press: true };
export function panicLocks(action: PanicAction, p: Player | null | undefined = G.local): boolean {
  return !!LOCKS[action] && isPanicked(p);
}

let fumbleT = 0;
export function panicFumble(action: PanicAction) {
  const now = performance.now();
  if (now - fumbleT < 350) return;
  fumbleT = now;
  sfx('error', 0.55);
  // the body console: the heart kicks and its readout flashes
  const h = (G as any).hudBody as { heartV?: { kick?: (a: number, b?: number) => void }; labs?: Record<string, HTMLElement> } | undefined;
  h?.heartV?.kick?.(1.6, 0.9);
  const lab = h?.labs?.heart;
  if (lab) { lab.classList.remove('pnc-flash'); void lab.offsetWidth; lab.classList.add('pnc-flash'); setTimeout(() => lab.classList.remove('pnc-flash'), 1300); }
  bus.emit('panicFumble', action);
}

if (typeof document !== 'undefined' && !document.getElementById('pnc-css')) {
  const st = document.createElement('style');
  st.id = 'pnc-css';
  st.textContent = '@keyframes pnc-flash { 0%, 100% { filter: none; } 15%, 45%, 75% { filter: brightness(2.2) sepia(1) saturate(6) hue-rotate(-30deg); } 30%, 60% { filter: none; } } .pnc-flash { animation: pnc-flash 1.2s steps(1) both; }';
  document.head.append(st);
}
