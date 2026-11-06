// Readables found by the dead (src/world/remains/scatter.ts LAST_NOTES): the
// notes old units were writing when they stopped, and the Institute's
// standing order about recovering them. Plus the hive at the Honey Pools.
import { defLore } from '../loreRegistry';

defLore({
  id: 'rm_note_count', title: 'Note in a dead unit\'s glove',
  text: `I counted the doors. 41 on the way in.
I counted them again on the way back.
39.

I am going to sit down here where I can see both ways.
If you are reading this you came from one of them.
Which one.`,
});
defLore({
  id: 'rm_note_bees', title: 'Note on the back of a ration wrapper', codex: ['bumble_bee', 'queen_bee'],
  text: `the bees came for Okafor about an hour after.
not to hurt. they sat on him and ate.
very slowly, very carefully, like they were being polite.
then they flew off fat and low and all the same way.

I followed them for a bit. they all go to the same place.
something is being fed.`,
});
defLore({
  id: 'rm_note_sorry', title: 'Note folded into a hazmat cuff',
  text: `To whoever has my number next:

The suit is not the problem. The mask is not the problem.
The problem is you will think you are the first one here.
Look at the floor. Look at how many of us there are.

Take the tag off my chest. They pay for those.
At least someone gets something out of this.`,
});
defLore({
  id: 'rm_note_map', title: 'A map drawn on graph paper, bloodied', codex: ['grinhound'],
  text: `[a sketch of corridors, most of them crossed out]

X = where it waits
X = where it waited YESTERDAY
X = (scribbled over)

it is not the same corridors. it is the same smile.`,
});
defLore({
  id: 'rm_note_hum', title: 'A page torn from a field log',
  text: `Day ?
The hum is louder lying down. I think it is in the floor.
My leg is not coming back. I put the torch on so whoever
finds me does not have to find me in the dark.

Battery says 2%. That is fine. That is long enough.`,
});
defLore({
  id: 'rm_recovery_order', title: 'Standing order 14: recovery of units', style: 'terminal', codex: ['queen_bee'],
  text: `MERIDIAN INSTITUTE // OPERATIONS // STANDING ORDER 14

UNITS LOST IN THE FIELD ARE NOT RECOVERED.
ID STRIPS ARE RECOVERED. BOUNTY: 6 SCRIP PER STRIP.

NOTE (LEDGE TEAM): DO NOT RECOVER STRIPS FROM THE
HONEY POOLS. THE REMAINS THERE ARE BEING FARMED.
THE BEES CARRY THEM TO SOMETHING IN THE COMB.
WHATEVER IS IN THE COMB IS VERY LARGE AND ITS
STOMACH IS OPEN.`,
});
defLore({
  id: 'qb_keeper_log', title: 'Ledge post: keeper sightings', style: 'terminal', codex: ['bee_keeper', 'still_life'],
  text: `SIGHTING 1  A Still Life sat at the edge of the Honey Pools.
            Bees on it. Dozens. Eating the wax off it.
SIGHTING 4  Same Still Life. There is fuzz coming out of
            its skin. Its eyes are wrong. More of them.
SIGHTING 9  It got up. It followed Unit 2207 round the
            pools for an hour, copying how she walked.
            She dropped a torch. It picked the torch up and
            turned it over and over and over.
SIGHTING 11 She cornered it by accident. It stung her.

CALL THEM KEEPERS. LEAVE THEM ROOM.`,
});
