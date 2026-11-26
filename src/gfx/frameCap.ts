// The frame cap (Settings > Display): 0 = follow the display (vsync), else at most this many frames a second.
// Read once a frame by the game loop (src/game/game.ts), so it is a plain number, not a settings parse.
let cap = 0;
try { cap = Number(JSON.parse(localStorage.getItem('noclip.gfx') || '{}').fpsCap) || 0; } catch { /* storage blocked */ }
export function fpsCap(): number { return cap; }
export function setFpsCap(n: number) { cap = Math.max(0, Math.round(n) || 0); }
