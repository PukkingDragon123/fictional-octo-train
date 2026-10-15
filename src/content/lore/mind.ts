// Lore — MIND: Meridian's wellness pamphlet, a breathing card and the wrist
// monitor's manual. In-world, practical and kind; they double as the tutorial
// for the coping mechanics.
import { defLore } from '../loreRegistry';

defLore({
  id: 'pamphlet_wellness', title: 'Meridian Employee Wellness: Long Shifts',
  text: `MERIDIAN EMPLOYEE WELLNESS
"LONG SHIFTS, STEADY MINDS"

Extended assignments are hard on everyone. Feeling anxious, low, lonely or unreal after many days on site is a normal response to an abnormal situation. It is not a failure.

WHAT HELPS
- SLEEP somewhere you feel safe. A little light is fine. Skip caffeine late in the shift.
- EAT a proper hot meal when you can. Daylight (or the brightest room you have) lifts mood.
- TALK to colleagues. Even a few words on the radio count.
- WRITE IT DOWN. A notebook and a pen, ten minutes, once or twice a day.
- BREATHE: in for four, hold for four, out for four. Repeat until your shoulders drop.
- KEEP SOMETHING FAMILIAR: a photo, a charm, a soft toy. Nobody here will laugh.

PANIC ATTACKS
Racing heart, tight chest, tunnel vision, shaking hands, the certainty that something is very wrong. They peak and pass, usually within a minute. You are not dying. Breathe slowly, name five things you can see, stay where you are if it is safe.

MEDICATION
Prescribed antidepressants take several days to work and should not be stopped suddenly. Anxiolytics act fast but cause drowsiness and lose effect with frequent use. Alcohol and cigarettes help for an hour and cost you the next day.

If what you see or hear stops making sense (footsteps with no one there, shapes at the edge of your vision) tell a colleague and rest. The building is strange enough without help.`,
});

defLore({
  id: 'card_breathing', title: 'Laminated card (clipped to a lanyard)',
  text: `BOX BREATHING

  IN ......... 4
  HOLD ....... 4
  OUT ........ 4
  (again)

You are here.
You are okay.
This will pass.

[Press H, or BREATHE on your wrist monitor]`,
});

defLore({
  id: 'manual_kestrel', title: 'KESTREL WM-7 Wrist Monitor — Quick Guide',
  text: `KESTREL WM-7 WRIST MONITOR
Meridian field issue. Read before use.

MODES (tap the display or MODE to cycle)
  TIME   clock, day, zone and heading
  VITAL  heart rate, body temperature, breathing
  MIND   mood read-out and stress; offers BREATHE
  ALARM  set with SET (hour, then minutes), toggle with LIGHT

LIGHT  backlight for a few seconds
ALERTS flash for bleeding, hunger, thirst, cold, heat, infection and low lucidity

CARE
Splash-proof, NOT submersible. A soaked unit fogs and may short out; let it dry. Impacts to the left forearm can crack the display. To service: remove the unit, open the case with a screwdriver and replace damaged parts with salvaged electronics.

NOTE: the WM-7 reports what your body does. It cannot tell you what is real.`,
});
