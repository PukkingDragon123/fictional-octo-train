// The prologue before the first run (./prologue.ts): no link room, the run
// starts at once and its intro (src/game/intro.ts) plays the link as a
// transition (./signal.ts), the old intake drag cinematic, then the wake in
// Level 0 and Dr. Calder's tutorial.
//   prologueWanted(), runPrologue(), replayPrologue(), prologueEntry(el?)
export { prologueWanted, runPrologue, replayPrologue, CALDER_VOICE, INTRO_FROM_KEY } from './prologue';
export { prologueEntry } from './entry';
export { SignalWipe, SIGNAL_DUR } from './signal';
