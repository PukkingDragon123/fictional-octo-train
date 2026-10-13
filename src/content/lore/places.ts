// Lore: Poolrooms, mall, hospital, tunnels, stairwell and parking.
import { defLore } from '../loreRegistry';

defLore({
  id: 'sign_pool_rules', title: 'Pool rules (tiled sign)',
  text: `POOL RULES
1. NO RUNNING
2. NO DIVING
3. NO GLASS IN THE POOL AREA
4. IF YOU HEAR A WHISTLE, LEAVE THE WATER
5. THERE IS NO LIFEGUARD ON DUTY
6. THERE IS NO LIFEGUARD`,
  codex: ['lifeguard'],
});

defLore({
  id: 'journal_survey_2', title: 'Field journal — H. Brandt',
  text: `The water is warm and very clean and I don't trust it. Every room is white tile and skylight and the skylights show a sky that is too blue, like a swimming pool's idea of a sky.

There's a pump hall. Three valves and a START button. If the pumps ran, the taps in every level would run clean. I couldn't get to it — something moves under the deep end. It surfaces when you splash.

Okafor, if you read this: I'm going down the drain grate. The tunnels have to connect.`,
});

defLore({
  id: 'pump_manual', title: 'Pump hall — operating instructions',
  text: `PUMP PLANT P-2

1. OPEN VALVE A (left manifold)
2. OPEN VALVE B (centre)
3. OPEN VALVE C (right manifold)
4. PRESS START. PRESSURE SHOULD RISE TO 3.2 BAR.

IF PRESSURE DOES NOT RISE, CHECK VALVES.
IF PRESSURE RISES ABOVE 3.2 BAR, LEAVE.`,
});

defLore({
  id: 'mall_directory', title: 'Mall directory',
  text: `LEVEL 1
  Food Court ............ A
  Pretzel Hut ........... A3
  Dawn's Shoes .......... B1
  Hallmark of the Heart . B4
  [store name worn off] . B9
  Cinema 6 .............. C (CLOSED FOR RENOVATION SINCE 1987)
  YOU ARE HERE .......... YOU ARE HERE

LEVEL 2
  Level 2 is not open to the public.`,
});

defLore({
  id: 'lost_child_notice', title: 'Information desk notice',
  text: `PAGE (READ EVERY 15 MINUTES):

"Would the parents of Mia please come to the information desk. Mia is waiting for you at the information desk. She says her daddy is at work. Thank you."

Handwritten below: "she's been waiting since we opened"`,
});

defLore({
  id: 'muzak_memo', title: 'Memo — background music',
  text: `To all tenants: the background music system cannot be turned off. It has no off switch. It has no speakers we can find. Please stop asking.`,
});

defLore({
  id: 'memo_lab_access', title: 'Memo, folded into a patient file',
  text: `Facility 4 main door keypad: 061480

Shred after reading.
— D.H.

(It was not shredded. Underneath, in pencil: "her birthday. of course it's her birthday.")`,
  sets: ['lab_code'],
});

defLore({
  id: 'patient_file_hale', title: 'Patient file — HALE, Mia',
  text: `ST. ALDRIC — PAEDIATRIC
NAME: Hale, Mia    DOB: 14 JUN 1980
ADMITTED: 02 JUN 1987. Vehicle collision (passenger).
STATUS: Persistent unresponsive state.

08 AUG 1987: Transferred to Facility 4, CONTINUITY pilot, at the request of her father.

Nursing note: "Dad reads to her every night through the headset. Says she can hear him in there. Says she's in the fields."`,
});

defLore({
  id: 'patient_file_0411', title: 'Patient file — SUBJECT 0411',
  text: `ST. ALDRIC — NOCLIP INCIDENT LOG
SUBJECT: 0411     NAME: [REDACTED]
FOUND: unresponsive, Facility 4 sub-level, beside node SRV-1.
EEG: active. Dreaming.

Observation: the subject's hands move as if writing.
Observation: we gave the subject a pen. The subject writes notes addressed to itself.
Observation: this is the subject's fourth admission.`,
});

defLore({
  id: 'pharmacy_note', title: 'Pharmacy counter note',
  text: `Out of: morphine, amoxicillin, good news.
In stock: bandages, iodine, sedatives (CONTROLLED — don't let them sleep near the nodes).`,
});

defLore({
  id: 'journal_survey_4', title: 'Field journal — K. Sato (last entry)',
  text: `Found the beacon. 121.5 MHz, from a blast door under junction 4. FACILITY 4 stencilled on it. Keypad. Six digits.

Hale's files say the code is "the date of origin". I tried the program start date. I tried his birthday. Something heard the keypad beeping.

I'm hurt. I'm leaving my kit at junction 9, behind the boiler, for whoever comes next. Food, batteries, a revolver with four rounds.

If you're Okafor: the date of origin isn't the program. It's her.`,
});

defLore({
  id: 'stair_graffiti', title: 'Graffiti in the stairwell',
  text: `FLOOR 13 IS NOT ON THE PLANS
(underneath:) THEN WHY DO I KEEP ARRIVING AT IT
(underneath:) count the landings. it skips one going down and adds one going up
(underneath:) stop counting`,
});

defLore({
  id: 'parking_ticket', title: 'Parking ticket',
  text: `MERIDIAN PARKING — LEVEL P∞
ROW 9,999 BAY 4

ENTRY: 06:12 (02 JUN 1987)
EXIT: —
FEE DUE: ∞

PLEASE REMEMBER WHERE YOU PARKED.`,
});
