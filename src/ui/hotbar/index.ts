// Round 12 HUD parts: the adaptive context buttons, the hotbar, the quest broadcast and
// Inspect Yourself (installed by the inventory UI).
import './hotbar.css';
import { G } from '../../game/G';
import { ContextBar } from './context';
import { HotbarStrip } from './hotbar';
import { QuestBroadcast } from '../watch/broadcast';
import { SelfInspect } from '../selfInspect';

let installed = false;
export function installHud12() {
  if (installed) return;
  installed = true;
  const ctx = new ContextBar();
  const hot = new HotbarStrip();
  // the quest broadcast (J) and Inspect Yourself (O) live beside them
  try { new QuestBroadcast(); } catch (e) { console.warn('broadcast', e); }
  try { new SelfInspect(); } catch (e) { console.warn('selfInspect', e); }
  G.addSystem({ name: 'hud12', update: (dt: number) => { try { ctx.update(dt); hot.update(dt); } catch (e) { console.warn('hud12', e); } } });
}
