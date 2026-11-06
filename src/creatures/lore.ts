// INHABITANTS — the Meridian Institute's field codex of everything that lives
// in this place. Not monsters: organisms. Every one of them has a diet, a life
// cycle and a reason to be where it is; most of them want nothing from you at
// all. This file is the shared data contract (other systems read it: the lab's
// codex archive, the watch, the scanner) and is deliberately free of game
// imports. One entry per species key in src/creatures/species/*.
//
// Ranks are the seven deadly sins, ascending danger:
//   sloth < gluttony < lust < greed < envy < wrath < pride
// Classes are the Institute's taxonomy (CLASSES below).

export type SinRank = 'sloth' | 'gluttony' | 'lust' | 'greed' | 'envy' | 'wrath' | 'pride';

export interface InhabitantLore {
  id: string;
  name: string;
  rank: SinRank;
  class: string;
  summary: string;
  biology: string;
  behaviour: string;
  habitat: string;
  lore: string;
  harvest: { item: string; how: string }[];
  /** 1..10 */
  danger: number;
}

/** the seven ranks, ascending danger */
export const SIN_RANKS: SinRank[] = ['sloth', 'gluttony', 'lust', 'greed', 'envy', 'wrath', 'pride'];
export const RANK_INFO: Record<SinRank, { label: string; numeral: string; gloss: string }> = {
  sloth: { label: 'SLOTH', numeral: 'I', gloss: 'Inert or harmless. It will not come to you. Leave it be.' },
  gluttony: { label: 'GLUTTONY', numeral: 'II', gloss: 'Feeders. Dangerous only to what they eat, and to the careless.' },
  lust: { label: 'LUST', numeral: 'III', gloss: 'Lures and the lured. It wants something you have: light, warmth, attention.' },
  greed: { label: 'GREED', numeral: 'IV', gloss: 'Hoarders and keepers. It guards, collects or takes, and it will hurt you for it.' },
  envy: { label: 'ENVY', numeral: 'V', gloss: 'Mimics and wearers. It wants to be what you are. Learn its rule or do not be seen.' },
  wrath: { label: 'WRATH', numeral: 'VI', gloss: 'Predators and defenders. It will kill you. Avoid, or come armed and rested.' },
  pride: { label: 'PRIDE', numeral: 'VII', gloss: 'Sovereigns. Not a thing you survive by fighting. Do not engage. Do not look.' },
};
export function rankIndex(r: SinRank): number { return SIN_RANKS.indexOf(r); }

/** the Institute's classes */
export const CLASSES: Record<string, string> = {
  Fauna: 'True animals of the place: they eat, breed, sleep and die here, and are shaped by it.',
  Swarm: 'Colonial organisms: many small bodies that act, and sometimes fuse, as one.',
  Parasite: 'Lives in, on or through a host: furniture, suits, people.',
  Mimic: 'Has evolved to resemble the furnishings, fixtures or occupants of the place.',
  Remnant: 'What the place made, or kept, of people. Some are still in there.',
  Statute: 'Bound by a single law it cannot break. Learn the law and it is harmless.',
  Process: 'Part of the place\'s own upkeep: maintenance, drainage, observation.',
  Familiar: 'Dream-born companions grown out of what visitors remember fondly.',
  Sovereign: 'Apex beings that the rest of the ecology arranges itself around.',
};

const L = (e: InhabitantLore) => e;

