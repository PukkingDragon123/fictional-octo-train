// Readable lore of the Ball House (src/world/gen/z_ballhouse.ts): the staff's
// closing procedure, the PA script, a party invitation, the wristband log and
// Dr. Calder's field note on the kids (src/creatures/species/timmy.ts).
import { defLore } from '../loreRegistry';

defLore({
  id: 'bx_closing', title: 'Closing Procedure', style: 'paper', codex: ['timmy'],
  text: 'STAFF: CLOSING PROCEDURE\n\n1. 7:45 make the PA announcement (script is by the mic).\n2. Check the pits. ALL the pits. Use the rake, not your arms.\n3. Check the tubes. Crawl them if you have to. Knock first.\n4. Count the shoes in the cubbies against the wristband log. If there are more pairs than wristbands, DO NOT count again. Ring Darren.\n5. Lights off from the back to the front. Do not turn round at the giraffe.\n\nNobody stays after 8. Nobody.\n- Management',
});
defLore({
  id: 'bx_pa_script', title: 'PA Script', style: 'paper',
  text: 'PA SCRIPT (read it slowly and SMILE while you say it, they can hear a smile)\n\n"Hi everybody! The Ball House is closing in fifteen minutes! Mums and dads, please collect your little ones from the play area. Kids, it\'s time to say bye-bye to the balls!"\n\nRepeat at 7:55.\nDo NOT read it a third time.\nIf something answers from the tubes, do not answer it back.',
});
defLore({
  id: 'bx_invite', title: 'Party Invitation', style: 'paper', codex: ['timmy'],
  text: 'YOU\'RE INVITED!\n\nTIMMY is turning 6!\nCome to TIMMY\'S PARTY at the BALL HOUSE!\nSaturday, 2:00 until home time.\nBALLOONS * CAKE * PRIZES * BALL PIT!!\n\nRSVP to Timmy\'s mum.\nPlease collect your child by 8pm.\n\n(on the back, in crayon:) everyone is invited. everyone is staying. mum is coming soon.',
});
defLore({
  id: 'bx_wristbands', title: 'Wristband Log', style: 'paper',
  text: 'WRISTBAND LOG: SATURDAY\n\n001 TIMMY (6)\n002 TIMMY (5)\n003 TIMMY (6)\n004 TIMMY (6)\n...\n211 TIMMY (5)\n212 TIMMY (6)\n\nCOLLECTED BY: (blank)\n\nIn a different pen: They all said their name was Timmy. They all said their mum was coming. I gave them each a lollipop because they would not stop giggling and it was the only thing that worked.',
});
defLore({
  id: 'bx_calder', title: 'Field Note: The Ball House', style: 'terminal', codex: ['timmy'],
  text: 'FIELD NOTE, Dr. I. Calder: THE BALL HOUSE\n\nThere is a party here every Saturday, and every day here is a Saturday. The children are not children. They are what the place made of the idea of a child left at a party after everyone else has gone home: excited, sticky, sugared, waiting to be collected. Their heads are full of the air they gulp when they laugh.\n\nThey will want to play with your unit. Do not let it play for long. Keep sweets on you, and throw them, do not hand them over. If one starts to squeak, put distance between you and it. If you cannot, put a sweet between you and it.\n\nRecovery note: units coming back from the Ball House have confetti in their wounds. The lab has asked us to stop bringing it back. I have asked the lab where they think we get it.',
});
