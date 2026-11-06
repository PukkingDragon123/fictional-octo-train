// One operation on the unit: the tool arm takes up its tool and goes to the
// part, the camera closes in, the player works the mini-game (or the robot
// does it alone when mini-games are off), and it ends in a flourish or a
// mishap. The change always takes; how cleanly is the only question.
import type { SubjectRoom, ShotName } from '../room3d';
import type { ToolKind } from '../scene/tools3d';
import { playGame, autoPlay, type GameKind, type GameResult, type Grade } from './qte';
import { sfx } from '../sfx';

export interface OpDef {
  tool: ToolKind; anchor: string; game: GameKind; verb: string; hint?: string; shot?: ShotName;
  path?: string; targets?: string[]; hits?: number; beats?: number; tempo?: number; paint?: number;
  /** what it does, in a few words (shown with the tool) */
  does: string;
}

export const TOOL_NAME: Record<ToolKind, string> = {
  saw: 'Bone saw', scalpel: 'Scalpel', laser: 'Laser', stamp: 'Die stamp', clipper: 'Clipper', spray: 'Spray nozzle', injector: 'Injector', clamp: 'Clamp', welder: 'Welder', scanner: 'Scanner',
};

const WORDS: Record<Grade, Partial<Record<ToolKind, string[]>> & { any: string[] }> = {
  perfect: {
    any: ['Flawless', 'Textbook', 'Surgical'],
    saw: ['Clean cut', 'Like butter'], scalpel: ['Surgical', 'Hairline'], laser: ['Precise', 'Not a mark'], stamp: ['Perfect fit', 'Pressed true'],
    clipper: ['Sharp', 'Fresh cut'], spray: ['Even coat', 'Not a streak'], injector: ['Right dose', 'In the vein'], clamp: ['Textbook', 'Snug'], welder: ['Seamless', 'Clean bead'],
  },
  good: {
    any: ['Neat', 'Good enough', 'Passable', 'It will heal'],
    saw: ['Rough edges', 'Mostly straight'], spray: ['A bit patchy'], welder: ['Lumpy seam'], clipper: ['Uneven'], stamp: ['Slightly off'],
  },
  fail: {
    any: ['Whoops', 'Malpractice', 'Oh no'],
    saw: ['It slipped', 'Kickback'], scalpel: ['Nicked an artery', 'Deep one'], laser: ['Ricochet', 'Scorched'], stamp: ['Too hard', 'Bonk'],
    clipper: ['Runaway clipper', 'Patchy'], spray: ['Overspray', 'Painted the lens'], injector: ['Needle snapped', 'Wrong vein'], clamp: ['Crack', 'Too tight'], welder: ['Crispy', 'Flashback'],
  },
};
const SUB: Record<Grade, string[]> = {
  perfect: ['not a drop wasted', 'the unit barely noticed', 'a fine piece of work'],
  good: ['close enough', 'the unit will live', 'it took'],
  fail: ['it took anyway', 'the change held', 'mop on aisle four', 'the unit will remember that'],
};
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
export function resultWords(g: Grade, tool: ToolKind): { big: string; small: string } {
  const W = WORDS[g];
  return { big: pick([...(W[tool] ?? []), ...(W[tool] ? [] : W.any), ...(Math.random() < 0.25 ? W.any : [])]), small: pick(SUB[g]) };
}

export interface OpRun {
  room: SubjectRoom; host: HTMLElement; def: OpDef; games: boolean;
  onProgress?: (k: number) => void; onClimax: () => void;
  /** show the verdict */
  verdict?: (g: Grade, skipped: boolean, words: { big: string; small: string }) => void;
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runOp(o: OpRun): Promise<GameResult> {
  const { room, def } = o;
  room.scan(false);
  if (def.paint !== undefined) room.setPaint(def.paint);
  room.useTool(def.tool, def.anchor);
  room.toolWork(0);
  // pull back so the tool is in the picture (the tight shots more)
  room.setZoom(def.shot && ['eyes', 'nose', 'mouth', 'brows', 'ears', 'beard'].includes(def.shot) ? 1.62 : 1.35);
  if (def.shot) void room.shot(def.shot, 650);
  sfx('servo', 0.6);
  // let the arm change tools and get there (it is physical: it takes a moment)
  for (let i = 0; i < 30 && !room.toolReady; i++) await sleep(60);
  await sleep(120);
  const spec = {
    kind: def.game, tool: def.tool, verb: def.verb, hint: def.hint, anchor: def.anchor, path: def.path, targets: def.targets, hits: def.hits, beats: def.beats, tempo: def.tempo,
    onProgress: o.onProgress, onClimax: o.onClimax,
  };
  const res = o.games ? await playGame(room, spec, o.host) : await autoPlay(room, spec);
  if (res.grade === 'fail' && !res.skipped) await room.toolMishap();
  else await room.toolFlourish();
  if (res.grade === 'perfect' && !res.skipped) sfx('perfect', 0.8);
  o.verdict?.(res.grade, res.skipped, resultWords(res.grade, def.tool));
  room.toolWork(0); room.toolRun(0); room.toolPress(0);
  room.setZoom(1);
  return res;
}
