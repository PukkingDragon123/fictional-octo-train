// What the lab's props have to say when pressed (rooms/pokes.ts shows them on
// an in-scene readout plate): staff memos, maintenance tags, redacted lines,
// lore. One list per kind of prop; a prop cycles through its list.
import type { PokeNote } from './pokes';
import type { SinRank } from '../../../creatures/lore';
import type { CurioKind } from './vault';

const memo = (head: string, ...lines: string[]): PokeNote => ({ head, lines, tone: 'memo' });
const red = (head: string, stamp: string, ...lines: string[]): PokeNote => ({ head, lines, stamp, tone: 'red' });
const lore = (head: string, ...lines: string[]): PokeNote => ({ head, lines, tone: 'lore' });

export const NOTES = {
  gauges: [
    memo('Maintenance tag · B. Okafor', 'Needles jump when a unit crosses over. That is normal.', 'Needles jump when NOBODY is crossing over. Call me.'),
    memo('Calibration log', 'Last calibrated: never. Reads plus or minus everything.', 'If the red zone looks wider than yesterday, it is.'),
    red('Night shift', 'NOTED', 'Surge at 03:12. No unit on the rig. Chair 4 warm to the touch.'),
  ],
  fuse: [
    red('Breaker panel 9', 'DO NOT', 'Breaker 9 trips itself. Do not reset breaker 9.', 'It is feeding something the drawings do not show.'),
    memo('Electrical', '415 V three phase. Rubber gloves on the hook.', 'The hook is empty. Ask Facilities where the gloves went.'),
  ],
  filing: [
    memo('Drawer: UNITS', 'Contracts, debts, next of kin (none listed).', 'Signatures in the debtors\' own hand. Some in blood. All binding.'),
    red('Drawer: VOID', 'VOID', 'Files for units that came back wrong.', 'Pull a file. Read it once. Put it back facing the wall.'),
    memo('Drawer: LINK', 'Rig 4 wiring diagrams, revision 31.', 'Revision 30 is missing. Revision 30 is why we have revision 31.'),
  ],
  clock: [
    memo('Facilities', 'All institute clocks run 4 minutes fast.', 'So you are never late for a crossing. So you are always early.'),
    lore('Dr. Calder, pencil on the wall', 'Count the chimes. If it strikes thirteen, you are not in the control room.'),
  ],
  extinguisher: [
    memo('Inspection tag', 'Inspected: overdue. Pressure: green (painted on).', 'For fires only. Not for anything in the cells.'),
    red('Incident 4-112', 'DENIED', 'Request to fill it with almond water: denied.'),
  ],
  vent: [
    memo('HVAC', 'Return air to the plant room. Grille bolted shut.', 'The grille was bolted from the inside.'),
    red('Air handler', 'LISTEN', 'If the fan changes pitch on its own, do not answer it.'),
  ],
  boxes: [
    memo('Archive box', 'Overflow from A-1: field notes, photographs, a shoe.', 'Nobody has claimed the shoe.'),
  ],
  clutter: [
    memo('Shift handover', 'Coffee is fresh. The intercom is not.', 'Unit 4 asked for its mother again. Logged it.'),
  ],
  crest: [
    lore('The Meridian Institute of Liminality', 'NOS INTRAMUS UT VOS NON INTRETIS.', 'We go in so that you do not have to.'),
    lore('Founding charter, 1961', 'A survey of the space between the walls, for the benefit of all who owe.'),
  ],
  keypad: [
    red('Access', 'DENIED', 'ACCESS DENIED. CLEARANCE 4 REQUIRED.', 'Your attempt has been logged with your name, your debt and your shoe size.'),
    red('Access', 'DENIED', 'ACCESS DENIED. THE CODE CHANGED AT 06:00.', 'It is not 1234. It was never 1234.'),
  ],
  biolock: [
    red('Palm reader', 'NO MATCH', 'SCANNING... PALM NOT ON FILE.', 'Note: the reader also accepts paws. We did not ask for that.'),
    memo('Palm reader', 'Wipe the plate after use. Something keeps leaving prints.', 'Six fingers. Wet.'),
  ],
  beacon: [
    red('Alarm beacon', 'TEST', 'Rotating while a cell is open, or while anything inside is awake.', 'It has not stopped in eleven years.'),
  ],
  dossiers: [
    red('Dossier · unit 4', 'REDACTED', 'Debt: 41,880 credits. Crossings: 6. Returned: 6.', 'Remarks: ████████ speaks in its sleep in a voice that is not its own.'),
    red('Dossier · operator', 'EYES ONLY', 'Operator ██████: eleven units recovered, one lost.', 'The lost one still calls the intercom at 02:00.'),
    memo('Dossier · field note', 'Yellow room, east run: carpet damp to the touch.', 'Followed the hum for 40 minutes. The hum followed back.'),
  ],
  corkboard: [
    red('Evidence board', 'OPEN CASE', 'Red string: every sighting of the Strider joined up.', 'It draws a door. We are standing on the other side of it.'),
    memo('Evidence board', 'Photo 7: the Ball House, Level 7. A child\'s drawing taped to the slide.', 'The drawing is of this room.'),
  ],
  valve: [
    memo('Coolant valve', 'Quarter turn only. Then listen for the hiss.', 'No hiss: the line is frozen. Hiss and a knock: the line is not empty.'),
    red('Holding air', 'CAUTION', 'Valve 2 vents the chamber. It also vents whatever is in it.'),
  ],
  rack: [
    memo('LINK 04', 'Rig 4\'s mind: 48 drives, mirrored, encrypted, humming.', 'Unit memories are stored here between crossings. Some leak.'),
    red('Server log', 'CORRUPT', 'Drive 31 holds a file nobody wrote. It grows every night.'),
  ],
  terminal: [
    red('Terminal log', 'REDACTED', '> SEARCH "GUMMY RESIDUE"', '> 14 RESULTS. 13 ██████. 1 STILL MOVING.'),
    red('Terminal log', 'REDACTED', '> CELL A-07 FEED', '> SPLIT EVENTS THIS WEEK: 3. HALVES RECOVERED: 5.'),
    memo('Terminal log', '> WHO IS LOGGED IN', '> CALDER  OKAFOR  YOU  ██████'),
  ],
  cell: [
    red('Cell A-07 · residue', 'DO NOT FEED', 'Split-off jelly from a Ledge gummy. Fur still rooted in it.', 'Quivers when watched. Grows when not.'),
    lore('Inhabitant note', 'The jelly reproduces by pinching itself in two.', 'Each half keeps a limb. Each half remembers the bear.'),
  ],
  vitrine: [
    lore('Curio', 'Recovered from the backrooms. Behaves wrongly in a small, patient way.'),
  ],
  blastDoor: [
    red('Vault B', 'SEALED', 'Sealed by order of the board, 1987.', 'Do not turn the wheel. If the wheel turns, leave.'),
    red('Vault B', 'SEALED', 'The wheel turned a quarter. It turned back on its own.'),
  ],
  decon: [
    memo('Decontamination', 'Ninety seconds under the spray after every crossing.', 'Carpet fibres in the drain are normal. Teeth are not.'),
  ],
  coldStore: [
    memo('Cold store', 'Minus 80. Gloves. Do not lick anything, Okafor.'),
    red('Cold store', 'LOGGED', 'Sample 112 was found on the wrong shelf. Then on the floor. Then by the door.'),
  ],
  dewar: [
    memo('Liquid nitrogen', 'Top up every Monday. Vent before opening.', 'The frost on it spells words some mornings. Wipe it off.'),
  ],
  obsWindow: [
    red('Observation', 'DO NOT TAP', 'Do not tap the glass. It knows what tapping means now.'),
  ],
  mirror: [
    lore('One-way mirror', 'Operators sit behind this glass during a link.', 'The unit cannot see you. The unit waves anyway.'),
  ],
  restraints: [
    memo('Restraints', 'Leather, steel, then the chain. In that order.', 'A unit in the chair is the safest unit in the building.'),
  ],
  gurney: [
    memo('Gurney', 'For units coming back from a crossing. Brake on.', 'Brake on. BRAKE ON. It rolls toward the hatch at night.'),
  ],
  lockers: [
    memo('Vault lockers', 'Each locker holds one thing that came back.', 'Locker 23 is warm. Locker 23 has always been warm.'),
  ],
  sign: [
    memo('Notice', 'Read the sign. Then read it again from the bottom up.'),
  ],
} satisfies Record<string, PokeNote[]>;

