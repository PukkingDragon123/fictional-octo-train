// Readables for the round-14 predators: the Whip Rat (src/creatures/species/whip_rat.ts)
// and the Strider (strider.ts). Each adds its species to the scanner codex when read.
// They are left in the levels where those things live when the zone is generated
// (deterministically from the zone seed, so every co-op peer gets the same notes),
// with what the note-writers left behind: a drag trail of blood into the dark.
import { defLore } from '../loreRegistry';
import { bus } from '../../core/events';
import { Rng } from '../../core/rng';
import { createItem } from '../../items/factory';
import { dropItem } from '../../items/worldItems';
import { hasItemDef } from '../../items/item';
import type { Zone } from '../../world/zone';

// ---------------------------------------------------------------- the Whip Rat
defLore({
  id: 'wr_pipe_note', title: 'Note, wedged behind a pipe', style: 'paper', codex: ['whip_rat'],
  text: `if you are reading this you are in the dark
which is where they are. so listen.

they are rats. big ones. a dog, a big dog.
their eyes are not in their heads. they are on
the ends of two long red things like bootlaces
and they come round the corner FIRST. before
the rat. if you see two eyes at ankle height
coming round a corner, that is the rat telling
you where it is. go the other way.

the tail has a hand on it. a person's hand.
it grabbed Tomas by the ankle and pulled him
into the dark under the stairs and I heard the
hand drumming its fingers on the floor while
the rest of it ate.

TORCH IN ITS EYES. it hates it. it backs off.
keep the beam on it and walk backwards.
                                   — D-4410`,
});
defLore({
  id: 'wr_calder_memo', title: 'Memo: re: "whip rats"', style: 'terminal', codex: ['whip_rat'],
  text: `MERIDIAN INSTITUTE // FAUNA DESK
FROM: Dr. I. Calder
RE: WR-04 ("whip rat"), interim guidance

1. Treat every dark doorway on a dark level as
   occupied. They lie flat beside the frame.
2. The eye stalk strike is fast (the tip goes
   supersonic: that crack is the sound barrier).
   It stuns. Units hit across the face lose
   one to two seconds. The hand follows.
3. The hand will take a unit by the ankle and
   back away with it. It does not need to win.
   It only needs to get you into the dark.
4. LIGHT. A held beam reliably drives it off.
   It will not cross a lit floor unless hurt.
5. Crouched and still, units are not found.

Retrieval teams: bring back a hand. Intact.
We still do not know whose they are.`,
});
// ---------------------------------------------------------------- the Strider
defLore({
  id: 'st_survey_tape', title: 'Survey tape 0-77, transcript', style: 'tape', codex: ['strider'],
  text: `[TAPE 0-77. UNIT D-5530, LONG SURVEY, LEVEL 0]

D-5530: Day ... nine? Ten. Still yellow. Still
humming. I have been walking in a straight
line for two days. There is no edge. Calder
said there was no edge. I want to see it.

[footsteps. a long time]

D-5530: My legs hurt. Not tired. Long. They
feel long. That is not a thing.

[footsteps. slower. further apart]

D-5530: The ceiling is lower today. I keep
ducking under the tiles. No. I am taller.

[a sound like knuckles cracking, many]

D-5530: I can see over the walls now.

[footsteps. three seconds apart. then four]

[END OF TAPE]`,
});
defLore({
  id: 'st_door_note', title: 'Writing on the back of a door', style: 'paper', codex: ['strider'],
  text: `THE TALL ONE CANT COME IN HERE
IT DOESNT COME INTO ROOMS
SHUT THE DOOR
SHUT THE DOOR

it walks over the walls. it listens. dont run.
running is what it hears. walk. or dont move.

if it sees you in the hall get DOWN and dont
MOVE. dont breathe. it looks right at you. it
looked right at me for a whole minute with its
little face and it didnt see me. it sees moving.

its arms go to its knees. its knees go the
wrong way. it was a woman. it still has a
watch on. it still has a WATCH on`,
});

// ---------------------------------------------------------------- placing them
const PLACE: Record<string, { lore: string[]; trail: boolean; inRoom?: boolean }> = {
  tunnels: { lore: ['wr_pipe_note'], trail: true },
  undercroft: { lore: ['wr_pipe_note'], trail: true },
  stairwell: { lore: ['wr_pipe_note'], trail: true },
  server: { lore: ['wr_calder_memo'], trail: true },
  lobby: { lore: ['st_door_note', 'st_survey_tape'], trail: false, inRoom: true },
};
function hashKey(s: string) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h >>> 0; }
bus.on('zoneGenerated', (z: Zone) => {
  const P = PLACE[z.key];
  if (!P || z.meta.zpPredLore || !hasItemDef('note')) return;
  z.meta.zpPredLore = 1;
  const rng = new Rng((z.seed ?? 1) * 7919 + hashKey('predators'));
  for (const id of P.lore) {
    const spot = z.randomFloor(rng, (x, y) => !z.solid[z.idx(x, y)] && (P.inRoom ? z.room[z.idx(x, y)] !== 0 : true));
    if (!spot) continue;
    const it = createItem('note', rng);
    it.data = { ...(it.data || {}), lore: id };
    dropItem(z, it, spot[0] + 0.5, spot[1] + 0.5, undefined, 0.3);
    if (!P.trail) continue;
    // whoever wrote it: a smear of blood leading off from it, then drips, into the dark
    const a = rng.float(0, Math.PI * 2);
    z.decals.push({ x: spot[0] + 0.5, z: spot[1] + 0.5, w: 1.1, d: 0.9, rot: rng.float(0, 6.28), tex: 'decal_blood_pool' });
    for (let i = 1; i < 9; i++) {
      const x = spot[0] + 0.5 + Math.cos(a) * i * 0.7 + rng.float(-0.15, 0.15), zz = spot[1] + 0.5 + Math.sin(a) * i * 0.7 + rng.float(-0.15, 0.15);
      const tx = Math.floor(x), ty = Math.floor(zz);
      if (!z.inb(tx, ty) || !z.floor[z.idx(tx, ty)]) break;
      z.decals.push({ x, z: zz, w: 0.55 - i * 0.03, d: 0.4, rot: a + rng.float(-0.3, 0.3), tex: 'decal_blood_drip' });
    }
  }
});
