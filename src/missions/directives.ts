// The directive chain.
//
// MAIN (the Remittance contract, voiced by Staff Sergeant Voss through the
// band): First Haul (smash furniture, find a valuable, put it on a hopper) →
// four installments, each due by a deadline → Discharge (clear the balance) →
// Passage (reach the depot, buy a ticket, board). See src/game/debt.
//
// SIDE (the way out they don't want you to find, on the radio, never from
// Voss): the old Continuity chain — a dead circuit's telemetry, the numbers
// station, the render nodes, the root key, the core — which ends with every
// band going dead ('band:removed') and a door that was always there.
//
// Free survival (directives off) runs none of it: no debt, no band.
import { G } from '../game/G';
import { zoneSpec } from '../world/worldGraph';
import { defDirective, has, count, MissionSystem } from './missions';

const lobbyPanelFuses = () => {
  const z = G.zones.get('lobby');
  if (!z) return 0;
  for (const o of z.objects.values()) if (o.state.mission === 'first_light') return o.state.fuses ?? 0;
  return 0;
};
const powered = (zone: string, c: number) => () => !!G.zones.get(zone)?.circuitPowered(c);
const fmt = (n: number) => Math.round(n).toLocaleString('en-GB');
const debt = () => G.debt as any;
const VOSS = 'SSGT. VOSS (PROJECTION)';
const INST = 4;

// ================================================================ main: the contract
defDirective({
  key: 'first_haul', main: true, voice: 'handler', title: 'First Haul', from: VOSS,
  when: (m) => m.flags.has('contract:intake'),
  desc: 'You owe. Everyone down here owes. The furniture is full of what people left behind: break it open, find something worth something, and put it on the plate of a Remittance Hopper. Your SEER-9 hears every hopper\'s beacon on 77.7 MHz.',
  intro: 'Listen up, convict. You find it, you break it open, you bring it to the plate. The plate takes it, your number goes down. Simple.',
  objectives: [
    { id: 'smash', text: 'Break a piece of furniture open', check: has('tut:smash') },
    { id: 'valuable', text: 'Find something valuable', check: has('tut:valuable') },
    { id: 'deposit', text: 'Put it on a hopper\'s plate', check: has('contract:first_deposit') },
    { id: 'scanner', text: 'Raise the SEER-9 (TAB) and find the hopper beacon (77.7 MHz)', check: (m) => m.flags.has('tut:scanner'), optional: true },
    { id: 'drink', text: 'Drink something', check: has('tut:drink'), optional: true },
    { id: 'light', text: 'Find a light source', check: (m) => m.flags.has('got:light') || m.flags.has('tut:light'), optional: true },
  ],
  outro: 'That is the job. Now do it again. And again. The first installment is due before you know it.',
});

for (let n = 1; n <= INST; n++) {
  defDirective({
    key: 'installment_' + n, main: true, voice: 'handler', after: [n === 1 ? 'first_haul' : 'installment_' + (n - 1)],
    title: `Installment ${n} of ${INST + 1}`, from: 'REMITTANCE LEDGER',
    get desc() {
      const d = debt();
      if (!d?.on) return 'The ledger is waiting for your first deposit.';
      return `Balance ${fmt(d.remaining)} scrip. Installment ${n} must be on the ledger by day ${d.dueDay}. Miss it and the band will remind you, and the Programme adds a penalty.`;
    },
    intro: n === 1 ? 'First installment. Do not make me remind you.' : n === INST ? 'One more installment after this and you are square. Do not get comfortable.' : undefined,
    objectives: [
      {
        id: 'pay',
        get text() { const d = debt(); return d?.on && d.installment === n && !d.cleared ? `Remit ${fmt(d.due)} more scrip by day ${d.dueDay}` : `Pay installment ${n}`; },
        check: has('contract:installment:' + n),
      },
    ],
  } as any);
}

defDirective({
  key: 'clear_debt', main: true, voice: 'handler', after: ['installment_' + INST], title: 'Discharge', from: 'REMITTANCE LEDGER',
  get desc() { const d = debt(); return `The last installment is the rest of it: ${fmt(d?.remaining ?? 0)} scrip. Clear the balance and the contract is discharged.`; },
  intro: 'Last one. Clear it and you get to talk about leaving.',
  objectives: [
    { id: 'clear', get text() { const d = debt(); return d?.on && !d.cleared ? `Clear the balance (${fmt(d.remaining)} scrip)` : 'Clear the balance'; }, check: has('contract:debt_cleared') },
  ],
} as any);

