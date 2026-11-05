// What the observation room says about your death. Three regulars watch the
// feeds: Dr. Hale (standing, coffee), Ortiz the technician (seated, typing the
// report) and Sergeant Brandt (security, leaning on the console). A scene is an
// opener, a line about the cause, a reply that ribs the run, a closer while the
// report is typed, and a last word over the research tally. Crude, PG-13.
import type { CauseKey, RunReport } from './stats';

export type Who = 0 | 1 | 2;
export type Gesture = '' | 'facepalm' | 'point' | 'shrug' | 'mock' | 'clap' | 'sip' | 'lean' | 'head' | 'type';
export interface Line { who: Who; text: string; g: Gesture; shout?: boolean }

export const STAFF = [
  { name: 'DR. HALE', color: '#f3eedf' },
  { name: 'ORTIZ', color: '#c6f2bc' },
  { name: 'SGT. BRANDT', color: '#ffd59a' },
];

const OPEN: [string, Gesture][] = [
  ['omfg… this dumbass.', 'facepalm'],
  ['oh, come ON.', 'point'],
  ['no. no no no. {he} did NOT just—', 'head'],
  ['aaand {he}\'s dead.', 'sip'],
  ['are you kidding me right now?', 'point'],
  ['lmao. LMAO.', 'mock'],
  ['wow. wow. okay.', 'facepalm'],
  ['…did everybody see that?', 'point'],
  ['bro.', 'facepalm'],
  ['and there it is.', 'sip'],
  ['flatline. called it.', 'clap'],
  ['oof. that one\'s going in the reel.', 'mock'],
];

const CAUSE: Record<CauseKey, [string, Gesture][]> = {
  creature: [
    ['how did {he} die to THAT?', 'shrug'],
    ['{He} walked straight up to {who}. Straight up.', 'point'],
    ['it has a RULE. it\'s on the scanner. it is literally on the scanner.', 'facepalm'],
    ['{he} tried to fight {who}. with {his} hands.', 'mock'],
    ['classic. turn around, get eaten.', 'shrug'],
    ['{who} didn\'t even look hungry.', 'shrug'],
  ],
  harmless: [
    ['how did {he} die to THAT? it\'s {who}!', 'point'],
    ['{who}. {Who}! that thing is harmless!', 'facepalm'],
    ['I\'ve seen {who} lose a fight to a door.', 'mock'],
    ['killed by {who}. put that on the headstone.', 'mock'],
  ],
  wounds: [
    ['{he} just… kept walking around. bleeding.', 'shrug'],
    ['there were bandages in {his} BAG.', 'facepalm'],
    ['{who} got {him} ages ago. {he} died of not caring.', 'mock'],
  ],
  press: [
    ['{he} climbed INTO the press.', 'point'],
    ['the press. the thing with the giant warning stripes.', 'facepalm'],
    ['it says KEEP CLEAR. in letters THIS big.', 'shrug'],
    ['well. the debt\'s a little lighter now.', 'mock'],
  ],
  band: [
    ['{he} tried to take the band off. they ALWAYS try to take the band off.', 'facepalm'],
    ['that\'s what the beeping means. the beeping means STOP.', 'point'],
    ['boom. orientation covers this. page one.', 'shrug'],
  ],
  chess: [
    ['{he} lost a chess game. with {his} body.', 'mock'],
    ['stood on the red square. the RED square.', 'facepalm'],
  ],
  custody: [
    ['{he} died in CUSTODY? before the wall?', 'point'],
    ['we didn\'t even get {him} through the wall.', 'facepalm'],
  ],
  bleed: [
    ['{he} bled out. with a first aid kit on {him}.', 'facepalm'],
    ['it\'s like {he} forgot blood goes on the inside.', 'mock'],
  ],
  thirst: [
    ['dehydration. there\'s water in every other room.', 'shrug'],
    ['{he} walked past four sinks. I counted.', 'point'],
  ],
  hunger: [
    ['{he} starved. with a ration bar in {his} pocket.', 'facepalm'],
    ['the vending machines are RIGHT THERE.', 'point'],
  ],
  cold: [
    ['froze. {he} froze to death. indoors.', 'shrug'],
    ['there was a coat. on the floor. next to {him}.', 'point'],
  ],
  heat: [['cooked. {he} just stood in it.', 'shrug'], ['it was a hundred and ten in there and {he} kept the jacket on.', 'facepalm']],
  infection: [['{he} never cleaned a single wound.', 'facepalm'], ['rot. textbook rot.', 'shrug']],
  corrupt: [['{he} stood in the static. on purpose.', 'point'], ['you could SEE the corruption. it glows.', 'facepalm']],
  sick: [['{he} ate the grey meat. everybody knows not to eat the grey meat.', 'facepalm'], ['food poisoning. from OUR rations. a first.', 'shrug']],
  downed: [['{his} crew just left {him} there.', 'point'], ['friends. great friends.', 'mock']],
  other: [['killed by {who}. sure. why not.', 'shrug'], ['rewind it. I genuinely don\'t know what happened.', 'point']],
  unknown: [['what even killed {him}?', 'shrug'], ['rewind it. I genuinely don\'t know what happened.', 'point'], ['{he} just… stopped.', 'shrug']],
};

