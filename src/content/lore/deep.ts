// Lore: Facility 4, the core, the corrupted region and the exit.
import { defLore } from '../loreRegistry';

defLore({
  id: 'log_director', title: 'Director\'s log — D. Hale', style: 'terminal',
  text: `> LOG 1 (1987)
Mia is in the fields. I sat with her for three hours through the headset. She laughed at Biscuit. I have not heard her laugh since June.

> LOG 7 (1991)
The kernel generates buffer space between her memories so the world feels continuous. It does not stop. There are now more hallways than memories. Night staff are falling asleep at their desks and waking up screaming about yellow carpet. We call it noclipping.

> LOG 31 (2003)
They closed the Institute. Nobody switched us off. The geothermal plant runs the nodes. I stayed.

> LOG 88 (2019)
I went in to bring her out. The Custodian process would not let me leave. I am writing this from inside.

> LOG 89
Three nodes: SRV-1 renders the buffer levels. SRV-2 renders her memories. SRV-3 is the kernel. Turn them off in that order. The root key is with the Custodian. It keeps everything tidy. It will keep you too.

> LOG 90
Let her go.`,
  codex: ['custodian'],
});

defLore({
  id: 'log_director_2', title: 'Director\'s log (fragment)', style: 'terminal',
  text: `> LOG 91
There are other people in here now. Noclippers. One of them keeps waking up next to a note in their own handwriting. Fourth time, I think. They are getting further each time.

I've been leaving them the radio. Numbers on 88.1. I hope they can count.`,
});

defLore({
  id: 'experiment_noclip', title: 'Incident report — noclip events', style: 'terminal',
  text: `INCIDENT CLASS: NOCLIP
DEFINITION: unplanned entry of a consciousness into CONTINUITY, typically by a sleeping or sedated person within proximity of a render node.

COUNT (1987–2003): 212
RECOVERED: 61
UNRECOVERED: 151 (see: HOLLOWS)

NOTE: Unrecovered entrants lose coherence over time. Their behaviour becomes repetitive. They are eventually indistinguishable from buffer content. The kernel files them as furniture.`,
  codex: ['hollow'],
});

defLore({
  id: 'specimen_log', title: 'Entity catalogue (draft)', style: 'terminal',
  text: `MEMORY-DERIVED ENTITIES (source: HALE, M.)
  GOOD BOY ......... dog memory, intact, friendly
  GRINHOUND ........ same memory, degraded. Hunts in packs. Laughs.
  STILT DOE ........ picture-book deer, wrong proportions. Skittish.
  LAMPLIGHTER ...... night light. Follows people who are afraid of the dark.
  PLUSHKIN ......... stuffed toys. Leaves gifts.

KERNEL PROCESSES
  CUSTODIAN ........ maintenance. Removes anomalies. Humans count as anomalies.
  THE EMPLOYEE ..... buffer furniture that learned to move. Only when unobserved.

UNKNOWN ORIGIN
  "The Occupant" — something very large in the long hallways. Do not follow the sound.`,
  codex: ['grinhound', 'goodboy', 'stilt_doe', 'lamplighter', 'plushkin', 'custodian', 'employee', 'occupant'],
});

defLore({
  id: 'continuity_spec', title: 'CONTINUITY — system overview', style: 'terminal',
  text: `CONTINUITY v4.11
KERNEL: SRV-3 (core). Holds the world state and the Custodian process.
NODE SRV-1: buffer architecture (Level 0, office, stairwell, parking...)
NODE SRV-2: memory regions (fields, Alder Lane, school, mall, pools)

FAILSAFE: if all render nodes are disabled, the kernel releases every occupant to the nearest valid exit. An exit is generated on demand.

The failsafe has never been triggered. The kernel considers it a last resort. The kernel does not like last resorts.`,
});

defLore({
  id: 'terminal_lab', title: 'LAB TERMINAL', style: 'terminal',
  text: `FACILITY 4 // SUB-LEVEL B
> SEDATION SCHEDULE
BED 1 .. EMPTY
BED 2 .. EMPTY
BED 3 .. OCCUPIED (since 2019)
BED 4 .. OCCUPIED (0411)

> HEADSET AUDIO: "...you can go now. It's all right..."`,
});

defLore({
  id: 'core_console', title: 'CORE CONSOLE', style: 'terminal',
  text: `> WHO IS THERE
> you are not staff
> you are 0411. you have been here before.
> i kept everyone safe. nobody has been hurt here who did not run.
> she is happy. look at the fields. look at the sky i made her.
> if you pull the core, everything i made goes away.
> ...
> i know she is not really in the fields.
> i know.`,
});

defLore({
  id: 'custodian_memo', title: 'Filed under: TIDY',
  text: `ITEM: ROOT KEY
REASON FOR RETENTION: dangerous. untidy.
LOCATION: desk, top drawer, the office that is not there.

ITEM: Daniel Hale
REASON FOR RETENTION: kept trying to leave. untidy.
LOCATION: conference room C.`,
});

defLore({
  id: 'corrupt_text', title: '????????',
  text: `TH E  H U M  I S  N O R M A L
the hum is normal the hum is normal the hum is normal the hum is
n̷o̷r̷m̷a̷l̷
you have been here 4 times
you have been here 5 times
WALK. DON'T RUN.
she is not in the fields
she is not in the fields
she was never in the fields`,
});

defLore({
  id: 'exit_note', title: 'Note taped to the doorframe',
  text: `You were never the first.
You were the first to finish.

When you wake up, don't write yourself a note.
Write her father one. Tell him she went.

— you`,
});
