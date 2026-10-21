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
  /** Rehab Section: what the programme gives you, and what it costs you */
  good?: string; bad?: string;
}

/**
 * Occupations. Three are always on the intake form (Between Jobs, Student,
 * Night Janitor); every other job is earned by doing something in a run and
 * stays unlocked on this browser (profile id 'job:<key>', see unlocks.ts).
 * Perks are plain strings checked by the body, the mind and the quirks system.
 */
export const OCCUPATIONS: Occupation[] = [
  { key: 'unemployed', name: 'Between Jobs', desc: 'No experience, no expectations. More room for personal quirks.', points: 8, skills: {}, items: [] },
  { key: 'student', name: 'Student', desc: 'Learns everything faster, knows nothing yet.', points: 0, skills: {}, items: ['backpack_school', 'notebook', 'pen'], perks: ['learner'] },
  { key: 'janitor', name: 'Night Janitor', desc: 'Knows the hidden corridors of every building. Quiet on their feet, used to long nights alone.', points: 0, skills: { carpentry: 1, sneaking: 1, mechanics: 1 }, items: ['flashlight', 'keyring', 'mop'], perks: ['lightstep', 'nightowl'] },
  // ---- earned in play
  { key: 'electrician', name: 'Electrician', desc: 'Breakers, fuses and wiring hold no secrets. Repairs power faster.', points: -2, skills: { electrical: 3, mechanics: 1 }, items: ['screwdriver', 'multimeter'],
    unlock: { hint: 'Restore power to the Lobby elevator circuit (First Light).' } },
  { key: 'nurse', name: 'Night-shift Nurse', desc: 'Calm with blood: injuries barely raise their pulse. Treats wounds quickly and cleanly.', points: -2, skills: { firstaid: 3, sneaking: 1 }, items: ['bandage', 'bandage', 'disinfectant'], perks: ['steady'],
    unlock: { hint: 'Treat eight wounds (yours or a friend\'s).' } },
  { key: 'cook', name: 'Line Cook', desc: 'Turns scraps into real meals; a hot meal lifts them more than most. Handy with a knife.', points: -2, skills: { cooking: 3, blade: 1 }, items: ['knife_kitchen'], perks: ['foodie'],
    unlock: { hint: 'Cook six meals.' } },
  { key: 'lifeguard', name: 'Lifeguard', desc: 'Strong swimmer, steady under pressure. Patches people up.', points: -2, skills: { fitness: 1, firstaid: 1, sprinting: 1 }, items: ['swim_goggles'], perks: ['swimmer'],
    unlock: { hint: 'Get the Poolrooms pumps running again.' } },
  { key: 'ranger', name: 'Park Ranger', desc: 'Reads the land, sets traps, finds food in the strangest fields. Open sky calms them.', points: -4, skills: { foraging: 2, trapping: 2, blade: 1 }, items: ['matches'], perks: ['outdoors'],
    unlock: { hint: 'Spend a full in-game day outdoors.' } },
  { key: 'carpenter', name: 'Carpenter', desc: 'Builds, barricades and dismantles faster than anyone.', points: -2, skills: { carpentry: 3, blunt: 1 }, items: ['hammer'],
    unlock: { hint: 'Build, barricade or take apart ten things.' } },
  { key: 'security', name: 'Security Guard', desc: 'Used to long nights and empty hallways. Hits hard.', points: -2, skills: { blunt: 2, sprinting: 1 }, items: ['flashlight'], perks: ['nightowl'],
    unlock: { hint: 'Down ten creatures (across all your runs).' } },
  { key: 'developer', name: 'Software Developer', desc: 'Sees the seams of the simulation. Scanner works better, lucidity drains slower.', points: -2, skills: { electrical: 1 }, items: ['handheld_game'], perks: ['seams'],
    unlock: { hint: 'Get the BAILIFF band off your wrist (or take render node SRV-1 offline).' } },
  { key: 'mechanic', name: 'Mechanic', desc: 'Engines, batteries and hotwiring. Knows every car part.', points: -2, skills: { mechanics: 3, electrical: 1 }, items: ['wrench'],
    unlock: { hint: 'Hotwire a car, or drive one for 300 metres.' } },
  // ---- new jobs
  { key: 'barista', name: 'Barista', desc: 'Runs on espresso. Caffeine lasts twice as long without the jitters, and coffee is a small daily joy.', points: 0, skills: { cooking: 1, nimble: 1 }, items: ['mug', 'coffee_beans'], perks: ['barista'],
    unlock: { hint: 'Drink four caffeinated drinks.' } },
  { key: 'mattress_tester', name: 'Mattress Tester', desc: 'Professionally rested. Sleeps well on anything, shrugs off insomnia, wakes up refreshed.', points: 2, skills: {}, items: ['pillow_item'], perks: ['sleeper'],
    unlock: { hint: 'Sleep thirty hours in total (across your runs).' } },
  { key: 'investigator', name: 'Paranormal Investigator', desc: 'Has waited a whole career for this. Anomalies drain less lucidity, cataloguing a new entity is thrilling, and hallucinations are just "data".', points: -2, skills: { sneaking: 1, electrical: 1 }, items: ['camera_polaroid', 'notebook'], perks: ['investigator'],
    unlock: { hint: 'Catalogue five different entities with the SEER-9.' } },
  { key: 'radio_host', name: 'Late-night Radio Host', desc: 'Talks to the dark for a living. Loneliness builds slowly; voices on the radio and in chat count as company.', points: 0, skills: { electrical: 1 }, items: ['radio_portable', 'headphones'], perks: ['radio_voice', 'nightowl'],
    unlock: { hint: 'Lock onto three different radio signals.' } },
  { key: 'therapist', name: 'Therapist', desc: 'Knows the techniques and, mostly, uses them. Breathing and journaling work twice as well; panic attacks pass faster.', points: -2, skills: { firstaid: 1 }, items: ['notebook', 'pen'], perks: ['therapist'],
    unlock: { hint: 'Breathe your way through three panic attacks.' } },
  { key: 'explorer', name: 'Urban Explorer', desc: 'Lives for abandoned places. A new zone lifts the mood; boredom fades on the move; shifting rooms are a thrill, not a threat.', points: -2, skills: { sprinting: 1, nimble: 1, foraging: 1 }, items: ['flashlight', 'chalk'], perks: ['explorer'],
    unlock: { hint: 'Visit eight different zones in one run.' } },
  { key: 'lab_tech', name: 'Lab Technician', desc: 'Used to work for Meridian. Knows how the simulation leaks: lucidity drains slower and the hum is just background.', points: -2, skills: { firstaid: 1, electrical: 2 }, items: ['lab_coat', 'gloves_rubber'], perks: ['seams'],
    unlock: { hint: 'Get inside the Meridian laboratory.' } },
  { key: 'returnee', name: 'Returnee', desc: 'Got out once. Came back anyway. Lucidity drains much slower, loops never rattle them, and they remember where the water is.', points: -4, skills: { sneaking: 1, foraging: 1 }, items: ['map_lobby', 'almond_water'], perks: ['deja_vu'],
    unlock: { hint: 'Buy a seat on the transport and ride it out.' } },
  { key: 'mime', name: 'Street Mime', desc: 'Silent on their feet and never short of imaginary company: loneliness builds slowly. Shouting breaks character (and their composure).', points: 0, skills: { nimble: 2, sneaking: 2 }, items: ['chalk'], perks: ['lightstep', 'mime'],
    unlock: { hint: 'Spend ten minutes sneaking (across your runs).' } },
  { key: 'exterminator', name: 'Exterminator', desc: 'Creepy-crawlies are a job, not a nightmare. Panics less at creatures, and downing one settles the nerves.', points: -2, skills: { blunt: 1, trapping: 2 }, items: ['bait', 'trap_box_item'], perks: ['exterminator'],
    unlock: { hint: 'Down three different kinds of creature in one run.' } },
  // ---- Remittance Programme jobs (earned through the debt contract)
  { key: 'fence', name: 'Fence', desc: 'Moved other people\'s things for twenty years. Knows what anything is worth to the Hopper, and hates walking around with empty pockets.', points: -2,
    skills: { nimble: 1, sneaking: 1 }, items: ['notebook', 'marker'], perks: ['fence'],
    good: 'Valuables you feed the Hopper pay 15% more scrip. Nimble and Sneaking 1.', bad: 'Costs 2 credits. Empty pockets make you blue: low mood builds while you carry nothing of value.',
    unlock: { hint: 'Deposit 2,000 scrip in total (across your runs).' } },
  { key: 'mover', name: 'Furniture Mover', desc: 'Twelve years of sofas up stairwells. Strong, steady, and the back never really recovered.', points: -2,
    skills: { strength: 2, fitness: 1 }, items: ['gloves_work', 'tape_measure'], perks: ['mover'],
    good: 'Strength 2, Fitness 1: drags, lifts and smashes like it is moving day. Work gloves.', bad: 'Costs 2 credits. Bad back: a heavy load makes you tired and grumpy fast.',
    unlock: { hint: 'Smash thirty pieces of furniture (across your runs).' } },
  { key: 'ex_officer', name: 'Ex-Custody Officer', desc: 'Wore the grey uniform once, on the other side of the Seam. Then the debt caught up with them too.', points: -2,
    skills: { blunt: 2, fitness: 1 }, items: ['flashlight', 'whistle'], perks: ['ex_officer', 'nightowl'],
    good: 'Blunt 2, Fitness 1, needs less sleep. Knows the drill: BAILIFF warnings and shocks rattle you far less.', bad: 'Costs 2 credits. Guilty conscience: low mood creeps up a little every day.',
    unlock: { hint: 'Clear a whole debt.' } },
  // ---- cyberware programme (earned in the field)
  { key: 'chop_doc', name: 'Back-Alley Surgeon', desc: 'Fitted hardware in a parking garage for cash. Steady with a saw, even on themselves.', points: -4,
    skills: { firstaid: 2, mechanics: 1 }, items: ['surgery_rig'], perks: ['chop_doc'],
    good: 'Self-surgery hurts half as much and goes quicker. First Aid 2, Mechanics 1. Comes with a field surgery rig.',
    bad: 'Costs 4 credits. A reputation: the Institute logs every limb you take off.',
    unlock: { hint: 'Fit three pieces of hardware in the field (across your runs).' } },
];

