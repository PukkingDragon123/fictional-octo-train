import { isUnlocked } from '../game/profile';
// Occupations, traits and skills — the "employee intake form" of the simulation.

export type SkillKey =
  | 'fitness' | 'strength' | 'sprinting' | 'sneaking' | 'nimble'
  | 'blunt' | 'blade' | 'spear' | 'firearm'
  | 'carpentry' | 'cooking' | 'farming' | 'firstaid' | 'electrical' | 'mechanics' | 'tailoring' | 'foraging' | 'trapping';

export const SKILLS: { key: SkillKey; name: string; group: string; passive?: boolean }[] = [
  { key: 'fitness', name: 'Fitness', group: 'Body', passive: true },
  { key: 'strength', name: 'Strength', group: 'Body', passive: true },
  { key: 'sprinting', name: 'Sprinting', group: 'Agility' },
  { key: 'sneaking', name: 'Sneaking', group: 'Agility' },
  { key: 'nimble', name: 'Nimble', group: 'Agility' },
  { key: 'blunt', name: 'Blunt', group: 'Combat' },
  { key: 'blade', name: 'Blade', group: 'Combat' },
  { key: 'spear', name: 'Spear', group: 'Combat' },
  { key: 'firearm', name: 'Firearm', group: 'Combat' },
  { key: 'carpentry', name: 'Carpentry', group: 'Crafting' },
  { key: 'cooking', name: 'Cooking', group: 'Crafting' },
  { key: 'farming', name: 'Farming', group: 'Survival' },
  { key: 'firstaid', name: 'First Aid', group: 'Crafting' },
  { key: 'electrical', name: 'Electrical', group: 'Crafting' },
  { key: 'mechanics', name: 'Mechanics', group: 'Crafting' },
  { key: 'tailoring', name: 'Tailoring', group: 'Crafting' },
  { key: 'foraging', name: 'Foraging', group: 'Survival' },
  { key: 'trapping', name: 'Trapping', group: 'Survival' },
];

/** XP needed to go from level n to n+1 (Project Zomboid curve) */
export const XP_PER_LEVEL = [75, 150, 300, 750, 1500, 3000, 4500, 6000, 7500, 9000];

/** How a job or trait becomes available: always (no field), or once a profile unlock id
 *  ('job:<key>' / 'trait:<key>') has been earned. `hint` tells the player how to earn it. */
export interface UnlockRule { hint: string }

export interface Occupation {
  key: string; name: string; desc: string; points: number;
  skills: Partial<Record<SkillKey, number>>;
  items: string[];
  perks?: string[];
  unlock?: UnlockRule;
}

export const OCCUPATIONS: Occupation[] = [
  { key: 'unemployed', name: 'Between Jobs', desc: 'No experience, no expectations. More room for personal quirks.', points: 8, skills: {}, items: [] },
  { key: 'janitor', name: 'Night Janitor', desc: 'Knows the hidden corridors of every building. Quiet on their feet.', points: 0, skills: { carpentry: 1, sneaking: 1, mechanics: 1 }, items: ['flashlight', 'keyring', 'mop'], perks: ['lightstep'] },
  { key: 'electrician', name: 'Electrician', desc: 'Breakers, fuses and wiring hold no secrets. Repairs power faster.', points: -2, skills: { electrical: 3, mechanics: 1 }, items: ['screwdriver', 'multimeter'] },
  { key: 'nurse', name: 'Night-shift Nurse', desc: 'Calm with blood. Treats wounds quickly and cleanly.', points: -2, skills: { firstaid: 3, sneaking: 1 }, items: ['bandage', 'bandage', 'disinfectant'] },
  { key: 'cook', name: 'Line Cook', desc: 'Turns scraps into real meals. Handy with a knife.', points: -2, skills: { cooking: 3, blade: 1 }, items: ['knife_kitchen'] },
  { key: 'lifeguard', name: 'Lifeguard', desc: 'Strong swimmer, steady under pressure. Patches people up.', points: -2, skills: { fitness: 1, firstaid: 1, sprinting: 1 }, items: ['swim_goggles'], perks: ['swimmer'] },
  { key: 'ranger', name: 'Park Ranger', desc: 'Reads the land, sets traps, finds food in the strangest fields.', points: -4, skills: { foraging: 2, trapping: 2, blade: 1 }, items: ['matches'] },
  { key: 'carpenter', name: 'Carpenter', desc: 'Builds, barricades and dismantles faster than anyone.', points: -2, skills: { carpentry: 3, blunt: 1 }, items: ['hammer'] },
  { key: 'security', name: 'Security Guard', desc: 'Used to long nights and empty hallways. Hits hard.', points: -2, skills: { blunt: 2, sprinting: 1 }, items: ['flashlight'], perks: ['nightowl'] },
  { key: 'developer', name: 'Software Developer', desc: 'Sees the seams of the simulation. Scanner works better, lucidity drains slower.', points: -2, skills: { electrical: 1 }, items: ['handheld_game'], perks: ['seams'] },
  { key: 'mechanic', name: 'Mechanic', desc: 'Engines, batteries and hotwiring. Knows every car part.', points: -2, skills: { mechanics: 3, electrical: 1 }, items: ['wrench'] },
  { key: 'student', name: 'Student', desc: 'Learns everything faster, knows nothing yet.', points: 0, skills: {}, items: ['backpack_school', 'notebook'], perks: ['learner'] },
];

export interface Trait { key: string; name: string; cost: number; desc: string; excl?: string[]; unlock?: UnlockRule; }

