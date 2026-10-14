// Lore: Level 0 (the Lobby) and generic readables.
import { defLore } from '../loreRegistry';

defLore({
  id: 'note_wake', title: 'A note, folded twice',
  text: `If you're reading this, you're me. Or you were.

Don't panic. Panic makes noise and noise brings the laughing ones.

1. The bottles with the blue caps are safe. Bluecap. Drink it.
2. Walk. Don't run unless something is already running at you.
3. The hum is normal. A hum that sounds DIFFERENT is not.
4. Doors that are alone in a room go somewhere else.
5. If a chair has moved, someone moved it.

There's a scanner in your hand. You won't remember how you got it either. Keep it close. It hears things you can't.

You've done this before. Do better this time.

— you`,
});

defLore({
  id: 'note_chairs', title: 'Note on a seminar chair',
  text: `THE CHAIRS MOVE WHEN NOBODY IS IN THE ROOM.

I counted 28 on Tuesday. I counted 29 this morning. They were facing the whiteboard. Now they face the door.

I'm not coming back in here.`,
});

defLore({
  id: 'journal_camp', title: 'Field journal — E. Okafor, Team 3 lead',
  text: `DAY 2. Insertion worked. All four of us woke in different places but the radios found each other. The hum is exactly as the briefing said. Nothing prepares you for the carpet.

DAY 4. Brandt went toward the water smell. Ruiz found a road and houses (HOUSES. Down here.). Sato wants the tunnels — says the lab beacon is under them. I'm staying with the camp.

DAY 6. Somebody pulled the fuses from the maintenance panel so the elevator can't run. Not us. The Custodians, maybe. Things here get "tidied".

DAY 9. A voice on 88.1 MHz reading numbers, very faint. Hale's voice. He's been dead for years. Or he hasn't.

DAY 11. Dogs. They laugh. Don't let them see you eat.

DAY 13. If anyone finds this: we came to switch it off. There are three nodes. Start with the one upstairs.`,
});

defLore({
  id: 'memo_maintenance', title: 'Work order (carbon copy)',
  text: `MERIDIAN FACILITIES — WORK ORDER 4471
PANEL: BRK-99 (SERVICE ELEVATOR)
ACTION: REMOVE ALL FUSES. PER DIRECTOR.
STORE: 1x break room, 1x supply shelf, 1x "wherever is safe"

NOTE FROM TECH: Director says nobody goes up until he says so. Director has not said anything in a very long time.`,
});

defLore({
  id: 'notice_lobby', title: 'Notice board',
  text: `REMINDER TO ALL STAFF

The hum is normal.
The carpet is damp because of a maintenance issue that is being looked into.
Please do not prop open doors that lead to rooms you do not recognise.
Please report rooms you do not recognise.

Thank you for your continuity.`,
});

defLore({
  id: 'note_generic', title: 'Scrap of paper',
  text: `WALK. DON'T RUN.
WALK. DON'T RUN.
WALK. DON'T RUN.
(the rest of the page is the same line, in handwriting that slowly stops being yours)`,
});

defLore({
  id: 'note', title: 'Note',
  text: `Someone wrote a list on the back of a receipt:
- bluecaps ×2
- batteries (D)
- bandages
- find Okafor
- DO NOT GO THROUGH THE RED DOOR AFTER DARK. It is always dark.`,
});

defLore({
  id: 'terminal_generic', title: 'WORKSTATION 0-118', style: 'terminal',
  text: `> MAIL (1 UNREAD)

FROM: facilities@meridian.int
SUBJ: the hum

Hi all. We have had several reports about "the hum". The hum is a normal property of the building's lighting and does not change pitch. If you hear the hum change pitch, please do not report it, as there is nothing to report.

Regards,
Facilities

> _`,
});

defLore({
  id: 'terminal', title: 'TERMINAL', style: 'terminal',
  text: `MERIDIAN INSTITUTE // BUFFER SPACE 0
LOGIN: ********
LAST LOGIN: 14,609 DAYS AGO

> STATUS
GENERATION: CONTINUOUS
OCCUPANCY: UNKNOWN
NOTE: BUFFER SPACE IS GENERATED TO FILL THE DISTANCE BETWEEN MEMORIES. IT IS NOT MEANT TO BE LIVED IN.

> _`,
});

defLore({
  id: 'laptop_meridian', title: 'Meridian laptop', style: 'terminal',
  text: `SPREADSHEET: buffer_gen_Q3.xls

ROOMS GENERATED THIS QUARTER   1,204,551
ROOMS VISITED                         19
ROOMS VISITED TWICE                    0
AVG. HALLWAY LENGTH (m)            61.2 → ∞

Comment (cell F12): "why is it still making them if nobody is looking"
Comment (cell F13): "someone is looking"`,
});

defLore({
  id: 'phone_dead', title: 'The phone',
  text: `A dial tone, then nothing. Then breathing, slow and patient.

Then your own voice, a second late, says: "hello?"`,
});
