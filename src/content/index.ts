// Content registry: importing this module registers all textures, furniture,
// items, recipes, creatures and lore with the engine. Content modules are
// plain side-effect imports so new files only need to be listed here.
import { registerAllTextures } from '../gfx/textures/index';
import './furniture_basic';

// ---- content modules (added as they are authored) ----
const modules = import.meta.glob(['./textures/*.ts', './furniture/*.ts', './items/*.ts', './recipes/*.ts', './lore/*.ts'], { eager: true });
void modules;

export function registerContent() {
  registerAllTextures();
}
