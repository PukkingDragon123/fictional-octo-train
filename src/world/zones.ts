// Registers every zone of the simulation with the world graph.
import { defZone } from './worldGraph';
import { generateLobby } from './gen/lobby';

defZone({ key: 'lobby', name: 'Level 0 — The Lobby', W: 160, H: 160, gen: (z, s) => { generateLobby(z, s); }, depth: 0,
  blurb: 'Mono-yellow. Moist carpet. The hum never stops.' });
