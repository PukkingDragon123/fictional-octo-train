// The directive chain. Main directives walk the player from waking up in
// Level 0 to shutting down CONTINUITY and walking out; side directives reward
// exploring, studying creatures and piecing together the survey team's fate.
import { G } from '../game/G';
import { defDirective, has, count, MissionSystem } from './missions';

const lobbyPanelFuses = () => {
  const z = G.zones.get('lobby');
  if (!z) return 0;
  for (const o of z.objects.values()) if (o.state.mission === 'first_light') return o.state.fuses ?? 0;
  return 0;
};
const powered = (zone: string, c: number) => () => !!G.zones.get(zone)?.circuitPowered(c);

// ---------------------------------------------------------------- main chain
defDirective({
  key: 'wake', main: true, title: 'Orientation', from: 'SEER-9 FIRMWARE',
  desc: 'Field unit active. Operator not found. Establish a survival baseline before moving on.',
  intro: 'SEER-9 ONLINE. NO OPERATOR. ...hello?',
  objectives: [
    { id: 'note', text: 'Read the note you woke up next to', check: has('read:note_wake') },
    { id: 'scanner', text: 'Raise the SEER-9 (TAB)', check: has('tut:scanner') },
    { id: 'drink', text: 'Drink something', check: has('tut:drink') },
    { id: 'light', text: 'Find a light source', check: (m) => m.flags.has('got:light') || m.flags.has('tut:light'), optional: true },
  ],
});

defDirective({
  key: 'first_light', main: true, after: ['wake'], title: 'First Light', from: 'BRK-99 TELEMETRY',
  desc: 'A dead circuit is broadcasting telemetry on 102.5 MHz. Its maintenance room is somewhere in this level. The service elevator runs on circuit 99.',
  intro: '...carrier on 102.5. Automated. "BRK-99: FUSES MISSING".',
  signals: [{ id: 'sig_brk99', zone: 'lobby', freq: 102.5, anchor: 'maintenance', range: 170, name: 'BRK-99 TELEMETRY', text: 'FUSES 0/3. ELEVATOR CIRCUIT OPEN.' }],
  objectives: [
    { id: 'track', text: 'Tune the SIG page to 102.5 MHz and follow it', check: (m) => m.flags.has('sig:sig_brk99') || m.flags.has('room:lobby:maintenance') },
    { id: 'room', text: 'Find the maintenance room', check: has('room:lobby:maintenance') },
    { id: 'fuses', text: 'Fit three fuses into the breaker panel', check: () => lobbyPanelFuses() >= 3 },
    { id: 'switch', text: 'Throw the main switch', check: (m) => m.flags.has('first_light') || powered('lobby', 99)() },
  ],
  outro: 'The hum changes key. Somewhere an elevator chimes. ...and a voice on 88.1, reading numbers.',
});

defDirective({
  key: 'numbers', main: true, after: ['first_light'], title: 'The Voice on 88.1', from: 'UNKNOWN',
  desc: 'Someone above is reading numbers on 88.1 MHz. The service elevator has power now.',
  signals: [{ id: 'sig_numbers', zone: 'office', freq: 88.1, anchor: 'numbers_terminal', range: 150, name: 'NUMBERS', text: '4 1 1 . 0 7 . 3 3 . . . 4 1 1 . 0 7 . 3 3' }],
  objectives: [
    { id: 'office', text: 'Take the elevator up', check: has('visit:office') },
    { id: 'lock', text: 'Lock onto the voice (88.1 MHz)', check: has('sig:sig_numbers') },
    { id: 'terminal', text: 'Find the terminal it comes from', check: has('read:terminal_numbers') },
  ],
  outro: 'Room 411. Server closet 07. Rack 33. Somebody wanted you to find it.',
});