export interface Trait {
  key: string; name: string; cost: number; desc: string; excl?: string[]; unlock?: UnlockRule;
  /** Rehab Section: the upside and the downside of the condition */
  good?: string; bad?: string;
}

export const TRAITS: Trait[] = [
  // positive (cost points)
  { key: 'strong', name: 'Strong', cost: -6, desc: '+4 Strength. Carries more, hits harder.', excl: ['weak'] },
  { key: 'athletic', name: 'Athletic', cost: -6, desc: '+4 Fitness. Runs longer.', excl: ['unfit'] },
  { key: 'keen_hearing', name: 'Keen Hearing', cost: -6, desc: 'Hears creatures from much further away.', excl: ['hard_hearing'] },
  { key: 'eagle_eyed', name: 'Eagle Eyed', cost: -4, desc: 'Wider vision cone, sees further in the dark.', excl: ['short_sighted'] },
  { key: 'light_eater', name: 'Light Eater', cost: -4, desc: 'Gets hungry less often.', excl: ['hearty_appetite'] },
  { key: 'fast_healer', name: 'Fast Healer', cost: -6, desc: 'Wounds heal faster.', excl: ['slow_healer'] },
  { key: 'lucid_dreamer', name: 'Lucid Dreamer', cost: -4, desc: 'Sleep restores lucidity; nightmares are rarer.' },
  { key: 'night_owl', name: 'Night Owl', cost: -4, desc: 'Needs less sleep.', excl: ['insomniac'] },
  { key: 'organized', name: 'Organized', cost: -6, desc: '+30% container capacity.', excl: ['disorganized'] },
  { key: 'dextrous', name: 'Dextrous', cost: -2, desc: 'Moves items between containers twice as fast.', excl: ['all_thumbs'] },
  { key: 'brave', name: 'Brave', cost: -4, desc: 'Panics less, rarely has panic attacks and shakes off bad memories.', excl: ['cowardly'] },
  { key: 'outdoorsman', name: 'Outdoorsman', cost: -2, desc: 'Resists cold and rain; finds more when foraging.' },
  { key: 'fast_learner', name: 'Fast Learner', cost: -6, desc: '+30% skill experience.', excl: ['slow_learner'] },
  { key: 'handy', name: 'Handy', cost: -6, desc: 'Builds faster and stronger.' },
  { key: 'iron_gut', name: 'Iron Gut', cost: -3, desc: 'Rarely gets food poisoning.', excl: ['weak_stomach'] },
  { key: 'resilient', name: 'Resilient', cost: -4, desc: 'Corruption spreads slower in the body.' },
  { key: 'lucky', name: 'Lucky', cost: -4, desc: 'Finds a little more in every container.' },
  { key: 'graceful', name: 'Graceful', cost: -4, desc: 'Moves quietly.', excl: ['clumsy'] },
  { key: 'mall_rat', name: 'Mall Rat', cost: -2, desc: 'Malls and supermarkets feel like home: never bored there, calmer and happier among the shelves.' },
  { key: 'gym_rat', name: 'Gym Rat', cost: -4, desc: 'Double Fitness and Sprinting experience, tires a little slower. Grumpy after a day without a workout.', excl: ['couch_potato', 'unfit'] },
  { key: 'speed_reader', name: 'Speed Reader', cost: -3, desc: 'Reads books and magazines twice as fast.' },
  { key: 'heavy_sleeper', name: 'Heavy Sleeper', cost: -3, desc: 'Sleep restores 25% faster and almost nothing wakes you. Might sleep through the alarm.', excl: ['light_sleeper', 'insomniac'] },
  { key: 'pocket_hoarder', name: 'Pocket Hoarder', cost: -3, desc: '+2 kg carrying capacity. Feels naked with nearly empty pockets.' },
  { key: 'lucky_socks', name: 'Lucky Socks', cost: -2, desc: 'While wearing socks, injuries are less severe and some hits only bruise. Without socks: a nervous wreck.' },
  { key: 'cat_person', name: 'Cat Person', cost: -2, desc: 'Small aloof creatures (Plushkins, Lamplighters) trust you after fewer treats. Pets calm you twice as much.', excl: ['dog_person'] },
  { key: 'dog_person', name: 'Dog Person', cost: -2, desc: 'Lost Dogs trust you after fewer meals and hounds scare you less. Pets calm you twice as much.', excl: ['cat_person'] },
  { key: 'snack_goblin', name: 'Snack Goblin', cost: -1, desc: 'Sweets and snacks cheer you up twice as much and vanish twice as fast. Gets hungry a bit sooner.' },
  { key: 'talks_furniture', name: 'Talks to Furniture', cost: -2, desc: 'Never truly alone: a chair, sofa or bed within reach keeps loneliness away. It is a good listener.' },
  { key: 'box_breather', name: 'Box Breather', cost: -3, desc: 'Knows the 4-4-4 trick. Breathing exercises work twice as well and panic attacks end sooner.' },
  { key: 'iron_nerves', name: 'Iron Nerves', cost: -6, desc: 'Never has panic attacks. Bad memories fade twice as fast.', excl: ['cowardly', 'dramatic'],
    unlock: { hint: 'Live through five panic attacks (across your runs).' } },
  { key: 'been_here_before', name: 'Been Here Before', cost: -4, desc: 'You have been deleted before. Lucidity drains 25% slower and the loops never surprise you.',
    unlock: { hint: 'Be deleted once.' } },
  { key: 'creature_whisperer', name: 'Creature Whisperer', cost: -4, desc: 'Every tameable creature trusts you one meal sooner, and a companion nearby counts as company.',
    unlock: { hint: 'Earn the trust of a creature.' } },
  { key: 'unbothered', name: 'Unbothered', cost: -5, desc: 'Stress and unhappiness build 30% slower.', excl: ['worrier'],
    unlock: { hint: 'Clear your debt.' } },
  // ---- Remittance conditions: every one of these cuts both ways
  { key: 'hoarder', name: 'Hoarder', cost: -2, desc: 'A full pack feels like safety. Letting go of anything feels like loss.',
    good: 'A heavy pack is a security blanket: stress and low mood ease while you carry a full load.', bad: 'Parting hurts: every deposit into the Hopper spikes stress and low mood.' },
  { key: 'snitch', name: 'Snitch', cost: -1, desc: 'Told on somebody once. Everybody inside knows it.',
    good: 'Everybody pays the snitch: hunger builds 20% slower.', bad: 'Sleeps with one eye open: sleep restores 20% less.', excl: ['heavy_sleeper'] },
  { key: 'lifer', name: 'Lifer', cost: -3, desc: 'Has been inside so long the inside is home.',
    good: 'Routine is home: boredom barely builds and cramped rooms feel safe.', bad: 'Freedom terrifies you: open spaces and the outdoors pile on stress.', excl: ['claustrophobic', 'agoraphobic'],
    unlock: { hint: 'Pay three installments (across your runs).' } },
  { key: 'wrecking_ball', name: 'Wrecking Ball', cost: -2, desc: 'Breaks things. Feels better. Breaks more things.',
    good: 'Smashing furniture is therapy: every piece you break melts stress, boredom and low mood.', bad: 'Restless hands: boredom builds 40% faster.' },
  { key: 'sweet_on_sarge', name: 'Sweet on the Sergeant', cost: -1, desc: 'He is a projection. He is also the only one who talks to you.',
    good: 'Every word from Staff Sgt. Voss eases panic and loneliness.', bad: 'When he goes quiet for an hour, low mood creeps in.' },
  { key: 'gallows_humour', name: 'Gallows Humour', cost: -2, desc: 'Laughs at the worst moments. Mostly that helps.',
    good: 'Laughs it off: panic drains faster and low mood fades after every scare.', bad: 'Cackles out loud at the wrong moment, and things in the dark hear it.' },
  // negative (give points)
  { key: 'fresh_fish', name: 'Fresh Fish', cost: 3, desc: 'First time inside. Has no idea how bad this is.',
    good: 'Too green to know better: panic builds 30% slower for your first two days.', bad: 'Not used to the rations: hunger and thirst build 25% faster.' },
  { key: 'born_in_debt', name: 'Born in Debt', cost: 2, desc: 'Inherited the debt from a parent, who inherited it from theirs.',
    good: 'Feeding the Hopper is pure relief: each deposit drops panic and stress.', bad: 'Deadline dread: stress climbs while an installment is due within a day.' },
  { key: 'band_picker', name: 'Picks at the Band', cost: 2, desc: 'Cannot leave the BAILIFF band alone. Picks at the bolt, the seam, the skin.',
    good: 'Fidgeting soothes: stress fades 20% faster.', bad: 'The skin under the band rubs raw: now and then the wrist opens up and bleeds.' },
  { key: 'weak', name: 'Weak', cost: 6, desc: '-4 Strength.' },
  { key: 'unfit', name: 'Out of Shape', cost: 6, desc: '-4 Fitness.' },
  { key: 'hard_hearing', name: 'Hard of Hearing', cost: 4, desc: 'Hears less.' },
  { key: 'short_sighted', name: 'Short Sighted', cost: 2, desc: 'Narrow, blurry vision at distance.' },
  { key: 'hearty_appetite', name: 'Hearty Appetite', cost: 4, desc: 'Gets hungry more often.' },
  { key: 'slow_healer', name: 'Slow Healer', cost: 6, desc: 'Wounds heal slower.' },
  { key: 'insomniac', name: 'Restless Sleeper', cost: 4, desc: 'Sleep is less effective and insomnia never fully goes away.' },
  { key: 'claustrophobic', name: 'Claustrophobic', cost: 4, desc: 'Panics in small rooms and tunnels.', excl: ['agoraphobic'] },
  { key: 'agoraphobic', name: 'Agoraphobic', cost: 4, desc: 'Panics in wide open spaces.', excl: ['claustrophobic'] },
  { key: 'nyctophobic', name: 'Afraid of the Dark', cost: 6, desc: 'Panics and loses lucidity in darkness. Nightmares in dark rooms.' },
  { key: 'cowardly', name: 'Cowardly', cost: 2, desc: 'Panics easily; panic attacks and bad memories hit harder.' },
  { key: 'clumsy', name: 'Clumsy', cost: 2, desc: 'Makes more noise.' },
  { key: 'all_thumbs', name: 'All Thumbs', cost: 2, desc: 'Moves items slowly.' },
  { key: 'disorganized', name: 'Disorganized', cost: 4, desc: '-30% container capacity.' },
  { key: 'prone_illness', name: 'Prone to Illness', cost: 4, desc: 'Gets sick more easily.' },
  { key: 'smoker', name: 'Smoker', cost: 2, desc: 'Stress and unhappiness build without cigarettes.' },
  { key: 'thin_skinned', name: 'Thin-skinned', cost: 4, desc: 'Injuries are worse.' },
  { key: 'slow_learner', name: 'Slow Learner', cost: 6, desc: '-30% skill experience.' },
  { key: 'weak_stomach', name: 'Weak Stomach', cost: 3, desc: 'Food poisoning is more likely.' },
  { key: 'lonely', name: 'Needs People', cost: 3, desc: 'Loneliness builds almost twice as fast; lucidity and mood suffer alone.' },
  { key: 'sneezer', name: 'Sneezer', cost: 2, desc: 'Sneezes loudly at random moments, more in dusty carpeted places. Everything hears it.' },
  { key: 'smells_pizza', name: 'Smells Like Pizza', cost: 3, desc: 'Something about you smells delicious. Creatures pick up your trail from much further away.' },
  { key: 'night_light', name: 'Night Light', cost: 3, desc: 'Cannot sleep properly in the dark. Needs a lamp, a lit candle or a little night-light nearby.' },
  { key: 'dramatic', name: 'Dramatic', cost: 1, desc: 'Panic spikes twice as hard but drains twice as fast. Narrates every crisis out loud.' },
  { key: 'butterfingers', name: 'Butterfingers', cost: 2, desc: 'Drops whatever is in hand when panicking.' },
  { key: 'couch_potato', name: 'Couch Potato', cost: 2, desc: 'Tires faster and builds Fitness slowly, but sitting down is pure bliss (stress and boredom melt away).', excl: ['athletic'] },
  { key: 'worrier', name: 'Worrier', cost: 3, desc: 'Anxiety builds twice as fast and stress lingers.' },
  { key: 'light_sleeper', name: 'Light Sleeper', cost: 2, desc: 'Wakes at the smallest noise; nightmares come more often.' },
  { key: 'melancholic', name: 'Melancholic', cost: 3, desc: 'Low moods build faster and linger longer.' },
  { key: 'hypochondriac', name: 'Hypochondriac', cost: 2, desc: 'Every scratch is a catastrophe: injuries spike panic and stress twice as much. Any pill calms you a little.', excl: ['iron_nerves'] },
  { key: 'coffee_dependent', name: 'Coffee Dependent', cost: 2, desc: 'Headaches and grumpiness after twelve hours without caffeine. Coffee hits harder.' },
  // cyberware conditions (effects in src/survival/cyber.ts; they only matter once metal is fitted)
  { key: 'machine_affinity', name: 'Machine Affinity', cost: -3, desc: 'Hardware takes to you: cyber parts rust and wear 40% slower and their cells last longer.', excl: ['tissue_rejection'],
    good: 'Cyber parts rust and wear 40% slower; cells drain 25% slower.', bad: 'Costs 3 credits. Flesh-and-blood perks only: nothing without hardware.' },
  { key: 'tissue_rejection', name: 'Tissue Rejection', cost: 3, desc: 'Your body fights the metal: every socket aches, cells drain faster.', excl: ['machine_affinity'],
    good: 'Pays 3 credits back. Harmless while you stay flesh.', bad: 'Every fitted part keeps you stressed and sore; cells drain 25% faster.' },
];

