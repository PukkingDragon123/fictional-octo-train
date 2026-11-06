// The prologue before the run (./prologue.ts: the operator strapped into the
// link rig, Dr. Calder a voice on the intercom, the shock, then the wake in
// Level 0) and the shared link-suite set (./set.ts) the run's handshake
// cinematic (src/game/intro.ts) reuses.
//   prologueWanted(), runPrologue(), replayPrologue(), prologueEntry(el?)
export { prologueWanted, runPrologue, replayPrologue, CALDER_VOICE, INTRO_FROM_KEY } from './prologue';
export { prologueEntry } from './entry';