defDirective({
  key: 'transport', main: true, voice: 'handler', after: ['clear_debt'], title: 'Passage', from: VOSS,
  get desc() {
    const d = debt();
    const where = zoneSpec('depot') ? 'the depot\'s kiosk' : 'the passage kiosk beside the Lobby hopper';
    return `Discharged debtors may buy passage out at ${where}. Surplus scrip pays for it: ${fmt(d?.surplus ?? 0)} on account. The cheap ride goes somewhere. The dear one goes home.`;
  },
  intro: 'There is a depot. Things leave from it. Keep depositing: every scrip over zero goes toward your ticket.',
  objectives: [
    { id: 'depot', get text() { return zoneSpec('depot') ? 'Reach the depot' : 'Find the passage kiosk'; }, check: (m) => !zoneSpec('depot') || m.flags.has('visit:depot') },
    { id: 'ticket', text: 'Buy passage at the kiosk', check: has('contract:ticket') },
    { id: 'board', text: 'Board before it leaves', check: has('contract:transport') },
  ],
} as any);

// ================================================================ side: the way out they don't want you to find
defDirective({
  key: 'first_light', after: ['first_haul'], title: 'Dead Circuit', from: 'BRK-99 TELEMETRY',
  desc: 'Something on 102.5 MHz is not Programme traffic: a dead circuit in this level broadcasting telemetry. The service elevator runs on circuit 99. Voss has never mentioned it.',
  intro: '...carrier on 102.5. Automated. "BRK-99: FUSES MISSING". The projection on your wrist flickers while it plays.',
  signals: [{ id: 'sig_brk99', zone: 'lobby', freq: 102.5, anchor: 'maintenance', range: 170, name: 'BRK-99 TELEMETRY', text: 'FUSES 0/3. ELEVATOR CIRCUIT OPEN.' }],
  objectives: [
    { id: 'track', text: 'Tune the SIG page to 102.5 MHz and follow it', check: (m) => m.flags.has('sig:sig_brk99') || m.flags.has('room:lobby:maintenance') },
    { id: 'room', text: 'Find the maintenance room', check: has('room:lobby:maintenance') },
    { id: 'fuses', text: 'Fit three fuses into the breaker panel', check: () => lobbyPanelFuses() >= 3 },
    { id: 'switch', text: 'Throw the main switch', check: (m) => m.flags.has('first_light') || powered('lobby', 99)() },
  ],
  outro: 'The hum changes key. Somewhere an elevator chimes. ...and a voice on 88.1, reading numbers. Not one of theirs.',
});

defDirective({
  key: 'numbers', after: ['first_light'], title: 'The Voice on 88.1', from: 'UNKNOWN',
  desc: 'Someone above is reading numbers on 88.1 MHz. The service elevator has power now. Your band chirps every time you tune to it.',
  signals: [{ id: 'sig_numbers', zone: 'office', freq: 88.1, anchor: 'numbers_terminal', range: 150, name: 'NUMBERS', text: '4 1 1 . 0 7 . 3 3 . . . 4 1 1 . 0 7 . 3 3' }],
  objectives: [
    { id: 'office', text: 'Take the elevator up', check: has('visit:office') },
    { id: 'lock', text: 'Lock onto the voice (88.1 MHz)', check: has('sig:sig_numbers') },
    { id: 'terminal', text: 'Find the terminal it comes from', check: has('read:terminal_numbers') },
  ],
  outro: 'Room 411. Server closet 07. Rack 33. Somebody wanted a debtor to find it.',
});

defDirective({
  key: 'node_one', after: ['numbers'], title: 'Node One', from: 'D. HALE (RECORDED)',
  desc: 'The numbers point at a server closet on the office floor. Inside, a render node holds these levels together, and carries the BAILIFF network with them. The recording says: turn it off.',
  objectives: [
    { id: 'card', text: 'Find the facilities keycard', check: (m) => m.flags.has('got:keycard_facilities') || m.flags.has('unlock:keycard_facilities') },
    { id: 'closet', text: 'Get into the server closet', check: has('room:office:server_closet') },
    { id: 'node', text: 'Disable render node SRV-1', check: has('node:SRV-1') },
  ],
  outro: 'Did you feel that? The floor settled. Your band lost its signal for a second. Two more.',
});

defDirective({
  key: 'beneath', after: ['node_one'], title: 'Beneath', from: 'SRV-1 SHUTDOWN LOG',
  desc: 'SRV-1 handed its load to SRV-2, at a Meridian laboratory under the levels. The lab has more than one way in, and a keypad on the main door.',
  signals: [{ id: 'sig_lab', zone: 'tunnels', freq: 121.5, anchor: 'lab_door', range: 160, name: 'MERIDIAN BEACON', text: 'FACILITY 4 // AUTHORISED PERSONNEL // CODE REQUIRED' }],
  objectives: [
    { id: 'code', text: 'Learn the laboratory access code', check: has('lab_code') },
    { id: 'lab', text: 'Enter the laboratory', check: has('visit:lab') },
    { id: 'log', text: 'Read the director\'s log', check: has('read:log_director') },
    { id: 'node', text: 'Disable render node SRV-2', check: has('node:SRV-2') },
  ],
  outro: 'The sky over the fields just flickered to a test card. The handler\'s projection stuttered mid-word. Good.',
});

