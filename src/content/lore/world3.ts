// Lore: the Depot, the Showroom, the Homestead, Annex B, the Undercroft and
// the wrong rooms. Everything here is told from inside the Remittance
// Programme: debtors, scrip, the BAILIFF band, the Still Lifes.
import { defLore } from '../loreRegistry';

// ---------------------------------------------------------------- the depot
defLore({
  id: 'zw_depot_notice', title: 'Interchange notice (framed)',
  text: `MERIDIAN TRANSIT — INTERCHANGE 0

Transport from this interchange is available to Remittance clients in good standing.

• Tickets are sold for scrip only, at the booth, when your balance reads ZERO.
• Your monitor band will be checked at the door of the vehicle.
• Clients with an outstanding balance will not be carried.
• Clients who attempt to board without a ticket will not be carried.
• Luggage left on the concourse becomes property of the Programme.

Services run on time. Please do not ask what time.`,
});

defLore({
  id: 'zw_depot_ticket', title: 'Ticket stub',
  text: `SINGLE — ADULT
FROM: INTERCHANGE 0   BAY 0
TO: HOME
VALID FOR ONE JOURNEY ONLY
NOT TRANSFERABLE
ISSUED 25:61

Torn, but not punched. On the back, in pencil: "it came. i didn't have enough. it waited, then it didn't."`,
});

defLore({
  id: 'zw_depot_driver', title: "Driver's duty sheet",
  text: `DUTY SHEET — BAY 0 — SHIFT: ALL OF THEM

06:14  Arr. Bay 0. One fare. Band green. Carried.
06:14  Arr. Bay 0. No fare.
06:14  Arr. Bay 0. Two fares, one band red. Refused. Other one would not leave without him. Refused.
06:14  Arr. Bay 0. No fare.
06:14  Arr. Bay 0. One fare, band green, ticket correct. Carried. Did not ask where.

I have not been home. I keep writing 06:14 because the clock above the bay says 06:14 and I have stopped arguing with it.`,
});

defLore({
  id: 'zw_lost_property', title: 'Lost property ledger',
  text: `ITEM                     FOUND        CLAIMED
suitcase, brown          concourse    —
suitcase, brown          concourse    —
suitcase, brown          concourse    —
child's coat, red        Bay 7        —
wedding ring             bench 14     —
wedding ring             bench 14     —
a man, seated            bench 14     STILL LIFE — DO NOT REMOVE
umbrella (x212)          everywhere   —

Note from management: items unclaimed after one shift may be remitted. Rings are worth more than the bags. Weigh accordingly.`,
});

// ---------------------------------------------------------------- the showroom
defLore({
  id: 'zw_showroom_memo', title: 'Staff memo — room sets',
  text: `TO: ALL FLOOR STAFF
RE: ROOM SETS

1. Room sets are restocked from the Homestead every night. Do not ask how. Do not go and look.
2. If a room set has more chairs than it had yesterday, leave the extra chair.
3. Do not acknowledge customers who are already seated in a room set. They are part of the display.
4. Price everything. Everything that is not priced will be taken by the Programme at a valuation of zero.
5. Remittance crews are permitted on the shop floor. Let them smash what they like. It all comes back.`,
});

defLore({
  id: 'zw_showroom_receipt', title: 'Till receipt',
  text: `THE SHOWROOM — WE FURNISH LIVES
-----------------------------
FAMILY SET (4 PERSONS)     999
  incl. table, chairs x4,
  sofa, television (on),
  beds x3, persons x4
DELIVERY                     0
-----------------------------
TOTAL                      999 SCRIP
PAID BY: CLIENT D-2210
BALANCE AFTER PAYMENT: -4,180

"He bought them because they looked like us. They do look like us."`,
});

defLore({
  id: 'zw_assembly', title: 'Assembly instructions',
  text: `HOMEBODY — 14 PARTS — 2 PERSONS REQUIRED

Step 1: Unpack all parts. Check you have the family.
Step 2: Seat the father at the head of the table.
Step 3: Seat the mother. Seat the children.
Step 4: Turn on the television. It does not need to be plugged in.
Step 5: Do not fit faces. Faces are fitted in use.

[The little drawn people in the diagrams have no faces. In the last panel, a fifth figure stands outside the window in a jumpsuit.]`,
});

// ---------------------------------------------------------------- the homestead
defLore({
  id: 'zw_home_note', title: 'Note on the fridge',
  text: `Dinner's on the table.
Don't let it get cold.
Don't wait up.
We love you.

— Mum & Dad

(The same note is on every fridge in every kitchen. The handwriting gets a little worse each time, as if someone were copying it from memory.)`,
});

defLore({
  id: 'zw_home_child', title: 'Letter in crayon',
  text: `DEAR WHOEVER

THE NEW MUMMY DOES NOT BLINK.
THE NEW DADDY SITS IN THE CHAIR ALL NIGHT AND THE TV IS ON BUT THERE IS ONLY SNOW.
THERE IS ALWAYS DINNER AND IT IS ALWAYS HOT AND NOBODY EATS IT.
WHEN I GO TO BED THERE IS ANOTHER ME IN THE BED.
I SLEEP ON THE FLOOR.

PLEASE COME AND GET ME
I AM IN THE HOUSE
THE HOUSE IS THE ONE WITH THE RED DOOR`,
});

