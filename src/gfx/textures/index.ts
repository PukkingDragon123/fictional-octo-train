// Registers every procedural texture into the shared atlas.
// Each module exports a register function; order does not matter.
import { registerLobbyTextures } from './lobby';

const registrars: (() => void)[] = [registerLobbyTextures];

/** Modules call this at import time to add their registrar */
export function addTextureModule(fn: () => void) { registrars.push(fn); }

export function registerAllTextures() {
  for (const r of registrars) {
    try { r(); } catch (e) { console.error('texture module failed', e); }
  }
}
