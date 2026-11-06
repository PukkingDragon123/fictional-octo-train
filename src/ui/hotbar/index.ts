// HUD parts: what the hands can do (round 12 logic; round 14 shows it as floating world
// text, src/ui/worldPrompt.ts, plus a small chamfered touch pad, src/ui/touch/actpad.ts),
// the hotbar, the quest broadcast and Inspect Yourself (installed by the inventory UI).
import './hotbar.css';
import { G } from '../../game/G';
import { ContextBar, ctxAllowed } from './context';
import { HotbarStrip } from './hotbar';
import { QuestBroadcast } from '../watch/broadcast';
import { SelfInspect } from '../selfInspect';
import { WorldPrompt } from '../worldPrompt';
import { ActPad } from '../touch/actpad';
import { isTouchMode } from '../touch/mode';

let installed = false;
export function installHud12() {
  if (installed) return;
  installed = true;
  const ctx = new ContextBar();
  const hot = new HotbarStrip();
  const wp = new WorldPrompt();
  wp.onRun = (a) => { ctx.runAction(a); };
  const pad = new ActPad();
  // the quest broadcast (J) and Inspect Yourself (O) live beside them
  try { new QuestBroadcast(); } catch (e) { console.warn('broadcast', e); }
  try { new SelfInspect(); } catch (e) { console.warn('selfInspect', e); }
  G.addSystem({ name: 'hud12', update: (dt: number) => {
    try {
      ctx.update(dt); hot.update(dt);
      const g: any = G, touch = isTouchMode();
      const allowed = !ctx.hidden && ctxAllowed();
      // the labels step aside for the pack, the inventory, photo mode and the eye view
      const labels = allowed && !G.ui?.inventory?.open && !g.pack?.open && !g.camera?.photo?.active && !g.pr?.eyeCamera;
      wp.update(dt, ctx.list, labels, touch);
      pad.update(ctx.list, allowed, touch);
    } catch (e) { console.warn('hud12', e); }
  } });
}