export const TRAITS: Trait[] = [
  // positive (cost points)
  { key: 'strong', name: 'Strong', cost: -6, desc: '+4 Strength. Carries more, hits harder.', excl: ['weak'] },
  { key: 'athletic', name: 'Athletic', cost: -6, desc: '+4 Fitness. Runs longer.', excl: ['unfit'] },
  { key: 'keen_hearing', name: 'Keen Hearing', cost: -6, desc: 'Hears creatures from much further away.', excl: ['hard_hearing'] },
  { key: 'eagle_eyed', name: 'Eagle Eyed', cost: -4, desc: 'Wider vision cone, sees further in the dark.', excl: ['short_sighted'] },
  { key: 'light_eater', name: 'Light Eater', cost: -4, desc: 'Gets hungry less often.', excl: ['hearty_appetite'] },
  { key: 'fast_healer', name: 'Fast Healer', cost: -6, desc: 'Wounds heal faster.', excl: ['slow_healer'] },
  { key: 'lucid_dreamer', name: 'Lucid Dreamer', cost: -4, desc: 'Sleep restores lucidity; dreams are kinder.' },
  { key: 'night_owl', name: 'Night Owl', cost: -4, desc: 'Needs less sleep.', excl: ['insomniac'] },
  { key: 'organized', name: 'Organized', cost: -6, desc: '+30% container capacity.', excl: ['disorganized'] },
  { key: 'dextrous', name: 'Dextrous', cost: -2, desc: 'Moves items between containers twice as fast.', excl: ['all_thumbs'] },
  { key: 'brave', name: 'Brave', cost: -4, desc: 'Panics less.', excl: ['cowardly'] },
  { key: 'outdoorsman', name: 'Outdoorsman', cost: -2, desc: 'Resists cold and rain; finds more when foraging.' },
  { key: 'fast_learner', name: 'Fast Learner', cost: -6, desc: '+30% skill experience.', excl: ['slow_learner'] },
  { key: 'handy', name: 'Handy', cost: -6, desc: 'Builds faster and stronger.' },
  { key: 'iron_gut', name: 'Iron Gut', cost: -3, desc: 'Rarely gets food poisoning.', excl: ['weak_stomach'] },
  { key: 'resilient', name: 'Resilient', cost: -4, desc: 'Corruption spreads slower in the body.' },
  { key: 'lucky', name: 'Lucky', cost: -4, desc: 'Finds a little more in every container.' },
  { key: 'graceful', name: 'Graceful', cost: -4, desc: 'Moves quietly.', excl: ['clumsy'] },
  // negative (give points)
  { key: 'weak', name: 'Weak', cost: 6, desc: '-4 Strength.' },
  { key: 'unfit', name: 'Out of Shape', cost: 6, desc: '-4 Fitness.' },
  { key: 'hard_hearing', name: 'Hard of Hearing', cost: 4, desc: 'Hears less.' },
  { key: 'short_sighted', name: 'Short Sighted', cost: 2, desc: 'Narrow, blurry vision at distance.' },
  { key: 'hearty_appetite', name: 'Hearty Appetite', cost: 4, desc: 'Gets hungry more often.' },
  { key: 'slow_healer', name: 'Slow Healer', cost: 6, desc: 'Wounds heal slower.' },
  { key: 'insomniac', name: 'Restless Sleeper', cost: 4, desc: 'Sleep is less effective.' },
  { key: 'claustrophobic', name: 'Claustrophobic', cost: 4, desc: 'Panics in small rooms and tunnels.', excl: ['agoraphobic'] },
  { key: 'agoraphobic', name: 'Agoraphobic', cost: 4, desc: 'Panics in wide open spaces.', excl: ['claustrophobic'] },
  { key: 'nyctophobic', name: 'Afraid of the Dark', cost: 6, desc: 'Panics and loses lucidity in darkness.' },
  { key: 'cowardly', name: 'Cowardly', cost: 2, desc: 'Panics easily.' },
  { key: 'clumsy', name: 'Clumsy', cost: 2, desc: 'Makes more noise.' },
  { key: 'all_thumbs', name: 'All Thumbs', cost: 2, desc: 'Moves items slowly.' },
  { key: 'disorganized', name: 'Disorganized', cost: 4, desc: '-30% container capacity.' },
  { key: 'prone_illness', name: 'Prone to Illness', cost: 4, desc: 'Gets sick more easily.' },
  { key: 'smoker', name: 'Smoker', cost: 2, desc: 'Stress and unhappiness build without cigarettes.' },
  { key: 'thin_skinned', name: 'Thin-skinned', cost: 4, desc: 'Injuries are worse.' },
  { key: 'slow_learner', name: 'Slow Learner', cost: 6, desc: '-30% skill experience.' },
  { key: 'weak_stomach', name: 'Weak Stomach', cost: 3, desc: 'Food poisoning is more likely.' },
  { key: 'lonely', name: 'Needs People', cost: 3, desc: 'Lucidity and mood drain faster when alone.' },
];

export const traitByKey = (k: string) => TRAITS.find((t) => t.key === k);
export const occupationByKey = (k: string) => OCCUPATIONS.find((o) => o.key === k) || OCCUPATIONS[0];

/** Is this job / trait available on this browser's profile? */
export const occupationAvailable = (o: Occupation) => !o.unlock || isUnlocked('job:' + o.key);
export const traitAvailable = (t: Trait) => !t.unlock || isUnlocked('trait:' + t.key);
