// What the contract tutorial (./tutorial.ts) is doing right now, for the
// systems it steers without them importing it: the debt hooks (a guaranteed
// valuable in the first thing you break), the press, the handler, the band.
export const TUT = {
  /** the forced tutorial is running */
  running: false,
  /** the current step key ('' when not running) */
  step: '',
  /** the uid of the piece of furniture the tutorial asked you to break (its stash always holds a valuable) */
  target: -1,
};

// round 22: the lab introduction (src/ui/menus/guide/tour.ts runLabIntro): Dr. Calder showed the unit round the
// Meridian Institute of Liminality before its first link, so the first run (./firstRun.ts) does not introduce her again
export const LAB_INTRO_KEY = 'noclip.labintro.v1';
export function labIntroDone(): boolean { try { return localStorage.getItem(LAB_INTRO_KEY) === '1'; } catch { return false; } }
