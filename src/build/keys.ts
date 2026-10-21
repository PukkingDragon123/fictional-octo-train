// Swallow a key press this frame so systems and UI that run after us don't also act on it.
import { G } from '../game/G';
import type { Action } from '../core/input';

export function consume(...acts: Action[]) {
  const inp = G.input;
  for (const a of acts) for (const c of inp.bindings[a] || []) inp.pressed.delete(c);
}