defDirective({
  key: 'node_one', main: true, after: ['numbers'], title: 'Node One', from: 'D. HALE (RECORDED)',
  desc: 'The numbers point at a server closet on the office floor. Inside, a render node holds these levels together. The recording says: turn it off.',
  objectives: [
    { id: 'card', text: 'Find the facilities keycard', check: (m) => m.flags.has('got:keycard_facilities') || m.flags.has('unlock:keycard_facilities') },
    { id: 'closet', text: 'Get into the server closet', check: has('room:office:server_closet') },
    { id: 'node', text: 'Disable render node SRV-1', check: has('node:SRV-1') },
  ],
  outro: 'Did you feel that? The floor just... settled. Like a held breath. Two more.',
});

defDirective({
  key: 'beneath', main: true, after: ['node_one'], title: 'Beneath', from: 'SRV-1 SHUTDOWN LOG',
  desc: 'SRV-1 handed its load to SRV-2, at a Meridian laboratory under the levels. The lab has more than one way in, and a keypad on the main door.',
  signals: [{ id: 'sig_lab', zone: 'tunnels', freq: 121.5, anchor: 'lab_door', range: 160, name: 'MERIDIAN BEACON', text: 'FACILITY 4 // AUTHORISED PERSONNEL // CODE REQUIRED' }],
  objectives: [
    { id: 'code', text: 'Learn the laboratory access code', check: has('lab_code') },
    { id: 'lab', text: 'Enter the laboratory', check: has('visit:lab') },
    { id: 'log', text: 'Read the director\'s log', check: has('read:log_director') },
    { id: 'node', text: 'Disable render node SRV-2', check: has('node:SRV-2') },
  ],
  outro: 'The sky over the fields just flickered to a test card. Then back. It is getting worse. Good.',
});

defDirective({
  key: 'root', main: true, after: ['beneath'], title: 'Root Access', from: 'CONTINUITY KERNEL',
  desc: 'The core node SRV-3 refuses commands without a root key. The key was last logged in a region the simulation no longer renders properly. The mall\'s cinema and the thirteenth floor both lead there now.',
  objectives: [
    { id: 'corrupt', text: 'Find a way into the corrupted region', check: has('visit:corrupt') },
    { id: 'key', text: 'Recover the root key', check: has('got:root_key') },
  ],
});

defDirective({
  key: 'shutdown', main: true, after: ['root'], title: 'Shutdown', from: 'CONTINUITY KERNEL',
  desc: 'The kernel is awake and it is afraid. The core is past the laboratory\'s lower elevator.',
  objectives: [
    { id: 'core', text: 'Reach the core', check: has('visit:server') },
    { id: 'node', text: 'Disable the core node SRV-3', check: has('node:SRV-3') },
  ],
  outro: 'Everything is coming apart. There is a door. GO.',
});

defDirective({
  key: 'noclip', main: true, after: ['shutdown'], title: 'Noclip', from: '???',
  desc: 'Find the door that was always there. Step through it.',
  objectives: [
    { id: 'exit', text: 'Reach the exit', check: has('visit:exit') },
    { id: 'out', text: 'Leave', check: has('escaped') },
  ],
});

// ---------------------------------------------------------------- side directives
defDirective({
  key: 'survey', after: ['wake'], title: 'The Survey Team', from: 'MERIDIAN FIELD TEAM 3',
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
  key: 'biology', after: ['wake'], title: 'Field Biology', from: 'SEER-9 FIRMWARE',
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
  key: 'pressure', after: ['wake'], title: 'Pressure', from: 'POOL PLANT TELEMETRY',
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
  key: 'friend', after: ['wake'], title: 'Good Boy', from: 'SEER-9 FIRMWARE',
  desc: 'Not everything here wants you dead. Some things are just hungry and lonely.',
  when: (m) => m.flags.has('scan:goodboy') || m.flags.has('scan:lamplighter'),
  objectives: [
    { id: 'tame', text: 'Earn the trust of a creature', check: (m) => [...m.flags].some((f) => f.startsWith('tamed:')) },
  ],
});
