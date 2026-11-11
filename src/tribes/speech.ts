// What people say when they are not reading from their tribe's book (defs.ts holds
// each tribe's own greetings, barks and trade talk). Shared banks for the brain
// (warnings, help, theft, alarms, the routine) and the talk (memory-aware
// greetings, answers, refusals). Placeholders: {n} their name, {c} an inhabitant,
// {i} an item, {t} their tribe, {r} the rival tribe, {d} a direction.
export type Bank = string[];

export const SAY = {
  // ---- the brain
  warn: ['Behind you! {c}!', 'Move! {c}, on your left!', "Don't turn round slow. {c}. Go!", '{c}! Get away from it!', 'Debtor! {c}, right there!'],
  call: ['Here! Over here!', 'To me! Now!', 'Wake up, all of you! Trouble!', 'Hands! I need hands here!'],
  callThief: ['Thief! Stop that one!', 'Quick hands! In the camp!', 'Grab them! They were in my pockets!'],
  callHurt: ['They cut me! Get them!', "I'm bleeding! Here!", 'Help! Help, they went for me!'],
  flee: ['No, no, no-', "I'm not dying for this!", 'Run! Just run!', 'Not today. Not like this.'],
  helpBleed: ["You're leaking all over the carpet. Hold still.", 'Stop. Arm out. This will sting.', "That's deep. Let me wrap it before you fall over.", 'Sit. Sit! You are no good to anyone bled out.'],
  helpDone: ['There. Keep it dry. Keep it shut.', "Don't thank me. Remember me.", 'That holds for now. Come back if it opens.'],
  thiefLeave: ['Excuse me.', 'Just passing, friend.', 'Pardon.', 'Mind your step.'],
  thiefGot: ['Lighter pack, lighter step.', 'Finders.', 'Thanks ever so.'],
  thiefNoticed: ['Hey! My {i}!', 'Did they just- my {i}!', 'That was mine! Get back here!'],
  thiefLater: ["My {i}'s gone. {n} was right behind me.", "Where's my {i}? ...{n}. It was {n}."],
  pocketNotice: ["Someone's been in my pockets.", 'My {i}... where did that go?', 'Lighter. Why am I lighter?'],
  caught: ['Hand out of my coat. Now.', 'Feel something you like?', 'Thief! I feel you, thief!', 'Wrong pocket, debtor.'],
  mug: ['Stop there. Pack on the floor, slowly.', "Easy. Nobody bleeds. Just the pack.", "Toll road. You're paying it.", "That's a heavy bag. Let me carry some."],
  ambush: ['Now!', 'Take them!', 'Out! Out!', "That's the one!"],
  sleep: ['Mm. Five more... five more.', 'Not now. Night shift.', '...lights are off. Let me be.'],
  eat: ['Pass the pot.', 'Same beans, same day.', "Hot, at least. It's hot."],
  scavGo: ['Going out. Back before the lights change.', 'Need more tins. Back soon.', 'Going looking.'],
  scavBack: ['Back. Half a bag. Better than none.', 'Found tins. Found nothing else.', 'The east rooms moved again.'],
  guardWatch: ['Quiet. Too quiet.', 'Something in the hum tonight.', 'I count the doors. Still four.'],
  // ---- followers
  followYes: ['Lead on.', 'Behind you.', 'Right with you.'],
  followWait: ["I'll be here.", 'Waiting. Not forever.', 'Holding this spot.'],
  followHungry: ["I haven't eaten since the last lights.", 'Food. Soon. Or I start walking.', "My stomach's eating itself, boss."],
  followHurt: ['Watch where you swing!', 'Hit me again and see what happens.', "I'm on your side, idiot!"],
  followWarn: ["Keep this up and I'm gone.", "I didn't sign up to be your punching bag.", "I'm close to walking. Hear me?"],
  followLeave: ["I'm done. Find someone else to bleed for you.", "That's it. I'm going home.", "We're finished. Don't follow me."],
  followFed: ['Bless you.', 'Now that is loyalty bought cheap.', 'I owe you.'],
  // ---- the talk: greetings by what they remember
  greetNew: ['Never seen you before. Keep your hands where I can see them.', "New face. Don't make it a problem.", "You're one of the debtors. Fresh, too."],
  greetFriend: ['There they are. Sit, you look terrible.', 'Good to see you breathing.', 'My favourite debtor.'],
  greetOwed: ['Still wearing my bandage, I see.', 'You owe me one. I have not forgotten.'],
  greetThief: ['Hands out of my coat this time.', 'Oh. The one with quick hands.', 'I check my pockets when you are near.'],
  greetLiar: ['You lied to me. Last time. Remember?', "Everything you say I'll be weighing twice.", 'Liar. Speak, then.'],
  greetHit: ['You have a nerve, walking up to me.', "Last time you swung at me. Don't.", 'Bruise still hasn\'t gone.'],
  greetScared: ['What do you want? Just say it.', "I don't want trouble. Not again.", 'Please. Not again.'],
  greetCold: ['What.', 'Make it quick.', 'You again.'],
  // ---- answers
  refuse: ['No.', "Don't think so.", 'Not for you.', 'Ask someone softer.'],
  believe: ['...Fine. I believe you. This once.', 'Huh. Alright then.', "That'd explain things. Fine."],
  disbelieve: ['Do I look stupid?', 'You lie like you walk. Badly.', 'No you are not. Try again and I cut you.'],
  foundOut: ['You lied to me. I asked around.', 'There was no crew. There was never a crew.', 'They never sent you. I checked.'],
  threatYield: ['Alright! Alright. Take it and go.', "Fine. Fine! It's not worth my neck.", 'Take it. Just- take it.'],
  threatRefuse: ['You and what army?', 'Try it.', 'Wrong camp to scare, debtor.'],
  sorryYes: ['...Fine. Clean slate. Mostly.', 'Words are cheap. But fine.', "Alright. Don't make me regret it."],
  sorryNo: ["Sorry doesn't fill a pocket.", "Sorry. Sure. And I'm the Institute.", 'Keep your sorry.'],
  amendsYes: ['That will do. We are square.', 'Paid in full. We start over.', 'Good. That buys you back in.'],
  returnYes: ['Here. Take it. Not worth the grief.', 'It was just lying there. Mostly.'],
  returnNo: ['Finders keepers.', "I don't know what you mean.", 'Prove it.'],
  giftThanks: ['For me? ...Huh. Thank you.', 'I will remember this.', 'You did not have to.'],
  foodYes: ['Here. Eat it slow.', "Take it. Don't tell the others.", "It's not much. It's yours."],
  foodNo: ["We're short ourselves.", "Can't. We're counting every tin.", 'Find your own.'],
  healNo: ["I'm not a nurse.", 'Bleed somewhere else.', 'Not my blood, not my problem.'],
  recruitYes: ['Alright. I walk with you. For now.', "Fine. Somebody has to keep you alive.", "Let's go, then."],
  recruitNo: ['Not with you.', "I don't trust you that far.", 'Come back when my people trust you.'],
  dismiss: ["I'll go home, then.", 'Take care of yourself. Somebody has to.', 'Good luck out there.'],
};

export function line(bank: Bank, vars: Record<string, string> = {}): string {
  const s = bank[Math.floor(Math.random() * bank.length)] ?? '';
  return s.replace(/\{(\w)\}/g, (_, k) => vars[k] ?? '');
}

/** a compass word for a direction from (x, z) to (tx, tz) in the rooms (north is -z) */
export function dirWord(x: number, z: number, tx: number, tz: number): string {
  const a = Math.atan2(tz - z, tx - x);
  const W = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  return W[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
}