defDirective({
  key: 'root', after: ['beneath'], title: 'Root Access', from: 'CONTINUITY KERNEL',
  desc: 'The core node SRV-3 refuses commands without a root key. The key was last logged in a region the simulation no longer renders properly. The mall\'s cinema and the thirteenth floor both lead there now.',
  objectives: [
    { id: 'corrupt', text: 'Find a way into the corrupted region', check: has('visit:corrupt') },
    { id: 'key', text: 'Recover the root key', check: has('got:root_key') },
  ],
});

defDirective({
  key: 'shutdown', after: ['root'], title: 'Shutdown', from: 'CONTINUITY KERNEL',
  desc: 'The kernel is awake and it is afraid. The core is past the laboratory\'s lower elevator. When it goes down, so does everything it carries: the levels, the ledger, the bands.',
  objectives: [
    { id: 'core', text: 'Reach the core', check: has('visit:server') },
    { id: 'node', text: 'Disable the core node SRV-3', check: has('node:SRV-3') },
  ],
  outro: 'Everything is coming apart. Your band just went dead. There is a door. GO.',
});

defDirective({
  key: 'noclip', after: ['shutdown'], title: 'The Way They Didn\'t Want You To Find', from: '???',
  desc: 'The band is off. The ledger cannot see you. Find the door that was always there and step through it.',
  objectives: [
    { id: 'band', text: 'Get the band off', check: has('band:removed') },
    { id: 'exit', text: 'Reach the exit', check: has('visit:exit') },
    { id: 'out', text: 'Leave', check: has('escaped') },
  ],
});

// ---------------------------------------------------------------- other side directives
defDirective({
  key: 'survey', after: ['first_haul'], title: 'The Survey Team', from: 'MERIDIAN FIELD TEAM 3',
  desc: 'Somebody camped in the Lobby before you. Their journal mentions three others who went deeper. Find what they left behind.',
  when: (m) => m.flags.has('read:journal_camp'),
  objectives: [
    { id: 'j1', text: 'Okafor\'s journal (Lobby camp)', check: has('read:journal_camp') },
    { id: 'j2', text: 'Brandt\'s journal', check: has('read:journal_survey_2') },
    { id: 'j3', text: 'Ruiz\'s journal', check: has('read:journal_survey_3') },
    { id: 'j4', text: 'Sato\'s last entry', check: has('read:journal_survey_4') },
  ],
  outro: 'Sato\'s entry ends with map coordinates. A cache, maybe. Tunnels, junction 9.',
  onDone: (m: MissionSystem) => m.set('survey_cache'),
});

defDirective({
  key: 'biology', after: ['first_haul'], title: 'Field Biology', from: 'SEER-9 FIRMWARE',
  desc: 'The SEER-9 can catalogue entities it scans. Meridian filed a bounty schema for five specimens. Firmware unlocks extended range on completion.',
  when: (m) => count('scan:', 1)(m),
  objectives: [
    { id: 'scan3', text: 'Scan three different entities', check: count('scan:', 3) },
    { id: 'scan5', text: 'Scan five different entities', check: count('scan:', 5) },
  ],
  onDone: (m: MissionSystem) => m.set('scanner_mk2'),
  outro: 'FIRMWARE 9.1 INSTALLED. SCAN RANGE EXTENDED.',
});

defDirective({
  key: 'pressure', after: ['first_haul'], title: 'Pressure', from: 'POOL PLANT TELEMETRY',
  desc: 'The Poolrooms pump hall reports zero pressure. With the pumps running, taps across the levels would run clean again.',
  when: (m) => m.flags.has('visit:pools'),
  signals: [{ id: 'sig_pumps', zone: 'pools', freq: 96.3, anchor: 'pumps', range: 140, name: 'PUMP PLANT', text: 'PRESSURE 0.0 BAR. VALVES CLOSED.' }],
  objectives: [
    { id: 'find', text: 'Find the pump hall', check: (m) => m.flags.has('room:pools:pumps') || m.flags.has('sig:sig_pumps') },
    { id: 'valves', text: 'Open the valves and start the pumps', check: has('pumps_on') },
  ],
  onDone: () => { for (const z of G.zones.values()) z.waterOn = true; },
  outro: 'Pipes knock everywhere at once. Water. Clean water.',
});

defDirective({
  key: 'friend', after: ['first_haul'], title: 'Good Boy', from: 'SEER-9 FIRMWARE',
  desc: 'Not everything here wants you dead. Some things are just hungry and lonely.',
  when: (m) => m.flags.has('scan:goodboy') || m.flags.has('scan:lamplighter'),
  objectives: [
    { id: 'tame', text: 'Earn the trust of a creature', check: (m) => [...m.flags].some((f) => f.startsWith('tamed:')) },
  ],
});
