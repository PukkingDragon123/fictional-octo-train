// Items stream — ELECTRONICS. `battery: true` devices hold their charge in
// `uses` (100 = full) and drain while on; `radio` describes receivers and
// two-way sets (channels, range in tiles).
import { defItem } from '../../items/item';
import { tex, decal, T, K, rp, dk, lt, txt, txtC, stamp, dashes, band, slab, rodX, rodZ, prism, ph, MB, PixelCanvas } from './_kit';

// ---------------------------------------------------------------- textures
const grille = (pc: PixelCanvas, x: number, y: number, w: number, h: number, c: number, bg: number) => {
  pc.rect(x, y, w, h, bg);
  for (let j = 0; j < h; j += 2) for (let i = (j >> 1) & 1; i < w; i += 2) pc.set(x + i, y + j, c);
};
const D_RADIO = decal('i_radio_front', 20, 12, (pc) => {
  pc.fill(0x3a3a40); pc.strokeRect(0, 0, 20, 12, 0x2a2a2e);
  grille(pc, 1, 2, 8, 8, 0x5a5a62, 0x1c1c20);
  pc.rect(11, 2, 8, 3, 0xc8b878); for (let x = 12; x < 19; x += 2) pc.set(x, 4, 0x3a3a2a); pc.set(15, 3, 0xc8302a);
  pc.circle(13, 8, 1.6, 0xc8ccd0); pc.circle(17, 8, 1.6, 0xc8ccd0);
});
const D_WALKIE = decal('i_walkie_front', 8, 16, (pc) => {
  pc.fill(0xe8b81a); pc.rect(0, 0, 8, 16, 0x2a2a2e); pc.rect(0, 0, 8, 5, 0xe8b81a);
  pc.rect(1, 1, 6, 3, 0x8aa88a); txt(pc, '3', 3, 0, 0x1c2a1c);
  grille(pc, 1, 7, 6, 6, 0x5a5a62, 0x1c1c20);
  pc.rect(2, 14, 4, 1, 0xc8302a);
});
const D_MP3 = decal('i_mp3_face', 8, 12, (pc) => {
  pc.fill(0xf2f2ee); pc.rect(1, 1, 6, 4, 0x2a3a5a); pc.hline(2, 5, 2, 0x8ab0e0);
  pc.circle(3.5, 8.5, 2.6, 0xd8d8d4); pc.circle(3.5, 8.5, 1, 0xf2f2ee);
});
const D_GAME = decal('i_game_face', 10, 16, (pc) => {
  pc.fill(0xb8b8b0); pc.rect(1, 1, 8, 7, 0x4a4a52); pc.rect(2, 2, 6, 5, 0x8aa83a); pc.set(3, 4, 0x3a5a1a); pc.set(5, 3, 0x3a5a1a);
  stamp(pc, 1, 10, ['.k.', 'kkk', '.k.'], { k: 0x2a2a2e }); pc.set(7, 10, 0xa8284a); pc.set(8, 11, 0xa8284a);
  pc.hline(4, 5, 14, 0x6a6a72);
});
const D_CALC = decal('i_calc_face', 8, 12, (pc) => {
  pc.fill(0x2a2a2e); pc.rect(1, 1, 6, 2, 0x9aa88a); pc.hline(4, 6, 2, 0x2a3a2a);
  for (let y = 4; y < 11; y += 2) for (let x = 1; x < 7; x += 2) pc.set(x, y, y === 10 && x === 5 ? 0xe86a1a : 0xc8c8c0);
});
const D_PHONE = decal('i_phone_face', 8, 14, (pc) => {
  pc.fill(0x121214); pc.rect(1, 1, 6, 11, 0x1c2026); pc.set(2, 2, 0x3a4450); pc.hline(3, 4, 0, 0x2a2a2e);
  pc.set(6, 3, 0x2a3a4a);
});
const D_CASSETTE_P = decal('i_tapeplayer_face', 12, 8, (pc) => {
  pc.fill(0x3a5a8a); pc.rect(1, 1, 10, 5, 0x1c1c20); pc.rect(2, 2, 8, 3, 0xc8b8a0); pc.set(4, 3, 0x2a2a2a); pc.set(7, 3, 0x2a2a2a);
  for (let x = 1; x < 11; x += 3) pc.rect(x, 6, 2, 1, 0xc8ccd0);
});
const D_POLA = decal('i_polaroid_front', 14, 10, (pc) => {
  pc.fill(0xf2f0e8); for (let i = 0; i < 4; i++) pc.hline(0, 13, 6 + i, [0xc8302a, 0xe8862a, 0xf0c419, 0x3a8a4a][i]);
  pc.circle(7, 4, 3, 0x2a2a2e); pc.circle(7, 4, 1.8, 0x4a5a6a); pc.set(6, 3, 0xc8d8e8);
  pc.rect(11, 1, 2, 2, 0x1c1c20);
});
const D_LAPTOP_SCREEN = decal('i_laptop_screen', 16, 10, (pc) => {
  pc.fill(0x0c1410);
  txt(pc, '>', 1, 1, 0x6af06a); dashes(pc, 5, 2, 9, 0x4ad04a, 2); dashes(pc, 1, 5, 12, 0x3a9a3a, 3); dashes(pc, 1, 7, 7, 0x3a9a3a, 4);
  pc.set(9, 7, 0x8aff8a);
});
const D_KEYS = tex('i_laptop_keys', 16, 10, (pc) => {
  pc.fill(0x3a3a40);
  for (let y = 1; y < 7; y += 2) for (let x = 1; x < 15; x += 2) pc.set(x, y, 0x1c1c20);
  pc.rect(5, 7, 6, 2, 0x2e2e34);
});
const D_REMOTE = decal('i_remote_face', 6, 16, (pc) => {
  pc.fill(0x1c1c20); pc.set(2, 1, 0xc8302a); pc.set(3, 1, 0xc8302a);
  for (let y = 4; y < 14; y += 2) for (let x = 1; x < 5; x += 2) pc.set(x, y, 0x6a6a72);
  pc.set(2, 3, 0x9a9aa2);
});
const D_PB = decal('i_powerbank_top', 8, 12, (pc) => { pc.fill(0x2a2a2e); for (let i = 0; i < 4; i++) pc.set(2 + i, 10, i < 3 ? 0x4af06a : 0x2a4a2a); dashes(pc, 1, 3, 6, 0x5a5a62, 2); });
const D_TIMER = decal('i_timer_face', 10, 8, (pc) => { pc.fill(0xf2f2ee); pc.rect(1, 1, 8, 3, 0x8a9a7a); txt(pc, '05', 2, 0, 0x1c2a1c); pc.set(2, 6, 0xc8302a); pc.set(5, 6, 0x2a2a2e); pc.set(7, 6, 0x2a2a2e); });
const D_CARBATT = decal('i_carbatt_top', 16, 10, (pc) => { pc.fill(0x1c1c20); pc.rect(1, 1, 14, 3, 0x2a2a30); txt(pc, '12V', 4, 4, 0xf0c419); pc.rect(1, 6, 3, 3, 0xc8302a); pc.rect(12, 6, 3, 3, 0x3a3a40); });
const D_WATCH = tex('i_watch_face', 8, 8, (pc) => { pc.fill(0xc8ccd0); pc.each((x, y) => { if (Math.hypot(x - 3.5, y - 3.5) < 2.9) pc.set(x, y, 0xf2eee2); }); pc.set(3, 2, 0x1c1c1c); pc.set(3, 3, 0x1c1c1c); pc.set(4, 3, 0x1c1c1c); });
const D_ALARM = decal('i_alarm_face', 14, 8, (pc) => {
  pc.fill(0x1c1c20); pc.rect(1, 1, 12, 6, 0x0a0a0c);
  const seg = (x: number, d: string) => txt(pc, d, x, 2, 0xff3a2a);
  seg(1, '1'); seg(4, '2'); pc.set(7, 3, 0xff3a2a); pc.set(7, 5, 0xff3a2a); seg(8, '0'); pc.set(11, 2, 0xff3a2a);
});

