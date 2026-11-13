// Westgate Station's inhabitants (round 16, src/world/gen/z_subway.ts): the Worm Train,
// its eggs and larvae, the Token Whelk, the Stile Mantis and the Ringer. Field codex
// entries (src/creatures/lore.ts spreads them into INHABITANTS). Data only.
import type { InhabitantLore } from './lore';

export const SUBWAY_INHABITANTS: InhabitantLore[] = [
  {
    id: 'worm_train', name: 'Worm Train', rank: 'pride', class: 'Sovereign', danger: 9,
    summary: 'A segmented animal sixteen metres long, grown into the shape of the thing it lives among: six car-segments of horn plate over pale flesh, fluted and striped like old rolling stock, fleshy gangways between them, a cab of a head with a headlamp that is an eye, and dead window-eyes all down both flanks, lit like a carriage at night. It walks on twenty-four long jointed legs, spider fashion.',
    biology: 'A myriapod, in the end: a centipede\'s body plan, every segment carrying two pairs of legs, scaled up past anything that should stand. The car-shell is keratinous horn laid down in plates over a hydrostatic body; the fluting and the teal and orange stripes are grown, not painted. The window-eyes are real eyes that no longer focus, kept for the light they give off; the headlamp is a single great eye with a reflecting layer behind it, like a cat\'s, and a lamp of its own chemistry in front of that. The pantograph spines on its back are sensory: they read the hum of the rails and the electricity in the air. The mouth splits down the middle of the cab, the two jaw-plates opening like doors on a row of teeth, and a comb of bone under the chin clears the track ahead. It lays egg sacs in the track pits.',
    behaviour: 'It runs the Inner Loop like a service: out of the tunnel mouth with its lamp lit and the rails singing, braking into Westgate with a scream, dwelling at Platform 2 with every window-eye open, then away round the ring. Between laps it climbs the tunnel walls into the roof and waits there upside down. Its legs step in ripples down each side; every segment goes exactly where the head went, up walls, over the roof and down again. It takes whatever stands on the track bed or at the platform edge, and it runs down anything that comes onto the tracks; anything in the way of the cars is run over. It does not leave the tracks and the platforms: the stairs, the ticket hall, the stabled train on Track 1 and the staff rooms are safe. Anything that rings, it comes to.',
    habitat: 'The Inner Loop: the ring of tunnels and track under Westgate Station.',
    lore: 'Motorman\'s log, the last page: "It is a train. It is on my line, facing me, with its lamp on. It is not a train." The signal room\'s track circuits still report the ring as OCCUPIED, OCCUPIED, OCCUPIED, at about twenty miles an hour. Dr. Calder: "It has learned the timetable. That is what frightens me. Not the size. It has learned to stop at the platform and wait for the doors." Rank PRIDE: there is no fighting it. Keep off the track.',
    harvest: [
      { item: 'wt_shell', how: 'Prise the car-shell plates off its flanks. They turn a blade.' },
      { item: 'wt_eye', how: 'Cut out a dead window-eye with its lid. The lab pays for every one.' },
      { item: 'wt_spine', how: 'Snap a pantograph spine off its back.' },
      { item: 'wt_flesh', how: 'Butcher the flesh between the plates: sweet, like crab, cooked.' },
    ],
  },
  {
    id: 'worm_egg', name: 'Worm Train Egg', rank: 'sloth', class: 'Fauna', danger: 2,
    summary: 'A translucent sac as long as a man, glued down in a track pit on tethers of mucus, lit warm from inside and pulsing, with a larva curled up in it like a sleeping beetle: three soft cars, its lamp already lit.',
    biology: 'The sac is a tough amber membrane full of a clear, warm yolk that hums faintly against the hand. The larva lies curled in it with its legs folded; its window-eyes are already open. The light is the larva\'s own lamp diffused through the yolk.',
    behaviour: 'It does nothing until it is disturbed: stand over it, touch it or strike it and the larva wakes, the sac heaves and splits within seconds, and a hungry larva comes out. Left alone it hatches in its own time.',
    habitat: 'The track pits of the Inner Loop: the Return Tunnel, the loop tunnels, the siding.',
    lore: 'The motorman again: "Sacs. Big as a man, lit up inside like a carriage at night. There is a little one curled up in each. Do not touch the sacs." The Institute wants intact larvae more than anything else on the Loop. Cut quickly, from a step away.',
    harvest: [
      { item: 'wt_egg_jelly', how: 'Scoop the yolk out of a split sac.' },
      { item: 'wt_larva', how: 'Cut the larva out before it hatches. A specimen, for the lab.' },
    ],
  },
  {
    id: 'worm_larva', name: 'Worm Train Larva', rank: 'wrath', class: 'Fauna', danger: 3,
    summary: 'A Worm Train three soft cars long and the size of a dog, lamp lit, legs everywhere. Just hatched and hungry.',
    biology: 'Everything the adult is, small and unhardened: the car-shell is still soft enough to dent with a thumb, the window-eyes are bright, and the legs are too many and too long for the body. It grows a car a year, the signal room thinks.',
    behaviour: 'It goes for the nearest unit and bites at the ankles, and it runs up walls like a centipede. It is soft and breaks off when it is hurt: hit it and it runs.',
    habitat: 'The Inner Loop; strays reach the Service Tunnels.',
    lore: 'Calder: "The adult does not seem to care about them at all. Which is a mercy, and also a little sad."',
    harvest: [{ item: 'wt_flesh', how: 'Butcher it.' }, { item: 'wt_shell', how: 'Peel the soft plates.' }],
  },
  {
    id: 'token_whelk', name: 'Token Whelk', rank: 'greed', class: 'Fauna', danger: 2,
    summary: 'A sea snail the size of an armchair that has grown into the token booth and will not come out: a turreted shell banded cream and chocolate and ringed with brass, a great soft foot pressed flat against the inside of the glass, eyes on stalks that follow you along the counter.',
    biology: 'A whelk, a predatory sea snail, grown huge in a dry place on what the booth offered it. It has been eating tokens for thirty years: the brass rings in its shell are the metal, laid down with the shell. Its proboscis is a long, soft tube with a rasping tongue at the end; it slides through the brass trough under the window. The operculum, the horn door it closes its shell with, is exactly the size of a token.',
    behaviour: 'It trades. Put a coin in the trough and it takes it, considers it, and slides a token back. It never leaves the booth. Struck, it pulls in and shuts its horn door, and most of the next blows go nowhere; and it remembers who did it, and for a while lashes at them through the trough if they stand at the window.',
    habitat: 'The token booth in Westgate\'s ticket hall.',
    lore: 'The booth daybook: "TUE The clerk did not come in. The booth is occupied anyway. It is very polite." Rank GREED: it keeps the takings. Every one of them.',
    harvest: [
      { item: 'whelk_meat', how: 'Butcher the foot: boil it long.' },
      { item: 'whelk_operculum', how: 'Take its horn door. The turnstiles accept it, and so does the thing at the end of the row.' },
      { item: 'brass_token', how: 'Search it: the tokens it hoarded.' },
    ],
  },
  {
    id: 'stile_mantis', name: 'Stile Mantis', rank: 'envy', class: 'Mimic', danger: 4,
    summary: 'A mantis grown into the shape of a token turnstile: a boxy thorax with a grain like brushed steel, a green light where its eyes are, the token slot its mouth, three raptorial arms held out from a hub on its chest exactly like the turnstile\'s bars. It stands at the end of the row.',
    biology: 'A mantid, all ambush. The thorax is broad and flat-sided and its chitin has grown a brushed grain; the abdomen is tucked up behind it out of sight. The three forelimbs are a mutation that has bred true: three raptorial arms on a rotating hub, each lined underneath with hooked spines. Four thin walking legs fold flat under the body. The slot on top is the mouth, and it takes tokens: it eats the brass.',
    behaviour: 'It stands perfectly still in the turnstile line, the last turnstile in the row. Put a token in its slot (it likes a whelk\'s operculum even better) and the bars click round, the green light shows, and it lets you through. Walk through without paying and the three arms close on you. Out of the line it guards a few metres for a little while, then walks back, folds itself down and is a turnstile again.',
    habitat: 'The turnstile line in Westgate\'s ticket hall.',
    lore: 'Staff notice, the signal room: "Fares are paid in tokens. Pay at the turnstile; the one at the end of the row is not a turnstile." Rank ENVY: it wants to be the machine, and it is very nearly there.',
    harvest: [
      { item: 'mantis_blade', how: 'Cut off a raptorial arm.' },
      { item: 'mantis_chitin', how: 'Pry off the brushed panels of its thorax.' },
    ],
  },
  {
    id: 'ringer', name: 'Ringer', rank: 'lust', class: 'Fauna', danger: 2,
    summary: 'A thing on stilt legs, the height of a child: a body like a black bakelite telephone with a ring of pale eyes on its chest like a dial, a coiled cord of a neck, and a head shaped like a handset, eyes in the earpiece cup and a perforated beak in the mouthpiece.',
    biology: 'A wading animal of sorts, all legs and neck. The body is a lacquered black shell, the neck a spring of cartilage that stretches to four times its length. Two chambers in its throat ring like a telephone bell, and its voice box records: what it says, when it finally speaks, is a scrap of somebody else\'s call. The eyes on its chest turn together when it rings, like a dial.',
    behaviour: 'It is curious and harmless and wants to be answered. It finds a unit and follows at a polite distance, head cocked, and rings at them: more often, and louder, the longer it is ignored. The ringing carries down the tunnels, and the Worm Train comes to it. Answer it (pick up its head) and it goes quiet, says something in a stranger\'s voice, and keeps you company for a while. Hurt it and it shrieks and rings and runs.',
    habitat: 'The platforms and the ticket hall at Westgate; one or two have wandered up into the Depot.',
    lore: 'Staff notices: "The phones on the concourse are not connected. If one rings, let it. If something walks up to you and rings, let it ring. It will bring the train." (Later, in different handwriting: "No. Answer it. Answer it and it stops.") Rank LUST: it wants your attention, and it is not the only thing listening.',
    harvest: [
      { item: 'ringer_cord', how: 'Cut the coiled neck: a natural bungee.' },
      { item: 'ringer_bell', how: 'Take the bell organ from its throat. It still rings.' },
    ],
  },
];