// ---- the Rehab Section shows every programme and condition as a good line and a bad line
const JOB_LINES: Record<string, [string, string]> = {
  unemployed: ['+8 credits to spend on conditions. No expectations, no paperwork.', 'No skills, no kit, nothing to fall back on.'],
  student: ['Learns everything 20% faster. School bag, notebook, pen.', 'No skills yet: all theory, no practice.'],
  janitor: ['Quiet feet, needs less sleep. Carpentry, Sneaking and Mechanics 1. Flashlight, keys, mop.', 'No combat training; a mop is a mop.'],
  electrician: ['Electrical 3, Mechanics 1. Screwdriver and multimeter.', 'Costs 2 credits. No combat training.'],
  nurse: ['Injuries barely raise the pulse. First Aid 3, Sneaking 1. Bandages and disinfectant.', 'Costs 2 credits. No combat training.'],
  cook: ['Hot meals lift the mood far more. Cooking 3, Blade 1. A kitchen knife.', 'Costs 2 credits.'],
  lifeguard: ['Swims 50% faster. Fitness, First Aid and Sprinting 1. Goggles.', 'Costs 2 credits. The goggles are the whole kit.'],
  ranger: ['Open sky calms stress and low mood. Foraging and Trapping 2, Blade 1. Matches.', 'Costs 4 credits.'],
  carpenter: ['Builds, barricades and dismantles faster. Carpentry 3, Blunt 1. A hammer.', 'Costs 2 credits.'],
  security: ['Needs less sleep. Blunt 2, Sprinting 1. A flashlight.', 'Costs 2 credits.'],
  developer: ['Lucidity drains slower; the SEER-9 works better. Electrical 1. A handheld game.', 'Costs 2 credits. Soft hands: no physical skills.'],
  mechanic: ['Engines, batteries, hotwiring. Mechanics 3, Electrical 1. A wrench.', 'Costs 2 credits.'],
  barista: ['Caffeine lasts twice as long, no jitters; coffee is a daily joy. Cooking and Nimble 1.', 'The kit is a mug and a bag of beans.'],
  mattress_tester: ['+2 credits. Sleeps well on anything, shrugs off insomnia.', 'No skills. The kit is a pillow.'],
  investigator: ['Anomalies drain less lucidity; cataloguing something new is a thrill. Camera and notebook.', 'Costs 2 credits.'],
  radio_host: ['Loneliness builds slowly; voices on the radio count as company. Needs less sleep.', 'Barely any skills: Electrical 1.'],
  therapist: ['Breathing and journaling work twice as well; panic attacks pass faster. First Aid 1.', 'Costs 2 credits.'],
  explorer: ['New zones lift the mood; boredom fades on the move. Sprinting, Nimble and Foraging 1.', 'Costs 2 credits.'],
  lab_tech: ['Lucidity drains slower, the hum is background. First Aid 1, Electrical 2. Lab coat, gloves.', 'Costs 2 credits. Used to work for the people who sent you here.'],
  returnee: ['Lucidity drains much slower; loops never rattle them. Lobby map, almond water.', 'Costs 4 credits.'],
  mime: ['Silent on their feet, never short of imaginary company. Nimble and Sneaking 2.', 'Shouting breaks character: every shout spikes stress.'],
  exterminator: ['Creatures panic you less and downing one settles the nerves. Trapping 2, Blunt 1. Bait, trap.', 'Costs 2 credits.'],
};
const TRAIT_LINES: Record<string, [string, string]> = {
  gym_rat: ['Double Fitness and Sprinting experience; tires a little slower.', 'Costs 4 credits. Grumpy after a day without a workout.'],
  heavy_sleeper: ['Sleep restores 25% faster and almost nothing wakes you.', 'Costs 3 credits. Might sleep through the alarm.'],
  pocket_hoarder: ['+2 kg carrying capacity.', 'Costs 3 credits. Feels naked with nearly empty pockets.'],
  lucky_socks: ['With socks on, injuries are milder and some hits only bruise.', 'Costs 2 credits. Without socks: a nervous wreck.'],
  snack_goblin: ['Sweets and snacks cheer you up twice as much.', 'Costs 1 credit. Snacks vanish twice as fast and hunger comes a bit sooner.'],
  couch_potato: ['+2 credits. Sitting down is pure bliss: stress and boredom melt away.', 'Tires faster and builds Fitness slowly.'],
  dramatic: ['+1 credit. Panic drains twice as fast.', 'Panic spikes twice as hard. Narrates every crisis out loud.'],
  hypochondriac: ['+2 credits. Any pill calms you a little.', 'Every scratch is a catastrophe: injuries spike panic and stress twice as much.'],
  coffee_dependent: ['+2 credits. Coffee hits harder.', 'Headaches and grumpiness after twelve hours without caffeine.'],
};
const credits = (n: number) => `${n} credit${n === 1 ? '' : 's'}`;
for (const o of OCCUPATIONS) {
  const l = JOB_LINES[o.key];
  o.good ??= l?.[0] ?? o.desc;
  o.bad ??= l?.[1] ?? (o.points < 0 ? `Costs ${credits(-o.points)}.` : 'Nothing in particular.');
}
for (const t of TRAITS) {
  const l = TRAIT_LINES[t.key];
  t.good ??= l?.[0] ?? (t.cost < 0 ? t.desc : `Pays ${credits(t.cost)} back into your programme.`);
  t.bad ??= l?.[1] ?? (t.cost < 0 ? `Costs ${credits(-t.cost)}.` : t.desc);
}

