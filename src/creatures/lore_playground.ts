// The Nostalgic Playground's inhabitants (src/world/gen/z_playground.ts): the
// field codex entries for the five things that came out of Bright Hour
// Television's children's programmes. Spread into INHABITANTS by
// src/creatures/lore.ts. Data only.
import type { InhabitantLore } from './lore';

export const PLAYGROUND_INHABITANTS: InhabitantLore[] = [
  {
    id: 'pg_dooley', name: 'Dooley Duckbill', rank: 'wrath', class: 'Remnant', danger: 6,
    summary: 'A two-metre walk-around dinosaur costume in faded tangerine plush, the host of "Dooley\'s Dino Den" (Bright Hour Television, 1991-1998). Googly eyes, a teal felt crest, a sewn-on grin that never changes. It is still performing. Its belly seam has split from breastbone to crotch.',
    biology: 'The costume is foam, plush and felt, and it is no longer empty. Through the split seam: wet red tissue pressed against the lining, the curve of a rib, yellow fat, and a human hand that grips the edge of the split from inside and lets go and grips again. Behind the black mesh in the duck-bill, where the performer looked out, there is an eye, and it blinks. Whatever is in there has grown to fill the suit. It does not eat. It does not tire. It sweats through the plush, and the plush is always warm.',
    behaviour: 'Once it has seen you, you are its audience. It waves, then dances its numbers, stomp, stomp, clap and spin, and between numbers it bows and takes a few steps closer. Watch the whole show, five numbers, and it says goodbye and leaves you alone for a while. Look away, or walk out of the show, and the show is over: it comes running with its arms open for a hug, and the hug crushes, and something inside the belly bites. If you look back at it for long enough it remembers itself and starts the next number. Hurt it and it stops caring whether you watch.',
    habitat: 'The Nostalgic Playground: the lawns, the climbing frames, the closed studio where the Den was filmed.',
    lore: 'Bright Hour\'s Dino Den went out at four every weekday for seven years. Four performers wore the suit; the costume department records show five. Field note, Dr. Calder: "The unit asked me why we keep calling it a costume. Because it is one, I said. The question is who is wearing whom." A survey unit that sat through the full show and clapped at the end reported that Dooley bowed to him, very low, and that through the mesh the eye was crying.',
    harvest: [
      { item: 'pg_plush_scrap', how: 'Cut panels of costume plush off a dead one.' },
      { item: 'pg_googly_eye', how: 'Pull a googly eye off its head.' },
    ],
  },
  {
    id: 'pg_doodlewump', name: 'Doodlewump', rank: 'envy', class: 'Mimic', danger: 5,
    summary: 'A pear-shaped pre-school character from "The Doodlewumps" (Bright Hour Television, 1996-1999): pastel terry plush embroidered with stars, a porcelain baby-doll face in a plush hood, a bent set of rabbit-ear aerials on top and a real cathode-ray screen sewn into its belly.',
    biology: 'Under the terry cloth is a soft, warm body that is mostly stuffing and partly not; the screen\'s housing has grown into it and something dark leaks from under the bezel. The face is porcelain, cracked and chipped, and the glass eyes do move. The tube is live. It shows static until the Doodlewump sees someone, and then it shows them: their own face, live, from where it stands. Scans of the tube show no circuitry that could do that. The aerial is the only part that is cold.',
    behaviour: 'They wander in twos and threes, waddling, giggling, bouncing on the spot. When one sees you, the static clears, your face comes up on its belly, and it stops and rocks and stares. The longer you stay on its screen the more it "tunes in", and the more of your mind goes into the glass: lucidity drains, stress climbs, and on the screen your eyes go black. Fully tuned, it runs to cuddle you and presses the hot tube to you. Break its line of sight and the picture goes; it wanders to where you were, says goodbye to nobody, and forgets. When one tunes in, the others nearby turn to you too.',
    habitat: 'The Nostalgic Playground. They like the sandpits and the long grass round the climbing domes, and the studio floor where the show was made.',
    lore: '"Tummy Time" was a short film shown on every Doodlewump\'s belly in every episode: a kite, a train, children waving. Bright Hour\'s archive has the scripts for forty-one Tummy Time films and the tapes for thirty-nine. Calder ordered the Institute\'s own monitors covered while a unit is in the Playground: "If it can find a screen, it can find you on it."',
    harvest: [
      { item: 'pg_crt_tube', how: 'Cut the picture tube out of a dead one\'s belly.' },
      { item: 'pg_aerial', how: 'Twist the aerial off its head.' },
      { item: 'pg_plush_scrap', how: 'Strip the terry plush.' },
    ],
  },
  {
    id: 'pg_lefty', name: 'Lefty', rank: 'greed', class: 'Parasite', danger: 4,
    summary: 'A big striped tube sock with button eyes, a pompom nose and a felt tongue: the host of "Lefty\'s Laundry Hour" (Bright Hour Television, 1989-1995). It is worn on a human arm, grey and hairless, that comes up out of a hole in the ground and does not seem to end.',
    biology: 'The arm is human in every respect but length: skin, veins, the knuckles of the hand under the sock; an elbow every couple of metres, each one bruised. It has been measured at more than twelve metres from the hole and the end has never been found. The hand inside the sock has teeth now, or something like teeth, behind the felt. The sock is wet inside and always warm.',
    behaviour: 'It lives in a hole, usually under the sandpit or the puppet booth, and pokes its head up to look around and chat. Within reach it comes for you over the grass, weaving like a snake, talking all the time, with the arm laid out behind it along every metre it has crossed. It bites, and it holds on. It takes anything left on the ground and pulls it down the hole: its "collection". The arm only goes so far. Past the end of it Lefty can only coax and complain. Hurt it badly and it whips back underground for a while.',
    habitat: 'The Nostalgic Playground: sandpits, the puppet booth on the old studio set, the laundry baskets.',
    lore: 'The Laundry Hour was filmed through a hole in the set floor. In six years nobody on the crew admitted to being Lefty\'s performer, and the show\'s budget sheets list no puppeteer. Bright Hour\'s last memo on the programme reads, in full: "Fill in the hole." Survey units call the dead ground round its hole "the basket". Things dropped there come back up, eventually, slightly damp.',
    harvest: [
      { item: 'pg_sock', how: 'Peel the sock off a dead one (do not look at the hand).' },
      { item: 'pg_button_eye', how: 'Cut off a button eye.' },
    ],
  },
  {
    id: 'pg_petula', name: 'Petula', rank: 'lust', class: 'Statute', danger: 5,
    summary: 'A two-and-a-half-metre sunflower that walks on its roots, the star of "Grow-Along with Petula" (Bright Hour Television, 1993-1997). Hairy stem, drooping leaves, petals browning at the tips, and in the middle of the seed head a baby\'s face, soft and pink, with seeds pushing through the skin and two black seeds for eyes.',
    biology: 'It is a plant: cellulose, chlorophyll, sap. It photosynthesises in the Playground\'s endless evening and drinks from the sandpits\' damp. The face is not a plant. It is warm, it has a pulse, and the mouth behind the soft chin is full of seeds set in it like teeth. Its roots end in curled tips it digs in and pulls on, and it can cross a lawn faster than you can run when nobody is watching it.',
    behaviour: 'It never moves while anyone has it in view. Watched, it is a sunflower, and its face is turned toward you. Look away and it walks on its roots toward you, singing the lullaby from the show, and you can hear the song getting closer. Close enough and unseen, it bites. Look back and it is a sunflower again, nearer, its face still on you. Two units back to back can walk past it in safety. Alone, keep it in sight while you back away.',
    habitat: 'The Nostalgic Playground. It likes the open lawns where the light is longest, and the planter boxes on the studio set.',
    lore: 'The original Petula was a rod puppet in a window box. Her song, "Grow Toward the Sun", was released as a single in 1994 and sold eleven copies. Calder had the Institute\'s copy destroyed after a unit listened to it on loop through a whole sleep cycle and woke facing the wall, smiling, and would not turn round.',
    harvest: [
      { item: 'pg_seeds', how: 'Prise seeds out of the head of a dead one.' },
      { item: 'pg_petal', how: 'Pluck petals.' },
    ],
  },
  {
    id: 'pg_counto', name: 'COUNT-O', rank: 'wrath', class: 'Statute', danger: 5,
    summary: 'A home-made robot costume from "COUNT-O\'s Number Hut" (Bright Hour Television, 1994-1996): a dented carton body in kitchen foil and silver tape, dryer-hose limbs, oven mitts, lamp eyes, a bulb on an aerial, an abacus on its chest and a dial that counts. A wooden metre-stick is taped to its right mitt.',
    biology: 'Whoever was inside the costume has been in there a very long time. The cardboard has gone soft and dark from the bottom up, the hose joints drip, and through a hole torn in its side there is something wet pressed against the card. It does not eat or sleep. Its lamps are lit with no battery anyone can find.',
    behaviour: 'It plays hide-and-seek, as the show did at the end of every episode. When someone is near, it turns its back, covers its lamps with its mitts and counts to ten, out loud. Be out of its sight when it gets to ten. Then it searches, near where it heard you. If it sees you it shouts, and runs, and teaches: three strokes of the metre-stick, counted. If it never finds you it announces "good hiding", leaves a gold star sticker for you, and counts again. Hit it while it is counting and it calls that cheating and comes straight for you.',
    habitat: 'The Nostalgic Playground: the studio set, the climbing frames, wherever there is something to hide behind.',
    lore: 'The Number Hut was cancelled after twenty-six episodes. Calder: "It is the only inhabitant we have found that rewards good behaviour. I would like everyone to think hard about what it has taught us, and then never play its game unless you have to." Gold stars are a minor currency among survey units. Nobody admits to how they got theirs.',
    harvest: [
      { item: 'pg_ruler', how: 'Cut the metre-stick off its mitt.' },
      { item: 'pg_gold_star', how: 'It gives them away. Or take them off a dead one.' },
    ],
  },
];