// ---------------------------------------------------------------- radios
defItem({
  key: 'radio_portable', name: 'Portable Radio', cat: 'electronics', weight: 0.8, battery: true, uses: 100,
  radio: { channels: 12, range: 400 }, tags: ['radio', 'electronics'],
  desc: 'AM/FM receiver. Mostly static down here — and, on some frequencies, voices reading numbers.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.2, 0.12, 0.07, T.plastic, { color: 0x3a3a40 });
    mb.panel(-0.1, 0.0351, 0.1, 0.0351, 0.005, 0.115, D_RADIO, { fit: true });
    mb.box(0, 0.12, 0, 0.12, 0.012, 0.02, T.plastic, { color: 0x2a2a2e });
    for (const s of [-1, 1]) mb.box(s * 0.055, 0.12, 0, 0.012, 0.03, 0.02, T.plastic, { color: 0x2a2a2e });
    mb.push().translate(0.085, 0.12, -0.02).rotateZ(-0.5); mb.cylinder(0, 0, 0, 0.003, 0.22, 4, 'chrome'); mb.pop();
  },
});
defItem({
  key: 'walkie_talkie', name: 'Walkie-Talkie', cat: 'electronics', weight: 0.4, battery: true, uses: 100,
  radio: { channels: 8, range: 120, twoWay: true }, tags: ['walkie', 'radio', 'electronics'],
  desc: 'Two-way radio, eight channels, about 120 tiles of range through the walls. Push to talk.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.06, 0.15, 0.035, T.plastic, { color: 0x2a2a2e });
    mb.panel(-0.03, 0.0176, 0.03, 0.0176, 0.005, 0.145, D_WALKIE, { fit: true });
    mb.cylinder(0.017, 0.15, -0.002, 0.007, 0.09, 6, T.rubber, { rTop: 0.005 });
    mb.cylinder(-0.015, 0.15, 0, 0.007, 0.012, 6, T.black);
    mb.box(-0.032, 0.07, 0, 0.006, 0.04, 0.02, T.rubber, { color: 0x4a4a52 });
  },
});

