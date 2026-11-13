// The emote catalogue (the shop's records) and what this operator owns and has
// on the wheel. Prices are research points (the lab commissary's currency,
// src/game/research.ts). Four basics come with every operator. Owned emotes and
// the eight wheel slots are kept in this browser (localStorage 'noclip.emotes').
//
//   EMOTES_ALL, emoteInfo(id), owns(id), ownedList(), buyEmote(id) -> 'ok' | 'poor' | 'owned'
//   wheelSlots() -> (id | '')[8], setSlot(i, id), onEmotes(cb)
import { researchPoints, spendResearch } from '../../game/research';
import './moves';

export type Rarity = 'basic' | 'common' | 'rare' | 'epic' | 'legendary';
export interface EmoteInfo {
  id: string;
  /** the animation the rig plays (built-in name or one registered in moves.ts) */
  anim: string;
  name: string;
  rarity: Rarity;
  price: number;
  blurb: string;
  /** keeps playing until the unit moves */
  loop?: boolean;
  /** shop code on the selector (A1 ...) */
  code: string;
}

const L = (id: string, anim: string, name: string, rarity: Rarity, price: number, blurb: string, o: Partial<EmoteInfo> = {}): Omit<EmoteInfo, 'code'> => ({ id, anim, name, rarity, price, blurb, ...o });
const RAW = [
  L('wave', 'wave', 'Wave', 'basic', 0, 'Standard issue. Hello, I am still alive.'),
  L('point', 'point', 'Point', 'basic', 0, 'That way. Or that thing. Usually that thing.'),
  L('sit', 'sit_wait', 'Sit', 'basic', 0, 'Down on the carpet until something happens.', { loop: true }),
  L('shrug', 'shrug', 'Shrug', 'basic', 0, 'The Institute\'s official position on most questions.'),
  L('chicken', 'chicken', 'The Chicken', 'common', 6, 'Beak, wings, tail, clap. Four movements, no dignity.'),
  L('boxer', 'boxer', 'Shadow Boxing', 'common', 7, 'Jab, jab, cross, hook. The air never stood a chance.'),
  L('mime', 'mime', 'The Box', 'common', 8, 'Trapped in a box nobody built. Familiar, somehow.'),
  L('airguitar', 'airguitar', 'Air Guitar', 'common', 9, 'A solo, a knee slide, a fist in the air. No guitar was harmed.'),
  L('jazz', 'jazz', 'Jazz Hands', 'common', 10, 'Crouch, spin, and the hands. Showbusiness, Level 0 style.'),
  L('ghostchair', 'ghostchair', 'The Chair That Isn\'t', 'rare', 14, 'Sits down on nothing, reads the paper. The chair remembers it was never there.'),
  L('faint', 'faint', 'Dramatic Faint', 'rare', 15, 'One hand to the brow, a full turn, and down like a cut tree. Gets up for applause.'),
  L('jelly', 'jelly', 'Jelly Wobble', 'rare', 16, 'Learned from a bear. Every joint rings like a spring.'),
  L('trombone', 'trombone', 'Sad Trombone', 'rare', 18, 'Three hopeful notes, then the long sad one, then the floor.'),
  L('confetti', 'confetti', 'Confetti Cannon', 'rare', 20, 'A brass popgun the size of a soup can. Pull the string, make it a party.'),
  L('puppet', 'puppet', 'The Ventriloquist', 'epic', 26, 'A sock with button eyes does the talking. It does not like you.'),
  L('magic', 'magic', 'Vanishing Hand', 'epic', 28, 'Now you see it. Now you don\'t. Now it\'s holding a flower.'),
  L('levitate', 'levitate', 'Levitation', 'epic', 30, 'Cross-legged, eyes shut, half a metre off the carpet. Nobody asks how.'),
  L('robot', 'robot', 'Robot Transform', 'legendary', 40, 'Plates slam onto every limb, servos whine, a stepping robot routine. Then it folds away.'),
  L('beehat', 'beehat', 'Bee Swarm Hat', 'legendary', 42, 'A straw skep for a hat and a cloud of very small bees that live in it.'),
  L('firework', 'firework', 'Firework', 'legendary', 45, 'Kneel, light, step back, fingers in the ears. A real rocket and a real burst.'),
];
const SERIES = 'ABCDE';
export const EMOTES_ALL: EmoteInfo[] = RAW.map((e, i) => ({ ...e, code: SERIES[Math.floor(i / 4)] + ((i % 4) + 1) }));
const BY = new Map(EMOTES_ALL.map((e) => [e.id, e]));
export const emoteInfo = (id: string) => BY.get(id) ?? null;
/** the catalogue entry an animation name belongs to */
export const infoOfAnim = (anim: string) => EMOTES_ALL.find((e) => e.anim === anim) ?? null;
export const RARITY: Record<Rarity, { label: string; col: string; lamp: 'green' | 'amber' | 'red' }> = {
  basic: { label: 'STANDARD ISSUE', col: '#b8b49a', lamp: 'green' },
  common: { label: 'COMMON', col: '#9fd88a', lamp: 'green' },
  rare: { label: 'RARE', col: '#6cc8ff', lamp: 'amber' },
  epic: { label: 'EPIC', col: '#d89aff', lamp: 'amber' },
  legendary: { label: 'LEGENDARY', col: '#ffc23a', lamp: 'red' },
};

