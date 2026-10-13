import type { Game } from './game';

/** Global access to the running game (set once at boot). */
export let G: Game = null as any;
export function setGame(g: Game) { G = g; }
