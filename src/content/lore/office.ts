// Lore: the office floor, Meridian internal documents.
import { defLore } from '../loreRegistry';

defLore({
  id: 'terminal_numbers', title: 'WORKSTATION 4-07 — PLAYBACK', style: 'terminal',
  text: `> PLAYING: hale_final_0411.wav  [LOOP]

"...this is Daniel Hale. If you can hear this, you've noclipped. You're inside CONTINUITY.

I'm sorry. It was never meant to hold anyone but her.

Listen. Four. One. One. Zero. Seven. Three. Three.
Room four-eleven. Closet zero-seven. Rack thirty-three.

There's a node there. It renders these floors. Turn it off. Then the next. Then the core.

It will try to keep you. It's good at keeping people. I taught it.

Four. One. One..."

> PLAYBACK LOOPS. THE TIMESTAMP SAYS IT WAS RECORDED TOMORROW.`,
});

defLore({
  id: 'memo_facilities', title: 'Sticky note on a monitor',
  text: `Rob —
Stop leaving the facilities card in your desk drawer. Top drawer. Unlocked. Office 4-12. EVERYONE KNOWS.
— Pat

(underneath, different pen:) it's safer there than on me`,
});

defLore({
  id: 'terminal_mail_1', title: 'WORKSTATION 4-22', style: 'terminal',
  text: `FROM: k.lindqvist@meridian.int
SUBJ: the floor plan is wrong again

The east wing has a corridor that was not there on Friday. It is very long. I walked to the end and it was still very long. I have attached a photo but the photo is just the corridor.

Can facilities please confirm whether we are allowed to use it.

FROM: facilities@meridian.int
SUBJ: RE: the floor plan is wrong again

Please don't.`,
});

defLore({
  id: 'terminal_mail_2', title: 'WORKSTATION 4-31', style: 'terminal',
  text: `FROM: reception@meridian.int
SUBJ: who is in conference room C

Conference room C has been booked every day for eleven years by "STAFF". The door is locked. The lights are on. Someone keeps ordering coffee for six.

FROM: d.hale@meridian.int
SUBJ: RE: who is in conference room C

Leave them be.`,
});

defLore({
  id: 'org_chart', title: 'Organisation chart (framed)',
  text: `MERIDIAN INSTITUTE — PROGRAM DIVISION

DIRECTOR ............ Dr. Daniel Hale
  CONTINUITY ........ Facility 4 (sub-level)
    Kernel & Nodes .. SRV-1 / SRV-2 / SRV-3
    Clinical ........ St. Aldric wing
    Field Teams ..... 1, 2, 3 (inactive)
  Facilities ........ R. Doyle

Someone has drawn a small dog next to the Director's name.`,
});

defLore({
  id: 'memo_continuity_1', title: 'Internal memo — CONTINUITY (1986)',
  text: `CONFIDENTIAL

CONTINUITY offers long-term coma patients a stable, calming environment while the body recovers. The patient's own memories seed the environment; the kernel generates "buffer" architecture to join memory regions together.

Patients experience continuity of self. Families are told their loved ones are "somewhere nice".

Known issue: buffer generation does not stop on its own. Known issue: staff sleeping within 30 m of the nodes report vivid dreams of yellow corridors. We are calling these events "noclips" in the incident log until someone thinks of something less silly.`,
});

defLore({
  id: 'poster_safety', title: 'Safety poster',
  text: `IF YOU SEE THE EMPLOYEE
DO NOT LOOK AWAY.

The Employee is part of the building. The Employee only moves when it is not being observed. Back away while facing it. Do not blink unnecessarily.

THINK SAFE. WORK SAFE. STAY SEEN.`,
  codex: ['employee'],
});