// ---------------------------------------------------------------- what is owned, what is on the wheel
const KEY = 'noclip.emotes';
interface Saved { owned: string[]; slots: string[] }
const BASICS = EMOTES_ALL.filter((e) => e.rarity === 'basic').map((e) => e.id);
let state: Saved | null = null;
function load(): Saved {
  if (state) return state;
  let s: Saved = { owned: [...BASICS], slots: [...BASICS, '', '', '', ''] };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && Array.isArray(raw.owned)) s = { owned: [...new Set([...BASICS, ...raw.owned.filter((x: unknown) => typeof x === 'string' && BY.has(x as string))])], slots: Array.from({ length: 8 }, (_, i) => (typeof raw.slots?.[i] === 'string' && BY.has(raw.slots[i]) ? raw.slots[i] : '')) };
  } catch { /* storage blocked */ }
  state = s;
  return s;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(load())); } catch { /* storage blocked */ } for (const cb of subs) cb(); }
const subs = new Set<() => void>();
export function onEmotes(cb: () => void): () => void { subs.add(cb); return () => subs.delete(cb); }
export const owns = (id: string) => load().owned.includes(id);
export const ownedList = () => EMOTES_ALL.filter((e) => owns(e.id));
export const wheelSlots = (): string[] => load().slots.slice(0, 8);
export function setSlot(i: number, id: string) {
  const s = load();
  if (i < 0 || i > 7 || (id && !owns(id))) return;
  // an emote sits in one slot at a time
  if (id) for (let j = 0; j < 8; j++) if (s.slots[j] === id) s.slots[j] = '';
  s.slots[i] = id;
  save();
}
export const slotOf = (id: string) => load().slots.indexOf(id);
/** buy a record: research points change hands, it is owned, and it takes the first free slot */
export function buyEmote(id: string): 'ok' | 'poor' | 'owned' | 'none' {
  const e = BY.get(id);
  if (!e) return 'none';
  if (owns(id)) return 'owned';
  if (e.price > 0 && !spendResearch(e.price, 'emote:' + id)) return 'poor';
  const s = load();
  s.owned.push(id);
  const free = s.slots.indexOf('');
  if (free >= 0) s.slots[free] = id;
  save();
  return 'ok';
}
export const balance = () => researchPoints();
if (import.meta.env?.DEV && typeof window !== 'undefined') (window as unknown as { __emotes: unknown }).__emotes = { EMOTES_ALL, owns, buyEmote, wheelSlots, setSlot, reset: () => { state = null; try { localStorage.removeItem(KEY); } catch { /* */ } } };