export const INHABITANTS: InhabitantLore[] = [
  // ============================================================== the new pass
  L({
    id: 'mulcher', name: 'Mulcher', rank: 'gluttony', class: 'Swarm', danger: 3,
    summary: 'A hand-sized insect that looks assembled from spares: a split, glossy carapace and far too many legs, some of them grown out of the wrong segments.',
    biology: 'Mulchers are not mutilated; they are built that way. Each moult adds limbs wherever the old shell tore, so an old Mulcher carries twenty or more legs of different lengths, a few ending in hooks, one or two in something like fingers. The abdomen is a soft, ribbed egg sac. They breathe through rows of wet spiracles that whistle when they are frightened.',
    behaviour: 'Alone, a Mulcher skitters from shadow to shadow and avoids light. Three or more that meet lock their legs together and pull into a writhing ball (see Mulcher Ball). Gravid females look for something still and soft to lay in: upholstery, a mattress, the lap of a Still Life. They do not attack the healthy unless balled.',
    habitat: 'Furnished rooms: houses, the lobby\'s break areas, offices, hospital wards. Wherever there is furniture nobody moves.',
    lore: 'The first Institute teams called them "mulch" because they were found inside rotted armchairs and assumed to be decomposers. They are not. A dissected chair from 14 Alder Lane held four clutches, and none of the wood had been eaten. The eggs need stillness, not food.',
    harvest: [
      { item: 'mulcher_chitin', how: 'Kill one and peel the carapace: light, glossy plates.' },
      { item: 'mulcher_roe', how: 'Scoop a clutch out of furniture or a Still Life before it hatches.' },
    ],
  }),
  L({
    id: 'mulcher_ball', name: 'Mulcher Ball', rank: 'wrath', class: 'Swarm', danger: 6,
    summary: 'A rolling mass of locked Mulchers the size of a beach ball: a wet knot of shells and legs that turns over and over and keeps coming.',
    biology: 'The ball is held together by the hooked legs of its members gripping each other\'s joints. The outer layer walks the ball along; the inner layer rests, warm and packed, and is swapped out every few seconds. Inside, the members share heat and moisture. A ball of twelve can roll at a run.',
    behaviour: 'Balls form when several Mulchers sense a large warm body. They roll at it, flatten against it and every member bites at once. Heavy blows break the grip: hit it hard enough and it bursts back into single, panicking insects, which scatter and re-form a few seconds later if nothing stops them.',
    habitat: 'Wherever Mulchers are common enough to meet: long-occupied houses, hotel corridors, the deep furnished wards.',
    lore: 'Field note, Dr. Calder: "Watch a ball long enough and you will see it choose. It hesitates at doorways like a single animal. Nobody in the ball is in charge, and yet it hesitates." She asked for the doorway footage to be archived under Behaviour, not Swarm.',
    harvest: [{ item: 'mulcher_chitin', how: 'Burst it and kill the singles: every member leaves plates.' }],
  }),
  L({
    id: 'mulcher_clutch', name: 'Mulcher Clutch', rank: 'sloth', class: 'Swarm', danger: 1,
    summary: 'A cluster of glistening, amber eggs packed into a seat cushion, a mattress, or a person who does not move, pulsing faintly.',
    biology: 'Each egg is a soft capsule the size of a grape, translucent enough to show the folded nymph inside. The clutch secretes a cement that glues it into fabric and warms itself by a few degrees. It hatches when it has been undisturbed long enough.',
    behaviour: 'It does nothing but wait. Disturbed, it twitches. Left alone, it splits and three or four new Mulchers climb out.',
    habitat: 'Inside furniture, and on Still Lifes.',
    lore: 'Clutches laid on a Still Life are carried for months. The Still Life does not notice, or does not mind. Calder has suggested the two evolved together: the Still Life provides perfect stillness, the Mulchers keep its furniture company.',
    harvest: [{ item: 'mulcher_roe', how: 'Scoop the clutch out with your hands (Harvest the clutch).' }],
  }),
  L({
    id: 'stilt_gull', name: 'Stilt Gull', rank: 'wrath', class: 'Fauna', danger: 6,
    summary: 'A grey-and-white gull the size of a man, carried on six jointed stilt legs, with two enormous wings whose leading edges are hard, bladed bone.',
    biology: 'Six legs, because the floors here are wet and uneven and it never needs to fly far: it walks. The wings have stopped being for flight. The primary feathers are fused along the leading edge into a keratin blade sharper than a scalpel, used to cut fabric, wallpaper and the occasional intruder. It is warm-blooded, fast-breathing and smells like a fishmonger\'s.',
    behaviour: 'It builds a nest of torn carpet and ceiling tile in the largest open room it can find and raises two to four chicks. It will tolerate you at a distance. Come close to the nest and it spreads its wings and screams; come closer and it cuts. It forages away from the nest for minutes at a time: that is when you take an egg.',
    habitat: 'Large open rooms: the lobby\'s halls, the Poolrooms, the parking levels, atria.',
    lore: 'No sea has ever been found here. The gulls cry like it is just past the next wall. Institute ornithologists ringed thirty birds; ringed birds were recovered on four different levels, always facing the same way.',
    harvest: [
      { item: 'gull_egg', how: 'Take one from the nest while the parent is away (or busy).' },
      { item: 'gull_feather', how: 'Pluck moulted blade feathers from the nest lining, or from a dead gull.' },
    ],
  }),
  L({
    id: 'gull_nest', name: 'Stilt Gull Nest', rank: 'sloth', class: 'Fauna', danger: 1,
    summary: 'A wide bowl of shredded carpet, ceiling tile and wallpaper, lined with shed blade feathers, with speckled eggs and grey chicks in it.',
    biology: 'Chicks hatch blind and bald, with stubby wing-blades soft as fingernails and only four legs; the second middle pair buds a week later. They beg with their heads thrown back and the inside of the mouth bright orange, which the parent reads as "feed".',
    behaviour: 'The chicks peep and beg. They are no danger. The parent hears them from across the level.',
    habitat: 'The middle of the biggest room the parent can find.',
    lore: 'The nest lining always includes something personal: a name badge, a lanyard, a single shoe. Nobody knows if the gulls collect them or the rooms provide them.',
    harvest: [
      { item: 'gull_egg', how: 'Take an egg from the nest.' },
      { item: 'gull_feather', how: 'Pull a moulted blade feather from the lining.' },
    ],
  }),
  L({
    id: 'king_in_yellow', name: 'The King in Yellow', rank: 'pride', class: 'Sovereign', danger: 10,
    summary: 'A vast octopoid shape draped in tattered yellow, seated in the deepest rooms on a throne of its own coiled limbs. Its face is covered. Do not look at its face.',
    biology: 'Eight great arms and many smaller ones, mantle hidden under rotten yellow silk that it grows, the way a snail grows a shell. It has never been seen to eat. The arms are covered in pale suckers that taste the air. Instruments near it record nothing; film comes back yellow.',
    behaviour: 'It does not hunt. It sits, and it waits to be seen. Now and then it lifts the hem of the pallid mask. Anyone who looks it in the face understands everything, all at once, the whole of the place and what is under it, and does not survive the understanding. Turn away. Look at the floor. Leave.',
    habitat: 'Very rare. The Undercroft, and the deepest unrendered rooms. Never more than one.',
    lore: 'The Institute\'s oldest file, older than the Institute, is a single typed page titled CARCOSA and a photograph of a man in a chair, smiling, with yellow in the whites of his eyes. On the back: "He asked to know. I let him." The King\'s court is furnished with those who asked (see The Seated).',
    harvest: [{ item: 'yellow_tatter', how: 'A strip of its silk sometimes catches on the doorframe of its court. Take it without looking up.' }],
  }),
  L({
    id: 'seated', name: 'The Seated', rank: 'sloth', class: 'Remnant', danger: 1,
    summary: 'An armchair made of a person: spine for the back, ribs for the springs, arms for the arms, the face set into the headrest, upholstered in their own stretched skin and a yellow cloth.',
    biology: 'It is alive. The heart beats slowly in the seat; the lungs work the backrest like a bellows. It cannot move, eat or close its eyes. Everything that is not furniture has been taken away with great care.',
    behaviour: 'It whispers. Sit in it, or lay a hand on it, and it tells you what it learned before it was made into a chair: true things about the inhabitants, more than it should know. It does not ask for help. It asks you to sit.',
    habitat: 'The King in Yellow\'s court, and anywhere the King has passed: quiet offices, waiting rooms, the deep lab.',
    lore: 'They were seekers: researchers, debtors, operators who wanted to know what is under the place. The King grants knowledge and then makes the knower useful. Some of the Seated wear Institute lanyards. One whispers Dr. Calder\'s first name, which she will not confirm.',
    harvest: [{ item: 'seated_whisper', how: 'Sit and listen: write down what it tells you.' }],
  }),
  L({
    id: 'paper_grazer', name: 'Wallpaper Grazer', rank: 'sloth', class: 'Fauna', danger: 1,
    summary: 'A pale yellow slug the length of a forearm, flat as a tongue, that slides up the walls eating the wallpaper and leaving a clean, wet stripe of plaster behind it.',
    biology: 'Its body is one long muscular foot under a thin mantle patterned exactly like the paper it eats: grazers in green rooms are green. A rasping tongue strips paper and paste; two pairs of retractable eye-stalks track light. Its mucus sets into a clear, strong glue.',
    behaviour: 'It grazes, slowly, in the same circuit, a few metres a minute. It shrinks into its mantle when touched. It is one of the few things here that is entirely harmless, and the Mulchers will not lay near it.',
    habitat: 'Wallpapered levels: the lobby, the house, the offices, the hotel corridors.',
    lore: 'The bare stripes on the walls of Level 0 that read like paths are grazer circuits. Followed long enough, a circuit always comes back to where it started: a grazer never gets lost. Operators lost in the lobby have walked out along them.',
    harvest: [{ item: 'grazer_mucus', how: 'Scrape the trail behind it, or the animal itself, into a container.' }],
  }),

  // ============================================================== the existing inhabitants
  L({
    id: 'still_life', name: 'Still Life', rank: 'sloth', class: 'Remnant', danger: 2,
    summary: 'People who do nothing. They stand facing walls or sit at tables, waxy and patient, slightly wrong: a neck too long, a head tipped over onto the shoulder, a smile that never moves.',
    biology: 'A shell of something like wax over a dark, soft interior. No blood, no organs anyone can name. They are warm, a few degrees above the room. They grow very slowly into their poses; an old Still Life cannot unbend.',
    behaviour: 'Most never move. Their heads follow you when you are not looking straight at them. A few change chairs between one look and the next, a few follow at a polite distance, and very rarely one closes its hands round a throat. They are the Mulchers\' favourite hosts.',
    habitat: 'Furnished rooms: houses, the suburbs, schools, wards. Dinner tables most of all.',
    lore: 'The place remembers people who passed through and makes them again from memory, without quite remembering what people are for. Sometimes it remembers someone in your crew. Calder: "They are not copies. They are the place practising."',
    harvest: [{ item: 'mulcher_roe', how: 'Clutches are often laid on them. Scoop them off.' }],
  }),
  L({
    id: 'stilt_doe', name: 'Stilt Doe', rank: 'gluttony', class: 'Fauna', danger: 2,
    summary: 'A deer on legs over two metres long that ducks its head under door frames and grazes the artificial grass.',
    biology: 'Hollow, birdlike leg bones and a tiny, efficient gut tuned to the plastic turf. Its meat tastes faintly of static, which is the polymer it eats breaking down in the muscle.',
    behaviour: 'Grazes in loose herds. Running footsteps send it bounding off. Cornered, it kicks with a force that breaks ribs.',
    habitat: 'The Fields, the suburbs\' lawns, the parking levels\' grass verges.',
    lore: 'The does came first; the grass came after. Herds are always found where the turf has been planted most recently, as if the grass is put down for them.',
    harvest: [{ item: 'venison_raw', how: 'Butcher a carcass with a knife.' }],
  }),
  L({
    id: 'wrongbird', name: 'Wrongbird', rank: 'sloth', class: 'Fauna', danger: 1,
    summary: 'A pigeon-sized bird that moves at seven frames a second, walks backwards and has a human eye.',
    biology: 'The eye is real: lens, iris and all, larger than a bird\'s. The rest of the bird is a bird. It glides on stiff wings without ever beating them; the frame-skipping is how it moves, not a trick of the light.',
    behaviour: 'Flocks scatter at noise or running. They pick through the carpet for things people dropped and swallow the shiny ones.',
    habitat: 'Open floors: the lobby, the parking levels, the mall.',
    lore: 'Every wrongbird eye is a different colour. Calder keeps a jar of them labelled DONORS and has never explained the label.',
    harvest: [{ item: 'meat_raw', how: 'Small game; keys and coins in the crop.' }],
  }),
  L({
    id: 'cowerling', name: 'Cowerling', rank: 'sloth', class: 'Fauna', danger: 1,
    summary: 'A knee-high, big-eyed scavenger with huge membrane ears it folds over its face when afraid.',
    biology: 'A small omnivore with a fast heart and a long memory. The ears are a second skin it can close like eyelids. It carries a bundle of found things that it trades.',
    behaviour: 'Runs; plays dead when you come close; kneels and begs when cornered. Spare one and it leaves a gift. Kill one and the others remember.',
    habitat: 'The lobby, houses, the suburbs, the Fields, parking and service tunnels.',
    lore: 'Cowerlings have been seen burying their dead under carpet tiles, with a gift on top.',
    harvest: [{ item: 'meat_raw', how: 'You can. They remember.' }],
  }),
  L({
    id: 'lumenmoth', name: 'Lumenmoth', rank: 'sloth', class: 'Fauna', danger: 1,
    summary: 'Pale moths the size of a hand whose shed scales glow for days.',
    biology: 'The glow is cold, chemical and continuous; the moth sheds it to mark light sources it has fed from. It drinks charge, not nectar: a torch lens, a battery contact, a live socket.',
    behaviour: 'Swarms any light and drains it. Switch off and it loses interest. Open flame scatters the swarm.',
    habitat: 'Lit levels everywhere: the lobby, the Poolrooms, the mall, offices, houses.',
    lore: 'Old fluorescent tubes in Level 0 are often found full of dead lumenmoths, packed like matches. The hum, some say, is them.',
    harvest: [{ item: 'glow_dust', how: 'Swat the swarm and gather the dust.' }],
  }),
  L({
    id: 'bubble_rabbit', name: 'Bubble Rabbit', rank: 'sloth', class: 'Fauna', danger: 1,
    summary: 'A pearly core inside a film of soap, with three stacked bubbles for ears.',
    biology: 'A gelatinous animal that keeps its skin inflated with its own breath. The jelly inside is sweet and fizzes.',
    behaviour: 'Zig-zags away from you. Cornered, it puffs up and pops in your face, which stings.',
    habitat: 'The Meadow.',
    lore: 'Bubble rabbits breed by budding a bubble off the ears. A warren is a cloud.',
    harvest: [{ item: 'bubble_jelly', how: 'Catch one: the jelly is edible.' }],
  }),
  L({
    id: 'bubble_mite', name: 'Bubble Mite', rank: 'gluttony', class: 'Swarm', danger: 2,
    summary: 'A soap bubble with a pale mite curled inside it, trailing glowing threads.',
    biology: 'The mite spins its bubble the way a spider spins silk, and drifts in it on air currents. The threads are sticky and faintly luminous.',
    behaviour: 'Drifts toward the fastest mover it can see. Stand still and it is not there to it. Any blow pops it; a pop brings the rest of the drift.',
    habitat: 'The Meadow and the dream levels.',
    lore: 'Drifts follow the wind that blows across the Meadow at dusk, which comes from nowhere.',
    harvest: [{ item: 'glow_dust', how: 'Pop it and scrape the threads.' }],
  }),
  L({
    id: 'moon_wisp', name: 'Moon Wisp', rank: 'lust', class: 'Fauna', danger: 3,
    summary: 'An eye in a ball of cold light held in a sliver of moon, with two small hands.',
    biology: 'A light-eater: it absorbs photons through the whole of its surface and stores them as cold. Its touch drinks a torch dead and leaves a frost burn.',
    behaviour: 'Drifts toward the brightest light in reach: lamps, torches, you. In the dark it wanders, unaware of you.',
    habitat: 'The Moon.',
    lore: 'Wisps gather in a ring around the one lamp on the Moon\'s surface that nobody has ever found the switch for.',
    harvest: [{ item: 'glow_dust', how: 'Its body dissolves into glowing dust.' }],
  }),
  L({
    id: 'moon_strider', name: 'Moon Strider', rank: 'wrath', class: 'Fauna', danger: 5,
    summary: 'A cratered body on two enormous folded legs, eyeless, with a mouth that opens sideways.',
    biology: 'Feels vibration through its feet with extraordinary sensitivity. Its jumps are ballistic: once committed, it cannot steer.',
    behaviour: 'Leaps at footsteps ten metres at a time, slowly. When it crouches, step aside. Sneak and it cannot find you.',
    habitat: 'The Moon.',
    lore: 'Its meat is cold even fresh, and tastes of dust and pennies.',
    harvest: [{ item: 'moon_meat', how: 'Butcher the haunches.' }],
  }),
  L({
    id: 'ventling', name: 'Ventling', rank: 'gluttony', class: 'Fauna', danger: 2,
    summary: 'A pale, hairless, all-eyes scavenger that lives in the ductwork and steals.',
    biology: 'Flexible ribs let it fold flat for the ducts. Huge eyes for the dark; poor eyes for light. It builds a hoard under a vent.',
    behaviour: 'Steals small things from floors and open drawers. Runs for the nearest vent if approached; bites only when cornered.',
    habitat: 'Anywhere with ducts: offices, hospitals, the lab, the lobby.',
    lore: 'Ventling hoards are sorted by colour.',
    harvest: [{ item: 'meat_raw', how: 'Butcher it; its hoard is under the nearest vent.' }],
  }),
  L({
    id: 'grinhound', name: 'Grinhound', rank: 'wrath', class: 'Fauna', danger: 5,
    summary: 'A lean pack hound whose head is rotated ninety degrees. It does not seem to notice.',
    biology: 'It hunts by smell, following the warm trail you leave on carpet. The sideways head gives it a wide stereo nose. The "laugh" is a contact call.',
    behaviour: 'Hunts in packs. Its laugh brings the others. Open flame turns it away.',
    habitat: 'The lobby, the suburbs, offices, service tunnels, parking.',
    lore: 'Pups are born with straight heads. The turn comes with the first kill.',
    harvest: [{ item: 'hound_meat_raw', how: 'Butcher a carcass.' }],
  }),
  L({
    id: 'goodboy', name: 'Lost Dog', rank: 'sloth', class: 'Fauna', danger: 1,
    summary: 'A stray dog. Hungry, harmless, glad to see you.',
    biology: 'An ordinary dog, as far as anyone can tell, which makes it the strangest thing here.',
    behaviour: 'Feed it meat three times and it follows you and growls at what you cannot see yet.',
    habitat: 'The suburbs, the Fields, the lobby.',
    lore: 'Its collar tag is always blank. It always answers to the first name you call it.',
    harvest: [],
  }),
  L({
    id: 'gloam', name: 'Gloam', rank: 'wrath', class: 'Fauna', danger: 6,
    summary: 'All you see of it is eye-shine and teeth: a long, low knuckle-walker the colour of the back of a closet.',
    biology: 'Too many eyes at the wrong heights, all tapetum, built to gather the last of the light. The skin absorbs nearly everything. Strong light burns it.',
    behaviour: 'Keeps to the edge of your light and watches. It comes in when you stand in the dark, and every time your torch stutters.',
    habitat: 'Tunnels, parking levels, stairwells, the dark corners of the lobby and houses.',
    lore: 'The wider it smiles, the longer it has been watching. Nobody has seen a gloam with its mouth fully open and reported it.',
    harvest: [{ item: 'meat_raw', how: 'Butcher it, if you can find it in the dark.' }],
  }),
  L({
    id: 'plenum', name: 'Plenum Crawler', rank: 'wrath', class: 'Fauna', danger: 6,
    summary: 'An eight-limbed thing that lives above drop ceilings and drops out of a panel onto you.',
    biology: 'Four joints to every limb and a face set upside down: built to hang. A vertebrate, apparently, which nobody expected.',
    behaviour: 'Listen for clicking crossing the tiles and dust sifting down. Fast on the floor, but once it has bitten or been hurt it climbs back up. It cannot follow you outdoors.',
    habitat: 'Anywhere with a drop ceiling: offices, the lobby, schools, hospitals, the mall.',
    lore: 'The crawlers are the reason the Institute specifies concrete ceilings in its own rooms.',
    harvest: [{ item: 'meat_raw', how: 'Butcher it.' }],
  }),
  L({
    id: 'underlay', name: 'Underlay', rank: 'greed', class: 'Parasite', danger: 4,
    summary: 'No visible body: a bulge under the carpet that moves against the weave.',
    biology: 'A flat, blind organism that lives between carpet and floor, feeding on what falls through. It feels footsteps; it has one long grey arm.',
    behaviour: 'Strikes at ankles, then stays surfaced for a moment, the only time a weapon finds it. Stand still and it loses you. It cannot cross tile, wood or concrete.',
    habitat: 'Carpeted floors.',
    lore: 'Pull up the carpet over a dead underlay and you find everything anyone ever lost in that room.',
    harvest: [{ item: 'coins', how: 'Lift the carpet where it died.' }],
  }),
  L({
    id: 'hush', name: 'Hush', rank: 'wrath', class: 'Statute', danger: 6,
    summary: 'A tall, thin body with a great flared brass horn where the head should be.',
    biology: 'The horn is an ear: wet folds inside, brass-coloured keratin outside. It is blind.',
    behaviour: 'It goes for the loudest sound it can hear and silences what made it. Walk soft, stand still when it is close, and throw something to send it elsewhere.',
    habitat: 'Tunnels, stairwells, the Poolrooms, the Core, the lab.',
    lore: 'Hush were first recorded in the Core, where the machines are loudest. The Core is now very quiet.',
    harvest: [{ item: 'bone', how: 'There is little else.' }],
  }),
  L({
    id: 'echo', name: 'Echo', rank: 'envy', class: 'Mimic', danger: 5,
    summary: 'An eyeless ambusher whose head is ears. It calls out in a voice you know.',
    biology: 'A vocal organ that can reproduce any voice it has heard, and a memory for them. It hunts by listening.',
    behaviour: 'Strikes only from behind, in the dark. Turn and put a light on it and it runs. The voice is never where it is.',
    habitat: 'The Poolrooms, schools, stairwells, hospitals, the lab, houses.',
    lore: 'Echoes have called operators by names they had not told anyone in the Institute.',
    harvest: [],
  }),
  L({
    id: 'employee', name: 'The Employee', rank: 'envy', class: 'Mimic', danger: 6,
    summary: 'A faceless fibreglass mannequin in a beige suit, with a blank badge.',
    biology: 'Hollow shell; whatever moves it is not inside. It is light, hard and cold.',
    behaviour: 'It cannot move while anyone looks at it in the light. Darkness, sleep and turning your back count as not looking. It cannot open doors.',
    habitat: 'Offices, schools, the mall, hospitals, the lab.',
    lore: 'There is a price tag on its cuff with no price on it. Payroll at Meridian still lists it.',
    harvest: [],
  }),
  L({
    id: 'swivel', name: 'Swivel', rank: 'greed', class: 'Mimic', danger: 3,
    summary: 'An office chair whose caster arms unfold into legs; eight eyes behind the backrest fabric.',
    biology: 'A mimic grown into the shape of the most common object in its habitat. The mouth is under the cushion.',
    behaviour: 'Lunges at whoever walks right past it, bites low, then skitters off to hide among chairs.',
    habitat: 'Offices, schools, the market.',
    lore: 'A chair that faces you when it did not before is not a chair.',
    harvest: [{ item: 'spring', how: 'Springs and screws from the wreck.' }],
  }),
  L({
    id: 'davenport', name: 'Davenport', rank: 'greed', class: 'Mimic', danger: 5,
    summary: 'A three-seater sofa in faded florals whose seat is a mouth and whose springs are in its gums.',
    biology: 'A bear-sized animal grown inside upholstery. It sleeps for weeks between meals.',
    behaviour: 'Wakes if sat on, rummaged in or bumped. Bear legs tear out of the cushions; it charges, knocks you flat, bites twice, and wanders off. Too wide for doorways.',
    habitat: 'Houses, the mall, the suburbs.',
    lore: 'There are always coins and remotes inside it. Nobody knows where they come from.',
    harvest: [{ item: 'coins', how: 'Search what is left of it.' }],
  }),
  L({
    id: 'drywall_man', name: 'Drywall Man', rank: 'envy', class: 'Mimic', danger: 5,
    summary: 'A thin man of board and plaster who lives inside the walls.',
    biology: 'Out of the wall he is brittle and breaks like board. Inside it he cannot be hurt.',
    behaviour: 'Only steps out for someone who is alone. A face pressing through the wallpaper means he is coming; hit the face and he pulls back.',
    habitat: 'Offices, tunnels, houses, schools.',
    lore: 'Builders\' notes from Alder Lane mention "the man in the plaster" before the houses were finished.',
    harvest: [],
  }),
  L({
    id: 'stammer', name: 'Stammer', rank: 'envy', class: 'Remnant', danger: 6,
    summary: 'Tall, starved, the colour of overexposed film. It is never seen walking.',
    biology: 'It exists discontinuously: it skips from frame to frame, two metres at a time.',
    behaviour: 'It skips when you look away and when your light stutters. Hold a steady light on its face and it skips back into the dark.',
    habitat: 'The lobby, offices, stairwells, hospitals, parking.',
    lore: 'Its arms fold up against its chest. Unfolded, they reach two metres.',
    harvest: [],
  }),
  L({
    id: 'surveyor', name: 'Surveyor', rank: 'envy', class: 'Parasite', danger: 6,
    summary: 'A 1990 survey-team hazmat suit with its tether rope still attached. Something else is wearing it.',
    biology: 'The occupant has grown to fill the suit; the visor fogs from the inside.',
    behaviour: 'It keeps its lamp on so you will see it, and talks on the radio. When the lamp goes out, it comes for you and drags you into the dark.',
    habitat: 'Tunnels, the lab, the Poolrooms, the lobby, parking.',
    lore: 'The 1990 survey team had six members. Eleven Surveyors have been logged.',
    harvest: [],
  }),
  L({
    id: 'hollow', name: 'Hollow', rank: 'sloth', class: 'Remnant', danger: 2,
    summary: 'A person who stayed too long, rendered at the lowest level of detail, repeating a routine.',
    biology: 'Low-resolution flesh. Its grab carries corruption.',
    behaviour: 'Harmless unless you get close in the dark or shine a light in its face. Point the torch at the floor and walk past.',
    habitat: 'Offices, the Poolrooms, the suburbs, the mall, hospitals.',
    lore: 'Some Hollows are still wearing their Institute band.',
    harvest: [],
  }),
  L({
    id: 'lifeguard', name: 'The Lifeguard', rank: 'wrath', class: 'Fauna', danger: 6,
    summary: 'A shadow under the deep end and a red float drifting against the current.',
    biology: 'An aquatic ambusher that cannot leave deep water.',
    behaviour: 'It blows a whistle when someone enters deep water. Get out. It grabs legs and pulls under.',
    habitat: 'The Poolrooms.',
    lore: 'The whistle is real metal. Recovered ones are engraved with a year that has not happened yet.',
    harvest: [],
  }),
  L({
    id: 'lintel', name: 'Lintel', rank: 'wrath', class: 'Statute', danger: 6,
    summary: 'A doorframe that walks: two posts, a lintel beam, a keyhole plate for a face and a curtain of teeth.',
    biology: 'A territorial organism grown into the frame of one room. The door leaves are its arms.',
    behaviour: 'Inside its room it is fast and it kills. It cannot cross a threshold: get out through a doorway.',
    habitat: 'Houses, schools, offices, hospitals, the lab.',
    lore: 'Every Lintel\'s room is a bedroom, if you look at it long enough.',
    harvest: [{ item: 'plank', how: 'Salvage the frame.' }],
  }),
  L({
    id: 'mirrorling', name: 'Mirrorling', rank: 'envy', class: 'Statute', danger: 5,
    summary: 'Quicksilver limbs and an oval hand-mirror for a head. You are in the mirror.',
    biology: 'Its body is liquid metal held in shape by the image it carries.',
    behaviour: 'It moves as your reflection would, in a line between you. Walk its reflection into a wall and the glass cracks.',
    habitat: 'Houses, hospitals, the mall, the lobby.',
    lore: 'It is always the version of you from the moment you first saw it.',
    harvest: [{ item: 'mirror_shard', how: 'Shards of the head.' }],
  }),
  L({
    id: 'tallyman', name: 'Tallyman', rank: 'greed', class: 'Statute', danger: 6,
    summary: 'Charcoal pinstripe on a frame two and a half metres tall. The head is a ledger, the ribs an abacus.',
    biology: 'Every step you take in its sight, a bead slides across.',
    behaviour: 'At thirteen it comes. Sneak, or stand still and let the beads slide back.',
    habitat: 'Offices, schools, hospitals, the mall, the lobby.',
    lore: 'The ledger\'s columns are names. The newest entry is always yours.',
    harvest: [{ item: 'tally_bead', how: 'Beads off the rack.' }],
  }),
  L({
    id: 'tithe', name: 'Tithe', rank: 'greed', class: 'Statute', danger: 5,
    summary: 'A bloated body shingled with coins, a coin slot for a mouth and a receipt for a tongue.',
    biology: 'It digests metal and paper value. What it cannot digest it keeps.',
    behaviour: 'It ignores the poor and hunts whoever carries the most. Drop your goods and it stops to eat them.',
    habitat: 'The mall, the market, offices, the lobby, parking.',
    lore: 'The receipt tongue prints a total. It has never printed zero.',
    harvest: [{ item: 'coins', how: 'Kill it and it coughs everything up.' }],
  }),
  L({
    id: 'chess_rook', name: 'Rook', rank: 'wrath', class: 'Statute', danger: 5,
    summary: 'A two-metre marble chess piece, warm to the touch, whose crown is a jaw.',
    biology: 'Living stone that moves only on the clock.',
    behaviour: 'Slides only in straight lines, one move per tick. Stand on its diagonal and it cannot touch you.',
    habitat: 'The Board.',
    lore: 'Nobody has ever seen the other player.',
    harvest: [{ item: 'marble_chip', how: 'Chips of the body.' }],
  }),
  L({
    id: 'chess_knight', name: 'Knight', rank: 'wrath', class: 'Statute', danger: 5,
    summary: 'A marble horse piece that jumps.',
    biology: 'Living stone that moves only on the clock.',
    behaviour: 'Only lands a knight\'s jump away. Right beside it is the safest place on the board.',
    habitat: 'The Board.',
    lore: 'The Board is always mid-game, and you are always on it.',
    harvest: [{ item: 'marble_chip', how: 'Chips of the body.' }],
  }),
  L({
    id: 'custodian', name: 'The Custodian', rank: 'pride', class: 'Process', danger: 7,
    summary: 'Tall, faceless, six arms folded behind its back. It is cleaning up.',
    biology: 'Not an animal: the place\'s own maintenance, given a body. It cannot be destroyed.',
    behaviour: 'Bins anything left on the floor, closes doors, ignores tidy survivors. Carry anomalies or stand in corruption and it notices you.',
    habitat: 'Offices, the mall, hospitals, the lab, the Core.',
    lore: 'It is the reason the place is always clean, and always the same.',
    harvest: [],
  }),
  L({
    id: 'occupant', name: 'The Occupant', rank: 'pride', class: 'Sovereign', danger: 9,
    summary: 'A leviathan of living carpet that fills the corridor wall to wall, with many eyes.',
    biology: 'It cannot be hurt. Contact crushes. It is heard long before seen: a rumble through the floor.',
    behaviour: 'It never turns into side rooms and cannot open doors. Noise draws it. Stay quiet and let it pass.',
    habitat: 'Long corridors: the lobby, tunnels, stairwells, parking.',
    lore: 'The corridors are the shape they are because it needs them.',
    harvest: [],
  }),
  L({
    id: 'sentinel', name: 'Far Sentinel', rank: 'lust', class: 'Process', danger: 3,
    summary: 'Five metres tall, at the edge of what you can see, watching.',
    biology: 'Rounds pass through it.',
    behaviour: 'It never moves while watched and is gone if you walk at it. Watching it wears you down.',
    habitat: 'The Fields, parking levels, the Core, the suburbs.',
    lore: 'It wants to be looked at. That is all it wants.',
    harvest: [],
  }),
  L({
    id: 'lamplighter', name: 'Lamplighter', rank: 'sloth', class: 'Familiar', danger: 1,
    summary: 'A night-light with a crescent moon and little pyjama legs.',
    biology: 'Dream-born: grown from what visitors remember fondly. Its light calms panic.',
    behaviour: 'Drifts to whoever is most afraid and stays. When it dims and hides, something hostile is near. Two candies and it is yours.',
    habitat: 'Houses, schools, the lobby, the suburbs, the Fields, hospitals.',
    lore: 'Mia had one just like it.',
    harvest: [],
  }),
  L({
    id: 'plushkin', name: 'Plushkin', rank: 'sloth', class: 'Familiar', danger: 1,
    summary: 'A stuffed toy that only moves when nobody is looking.',
    biology: 'Stuffing, thread and something that keeps it warm.',
    behaviour: 'Follows the survivor it has chosen and leaves gifts. Three sweets and it is yours.',
    habitat: 'Houses, schools, the Fields, the mall, the lobby.',
    lore: 'Its gifts are sometimes crayon notes, in handwriting you recognise.',
    harvest: [{ item: 'rag', how: 'Stuffing and cloth.' }],
  }),
];

const BY_ID = new Map(INHABITANTS.map((e) => [e.id, e] as const));
export function inhabitant(id: string): InhabitantLore | undefined { return BY_ID.get(id); }

/** the reveal order the scanner follows (one more section per scan) */
export const LORE_SECTIONS = ['summary', 'biology', 'behaviour', 'habitat', 'lore'] as const;
export type LoreSection = (typeof LORE_SECTIONS)[number];
export const SECTION_TITLE: Record<LoreSection, string> = { summary: 'SUMMARY', biology: 'BIOLOGY', behaviour: 'BEHAVIOUR', habitat: 'HABITAT', lore: 'LORE' };
/** the lines an entry shows at a reveal level (1 = summary, ... 5 = everything incl. harvest) */
export function loreLines(e: InhabitantLore, level: number): string[] {
  const out: string[] = [];
  LORE_SECTIONS.forEach((s, i) => { if (level > i) out.push(`${SECTION_TITLE[s]}: ${e[s]}`); });
  if (level >= LORE_SECTIONS.length && e.harvest.length) out.push('HARVEST: ' + e.harvest.map((h) => h.how).join(' '));
  return out;
}
