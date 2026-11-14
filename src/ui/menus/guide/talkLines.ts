// What you can talk to Dr. Calder about in the lab (./talk.ts). Every fixed line here has a recording in
// her 8-bit voice (public/voice/calder/, generated from TALK_LINES by release/video/reels/tools/voice_talk.py);
// the few lines built from the file (a cause of death, a research node) are said in her chip voice.
import { file, deathCount, isDiscovered, bump, counter } from '../../../game/meridian';
import { researchPoints, researchNodes, hasUnlock } from '../../../game/research';

export interface Answer { text: string; emote?: string }
export interface Topic {
  id: string;
  label: string;
  /** shown once this is true (progress) */
  open?: () => boolean;
  /** what she says */
  say: () => Answer[];
  /** follow-up questions offered after her answer */
  then?: string[];
  /** a small reward, given once (the flag remembers) */
  reward?: 'hint' | 'rp' | 'blueprint';
  /** gone once asked */
  once?: boolean;
}

const runs = () => file().runs;

/** the inhabitants she will talk about (those in the codex you have filed), and how to live through them */
export const INHABITANTS: Record<string, [string, string]> = {
  gummy_bear: ['The jelly bear. It was a brown bear once. Now it swallows what it hits, and you can watch it go.', 'Never stand on the jelly. It is warm, it is sweet, and it burns.'],
  bumble_bee: ['The bumble bee. Too heavy for its wings, and it cannot sting. It only chews.', 'Leave it alone and it leaves you alone. Its queen is the problem.'],
  queen_bee: ['The queen. Three metres of bee with a belly that split open, and she is never full.', 'Stay out of the honey pools. Her front legs rake in anything that moves.'],
  bee_keeper: ['The bee keeper. It wears what is left of the last keeper, and it is still growing.', 'Never corner it. Give it the door and it will take the door.'],
  battering_hare: ['The battering hare. A rabbit the size of an elephant, on three legs.', 'When it scrapes the floor, step to one side. It cannot turn once it starts.'],
  gaunt_wolf: ['The gaunt wolf. Three times your height at the shoulder, and starving.', 'It hunts by sound and by blood. Bandage first, then walk. Never run.'],
  parasite_salamander: ['The parasite salamander. A forearm long, and it lives inside other animals.', 'If you are hurt down there, keep moving. It only takes the ones who keep still.'],
  gulper: ['The gulper. A giant salamander at the bottom of the deep end, white as wet plaster.', 'Stay back from the edge of the pool. On land it is slow.'],
  frog_piranha: ['The frog-legged piranha. Teeth at one end, frog legs at the other.', 'Keep your boots out of the water, and it stays in it.'],
  balloon_puffer: ['The balloon puffer. A party balloon with human eyes.', 'Do not startle it. If it pops, everything in the water hears.'],
  worm_train: ['The worm train. Sixteen metres of animal that runs the loop like a service.', 'Stand behind the line on the platform, and wait for it to leave. It always leaves.'],
  stalker: ['The stalker. The level\'s copy of you, a little wrong.', 'When it crouches, you crouch. When it waves, you wave. Play along.'],
};
export const HINTS = [
  'If the band beeps faster, you are near the edge of its range. Turn back.',
  'Smash furniture next to the hopper. The valuables spill out where you need them.',
  'Inhabitants that stop moving are not always dead. Count to ten.',
  'Water carries sound. Walk the Poolrooms slowly.',
];
export const ODD: [string, string][] = [
  ['Do you ever sleep?', 'In the archive, between the cabinets. Please do not tell anyone.'],
  ['What is in the jar?', 'E-31. It was a moth once. Now it dreams.'],
  ['Is the coffee real?', 'It is brown, and it is hot. I have stopped asking more of it.'],
  ['Have you been down there?', 'Once. I came back with my own file. I have not read it.'],
];
const known = () => Object.keys(INHABITANTS).filter((k) => { try { return isDiscovered(k); } catch { return false; } });

