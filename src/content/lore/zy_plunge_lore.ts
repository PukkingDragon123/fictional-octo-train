// Lore: the Plunge (src/world/gen/z_plunge.ts).
import { defLore } from '../loreRegistry';

defLore({
  id: 'pl_notice', title: 'Foyer noticeboard',
  text: `THE PLUNGE: LEISURE POOL
Open every day. Waves every hour, on the hour.

TODAY: Deep End CLOSED. Diving Pit CLOSED. Flume CLOSED.
Toddler Pool OPEN (supervised). Cafe OPEN.

Lost property: goggles (x41), one flipper, a wristwatch still ticking, a set of keys, a child's armband with a name on it that has been scratched off.

Please do not run. Please do not shout. Please do not make loud noises near the balloons.`,
  codex: ['balloon_puffer'],
});

defLore({
  id: 'pl_lifeguard', title: 'Lifeguard\'s log',
  text: `07:00 Opened up. Water 29 degrees. Clarity good. Two little bumps at the deep end again, perfectly still. Not a float. Not a drain cover.
07:40 Tadpoles in the beach shallows again, hundreds. Big heads. They nibble. Kids think it is funny.
09:15 Something came out of the pool at the edge like a door opening and the man on the edge was not on the edge any more. I could SEE him in it. It went back down. It came up four minutes later and spat him out on the beach. He is all right. He is not all right.
DEEP END CLOSED.
11:30 The fish with legs went down the flume. Hopping all the way down.`,
  codex: ['gulper', 'gulper_tadpole', 'frog_piranha'],
});

defLore({
  id: 'pl_waves', title: 'Wave machine log (taped to the grille housing)',
  text: `WAVE MACHINE 2
Cycle: 5 min on, 55 min off. Klaxon 30 s before.
Intake grille fouled: removed (1) child's armband (2) seventeen pool noodles (3) a white tooth row, forty teeth, curved backwards, like a comb.
Engineer's note: whatever lives in the deep end likes the waves. It comes up into them. Running the machine is now NOT recommended.`,
  codex: ['gulper'],
});

defLore({
  id: 'pl_cafe', title: 'Cafe order pad',
  text: `2 x hot choc
1 x chips
1 x frog legs (NOT ON MENU, kitchen says can do)
3 x balloons for the party table (the eyes ones)

Party in the birthday room CANCELLED.`,
  codex: ['balloon_puffer', 'frog_piranha'],
});

defLore({
  id: 'pl_plant', title: 'Plant room clipboard',
  text: `BALANCE TANK: level dropping 3 cm a day. Pump 2 cavitating. Something in the tank keeps blocking the outlet. Something big and soft and white.
Do not go down the ladder into the balance tank.
Chlorine: 4 drums. It does not mind the chlorine.`,
  codex: ['gulper'],
});