defLore({
  id: 'zw_home_survey', title: 'Domestic Replication Survey (clipboard)',
  text: `MERIDIAN INSTITUTE — DOMESTIC REPLICATION SURVEY
Subject dwelling: "14"   Iteration: 212

Rooms present: hall, living, kitchen, dining, bedrooms (3), bathroom. ✓
Persons present: 4 (posed). ✓
Food: present, fresh, warm. ✓ (source unknown)
Faces: UNRESOLVED.
Television: on. Content: static. ✓

Observer note: the Still Lifes do not move while observed. I am confident of this. I am less confident about while not observed. Iteration 213 has one more chair at the table than 212. The extra place is laid for someone in a yellow jumpsuit.`,
  codex: ['still_life'],
});

// ---------------------------------------------------------------- annex B
defLore({
  id: 'zw_annex_memo', title: 'Memo — Remittance survey crews',
  text: `MERIDIAN INSTITUTE — ANNEX B — INTERNAL

Survey teams cost money. Remittance clients cost nothing; they already owe.

Effective immediately, all survey work beyond Annex B will be carried out by Remittance crews. Fit the BAILIFF band before insertion. Brief them through the projection (Staff Sergeant VOSS profile). Do not tell them the band is armed until they ask.

Recovered property is to be remitted through the hoppers at full weight. Clients are credited at our valuation.

Tether protocol applies to staff only.`,
});

defLore({
  id: 'zw_annex_log', title: 'Base camp log',
  text: `DAY 1. Camp set at the edge of the lit area. Generator up. Three tether lines laid into Sector 7: T1 (orange), T2 (orange), T3 (blue). Rule: nobody goes in unclipped. Nobody comes out unclipped.

DAY 2. T1 to 40m. Office cubicles, same as here, no lights. T2 to 52m. Same.

DAY 3. T3 to 61m and then the rope went slack. Not cut. Slack. We pulled it back in and there was more rope than we sent.

DAY 4. T3 came back on her own. She was dry. She did not know us. She sat down at the table and ate.

DAY 5. There are two of her now. One is sitting very still.`,
  codex: ['still_life'],
});

defLore({
  id: 'zw_annex_tape', title: 'VHS label: "TETHER 3 — HELMET CAM"',
  style: 'tape',
  text: `[Hiss. A torch beam in a beige corridor, ceiling tiles, a rope in frame.]

T3: Forty-eight metres. It's just more of the annex. Same posters.
CAMP: Copy, forty-eight.
T3: Fifty-five. There's a light on in one of the offices. There's someone at the desk.
CAMP: Say again?
T3: Someone at the desk. Their back's to me. They're wearing — it's one of ours. It's a suit like mine.
CAMP: T3, come back now.
T3: Sixty. It's me. It's sitting there and it's me. It's —

[The rope in frame goes slack. The picture holds on the corridor for eleven minutes. Then the camera is picked up, and carried back towards camp, very carefully, by someone who does not speak.]`,
});

// ---------------------------------------------------------------- the undercroft
defLore({
  id: 'zw_under_scratch', title: 'Scratched into a pillar',
  text: `D-3907 WAS HERE
OWED 6,000
PAID 5,990
THE LAST TEN IS DOWN THE LADDER
I'M GOING DOWN THE LADDER

(Underneath, much later, in the same hand:)
THE LADDER DOESN'T END. IT JUST GETS DARKER.`,
});

defLore({
  id: 'zw_under_ledger', title: "A debtor's tally",
  text: `A page of strokes in fives, hundreds of them, each group with a note.

"chair 12" "chair 12" "lamp 20" "the coat with the ring in the lining 340" "sofa 60" "sofa 60" "the sofa again 60" "a whole bedroom 410"

At the bottom, circled: "VOSS SAYS ANOTHER INSTALMENT BY TOMORROW. THERE IS NO TOMORROW HERE. HOW DOES THE BAND KNOW."`,
});

// ---------------------------------------------------------------- wrong rooms
defLore({
  id: 'zw_wrong_same', title: 'Note on the floor',
  text: `This is the third time I've found this note.

I wrote it the first time.

I didn't write it the second time.

If you are reading this in a room with a green chair and a clock that says ten past, go back the way you came and DON'T count the doors.`,
});

defLore({
  id: 'zw_wrong_phones', title: 'Note taped to a phone',
  text: `DON'T ANSWER THEM.
It's you. It's always you, a few minutes from now, asking you not to go where you're about to go.
I answered one. I listened. I went anyway.
I'm calling from there.`,
});

defLore({
  id: 'zw_wrong_poster', title: 'Small print on the poster',
  text: `HAVE YOU SEEN THIS HALLWAY?
If you have seen this hallway, please stay where you are. Somebody will come and find you.

Somebody is coming to find you.`,
});

defLore({
  id: 'zw_wrong_tvs', title: 'Sticker on a television',
  text: `PROPERTY OF MERIDIAN INSTITUTE — OBSERVATION
CHANNEL: SUBJECT (REAR)
DO NOT TURN AROUND TO CHECK. THE FEED IS LIVE. IT IS ALWAYS LIVE.`,
});