// ---------------------------------------------------------------- music & games
defItem({
  key: 'headphones', name: 'Headphones', cat: 'electronics', weight: 0.2, tags: ['headphones'],
  desc: 'Pair them with a music player. Drowns out the hum (and the footsteps).',
  model: (mb) => {
    for (let i = 0; i < 7; i++) { const a = (i / 6) * Math.PI; mb.box(Math.cos(a) * 0.075, 0.012, -Math.sin(a) * 0.07 + 0.02, 0.03, 0.012, 0.018, T.plastic, { color: 0x2a2a2e }); }
    for (const s of [-1, 1]) { mb.cylinder(s * 0.08, 0, 0.03, 0.035, 0.03, 10, { sides: T.plastic, top: 'i_cushion' }, { color: 0x3a3a40, fit: true }); }
  },
});
tex('i_cushion', 8, 8, (pc) => { pc.fill(0x1c1c20); pc.each((x, y) => { if (Math.hypot(x - 3.5, y - 3.5) < 2.2) pc.set(x, y, 0x5a5a62); }); });
defItem({
  key: 'mp3_player', name: 'MP3 Player', cat: 'electronics', weight: 0.1, battery: true, uses: 100, tags: ['music', 'electronics', 'entertain'],
  desc: 'Two hundred songs you do not remember downloading. Eases boredom and unhappiness while it has charge.',
  model: (mb) => slab(mb, 0.055, 0.01, 0.09, D_MP3, T.white, 0xe8e8e4, { rot: 0.2 }),
});
defItem({
  key: 'handheld_game', name: 'Handheld Game', cat: 'electronics', weight: 0.3, battery: true, uses: 100, tags: ['game', 'electronics', 'entertain'],
  desc: 'A blocky puzzle game. The high score table has your initials on every line.',
  model: (mb) => slab(mb, 0.09, 0.025, 0.14, D_GAME, T.plastic, 0xb8b8b0, { rot: -0.15 }),
});
defItem({
  key: 'cassette_player', name: 'Cassette Player', cat: 'electronics', weight: 0.3, battery: true, uses: 100, tags: ['music', 'tapeplayer', 'electronics', 'entertain'],
  desc: 'Plays music tapes — and the recorded logs you find.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.12, 0.03, 0.09, { all: T.plastic, top: D_CASSETTE_P }, { color: 0x3a5a8a, fit: { top: true } });
    for (const x of [-0.04, 0.0, 0.04]) mb.box(x, 0.03, 0.035, 0.022, 0.006, 0.012, T.plastic, { color: 0xc8ccd0 });
  },
});
defItem({
  key: 'camera_polaroid', name: 'Instant Camera', cat: 'electronics', weight: 0.6, uses: 10, tags: ['camera', 'electronics'],
  desc: 'Ten exposures left. Photos come out with things in them that were not there.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.14, 0.1, 0.1, T.plastic, { color: 0xf2f0e8 });
    mb.panel(-0.07, 0.0501, 0.07, 0.0501, 0.0, 0.1, D_POLA, { fit: true });
    mb.cylinder(0, 0.042, 0.06, 0.028, 0.02, 10, { sides: T.black, top: T.screen }, { fit: true });
    mb.box(0.0, 0.1, -0.01, 0.08, 0.025, 0.06, T.plastic, { color: 0xe2e0d8 });
    mb.push().translate(0, 0.05, 0.06).rotateX(Math.PI / 2); mb.cylinder(0, 0, 0, 0.028, 0.02, 10, { sides: T.black, top: T.screen, bottom: T.screen }, { fit: true }); mb.pop();
  },
});

