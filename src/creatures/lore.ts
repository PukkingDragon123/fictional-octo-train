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

import { PLAYGROUND_INHABITANTS } from './lore_playground';
import { FUNGUS_SEA_INHABITANTS } from './lore_fungus_sea';
import { SUBWAY_INHABITANTS } from './lore_subway';
import { POOL_INHABITANTS } from './lore_pool';

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
  Carrion: 'Dead things the place keeps: carcasses that have become habitats in their own right.',
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
    summary: 'A tall figure in tattered yellow robes and a pallid mantle, standing very still in the deepest rooms. It is never quite in focus. Its face is under a deep hood. Do not look at its face.',
    biology: 'Under the robes it is the shape of a man, too tall by a head, with long pale hands. Cameras, film and eyes all fail to resolve it: the edges smear, an after-image lags behind every movement, the cloth frays into grain at the hem. Instruments near it record nothing; film comes back yellow. It has never been seen to eat or breathe.',
    behaviour: 'It does not hunt. It stands, and it waits to be seen. When someone looks too long, it turns its hood toward them. Whoever keeps looking sees its face, understands everything, all at once, the whole of the place and what is under it, and does not survive the understanding. Nobody has described the face. Turn away. Look at the floor. Leave.',
    habitat: 'Very rare. The Undercroft, and the deepest unrendered rooms. Never more than one.',
    lore: 'The Institute\'s oldest file, older than the Institute, is a single typed page titled CARCOSA and a photograph of a man in a chair, smiling, with yellow in the whites of his eyes. On the back: "He asked to know. I let him." The King\'s court is furnished with those who asked (see The Seated).',
    harvest: [{ item: 'yellow_tatter', how: 'A strip of its robe frays loose where it has stood. Pick it up without looking up.' }],
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

  // ============================================================== the predators (round 14)
  L({
    id: 'whip_rat', name: 'Whip Rat', rank: 'wrath', class: 'Fauna', danger: 6,
    summary: 'A brown rat the size of a big dog, mangy and half-skinned, whose eyes ride the ends of two long whip-like stalks, and whose tail turns, halfway down, into a man\'s forearm and ends in a human hand.',
    biology: 'The eye stalks are tubes of ringed muscle nearly a metre long, grown out of the sockets the eyes left. They can be sent round a corner, laid flat along the floor, or cracked like a stockwhip: the tip breaks the sound barrier, and the eye on the end takes no harm from it that anyone can find. The tail is a rat\'s for half its length; then the scales stop at a puckered seam and it is a forearm, with hair, a blue vein and a second elbow, and then a hand. The hand is human in every particular, and its nails are kept short. It does everything a rat cannot do with its mouth: it takes, carries, grips the floor and hauls the animal along. The hide is patchy with mange and torn open over muscle and ribs. It does not heal, and it does not seem to matter.',
    behaviour: 'It hunts in the dark and keeps out of the light. It lurks in a dark corner with its eyes going round on their stalks, and when it hears something it sends the eyes round the corner before the rest of it. It waits low and flat beside where you will walk, cracks an eye across your face (it stuns), takes your ankle in the hand and backs into the dark, biting. It drags small animals off to eat, and takes anything left on the floor near its corner. A torch beam held on it makes it pull its eyes in and back away. Crouch and keep still and it loses you.',
    habitat: 'Dark levels: the maintenance tunnels, the undercroft, the server floors, the stairwells; and the dark edges of Level 0, wherever a tube has gone out.',
    lore: 'Rats were the first thing the Institute found living down here, and for a long time they were ordinary rats. Dr. Calder thinks the hand came first: "Something down here taught them that hands are how you take things, and they took the lesson literally." The first Whip Rat on file was found in the undercroft wearing a wedding ring. Nobody has found the finger it came off.',
    harvest: [
      { item: 'rat_eyestalk', how: 'Cut an eye stalk off a dead one (it twitches for an hour).' },
      { item: 'rat_hand', how: 'Take the hand off the end of the tail.' },
      { item: 'rat_incisor', how: 'Pull the long yellow incisors.' },
      { item: 'mangy_hide', how: 'Skin what hide it has left.' },
    ],
  }),
  L({
    id: 'strider', name: 'Strider', rank: 'wrath', class: 'Remnant', danger: 8,
    summary: 'A naked person stretched to nearly four metres, most of it leg: legs that bend backward and walk on the tips of feet drawn out into a third limb, a gaunt torso with every rib showing, arms that hang to its knees, and a small, slack face a long way up.',
    biology: 'Everything in it is human, and everything has been pulled. The bones are a person\'s bones grown long and thin: the thigh bone nearly two metres, the foot bones as long as a shin. The skin is smooth, hairless and pale, striped with stretch marks and drawn too tight over the joints, which are always raw. There is no navel and nothing else to say what it was; the place did not bother to keep them. It breathes slowly through its open mouth. Its eyes are small and dark and do not track well: it sees things that move and does not see things that keep still.',
    behaviour: 'It walks the halls of Level 0 at the height of the ceiling tiles, stepping over the partition walls, and it listens. A footstep stops it dead. It tilts its head toward the sound, then goes to look: it folds its legs until its knees are higher than its head and peers into the rooms with its face at the height of yours. Seen moving, you are run down in strides of three and four metres and taken up in both hands. It does not go into rooms and it cannot see through a shut door. Crouch and keep absolutely still and it can look straight at you and not see you.',
    habitat: 'Level 0, the Yellow Room, and nowhere else. Never more than one at a time, and long stretches with none.',
    lore: 'The Institute matched one to a missing debtor, Unit D-5530, by a healed break in the collarbone that is on her intake X-ray. She went into Level 0 on a long survey and walked further than she should have, looking for the edge of it. Dr. Calder\'s note on the file: "Level 0 has no edge. It is as long as you walk. I think it made her the right shape for it." Sightings rise when units run in the lobby. Walk.',
    harvest: [
      { item: 'strider_tendon', how: 'Cut the long tendons out of a dead one\'s legs.' },
      { item: 'strider_skin', how: 'Peel a strip of the stretched skin.' },
      { item: 'long_bone', how: 'Take a finger bone, longer than your forearm.' },
    ],
  }),

  L({
    id: 'parasite_salamander', name: 'Parasite Salamander', rank: 'lust', class: 'Parasite', danger: 6,
    summary: 'A pale amphibian a forearm long that you can see into: the organs are dark shapes under skin the colour of a peeled grape, the veins blue. A flat shovel of a snout, a round rasping mouth ringed with hooked teeth underneath it, frilled red gills, and eight or nine soft little fingers on every foot.',
    biology: 'An endoparasite with a free-living adult stage. The shovel snout parts skin and muscle; the rasp files a way through; the fingers hold the wound open while it pulls itself in. Inside, it moves through the body cavity eating one organ at a time (gut, liver, stomach, a kidney, a lung), growing with each, and the host goes on living without them, badly. When it has eaten four it stops and lays a clutch of yolky eggs in a skin against the spine; about two game hours later the larvae hatch and chew their way out through the original wound, and the adult, spent, crawls out after them.',
    behaviour: 'It hunts for hosts by creeping up on whatever keeps still: the sleeping, the downed, units standing in the dark, animals, and above all the dead. Light and movement put it off; it freezes and waits. The last metre is a rush and a grab, and then it is in. While it is burrowing (a few seconds) it can be pulled out by the tail; after that it must be cut out of the wound with a knife or a scalpel, a deep cut and a bad one, before it lays. Animals it gets into sicken, swell and burst; corpses burst sooner.',
    habitat: 'The damp dark levels: the Undercroft, the Tunnels, the Pools, and the wards of the hospital, wherever the dead are left lying.',
    lore: 'Calder\'s field note: "If you wake up with a wound you do not remember and a lump that moves, do not wait to see what it does. Cut. The place grows organs back, slowly. It does not grow you back." The lab buys them whole and alive. Nobody will say what for.',
    harvest: [
      { item: 'parasite_salamander', how: 'Kill one, or cut it out of a host whole.' },
      { item: 'salamander_eggs', how: 'Cut the clutch out of a host who has been laid in.' },
    ],
  }),
  L({
    id: 'salamander_larva', name: 'Salamander Larva', rank: 'gluttony', class: 'Parasite', danger: 2,
    summary: 'A finger-length, see-through hatchling of the Parasite Salamander, all mouth and fingers.',
    biology: 'Born inside a host and eating its way out. The gills come in first, then the shovel.',
    behaviour: 'They scatter from whatever they came out of and look for a carcass to get into. Left in the dark for a few minutes they grow into adults. They die under a boot.',
    habitat: 'Wherever a host burst.',
    lore: 'A clutch is twelve to forty. Most do not live to find a host. Enough do.',
    harvest: [{ item: 'salamander_eggs', how: 'Sometimes there is an unhatched egg still clinging to one.' }],
  }),
  L({
    id: 'gaunt_wolf', name: 'Gaunt Wolf', rank: 'wrath', class: 'Fauna', danger: 9,
    summary: 'A wolf three times a unit\'s height at the shoulder and starved down to the frame: mange and scab over a matted coat, a flank torn open on bare ribs, a ridge of vertebrae through the back, a long jaw with three rows of teeth, forelegs too long for its hind legs, one of which it holds up off the ground. Its breath steams.',
    biology: 'A canid that has grown and grown on the open levels with never enough to eat. Its body has kept the frame and spent everything else: there is almost no fat on it, the muscles are cords, the skin has split where the bones press through and never healed. The teeth keep coming in behind the old ones. It is hot to stand near; it is burning itself to keep going.',
    behaviour: 'It hunts alone, by sound and above all by the smell of blood: a bleeding unit is smelled from a long way off. It howls first, then lopes in, then charges; it knocks you down and stands on you and bites, again and again, and if it kills it carries the body away in its mouth to eat. It hunts the other animals too. It is too big for doorways and corridors: indoors, under cover, in a narrow place, it can only circle and wait.',
    habitat: 'The big open levels: the Fields, the Meadow, the parking structure, the suburbs at night. Never more than one.',
    lore: 'Units call it the Landlord. The Institute has lost three survey teams in the Fields to it and one operator who would not unlink while it ate her unit, and has not been the same since. Calder: "Bandage before you cross open ground. Walk. If you hear it, find a door."',
    harvest: [
      { item: 'wolf_meat', how: 'Butcher it for dark, stringy meat.' },
      { item: 'matted_hide', how: 'Skin a sheet of the coat.' },
      { item: 'wolf_fang', how: 'Pull the long teeth from the third row.' },
    ],
  }),
  L({
    id: 'battering_hare', name: 'Battering Hare', rank: 'wrath', class: 'Fauna', danger: 8,
    summary: 'A rabbit the size of an elephant and grotesquely fat, on three legs: the right hind leg is gone, healed over into a knot of scar and bone sunk in the haunch. It does not hop. It crawls, hunched and low, its sagging belly dragging on the floor, the forelegs reaching and pulling and the one huge hind leg shoving, slewing toward the stump on every shove, and still covers ground faster than you can run. Enormous rounded haunches; a matted, scabbed coat; long ears, veined and torn, that flop and twitch; a blunt muzzle with a split lip over yellow chisel teeth as long as a forearm; big wet dark eyes; a callus on its forehead from everything it has hit.',
    biology: 'A leporid grown far past anything its skeleton was drawn for, and fat past anything its legs were: most of its weight is a belly it can no longer lift. The good hind leg is enormous, half the animal\'s muscle, and the spine has twisted to put the weight over it. The forehead is callus on callus: the skull underneath is cracked through in old breaks that have knitted. It eats grass, hedges, insulation and anything green, and it is not a hunter. It is defending a space it carries around with it.',
    behaviour: 'It does not chase. It lowers its head, scrapes the floor with one forefoot, lined up on you, and then comes in a dead straight line, a low lunging scramble, through whatever is in the way: furniture, cars, barricades, the plank and drywall walls of a camp. It cannot turn once it has started. If it hits something it cannot break, the place\'s own concrete, a pillar, a steel barricade, it stands there dazed and swaying for a few seconds, which is the only time to hurt it. It hears you behind a wall and will come through the wall.',
    habitat: 'The big open levels: the Fields, the Meadow, the Homestead\'s paddocks, the parking structure, the gardens of the estates. One to a level.',
    lore: 'Survey teams call it the Lorry. A camp in the Fields built a double plank wall against the Gaunt Wolf and woke up with a hare-shaped hole through both. Calder: "Do not stand between it and anything. Put something solid behind you and step aside at the last moment. It will knock itself silly on your wall, and then it is yours."',
    harvest: [
      { item: 'hare_haunch', how: 'Butcher the good hind leg: there is enough meat on it for a camp.' },
      { item: 'hare_incisor', how: 'Lever a front tooth out of the jaw with something long. It is a blade already.' },
      { item: 'horn_boss', how: 'Saw the callus off its forehead. Heavy as a brick; the workshop can make a ram of it.' },
    ],
  }),
  L({
    id: 'stalker', name: 'Stalker', rank: 'envy', class: 'Mimic', danger: 7,
    summary: 'You, made again from the outside: your face, your suit (nearly; it has no hood), your lamp on its temple, two and a half metres tall. Its legs are too long and the left one longer still; it will not bend, so it drags it, toes down, behind the good one. Its arms hang past its knees. Its head is the wrong size for it, its eyes are too round and too pale, and its face will not hold still: it flickers between smiles.',
    biology: 'Nobody has dissected one that looked like anyone but the unit who killed it. The body is human, stretched: long bones lengthened at the growth plates, a neck half again too long, the dragged leg\'s knee fused straight. The skin is a few shades paler than the original and older by a decade. The suit is not cloth; it is skin, coloured and creased like the suit, with the number almost right. Its lamp works. Calder\'s view is that it is not a predator of units so much as of the link: it learns the operator, not the body.',
    behaviour: 'It walks where you walked and does what you did, a few seconds late: crouches where you crouched, picks up what you picked up, switches its lamp when you switched yours. Every action it copies, and every second it can see you, the gap closes. Look straight at it and it stops and copies you face to face, now. Now and then it does something you did not do (it crouches, works its lamp, stops dead with its hands out) and waits: do it back quickly and it smiles and drops back. Fail to, hit it, or let it catch all the way up, and it comes for you in a dragging, lurching run, takes you by the throat, then backs off and starts again. It needs to see you to copy you: put a shut door between you and wait, and it walks to the end of the trail it saw and loses you.',
    habitat: 'Level 0, rarely, and the beige levels that look like it (Annex B, the Cubicles). Never more than one.',
    lore: 'The first report came from an operator who thought, for most of a shift, that the unit on her screen was being followed by another unit from the same intake. Then it turned round and she saw its face. Calder\'s note on the file: "It is copying the operator, not the debtor. It has learned what the link looks like from the outside. Do not play its game longer than you must. Every time you copy it back, it is a little more you."',
    harvest: [
      { item: 'strider_skin', how: 'Peel a strip of the stretched skin (it is your colour).' },
      { item: 'long_bone', how: 'Take one of the lengthened finger bones.' },
    ],
  }),

  // ============================================================== round 15: the cull's replacements
  L({
    id: 'driller', name: 'Driller', rank: 'wrath', class: 'Remnant', danger: 7,
    summary: 'A person rebuilt around a mouth. The lower face has grown into a jaw as wide as the shoulders, ringed with spiral-grooved teeth, and behind them a ring of seven long teeth that turn in the gums like the bit of a core drill. It lives under the floor.',
    biology: 'Everything above the collarbones has been given over to the jaw: the mandible is a slab of bone the size of a shovel blade, hinged on muscle as thick as a thigh, and the neck has thickened to carry it. The seven ring teeth sit in a collar of gum on a socket of cartilage that can turn, a quarter turn and back, very fast, hundreds of times a minute; the rim teeth are grooved in a spiral, like masonry bits, and grow back when they break. The eyes have shrunk to slits. The hands are callused to horn from bracing against concrete. It breathes through the floor dust and eats meat: people, mostly.',
    behaviour: 'It travels under the levels: the floor heaves over it, cracks spread behind it and grit jumps on the carpet. It feels footsteps through the slab: running carries a long way, walking only close, and a unit that sneaks or stands still is not there to it. Fed, it lets a quiet unit pass over it. Before it bites it warns: it rears half out of the floor in front of you, jaw open, the ring screaming. Back away slowly and it goes back down. Keep coming, or run, and it comes up under you, bites, and goes back down. It surfaces to eat the dead and the downed, and now and then to breathe.',
    habitat: 'Under anything with a floor slab: Level 0, the tunnels, the undercroft, car parks, the depot, the stairwells, the server rooms, and the corrupted levels. Never more than two to a level.',
    lore: 'The Institute sent excavation crews down in the first years of the Remittance Programme, debtors with picks and core drills, to dig a way through to the lower levels instead of walking. The place gave them what they wanted. Calder\'s note on the file: "Every Driller we have scanned has a crew number tattooed inside the left wrist. We stopped sending crews. The holes they dug are still there, and they are still in them."',
    harvest: [
      { item: 'driller_tooth', how: 'Prise the ring teeth out of the gum collar of a dead one. They bite into concrete.' },
      { item: 'driller_cheek', how: 'Cut the great chewing muscle off the jaw hinge. Tough, and it was a person.' },
    ],
  }),
  L({
    id: 'hermit', name: 'Partition Hermit', rank: 'greed', class: 'Remnant', danger: 2,
    summary: 'An office worker who never left the desk, living on all fours under a shell of cubicle partitions that have grown into the spine and shoulder blades: fabric board, aluminium trim, memos still pinned to it.',
    biology: 'The partition frames have fused with the ribs and the scapulae; where board meets back there is a raw pink seam of scar tissue that never quite closes. The person underneath is thin, pale, stiff at the hips from years on hands and knees, its nails grown long and yellow. The shell is not alive, but it is part of it now: cut the boards and it bleeds at the seams.',
    behaviour: 'It claims a few metres of floor in a corner and keeps things there: mugs, staplers, a dead phone, a photo of someone. It watches you go past and does nothing. Step into its corner and it rears up under the shell and rattles the panels, hissing through its teeth: that is the warning. Keep coming and it rakes you with its nails, then pulls itself back under the boards, which take most of a blow. Hurt badly, it crawls away and starts a new corner.',
    habitat: 'Offices, the annex, wards, the lab levels, the mall\'s back rooms, schools, the showroom: anywhere with cubicles.',
    lore: 'A nameplate is usually still screwed to the ridge of the shell. The Institute has matched three of them to people on its own payroll. Calder: "It is not a punishment. It is what the place does with someone who keeps coming back to the same chair. It gives them the chair."',
    harvest: [{ item: 'partition_board', how: 'Cut the boards off its back: building panels, still trimmed in aluminium.' }],
  }),
  L({
    id: 'hum_possum', name: 'Hum Possum', rank: 'sloth', class: 'Fauna', danger: 1,
    summary: 'The commonest animal in the backrooms and the gentlest: a grey, pink-skinned marsupial with wet black mirror eyes and a long naked tail, working the bins at night.',
    biology: 'A true marsupial, adapted to the ceiling voids over generations: the fur has thinned to bristle over pink-grey skin under the fluorescent hum, the eyes have grown huge and reflective for the dark between the tiles, the tail is long, naked and prehensile. Fifty teeth. A low body temperature that makes it a poor host for most infections, though it carries worms. Mothers carry the young on their backs for weeks.',
    behaviour: 'It scavenges at night: bins, break rooms, the scraps around camps. Meet one and it freezes. Come closer and it gapes and hisses and drools: all bluff. Run at it and it bolts; corner it or strike it and it falls over, tongue out, stiff, and smells of death until you go away. It almost never bites.',
    habitat: 'Everywhere with a ceiling void: Level 0, offices, the mall and the market, houses and the suburbs, schools, the Fields, the tunnels, the depot.',
    lore: 'The Institute thinks they came in through a seam somewhere with weather and have been here a very long time. Units learn to like them: a possum that is foraging calmly means nothing worse is near. Calder: "If the possums have all gone up into the ceiling, so should you."',
    harvest: [{ item: 'possum_meat', how: 'Butcher it for a lean haunch or two. Cook it through: they carry worms.' }],
  }),
  // ============================================================== the existing inhabitants
  // ============================================================== the Ledge (the far, melting edge of the place)
  L({
    id: 'gummy_bear', name: 'Gummy Bear', rank: 'gluttony', class: 'Fauna', danger: 5,
    summary: 'A brown bear that went over the Ledge and lived. Its body has run into a translucent red jelly the size of a car bonnet. Islands of real wet fur float on it; its skeleton, heart and stomach hang visible inside; its limbs are still a bear\'s, but not where a bear keeps them.',
    biology: 'Ledge exposure did not kill the tissue, it relaxed it: collagen gone to gelatin, fat to syrup, the whole animal held together by its own surface tension. The jelly is alive throughout and digests through its whole volume. It cannot hold a shape, so it keeps none: it hauls itself along on its two front legs and the rest follows in a wave. It reproduces by fission. After two good meals it pinches in at the middle, the halves pull apart on a stretching strand, and each half regrows the bear it is missing, putting back legs, jaws and paws wherever they happen to bud. A paw comes out of a flank. A jaw opens where a shoulder was. No two are wrong in the same way.',
    behaviour: 'It hunts the Giant Bumble Bees. It goes flat and quiet, creeps to within two lengths, coils, lunges, and the front of it folds over the bee. Then it sits and digests, and you can watch the meal turn slowly inside it and fade. Fed, it lets you be unless you stand on top of it: it gapes and gnashes first. Hungry, with no bees about, it treats you as a bee. Hurt it and it comes after you, faster than anything that shape should move.',
    habitat: 'The Ledge, where the bees are. Strays turn up in the Fields and in corrupted levels, where things soften.',
    lore: 'Field note, Dr. Calder: "The first one we saw had been a bear for at least three generations. The Ledge team called it Haribo and laughed about it until it split in front of them. Both halves turned to look at them with the one head between them." Specimen jars of its jelly keep digesting whatever is put in with them. Do not put your hand in the jar.',
    harvest: [
      { item: 'ledge_gel', how: 'Cut a lump of its jelly away (it seals over), or scoop it off a dead one.' },
      { item: 'matted_fur', how: 'Peel a floating island of fur off a dead one.' },
    ],
  }),
  L({
    id: 'bumble_bee', name: 'Giant Bumble Bee', rank: 'sloth', class: 'Fauna', danger: 1,
    summary: 'A bumblebee the size of a dog and many times too fat for its wings: a beach ball of banded fuzz on six dangling legs, held up by four wings no bigger than playing cards.',
    biology: 'Whatever the Ledge does to bodies, it did it to this one\'s appetite and not its wings. The abdomen is mostly stored fat and wax; the flight muscles shiver so hard to keep it up that the whole animal is warm to the touch. The sting has softened to a useless stub. Wax flakes off the belly segments in warm, honey-smelling sheets; the hind legs carry baskets of packed orange pollen from nowhere anyone has found.',
    behaviour: 'It hovers a hand\'s breadth higher than it can manage, sags, claws back up, bumps into walls, furniture and people, and every minute or so gives up and sits on the floor, panting through its abdomen. It does one thing with purpose: it forages the dead. It lands on remains, a carcass, a body in a torn suit, a heap of offal, and chews with its head down for a long minute, then flies off lower and heavier with a ball of meat in its jaws, always the same way, home to its Queen, and feeds her. Between trips the bees drift round her comb. It does not mind being touched. When a Gummy Bear stalks it, it notices late and flees at a walking pace.',
    habitat: 'The Ledge, in slow drifting clouds round the Queen\'s comb at the Honey Pools. Now and then one wanders into the Fields or the Meadow.',
    lore: 'The Institute keeps one in a cage at the Ledge outpost as an early warning: when it stops bumping into the bars and goes very still, a Gummy Bear is close. Operators call it the Dean. It has outlived four of them. The remains it forages are why the Ledge has so few bodies, and why the ones there are have been eaten so neatly.',
    harvest: [
      { item: 'bee_fuzz', how: 'Pluck a handful of fuzz (it buzzes once, then forgets).' },
      { item: 'honey_wax', how: 'Scrape the wax flaking off its belly segments.' },
    ],
  }),
  L({
    id: 'queen_bee', name: 'Queen Bee', rank: 'gluttony', class: 'Sovereign', danger: 6,
    summary: 'The mother of the Giant Bumble Bees: three metres of banded fur and fat sat in a bowl of comb at the back of the Ledge\'s Honey Pools. The whole front of her abdomen is an open stomach, a ribbed, wet, gaping maw at floor level, and it swallows anything.',
    biology: 'Her abdomen outgrew her wings, then her legs, then her skin. It rolled forward under her until she sat on it, and it split along the belly where the plates meet. The split never healed: the stomach lining grew out to its edges and became lips, the sternite plates round it curled into hooked ribs, and the gut behind became one great open crop that digests through its whole wall. Over her flanks the fur has stretched bald and the skin gone thin as a balloon\'s; through those windows you can watch what she swallowed turn over inside her and slowly fade. She cannot walk or fly. Her four wings are the size of a man\'s hand. Her front legs are long and thick and never stop raking the floor in front of her mouth.',
    behaviour: 'She does not hunt, because she does not have to. What lies within reach of her front legs, she turns to, inhales, and swallows whole: things on the floor, chairs, boxes, the remains the bees bring her, stray animals. She is territorial, not hungry for you: a unit that steps into her bowl gets a warning first, the maw thrown wide, the front legs raking, a hiss, and is let be if it backs off. Stay, or hurt her, and you feel the inhale, a pull at your clothes; that is the moment to run. A swallowed unit is held and digested alive. It can struggle, and a hard enough struggle tears it out through her lips; a partner can cut it free, or hurt her until she heaves it back up; and after half a minute she gives up on anything that fights and brings it up anyway. Fed, she lays: the rear of her lifts, the ovipositor works, and a new grub goes into the brood comb. Her bees tend her, drift round her, and feed her what they find.',
    habitat: 'A chamber of hanging comb at the back of the Honey Pools, on the Ledge. There is only ever one.',
    lore: 'Standing order 14 tells recovery teams not to take ID strips from the Honey Pools, "because the remains there are being farmed". The order does not say for what. The Ledge team says she is the reason the bees exist at all: the place made something with an appetite and nothing else, then gave it daughters to bring it food. Calder, on the first footage: "Gluttony, not wrath. She is not angry at anything. She is just open."',
    harvest: [
      { item: 'royal_jelly', how: 'Scrape it from the brood comb round her, or from her when she is dead.' },
      { item: 'brood_comb', how: 'Break a slab off the brood mounds (the grubs are edible roasted).' },
      { item: 'honey_wax', how: 'Peel the wax off her chamber, or off her.' },
    ],
  }),
  L({
    id: 'bee_keeper', name: 'Bee Keeper', rank: 'lust', class: 'Remnant', danger: 3,
    summary: 'A Still Life the Giant Bumble Bees fed on until they grew into it: a human body with a bee coming through it, fuzz through the skin, clusters of compound eyes on the face, wings it cannot fly with, honey wax seeping from it everywhere. It is curious.',
    biology: 'The bees eat the wax off Still Lifes that sit near their foraging grounds, a little at each visit. What they leave in it, eggs, wax, fuzz, takes root in the soft dark under the wax, and the two grow together. Fuzz comes through first, then compound eyes where the eyes were and on the brow and the cheek, then antennae out of the forehead and mandibles splitting the jaw; a pair of thin jointed bee legs pushes out between the ribs and never stops moving; a banded abdomen sags out of the small of the back with a soft sting at its tip; four wings come out of the shoulder blades, far too small to lift it. Honey wax seeps from the eyes, the mouth, the wrists. Then one day it stands up.',
    behaviour: 'It wants to know about you. It follows at a polite distance, four or five metres, stops when you stop, and watches with its head on one side, in little snaps, like an insect\'s. If you look at it, it starts copying you: crouches when you crouch, holds a hand up when you hold up a torch, stands as still as you do. Anything you put down, it picks up and turns over and over against its eyes, then puts somewhere else. It backs off if you come close. It only stings when it is cornered or hurt and cannot get away: the wings blur, it hisses, and the abdomen swings forward between its legs.',
    habitat: 'The Ledge, round the Honey Pools, wherever Still Lifes sat near the bees. A few drift further.',
    lore: 'Ledge post sightings 1 to 11 follow one Still Life from the edge of the Honey Pools to its first sting. The log ends: "CALL THEM KEEPERS. LEAVE THEM ROOM." Calder argued against the name for a week and lost. She thinks they are the place practising again, with a new material: "It made a person out of wax, then let the bees teach it how to want things."',
    harvest: [
      { item: 'keeper_wax', how: 'Scrape the honey wax off it (dead), or off where it has stood a while.' },
      { item: 'keeper_eye', how: 'Cut a compound-eye cluster out of a dead one\'s face.' },
    ],
  }),
  L({
    id: 'tallow_pigeon', name: 'Tallow Pigeon', rank: 'sloth', class: 'Fauna', danger: 1,
    summary: 'A city pigeon from the neck up. Below the neck it has run down into a lumpy cone of warm tallow, wings slumped into two long drips down its sides, its pink feet poking out of a puddle of itself.',
    biology: 'The Ledge rendered it, slowly, the way fat renders in a warm pan, and it lived through it. The tallow is still its body: warm, faintly pulsing, threaded with the ghosts of feathers. It eats crumbs, grit and dropped food, and the wax it loses to the floor it regrows overnight. The crown of its head has charred into a wick; nobody has dared to find out what lighting it would do.',
    behaviour: 'It waddles on its own melt with the head-bobbing walk of every pigeon, pecks, coos, and shuffles out of your way. In the warm it softens and sags; in the cold it sets hard and stands very still. Flocks gather wherever the Ledge is close.',
    habitat: 'The Ledge, in flocks. Strays wander the suburbs, the parking levels and the corrupted floors, wherever the place has started to melt.',
    lore: 'Survey teams use them as gauges. A flock of Tallow Pigeons standing upright means the Ledge is a long way off; when they start to slump, turn around. One operator kept one as a desk lamp for a week before Calder made him give it back.',
    harvest: [{ item: 'pigeon_tallow', how: 'Scrape warm curls of tallow off its sides (it coos the whole time).' }],
  }),
  L({
    id: 'moon_calf', name: 'Moon Calf', rank: 'sloth', class: 'Fauna', danger: 1,
    summary: 'A pale, soft, pocked grazer the size of a calf, with a long prehensile lip and a clear gas bladder along its spine, bounding over the dust in long, slow hops.',
    biology: 'Its hide is the colour and texture of the regolith, cratered with tiny pits that hold moisture. The bladder is a buoyancy organ: it fills it with a light gas before each bound and sighs it out on landing, which in the Moon\'s weak pull is enough to carry it ten metres. The lip scrapes a grey lichen off the dust that nothing else can digest.',
    behaviour: 'Grazes in loose groups, heads down, lips working. Bolts from anything that runs or leaps, in long floating bounds. It never fights. Its landings thump through the ground.',
    habitat: 'The Moon.',
    lore: 'Moon Striders hunt by feeling footsteps through the dust, and a bounding calf is the loudest thing on the Moon. Operators have learned to cross the Moon behind a grazing herd: the Striders go for the calves. Calder\'s note on the file: "Do not get attached to them."',
    harvest: [{ item: 'moon_meat', how: 'Butcher it: pale, cold meat that tastes of dust.' }],
  }),
  L({
    id: 'still_life', name: 'Still Life', rank: 'sloth', class: 'Remnant', danger: 2,
    summary: 'People who do nothing. They stand facing walls or sit at tables, waxy and patient, slightly wrong: a neck too long, a head tipped over onto the shoulder, a smile that never moves.',
    biology: 'A thin skin of wax over a body of sponge: a coarse, yellow-ochre cellulose with pores you could put a finger in. No blood, no organs anyone can name. It soaks up whatever it stands in (old water, spilled drinks, blood) and grows darker and heavier with it, and it squashes when struck and springs back. Cut, it tears into spongy chunks. They are warm, a few degrees above the room, and grow very slowly into their poses; an old Still Life cannot unbend.',
    behaviour: 'Most never move. Their heads follow you when you are not looking straight at them. A few change chairs between one look and the next, a few follow at a polite distance, and very rarely one closes its hands round a throat. They are the Mulchers\' favourite hosts.',
    habitat: 'Furnished rooms: houses, the suburbs, schools, wards. Dinner tables most of all.',
    lore: 'The place remembers people who passed through and makes them again from memory, without quite remembering what people are for. Sometimes it remembers someone in your crew. Calder: "They are not copies. They are the place practising."',
    harvest: [{ item: 'sponge_chunk', how: 'Tear it apart: sponge, and a lump of tallow wax inside.' }, { item: 'mulcher_roe', how: 'Clutches are often laid on them. Scoop them off.' }],
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
    summary: 'An eye inside a ball of cold light, cupped by a sliver of moon, trailing ribbons, with two small pale hands underneath.',
    biology: 'A light-eater: it absorbs photons through the whole of its surface and stores them as cold. The sliver of moon is a shell of calcified light; the ribbons are where it sheds what it cannot hold. Its touch drinks a torch dead and leaves a frost burn the shape of a small hand.',
    behaviour: 'It drifts toward the brightest light in reach: lamps, torches, you. In the dark it wanders, unaware of you. Switch your light off and it loses you within a few seconds.',
    habitat: 'The Moon.',
    lore: 'Wisps gather in a ring around the one lamp on the Moon\'s surface that nobody has ever found the switch for. Dead wisps dissolve into glow dust; the Institute pays for it by the gram.',
    harvest: [{ item: 'glow_dust', how: 'Its body dissolves into glowing dust: sweep it up.' }],
  }),
  L({
    id: 'moon_strider', name: 'Moon Strider', rank: 'wrath', class: 'Fauna', danger: 5,
    summary: 'A grey cratered body on two enormous folded jumping legs, a long neck, an eyeless head with a mouth that opens sideways.',
    biology: 'It feels vibration through the pads of its feet with extraordinary sensitivity, and hears nothing else. Its jumps are ballistic: the legs store a whole minute of effort and release it at once, and once it is in the air it cannot steer.',
    behaviour: 'It crouches, listening, then leaps at footsteps ten metres at a time, slowly, and lands on them. When it crouches, step aside. Sneak and it cannot find you. It prefers Moon Calves, whose landings are louder than you.',
    habitat: 'The Moon.',
    lore: 'Its meat is cold even fresh, and tastes of dust and pennies. Strider skeletons lie all over the Moon with their legs still folded, as though they died listening.',
    harvest: [{ item: 'moon_meat', how: 'Butcher the haunches.' }],
  }),
  L({
    id: 'hollow', name: 'Hollow', rank: 'sloth', class: 'Remnant', danger: 2,
    summary: 'A person who stayed too long, rendered at the lowest level of detail: a grey, smeared body with a face like a thumbprint, walking the same short routine over and over.',
    biology: 'Low-resolution flesh. Up close it has no pores, no seams, no fingernails: the place stopped spending detail on it. It still breathes, still blinks on a timer, still sweats a little. Its grip carries corruption: the low detail spreads into whatever it holds.',
    behaviour: 'Harmless unless you get close in the dark or shine a light in its face. Point the torch at the floor and walk past.',
    habitat: 'Offices, the Poolrooms, the suburbs, the mall, hospitals.',
    lore: 'Some Hollows are still wearing their Institute band. One on the fourth parking level has been sweeping the same bay for eleven years; Calder had the bay marked off so nobody parks there and interrupts it.',
    harvest: [],
  }),
  L({
    id: 'lifeguard', name: 'The Lifeguard', rank: 'wrath', class: 'Fauna', danger: 6,
    summary: 'A shadow under the deep end, a long pale arm, and a red float drifting against the current. You hear its whistle before you see it.',
    biology: 'An aquatic ambusher that cannot leave deep water: a flat, eel-long body with a human arm at the front, lungs it never uses, and a whistle grown into its throat like a gall. It feels the water move from one end of the pool to the other.',
    behaviour: 'It blows its whistle once when someone enters deep water: that is the warning. Get out. Stay in, and it grabs a leg and pulls you under, and holds you there. It cannot follow you onto the tiles.',
    habitat: 'The Poolrooms.',
    lore: 'The whistle is real metal. Recovered ones are engraved with a year that has not happened yet.',
    harvest: [],
  }),
  L({
    id: 'chess_rook', name: 'Rook', rank: 'wrath', class: 'Statute', danger: 5,
    summary: 'A two-metre marble chess piece, warm to the touch, with a slit of an eye. Its crown of battlements is a jaw, hinged at the back, over a red throat.',
    biology: 'Living stone: cut it and it bleeds a fine wet plaster, and the cut closes slowly over days, leaving a vein in the marble. It has no legs. It cannot move except on the Board\'s clock, and then only along ranks and files, sliding, never through anything. It does not eat what it takes. The squares do.',
    behaviour: 'Every tick of the clock it picks a square, the square lights red under it for most of a second, and then it slides there. Whatever stands on that square when it lands is taken. Stand on its diagonal and it cannot touch you; it will line itself up with you and wait for you to step back onto its rank or file.',
    habitat: 'The Board, a dimension reached through the shining holes in the deep floors.',
    lore: 'The Board is always mid-game. Institute observers have charted three thousand of its moves and the position never repeats and never resolves. Nobody has ever seen the other player. The pieces on the far side of the Board are always the other colour, and always facing you.',
    harvest: [{ item: 'marble_chip', how: 'Chips of the body, knocked off with something heavy.' }],
  }),
  L({
    id: 'chess_knight', name: 'Knight', rank: 'wrath', class: 'Statute', danger: 5,
    summary: 'A stone horse\'s head on a plinth, its mane a row of chiselled blades, its long mouth full of teeth.',
    biology: 'Living stone like the Rook, but the head is heavier and the plinth hollow: it jumps by clenching, a sound like a quarry blast. It lands hard enough to crack the squares, which mend.',
    behaviour: 'On the clock it jumps a knight\'s L (two squares one way, one across), over anything, and lands on whatever is there. It can never land on any square touching its own: right beside it is the safest place on the Board.',
    habitat: 'The Board.',
    lore: 'Operators who survived the Board report the same habit: the Knight jumps to the square that would leave them with the fewest safe squares, every time. It is not hunting you. It is playing you.',
    harvest: [{ item: 'marble_chip', how: 'Chips of the body.' }],
  }),
  L({
    id: 'chess_bishop', name: 'Bishop', rank: 'wrath', class: 'Statute', danger: 5,
    summary: 'A slender robed column of marble under a tall mitre. The cut of the mitre is a mouth; a slit across its brow glows.',
    biology: 'The same living stone as the other pieces, worked thin: long folded hands, a ruff of a collar, a hinged cap ringed with teeth over a red throat. It is lighter than the Rook and slides faster, corner to corner, as far as it likes.',
    behaviour: 'On the clock it slides only along the diagonals, never through anything, so it can never leave the colour of square it was set down on. Stand on the other colour and it cannot reach you, ever; it will drift along its diagonals beside you, watching, gaping.',
    habitat: 'The Board.',
    lore: 'There are always two of them, one on each colour, and they never look at each other. Calder\'s survival card for the Board has one line for the Bishops: "Know your colour."',
    harvest: [{ item: 'marble_chip', how: 'Chips of the body.' }],
  }),
  L({
    id: 'chess_clock', name: 'Flagfall', rank: 'wrath', class: 'Statute', danger: 5,
    summary: 'A twin-dial tournament chess clock the size of a sideboard: a walnut-veneered case, two cream dials behind chrome bezels, a little red flag hanging at twelve on each, two chrome plunger buttons on top, a brass carrying handle. It walks on four turned spindle legs with green felt pads under the feet.',
    biology: 'Wood, brass and clockwork all the way through, and alive: the mainsprings flex like muscle and the escapement ticks like a pulse, faster when it is excited. The lower front panel is a jaw hinged at the bottom, its top edge filed into teeth, and behind it the brass wheels turn in a wet red throat. Cut it and it bleeds clock oil. One dial keeps the Board\'s time and creeps. The other is for whoever it is standing next to.',
    behaviour: 'It moves like a king: one square in any direction on its tick, always toward the nearest unit, until it is standing on a square that touches yours. Then it presses its button and your dial starts. The hand climbs toward twelve while you stay within one square of it, and stops (but does not go back) when you step two squares off. As the hand reaches the top it lifts the little red flag; when the flag falls the clock rears up on its spindle legs and comes down on every square around it. Strike its button (hit it at all) and it stops your clock, knocks your hand back, and the whole Board waits a move: no piece moves until the next knock.',
    habitat: 'The Board. Never more than one; it is always found near the Gallery end, as if it had been put down beside the set.',
    lore: 'Every Institute operator who has played a tournament game recognises the model: the twin-faced wind-up kind, with the flags, that used to be in every school chess club cupboard. Calder\'s note: "It does not want to kill you. It wants you to make your move. Do not stand next to it thinking." Units who have struck its button report the same thing: the Board goes absolutely silent, and for a moment every piece on it turns to look at them.',
    harvest: [
      { item: 'spring', how: 'Pry the mainsprings out of a dead one (they are still wound).' },
      { item: 'gear', how: 'Take the brass wheels from behind the jaw.' },
    ],
  }),
  L({
    id: 'chess_pawn', name: 'Boxwood Pawn', rank: 'gluttony', class: 'Statute', danger: 3,
    summary: 'A wooden pawn as tall as your hip, turned from honey-coloured boxwood (or ebonised black, the pale wood showing at the knocks), worn smooth by hands that are not there, with a peeling disc of green baize glued under its foot. Someone has cut a face into the knob with a penknife. The knob splits round the middle into a mouth full of teeth.',
    biology: 'Living turned wood with a slug of lead poured into the foot, which is how it stands back up whenever it is knocked over. It hops, the lead thumping on the squares, and wobbles when it lands the way a wooden piece does. It has no stomach: what it takes, the square keeps. The faces are all different and all crude, and the Institute has found the same initials scratched under the felt of every one it has opened.',
    behaviour: 'They come in a rank, from the far side of the Board, and they keep the rules of pawns exactly: one square forward (toward the Gallery) when they move, or two on a pawn\'s first move; never backward; and they can only take on the two squares diagonally in front of them. A unit standing directly in front of one is perfectly safe, and the pawn cannot get past: it rocks on its foot at you, furious. Beside it or behind it you cannot be touched at all. They are slow (not every knock), except when a unit is close ahead. A pawn that reaches the last rank grows a crown and from then on moves like a queen, any distance along any line, and it is a different animal.',
    habitat: 'The Board, in ranks of two to four.',
    lore: 'The Board will not let them stay pawns. Observers who watched a pawn crowned say the crown comes up out of the knob like a tooth, and the pawn stands up straighter and turns, for the first time, to look at whoever is nearest. Calder\'s survival card: "Stand in front of the pawns. Never let one through."',
    harvest: [
      { item: 'boxwood_chunk', how: 'Split the dead pawn: dense turned boxwood, good fuel, good for carving.' },
      { item: 'lead_weight', how: 'Knock the lead slug out of its foot.' },
      { item: 'baize_felt', how: 'Peel the green felt off the bottom.' },
    ],
  }),
  L({
    id: 'chess_case', name: 'Folding Board', rank: 'greed', class: 'Statute', danger: 5,
    summary: 'The box the set came in: a hinged walnut folding chessboard closed like a clam, inlaid squares on both outside faces, brass corners and a brass clasp. Inside it is lined with green baize and pressed with piece-shaped hollows, and its rim, both halves, is set all round with teeth. Something with yellow eyes looks out from the places where the king and queen are kept.',
    biology: 'A box that has become a mouth. The lid and the base are one animal joined at the brass hinges, which flex like a jaw joint and creak when it breathes, lifting the lid a crack. Loose pieces rattle around in the hollows; some of them are not from this set. Overturned, it cannot right itself quickly: the hinge only works one way.',
    behaviour: 'On its knock it moves exactly two squares along a rank or file, never one, never diagonally, like a king castling: it opens onto the first square and bites down on it, then hauls itself over onto the second and bites that. Both squares light up red first. The squares right beside it and every diagonal are safe. Between moves it keeps its hinge turned away from you and watches you through the gap. A heavy enough blow turns it over on its back, rocking, for a few seconds.',
    habitat: 'The Board. One or two, usually near the edges.',
    lore: 'Calder: "It is the most dangerous thing on the Board that is not a piece, because it is the only thing there that keeps what it takes. Every unit we have lost on the Board was later seen in a scan of its hollows. Small. Turned. Lacquered. Standing in a row with the spare pawns." The Institute has asked units to stop putting things into it.',
    harvest: [
      { item: 'baize_felt', how: 'Strip the green baize lining.' },
      { item: 'plank', how: 'Break up the walnut boards.' },
      { item: 'boxwood_chunk', how: 'Collect the loose pieces from its hollows.' },
    ],
  }),
  L({
    id: 'lamplighter', name: 'Lamplighter', rank: 'sloth', class: 'Familiar', danger: 1,
    summary: 'A night-light with a crescent moon and little pyjama legs.',
    biology: 'Dream-born: grown from what visitors remember fondly. Its light calms panic.',
    behaviour: 'Drifts to whoever is most afraid and stays. When it dims and hides, something hostile is near. Two candies and it is yours.',
    habitat: 'Houses, schools, the lobby, the suburbs, the Fields, hospitals.',
    lore: 'Mia had one just like it. The Institute has found Lamplighters on every level that has bedrooms, and each one is a night-light somebody on the staff remembers owning. Nobody has ever found two the same.',
    harvest: [],
  }),
  L({
    id: 'plushkin', name: 'Plushkin', rank: 'sloth', class: 'Familiar', danger: 1,
    summary: 'A stuffed toy that only moves when nobody is looking.',
    biology: 'Stuffing, thread and something that keeps it warm: cut one open and the stuffing is body temperature, and there is a small knot in the chest that beats. It is dream-born, grown out of a toy somebody loved, and it chooses the survivor who reminds it of them.',
    behaviour: 'Follows the survivor it has chosen and leaves gifts. Three sweets and it is yours.',
    habitat: 'Houses, schools, the Fields, the mall, the lobby.',
    lore: 'Its gifts are sometimes crayon notes, in handwriting you recognise.',
    harvest: [{ item: 'rag', how: 'Stuffing and cloth.' }],
  }),
  // ============================================================== the Nostalgic Playground (src/creatures/lore_playground.ts)
  ...PLAYGROUND_INHABITANTS,
  ...FUNGUS_SEA_INHABITANTS,
  ...SUBWAY_INHABITANTS,
  ...POOL_INHABITANTS,
  // ============================================================== the Ball House (src/world/gen/z_ballhouse.ts)
  L({
    id: 'timmy', name: 'Timmy', rank: 'lust', class: 'Remnant', danger: 6,
    summary: 'A child of five or six whose head has swollen into a thin, taut balloon of skin twice the width of its shoulders. The head floats; the little body dangles under it on a stretched neck, socks and sneakers kicking a hand\'s breadth off the floor. Propeller beanie, a loud printed shirt, a lollipop. Every one of them answers to Timmy.',
    biology: 'The skull has opened along its sutures and the scalp has stretched over a single sac of air the child cannot breathe back out: a knot of scar tissue at the base of the head works like the neck of a balloon. The sac is lighter than the room because the air in it is warm and wet and faintly sweet, fermented by a yeast that lives in the sinuses and feeds on sugar in the blood. Everything below the neck is an ordinary, light, underfed child. The head skin is as thin as rubber, veined blue at the temples, and rings when it is flicked. Laughing makes it gulp air; excitement closes the throat. A sweet in the mouth makes it suck instead of gulp, and the sac slowly sighs back down.',
    behaviour: 'They want to play. A Timmy that sees you giggles, waves and follows you about at a polite distance that gets less polite, kicking its feet, licking its lollipop to keep itself level. Stay close to it for long, run and make a game of it, or hurt it, and it starts to gulp air between giggles: the head swells, reddens, squeaks like a stretched balloon and wobbles, and it drifts at you to hug you, and then it pops. The burst throws confetti, boiled sweets and the rest of the child over everything within a few metres, and sets off any other Timmy near enough to hear it. A sweet thrown near one (or put in its hand) calms it, even half-swollen: it goes to it, sucks it, hums and forgets you for a while. Killed before it swells, it only goes down like a balloon. They hide in the ball pits with only their hats showing.',
    habitat: 'The Ball House, where every day is Saturday and the parties never end. They drift out to the Nostalgic Playground, and one or two have been seen in the mall, near the sweet shops.',
    lore: 'The Ball House kept every child who was not collected at closing time, and it is still keeping them. Its wristband log for a single Saturday lists two hundred and twelve children named Timmy, aged five or six, and nobody collected. The Institute does not know whose name it was first. Calder: "They are what the place made of the idea of a child left at a party after everyone else has gone home. Excited. Sticky. Waiting. Be kind to them, and be quick, and keep sweets in your pockets." Units coming back from the Ball House have confetti in their wounds.',
    harvest: [
      { item: 'timmy_lollipop', how: 'Prise the lollipop out of its fist once it is still (the others want that one more than anything).' },
      { item: 'head_membrane', how: 'Peel a sheet of the stretched head skin off a deflated one. The lab wants it.' },
    ],
  }),
];

const BY_ID = new Map(INHABITANTS.map((e) => [e.id, e] as const));
export function inhabitant(id: string): InhabitantLore | undefined { return BY_ID.get(id); }
/** species generated at run time (src/creatures/species/wildlife.ts) file their own entries */
export function addInhabitant(e: InhabitantLore) { if (BY_ID.has(e.id)) return; INHABITANTS.push(e); BY_ID.set(e.id, e); }

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