const REPLY: [string, Gesture][] = [
  ['I had {him} at three days in the pool. pay up.', 'mock'],
  ['that\'s going in the training video.', 'point'],
  ['I\'m not even mad. that was art.', 'clap'],
  ['shh. I\'m watching it again.', 'lean'],
  ['do we bill the family?', 'shrug'],
  ['honestly? personal best for this batch.', 'clap'],
  ['skill issue.', 'mock'],
];
const REPLY_SHORT: [string, Gesture][] = [
  ['{time}. {he} lasted {time}.', 'facepalm'],
  ['that has to be a record. a bad one.', 'mock'],
  ['the paperwork took longer than {his} run.', 'shrug'],
];
const REPLY_LONG: [string, Gesture][] = [
  ['shame. I actually liked this one.', 'shrug'],
  ['{days} days. {he} was actually good.', 'shrug'],
];
const REPLY_KILLS: [string, Gesture][] = [['{he} killed {kills} things and THAT\'s what got {him}?', 'point']];

const CLOSE: [string, Gesture][] = [
  ['put it on the wall of shame.', 'point'],
  ['that\'s the third one this week.', 'sip'],
  ['log it. send in the next one.', 'sip'],
  ['print it. the wall of shame needs a new row.', 'point'],
  ['reset the sign. days without a deletion: zero.', 'point'],
  ['someone tell accounting the debt\'s… uncollectable.', 'shrug'],
];
const TYPE: string[] = [
  'typing it up. cause of death: dumbass.',
  'cause of death… "yes".',
  'I\'m writing "stupidity". no, I\'m serious.',
  'report\'s filed. {he}\'s data now.',
  'subject {file}. deleted. next.',
];
const DATA: string[] = [
  'at least the data\'s good.',
  '{rp} research points. we\'ll take it.',
  'useful. barely.',
  'the lab gets {rp} points. {he} gets a drawer.',
];

function pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)]; }

export interface Scene { lines: Line[]; type: Line; data: Line }

/** a fresh scene for this death (pronouns from the subject's build) */
export function sceneFor(r: RunReport, she: boolean): Scene {
  const he = she ? 'she' : 'he', him = she ? 'her' : 'him', his = she ? 'her' : 'his';
  const days = Math.floor(r.hours / 24);
  const time = r.hours < 1 ? `${Math.max(1, Math.round(r.hours * 60))} minutes` : r.hours < 24 ? `${Math.round(r.hours)} hours` : `${days} days`;
  const who = r.cause.who || 'that';
  const fill = (s: string) => s
    .replace(/\{He\}/g, cap(he)).replace(/\{he\}/g, he).replace(/\{him\}/g, him).replace(/\{his\}/g, his)
    .replace(/\{Who\}/g, cap(who)).replace(/\{who\}/g, who)
    .replace(/\{days\}/g, String(days)).replace(/\{time\}/g, time).replace(/\{kills\}/g, String(r.kills))
    .replace(/\{rp\}/g, String(r.rp)).replace(/\{file\}/g, r.file).replace(/\{name\}/g, r.name);
  const op = pick(OPEN);
  const cs = pick(CAUSE[r.cause.key] || CAUSE.unknown);
  const rep = r.kills >= 3 && Math.random() < 0.6 ? pick(REPLY_KILLS) : r.hours < 6 && Math.random() < 0.7 ? pick(REPLY_SHORT) : r.hours >= 48 && Math.random() < 0.7 ? pick(REPLY_LONG) : pick(REPLY);
  const cl = pick(CLOSE);
  // who says what: Hale opens (or Brandt), Ortiz has the cause, Brandt ribs, Hale closes
  const opener: Who = Math.random() < 0.7 ? 0 : 2;
  const lines: Line[] = [
    { who: opener, text: fill(op[0]), g: op[1], shout: /!|[A-Z]{3}/.test(op[0]) },
    { who: opener === 0 ? 2 : 0, text: fill(cs[0]), g: cs[1] },
    { who: opener === 0 ? 0 : 2, text: fill(rep[0]), g: rep[1] },
    { who: 0, text: fill(cl[0]), g: cl[1] },
  ];
  // never the same speaker twice in a row
  for (let i = 1; i < lines.length; i++) if (lines[i].who === lines[i - 1].who) lines[i].who = (lines[i].who === 0 ? 2 : 0) as Who;
  return { lines, type: { who: 1, text: fill(pick(TYPE)), g: 'type' }, data: { who: 0, text: fill(pick(DATA)), g: 'sip' } };
}

function cap(s: string) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