const RANK: Record<SinRank, string> = {
  sloth: 'Sloth: it waits. It can wait longer than you.',
  gluttony: 'Gluttony: it eats, and what it eats becomes it.',
  lust: 'Lust: it wants to be near you. Do not let it.',
  greed: 'Greed: it takes, and it keeps what it takes.',
  envy: 'Envy: it copies. Count your hands.',
  wrath: 'Wrath: it hunts. It is the reason for the beacon.',
  pride: 'Pride: it knows it is the top of this place.',
};
export function placardNote(rank: SinRank, cls?: string, cell?: string): PokeNote {
  return { head: `Containment placard${cell ? ' · ' + cell : ''}`, lines: [`Class: ${cls ?? 'Unclassed'}. Sin rank: ${rank.toUpperCase()}.`, RANK[rank]], tone: rank === 'wrath' || rank === 'pride' ? 'red' : 'lore' };
}
const CURIO: Record<CurioKind, string[]> = {
  watch: ['THE LATE WATCH', 'Runs four minutes behind whoever holds it. Nobody has worn it twice.'],
  doll: ['FACELESS DOLL', 'Found facing the wall in every room it was left in. Including this one.'],
  cube: ['NESTED CUBE', 'Inside the cube is a cube. Inside that is this room, smaller.'],
  phone: ['THE CALLER', 'The cord is knotted shut. It rings anyway. Do not pick it up.'],
  mask: ['SMILING MASK', 'The smile was a frown when it came in. Nobody admits to touching it.'],
  key: ['LONG KEY', 'Opens a door in Level 0 that is never in the same place twice.'],
  shard: ['BLACK SHARD', 'Absorbs light, and some sound. Hold it to your ear and hear the hum stop.'],
  jar: ['JAR OF TEETH', 'Human, mostly. More each inventory. The lid has never been opened.'],
  hourglass: ['UPHILL GLASS', 'The sand runs up. When it is all at the top, something comes to turn it.'],
  gummy: ['GUMMY RESIDUE', 'Candy flesh with fur in it. Warm. It flinches from the lamp.'],
};
export function curioNote(kind: CurioKind): PokeNote { const [h, l] = CURIO[kind]; return { head: 'Curio · ' + h, lines: [l], tone: 'lore' }; }
