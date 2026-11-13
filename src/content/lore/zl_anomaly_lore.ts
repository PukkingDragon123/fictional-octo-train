// Readables for the Ledge (src/world/gen/z_ledge.ts) and the studyable
// anomalies placed through the levels (src/world/anomalies/place.ts). The
// codex ids and notes live in src/world/anomalies/data.ts.
import { defLore } from '../loreRegistry';

// ---------------------------------------------------------------- the Ledge
defLore({
  id: 'lg_survey_log', title: 'Survey log, Ledge post 2', style: 'terminal', codex: ['gummy_bear', 'bumble_bee'],
  text: `MERIDIAN INSTITUTE OF LIMINALITY // FIELD SURVEY // AN-07
DESIGNATION: THE LEDGE (THERMOPLASTIC DRIFT)

AIR 31 C. CARPET 31 C. WALLS 31 C. PROBE 31 C.
NOTHING HERE IS HOT. EVERYTHING HERE IS SOFT.

DAY 1  Set the post. Left the spare kit on the
       carpet by the tent. Ate.
DAY 1  The spare kit is a puddle with buckles in it.
DAY 2  Units report warmth behind the eyes after
       ninety minutes. Rotating them out at sixty.
DAY 3  The bees are back on the honey pools. Fat,
       slow, harmless. Something follows them that
       is not slow. Fur on it. Do not approach.

RECOMMEND: CARRY EVERYTHING. FOIL IN THE POCKET.
SAMPLES FROM THE HEAPS, NOT FROM THE WALLS.`,
});
defLore({
  id: 'lg_debtor_note', title: 'Note stuck to the carpet',
  text: `DON'T PUT ANYTHING DOWN.
NOT YOUR BAG. NOT YOUR TORCH. NOT FOR A MINUTE.

I put my boots by the wall to dry my feet
and when I looked back the boots were a
shape on the floor that remembered boots.

the walls lean in when you are not watching.
they lean back when you look. it's fine.
it's fine. drink water. keep moving.

the bear isn't a bear any more. if you see
something brown and wet with too many old
legs, go the other way. it eats the bees.
it splits when you hurt it.        — D-6102`,
});
defLore({
  id: 'lg_calder_memo', title: 'Memo: on the Ledge', style: 'paper',
  text: `TO: Field operators
FROM: Dr. I. Calder, Research

The Ledge is not dangerous because it is hot.
It is dangerous because it is comfortable.
Units lie down there. They feel warm and safe
and do not want to get up, and the place lets
them sink.

Keep your unit moving. Keep its hazmat sealed.
Bring a filter. Bring survey foil if the stores
have any. Bring nothing you cannot carry out.

Whatever melts there can be un-melted. The
Poolrooms drain that rains upward will set it
right, for reasons I would very much like to
understand. Send me a sample of each.

And look over the edge, once. I want to know
what you think is down there.`,
});

// ---------------------------------------------------------------- the anomalies in the levels
defLore({
  id: 'an_updrip_note', title: 'Lifeguard incident card',
  text: `INCIDENT: DRAIN 4 (DRY END)
NATURE: WATER GOING THE WRONG WAY

Water leaves the grate in drops and goes UP
to the ceiling. Dropped my whistle on it.
Whistle went up. Whistle came down a minute
later. Whistle was new. The dent was gone.

Tried my watch (broken since '91).
Came down ticking.

Did NOT try my hand. Do NOT try your hand.
                       — Lifeguard on duty`,
});
defLore({
  id: 'an_noon_note', title: 'Drawing on the wall, with words',
  text: `MY LAMP IS THE SUN.

when it is dark mommy says go to sleep but my
lamp says it is lunch time. the scratchy things
don't come in when it is lunch time. they stand
in the hall and wait for night but my lamp
doesn't do night.

i drew the sun inside it. it looks like my
drawing now.                            — M.`,
});
defLore({
  id: 'an_callback_note', title: 'Torn page from a camp',
  text: `THE PHONE ON THE ISLAND RANG AND IT WAS ME.

Not like an echo. Like a recording. It said
"left at the ramp, left again, don't look at
the pillar with the hands," which is what I
said to myself an hour before.

It kept going after that. It said where I came
in. I hadn't said that out loud. It was right.

Second time it rang I didn't answer, and it
rang for a long time, and then it said my name
in a voice that was trying to be mine.`,
});
defLore({
  id: 'an_globe_note', title: 'Westgate Lost & Found tag', style: 'paper',
  text: `LOST & FOUND // WESTGATE MALL
ITEM: SNOW GLOBE (LARGE)  FOUND: CENTRE COURT
CONTENTS: "LEVEL 0" (MINIATURE), ONE FIGURE

DO NOT SHAKE.

Staff note: Kevin shook it. Every mannequin on
the upper floor fell over at the same time. So
did Kevin. The little man inside did not fall
over. He looked up.

Nobody has claimed it. It does not fit through
the door to the office anyway.`,
});
defLore({
  id: 'an_carpet_note', title: 'Note pinned near the whorl',
  text: `TRADING POST (DON'T LAUGH)

Put a thing on the soft bit. It goes down.
Wait. It coughs up something else.

Gave it: a dead battery.     Got: a sandwich.
Gave it: the sandwich.       Got: a key (no door).
Gave it: a sock.             Got: a better sock.
Gave it: a finger (Doyle's,  Got: nothing for a day.
         he was already          Then a lot of hair.
         dead, it's fine)

It's warm. It breathes when you're quiet.
Don't sleep on it.`,
});
defLore({
  id: 'an_chair_note', title: 'Facilities ticket #4471',
  text: `REQUEST: REMOVE CHAIR, QUIET ROOM
STATUS: CLOSED (UNABLE)

Chair turns to face whoever is in the room.
Tried facing it to the wall. Tried a cable tie.
Tried taking it out of the room. It was back
in the room when we got back to the room.

R. Doyle sat in it for a laugh at 10:15.
R. Doyle was found in the copy room at 12:15
standing very still, rested, asking what day
it was. He has asked to sit in it again.
Request denied.`,
});
