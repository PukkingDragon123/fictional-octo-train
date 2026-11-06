// Round 12 HUD parts: the adaptive context buttons and the hotbar (installed by the inventory UI).
import './hotbar.css';
import { G } from '../../game/G';
import { ContextBar } from './context';
import { HotbarStrip } from './hotbar';

let installed = false;
export function installHud12() {
  if (installed) return;
  installed = true;
  const ctx = new ContextBar();
  const hot = new HotbarStrip();
  G.addSystem({ name: 'hud12', update: (dt: number) => { try { ctx.update(dt); hot.update(dt); } catch (e) { console.warn('hud12', e); } } });
}