export const TOPICS: Topic[] = [
  { id: 'debt', label: 'The debt', say: () => [
    { text: 'Every unit arrives owing. The suit, the band, the intake, the food.' },
    { text: 'You pay it off with what you find down there. The press takes everything of value.', emote: 'shrug' }], then: ['debt_paid', 'debt_who'] },
  { id: 'debt_paid', label: 'Can it be paid off?', say: () => [{ text: 'It can. A few units have.' }, { text: 'Clear the contract, and passage out is sold at the depot. One ticket, one ride.' }] },
  { id: 'debt_who', label: 'Who holds the paper?', say: () => [{ text: 'The Institute holds the paper. I only keep the files.' }, { text: 'Please do not ask accounting. Accounting asks back.', emote: 'facepalm' }] },
  { id: 'last', label: 'The last unit', open: () => deathCount() > 0, say: () => {
    const k = file().killers;
    const cause = k[k.length - 1];
    return [...(cause ? [{ text: `The file says: ${cause.replace(/\.$/, '')}.` }] : []), { text: 'It is never pretty. It is always useful.' }];
  }, then: ['last_hurt', 'last_learn'] },
  { id: 'last_hurt', label: 'Did it hurt?', say: () => [{ text: 'I do not know. I only get the file, and the band\'s last readings.' }, { text: 'The readings were very busy.' }] },
  { id: 'last_learn', label: 'What did it teach us?', say: () => [{ text: 'Here is what the file teaches.' }], reward: 'hint' },
  { id: 'creature', label: 'An inhabitant', open: () => known().length > 0, say: () => {
    const k = known();
    const pick = k[bump('talk.cr') % k.length];
    (TOPICS.find((t) => t.id === 'creature_tip') as any).about = pick;
    return [{ text: INHABITANTS[pick][0], emote: 'point' }];
  }, then: ['creature_tip'] },
  { id: 'creature_tip', label: 'How do I live through it?', say: () => {
    const a = (TOPICS.find((t) => t.id === 'creature_tip') as any).about as string | undefined;
    return [{ text: a ? INHABITANTS[a][1] : 'File one for me first. Then we can talk about it.' }];
  } },
  { id: 'research', label: 'What should I research?', open: () => runs() > 0 || researchPoints() > 0, say: () => {
    const rp = researchPoints();
    const next = researchNodes().filter((n) => !hasUnlock(n.key) && !n.requires?.some((r) => !hasUnlock(r)) && (!n.gate || n.gate())).sort((a, b) => a.cost - b.cost)[0];
    return [
      next ? { text: rp >= next.cost ? `You have ${rp} points. I would put them into ${next.title}.` : `Save up for ${next.title}. It costs ${next.cost}.` } : { text: 'You have bought everything on the tree. I am impressed, and a little worried.' },
      { text: 'Every node on that tree is a lesson somebody paid for.' }];
  } },
  { id: 'institute', label: 'The Institute', say: () => [
    { text: 'The Meridian Institute of Liminality studies the places between places.' },
    { text: 'We send units in. Some of them come back. All of them report.' }], then: ['inst_units', 'inst_you'] },
  { id: 'inst_units', label: 'Why "units"?', say: () => [{ text: 'Because names make the paperwork heavier.' }, { text: 'And because it is easier to send a unit than a person. For us, I mean.', emote: 'shrug' }] },
  { id: 'inst_you', label: 'Why do you work here?', open: () => talks() >= 2, say: () => [{ text: 'Someone has to read the files.' }, { text: 'And I like knowing things nobody else knows. That is the whole job.' }] },
  { id: 'odd', label: 'Something odd', open: () => talks() >= 1, say: () => {
    const i = bump('talk.odd') - 1;
    const [q, a] = ODD[i % ODD.length];
    (TOPICS.find((t) => t.id === 'odd') as any).asked = q;
    return [{ text: a }];
  }, reward: 'rp' },
  { id: 'room', label: 'Anything for the room?', open: () => runs() >= 1, once: true, say: () => [
    { text: 'Actually, yes. Take this blueprint. My specimen jar.', emote: 'bow' }, { text: 'Put it somewhere it can see the door.' }], reward: 'blueprint' },
  { id: 'bye', label: 'That is all', say: () => [{ text: 'Good. Back to work, operator.', emote: 'wave' }] },
];
/** conversations had (progress for new topics) */
export function talks(): number { return counter('talk.n'); }

/** every fixed line (the voice generator records these) */
export const TALK_LINES: string[] = [
  ...TOPICS.flatMap((t) => { try { return t.id === 'last' || t.id === 'research' || t.id === 'creature' || t.id === 'creature_tip' || t.id === 'odd' ? [] : t.say().map((a) => a.text); } catch { return []; } }),
  'It is never pretty. It is always useful.', 'Every node on that tree is a lesson somebody paid for.',
  'You have bought everything on the tree. I am impressed, and a little worried.', 'File one for me first. Then we can talk about it.',
  ...Object.values(INHABITANTS).flat(), ...HINTS, ...ODD.map((o) => o[1]),
  'Here. Some research points I found in a drawer. Do not tell accounting.',
  'What would you like to know?', 'Ask me anything. Within reason.', 'Anything else?',
];