// ---------------------------------------------------------------- office & household
defItem({
  key: 'calculator', name: 'Calculator', cat: 'electronics', weight: 0.1, tags: ['calculator', 'office'],
  desc: 'Solar powered. Every answer is 37.',
  model: (mb) => slab(mb, 0.08, 0.012, 0.13, D_CALC, T.plastic, 0x2a2a2e, { rot: 0.25 }),
});
defItem({
  key: 'phone_dead', name: 'Dead Phone', cat: 'electronics', weight: 0.15, tags: ['phone', 'lore'], lore: 'phone_dead',
  desc: 'No signal, no charge. Before it died, the lock screen showed thirty-seven missed calls — from your own number.',
  model: (mb) => slab(mb, 0.07, 0.009, 0.145, D_PHONE, T.black, 0x1c1c20, { rot: -0.3 }),
});
defItem({
  key: 'laptop', name: 'Laptop', cat: 'electronics', weight: 2.2, battery: true, uses: 100, tags: ['computer', 'lore'], lore: 'laptop_meridian',
  desc: 'A Meridian Institute workstation, still logged in. The terminal shows a session that never closed.',
  literature: { text: 'MERIDIAN INSTITUTE // SUBJECT LOG\n> instance count: 7\n> instance 4 desync: noclip event logged at sector Y-0\n> recommendation: let them find the exits. observe.\n> exits verified: 0' },
  model: (mb) => {
    mb.box(0, 0, 0, 0.33, 0.02, 0.23, { all: T.plastic, top: D_KEYS }, { color: 0x3a3a40, fit: { top: true } });
    mb.push().translate(0, 0.02, -0.115).rotateX(-0.35);
    mb.box(0, 0, -0.008, 0.33, 0.22, 0.012, T.plastic, { color: 0x3a3a40 });
    mb.panel(-0.15, -0.0015, 0.15, -0.0015, 0.015, 0.205, D_LAPTOP_SCREEN, { fit: true, emissive: 0.8 });
    mb.pop();
  },
});
defItem({
  key: 'tv_remote', name: 'TV Remote', cat: 'electronics', weight: 0.1, tags: ['remote'],
  desc: 'Points at nothing in particular. Occasionally, something switches on.',
  model: (mb) => slab(mb, 0.045, 0.018, 0.17, D_REMOTE, T.black, 0x1c1c20, { rot: 0.4 }),
});
defItem({
  key: 'power_bank', name: 'Power Bank', cat: 'electronics', weight: 0.25, uses: 100, tags: ['powerbank', 'electronics'],
  desc: 'Recharges a battery or a device. Charge shown as a percentage.',
  model: (mb) => slab(mb, 0.07, 0.022, 0.12, D_PB, T.plastic, 0x2a2a2e, { rot: -0.2 }),
});
defItem({
  key: 'timer', name: 'Kitchen Timer', cat: 'electronics', weight: 0.15, battery: true, uses: 100, tags: ['timer', 'electrical'],
  desc: 'Counts down and beeps. Useful for rigging delayed distractions.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.07, 0.06, 0.025, T.plastic, { color: 0xf2f2ee });
    mb.panel(-0.035, 0.0126, 0.035, 0.0126, 0.005, 0.055, D_TIMER, { fit: true });
    mb.box(0, 0, -0.01, 0.05, 0.02, 0.03, T.plastic, { color: 0xe2e2de });
  },
});
defItem({
  key: 'car_battery', name: 'Car Battery', cat: 'electronics', weight: 18, heavy: true, uses: 100, tags: ['carbattery', 'power_source'],
  desc: 'Twelve volts. Wire it to a lamp or radio to run them without the grid.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.3, 0.18, 0.17, T.plastic, { color: 0x1c1c20 });
    mb.flat(0, 0.1801, 0, 0.3, 0.17, D_CARBATT);
    mb.cylinder(-0.11, 0.18, 0.04, 0.012, 0.02, 6, T.white, { color: 0xc8302a });
    mb.cylinder(0.11, 0.18, 0.04, 0.012, 0.02, 6, T.white, { color: 0x3a3a40 });
    mb.box(0, 0.18, -0.03, 0.2, 0.012, 0.012, T.black);
  },
});
defItem({
  key: 'wristwatch', name: 'Wristwatch', cat: 'electronics', weight: 0.05, tags: ['watch'],
  desc: 'Keeps time. Sets an alarm. The second hand stutters near certain doors.',
  model: (mb) => {
    mb.cylinder(0, 0.004, 0, 0.02, 0.01, 10, { sides: 'chrome', top: D_WATCH }, { fit: true });
    for (const s of [-1, 1]) mb.box(0, 0.004, s * 0.045, 0.018, 0.004, 0.05, T.leather, { color: 0x6a4a2a });
  },
});
defItem({
  key: 'alarm_clock', name: 'Alarm Clock', cat: 'electronics', weight: 0.4, battery: true, uses: 100, tags: ['clock', 'electrical'],
  desc: 'Bedside clock, blinking 12:00. Rig it with some scrap and it becomes a thrown noisemaker.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.14, 0.07, 0.06, T.plastic, { color: 0x2a2a2e });
    mb.panel(-0.06, 0.0301, 0.06, 0.0301, 0.012, 0.06, D_ALARM, { fit: true, emissive: 0.9 });
    mb.box(0.04, 0.07, -0.01, 0.03, 0.006, 0.015, T.plastic, { color: 0x4a4a52 });
  },
});

void K; void rp; void dk; void lt; void txtC; void band; void rodX; void rodZ; void prism; void ph;