// exclusions are symmetric: picking either side blocks the other on the intake form
for (const t of TRAITS) for (const x of t.excl || []) {
  const o = TRAITS.find((q) => q.key === x);
  if (o && !(o.excl || []).includes(t.key)) (o.excl = o.excl || []).push(t.key);
}

/** human-readable perk descriptions (scanner profile, intake tooltips) */
export const PERKS: Record<string, string> = {
  learner: 'Learns 20% faster', lightstep: 'Quiet footsteps', nightowl: 'Needs less sleep', swimmer: 'Swims faster',
  seams: 'Lucidity drains slower', steady: 'Injuries barely raise panic', foodie: 'Cooked meals lift mood more',
  outdoors: 'Open sky calms stress and low mood', barista: 'Caffeine lasts longer, no jitters', sleeper: 'Sleeps well anywhere, resists insomnia',
  investigator: 'Anomalies drain less, scanning lifts mood', radio_voice: 'Radio and chat count as company', therapist: 'Coping works twice as well',
  explorer: 'New zones lift mood', deja_vu: 'Lucidity drains much slower', mime: 'Imaginary company', exterminator: 'Creatures panic you less',
  fence: 'Better scrip rates at the Hopper', mover: 'Built for hauling (bad back)', ex_officer: 'BAILIFF warnings rattle you less',
  chop_doc: 'Self-surgery hurts half as much',
};

export const traitByKey = (k: string) => TRAITS.find((t) => t.key === k);

// ---- the operating table shows programmes as chips and conditions as wares (src/ui/surgery)
/** "PRG-07" style code of a programme chip */
export const chipCode = (o: Occupation) => `PRG-${String(OCCUPATIONS.indexOf(o) + 1).padStart(2, '0')}`;
/** "WR+04" (assets) / "WR-11" (liabilities) code of a condition ware */
export const wareCode = (t: Trait) => `WR${t.cost <= 0 ? '+' : '-'}${String(TRAITS.indexOf(t) + 1).padStart(2, '0')}`;
export const occupationByKey = (k: string) => OCCUPATIONS.find((o) => o.key === k) || OCCUPATIONS[0];

/** Is this job / trait available on this browser's profile? */
export const occupationAvailable = (o: Occupation) => !o.unlock || isUnlocked('job:' + o.key);
export const traitAvailable = (t: Trait) => !t.unlock || isUnlocked('trait:' + t.key);
