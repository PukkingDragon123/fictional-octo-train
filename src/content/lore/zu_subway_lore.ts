// Lore: Westgate Station on the Inner Loop (src/world/gen/z_subway.ts).
import { defLore } from '../loreRegistry';

defLore({
  id: 'su_map', title: 'The Inner Loop (line map)',
  text: `THE INNER LOOP
Trains every few minutes.

WESTGATE (you are here)
ALDER LANE
ELM STREET
ST. ALDRIC'S
INTERCHANGE 0 (change for buses)
FACILITY 4 (staff only)

The loop is one line with no ends. Every station on it is Westgate.`,
});

defLore({
  id: 'su_last_train', title: 'A commuter\'s note (folded into a token envelope)',
  text: `Waited forty minutes. The board kept saying 2 MIN. Then the rails started to sing, the way they do, and the lights at the tunnel mouth went white.

It was not the 11:52.

It came in slow, with its headlight on, and the cars were the right colour and there were windows all down the side and every window was looking at us. Then the legs came out. All of them at once, like somebody opening a lot of umbrellas.

Everybody on the platform got back against the wall without anybody saying to. It went past. It took the man who was standing on the yellow line.

Do not stand on the yellow line.`,
  codex: ['worm_train'],
});

defLore({
  id: 'su_driver', title: 'Motorman\'s log, last page',
  text: `23:40 Westgate. Signal red at the mouth again. Red for an hour.
23:58 Something on the line ahead. Headlamp on it. It is a train. It is on my line, facing me, with its lamp on.
00:03 It is not a train.
00:04 It has been laying something in the pits under the third rail. Sacs. Big as a man, lit up inside like a carriage at night. There is a little one curled up in each.
00:05 Leaving the cab. Taking the brass. Do not touch the sacs. Do not touch the sacs.`,
  codex: ['worm_train', 'worm_egg'],
});

defLore({
  id: 'su_booth_log', title: 'Token booth daybook',
  text: `MON  Tokens sold 0. Tokens taken from the trough overnight 31. Coins left in exchange: 31.
TUE  The clerk did not come in. The booth is occupied anyway. It is very polite.
WED  It slides the tokens through with something soft. If you give it a coin, it gives you a token. If you put your hand in the trough, it gives you nothing back, and you do not get the hand back either.
THU  Pay the fare. The thing in the turnstile line knows who has paid.
FRI  The phones ring all night. Don't answer them in front of the tunnel.`,
  codex: ['token_whelk', 'stile_mantis'],
});

defLore({
  id: 'su_car_notice', title: 'Notice in Car 2',
  text: `THIS CAR IS OUT OF SERVICE
Passengers must not remain on the train.

(In pen, underneath:) We are staying in the train. It does not come onto Track 1. It never comes onto Track 1. Sixty-one days. It goes past every few minutes on the other side and the whole platform shakes and we count the cars. It is always six. One night it was seven.`,
});

defLore({
  id: 'su_signal_log', title: 'Signal room terminal',
  text: `INNER LOOP SIGNALLING :: WESTGATE CABIN
TRACK 1 ........ OUT OF USE (STOCK STABLED)
TRACK 2 ........ OCCUPIED
TRACK 2 ........ OCCUPIED
TRACK 2 ........ OCCUPIED
RETURN TUNNEL .. OCCUPIED

ALL SIGNALS HELD AT DANGER
OPERATOR NOTE: The occupancy moves round the ring at about twenty miles an hour and stops when somebody is on the platform. The track circuits say it is six cars long. The track circuits also say it is breathing.`,
  codex: ['worm_train'],
});

defLore({
  id: 'su_rules', title: 'Staff notices (signal room)',
  text: `STAFF ONLY BEYOND THIS POINT

1. Do not cross the tracks.
2. If the rails sing, stand against the wall with your back to the tile. It hunts what moves at the edge.
3. The phones on the concourse are not connected. If one rings, let it. If something walks up to you and rings, let it ring. It will bring the train.
4. Fares are paid in tokens. The booth gives a token for a coin. Pay at the turnstile; the one at the end of the row is not a turnstile.
5. Egg sacs in the pits are to be reported, not touched. They hatch when they are touched.`,
  codex: ['worm_train', 'ringer', 'stile_mantis', 'worm_egg'],
});
