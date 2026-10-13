// Items stream — ANOMALIES, MISSION ITEMS & LORE OBJECTS. `anomaly` names the
// behaviour hook a system can key on (glow, static, memory, pixel, signal,
// checksum). Mission items (keycard_admin, fuse_special, exit_code_fragment)
// are never in random loot tables — story/mission code places them.
import { defItem } from '../../items/item';
import { tex, decal, T, K, rp, dk, lt, txt, txtC, stamp, stampC, dashes, band, panels, slab, rodX, rodZ, prism, ph, bayer, MB, PixelCanvas } from './_kit';

// ---------------------------------------------------------------- textures
const S_GLOWDUST = tex('i_glowdust', 8, 8, (pc) => pc.each((x, y) => pc.set(x, y, ph(x, y, 3) < 0.25 ? 0x8af8d0 : ph(x, y, 4) < 0.5 ? 0x2ad8a0 : 0x169a78)), true);
const S_STATIC = tex('i_static', 8, 8, (pc) => pc.each((x, y) => { const v = ph(x, y, 7); pc.set(x, y, v < 0.45 ? 0x16161e : v < 0.75 ? 0x3e3e50 : v < 0.92 ? 0x7a7a96 : 0xd0d0e8); }), true);
const S_CRYSTAL = tex('i_crystal', 6, 12, (pc) => { pc.fill(0x8a5ad8); pc.vline(1, 0, 11, 0xc8a8f8); pc.vline(4, 0, 11, 0x5a38a8); pc.set(2, 3, 0xf2e8ff); pc.set(3, 8, 0xb898f0); });
const S_SHARD = tex('i_memshard', 6, 12, (pc) => { pc.each((x, y) => pc.set(x, y, [0xe070c0, 0x60b0e8, 0xe8c050][(x + (y >> 2)) % 3])); pc.vline(1, 0, 11, 0xf8e8f8); });
const S_MISSING = tex('i_missing', 4, 4, (pc) => pc.each((x, y) => pc.set(x, y, ((x >> 1) + (y >> 1)) % 2 ? 0xff00ff : 0x101010)), true);
const D_KEYCARD = decal('i_keycard', 16, 10, (pc) => {
  pc.fill(0xf2f2ee); pc.rect(0, 0, 16, 3, 0xc8302a); txt(pc, 'ADM', 1, -1, 0xf2f2ee);
  pc.rect(1, 4, 4, 5, 0xc8b8a0); pc.rect(2, 5, 2, 2, 0x8a6a5a);
  dashes(pc, 6, 5, 8, 0x2a2a2a, 3); dashes(pc, 6, 7, 6, 0x2a2a2a, 4);
  pc.rect(12, 7, 3, 2, 0xd8b04a);
});
const D_DRIVE = decal('i_data_drive', 10, 16, (pc) => { pc.fill(0xe86a1a); pc.rect(1, 1, 8, 14, 0x2a2a2e); pc.rect(2, 3, 6, 4, 0xf2f2ee); dashes(pc, 3, 4, 4, 0x2a2a2e, 2); pc.set(5, 12, 0x4af06a); });
const D_MFUSE = tex('i_master_fuse', 12, 8, (pc) => {
  pc.fill(0xe8e2d4); pc.rect(0, 2, 12, 4, 0xf2ecdc);
  pc.rect(2, 3, 8, 2, 0xc8302a); txt(pc, '', 3, 3, 0); dashes(pc, 3, 3, 6, 0xf2ecdc, 2);
  pc.hline(0, 11, 1, 0xc8c2b4); pc.hline(0, 11, 6, 0xb8b2a4);
}, true);
const D_CASSETTE = decal('i_cassette', 14, 9, (pc) => {
  pc.fill(0x2a2a2e); pc.rect(1, 1, 12, 4, 0xf2ecd8); dashes(pc, 2, 2, 10, 0x2a5aa8, 5);
  pc.rect(3, 5, 8, 3, 0x1c1c1e); pc.circle(4.5, 6.5, 1, 0xd8d8d0); pc.circle(9.5, 6.5, 1, 0xd8d8d0);
});
const D_VHS = decal('i_vhs_sleeve', 12, 20, (pc) => {
  pc.fill(0x1c1c20); pc.rect(1, 1, 10, 6, 0xf2f2ee); txt(pc, 'TAP', 1, 1, 0x1c1c20);
  for (let y = 8; y < 18; y++) for (let x = 1; x < 11; x++) if (ph(x, y, 3) < 0.25) pc.set(x, y, 0x3a3a44);
  pc.rect(3, 12, 6, 4, 0xc8b860); pc.set(5, 13, 0x1c1c1c); pc.set(6, 13, 0x1c1c1c);
  dashes(pc, 2, 18, 8, 0xc8302a, 2);
});
const D_FLOPPY = decal('i_floppy', 12, 12, (pc) => {
  pc.fill(0x2a4a8a); pc.rect(3, 0, 6, 4, 0xc8ccd0); pc.rect(6, 1, 2, 2, 0x2a4a8a);
  pc.rect(2, 6, 8, 6, 0xf2f2ee); dashes(pc, 3, 7, 6, 0x2a2a2a, 3); dashes(pc, 3, 9, 5, 0xc8302a, 4);
  pc.set(0, 11, 0x1c2a5a);
});
const D_PHOTO = decal('i_photo_old', 12, 14, (pc) => {
  pc.fill(0xf2ecdc);
  pc.rect(1, 1, 10, 9, 0xc8b45a);
  for (let x = 1; x < 11; x++) for (let y = 1; y < 10; y++) { if (y > 6) pc.set(x, y, 0x9a8a44); if (x % 3 === 0 && y < 7) pc.set(x, y, 0xd8c46a); }
  pc.rect(6, 3, 2, 5, 0x2a2420); pc.set(6, 2, 0x2a2420); pc.set(7, 2, 0x2a2420);
  pc.hline(2, 9, 1, 0xf6f0c0);
  dashes(pc, 2, 11, 7, 0x5a5a8a, 4);
});
const D_NOTE = decal('i_note', 12, 14, (pc) => {
  pc.fill(0xf2ecd2);
  for (let y = 2; y < 13; y += 2) dashes(pc, 1, y, 10 - (y % 4), 0x2a2a6a, y);
  pc.line(0, 13, 11, 12, 0xd8ceb0); pc.set(10, 1, 0xc8302a);
});
const D_EXITCODE = decal('i_exit_code', 16, 6, (pc) => {
  pc.fill(0xf6f2e6); pc.strokeRect(0, 0, 16, 6, 0xd8d0b8);
  for (let i = 0; i < 7; i++) { const x = 1 + i * 2; pc.set(x, 2, 0x2af0a0); pc.set(x, 3, 0x2af0a0); if (i % 2) pc.set(x, 1, 0x2af0a0); else pc.set(x, 4, 0x2af0a0); }
});
const D_IDBADGE = decal('i_id_badge', 10, 14, (pc) => {
  pc.fill(0xf2f2ee); pc.rect(0, 0, 10, 3, 0x2a5a9a); pc.set(4, 1, 0xf2f2ee); pc.set(5, 1, 0xf2f2ee);
  pc.rect(2, 4, 6, 5, 0xc8b8a0); pc.rect(4, 5, 2, 2, 0x8a6a5a); pc.rect(3, 7, 4, 2, 0x5a6a8a);
  dashes(pc, 1, 10, 8, 0x2a2a2a, 2); dashes(pc, 2, 12, 6, 0xc8302a, 3);
});
const L_SPECIMEN = tex('i_specimen_label', 16, 6, (pc) => { pc.fill(0xb8d8c0); panels(pc, 2, (x0, pw) => { pc.rect(x0 + 1, 1, pw - 2, 4, 0xf2f2ee); dashes(pc, x0 + 2, 2, pw - 4, 0x2a2a2a, 3); }); }, true);
const D_EYE = tex('i_eye_ball', 12, 8, (pc) => { pc.fill(0xf0ece4); pc.each((x, y) => { const d = Math.hypot(x - 1.5, y - 3.5); if (d < 2.4) pc.set(x, y, 0x3a7aa8); if (d < 1.2) pc.set(x, y, 0x0c0c0c); }); pc.set(4, 6, 0xd86a6a); pc.set(8, 2, 0xd86a6a); }, true);

// ---------------------------------------------------------------- anomalies
defItem({
  key: 'glow_dust', name: 'Glow Dust', cat: 'anomaly', weight: 0.05, anomaly: 'glow', tags: ['glowdust', 'anomalous'],
  desc: 'Luminous scales from the big pale moths. Mix it with water to paint trail marks that glow for days.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.018, 0.05, 8, 'i_glass', { color: 0xe8f8f2, fit: true });
    mb.cylinder(0, 0.004, 0, 0.0185, 0.03, 8, S_GLOWDUST, { fit: true, emissive: 0.55, caps: false });
    mb.cylinder(0, 0.05, 0, 0.012, 0.014, 6, 'i_wood', { fit: true });
  },
});
defItem({
  key: 'glow_paint', name: 'Glow Paint', cat: 'tool', weight: 0.4, uses: 20, tags: ['glowpaint', 'mark_wall', 'anomalous'],
  desc: 'Twenty glowing trail marks. Paint arrows on walls and floors; they shine in the dark for days.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.035, 0.07, 10, { sides: T.tin, top: 'i_glowpaint_top', bottom: T.tinTop }, { fit: true });
    mb.cylinder(0, 0.07, 0, 0.0365, 0.006, 10, { sides: T.tin, top: 'i_glowpaint_top' }, { fit: true, emissive: 0.55 });
    mb.push().translate(0.035, 0.05, 0).rotateZ(-0.7); mb.box(0, 0.04, 0, 0.012, 0.09, 0.006, 'i_wood'); mb.box(0, 0.0, 0, 0.016, 0.02, 0.008, S_GLOWDUST, { emissive: 0.55 }); mb.pop();
  },
});
tex('i_glowpaint_top', 10, 10, (pc) => { pc.fill(0x22c890); pc.each((x, y) => { if (ph(x, y, 6) < 0.25) pc.set(x, y, 0x7af0c0); if (Math.hypot(x - 4.5, y - 4.5) > 4.4) pc.set(x, y, 0xb8bcc0); }); });
defItem({
  key: 'glow_jar', name: 'Glow Jar', cat: 'light', weight: 0.4, uses: 100, tags: ['light', 'anomalous'],
  light: { range: 3.5, intensity: 0.45, color: 0x9fffe0, drainPerHour: 0.01 },
  desc: 'A jar of stirred glow dust. Dim, cold, and lasts for days. Needs no batteries.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.04, 0.1, 10, S_GLOWDUST, { fit: true, emissive: 0.7 });
    mb.cylinder(0, 0.1, 0, 0.034, 0.012, 10, { sides: T.tin, top: T.tinTop }, { fit: true });
    mb.box(0, 0.03, 0.0405, 0.05, 0.03, 0.002, 'i_glass', { color: 0xe8fff8 });
  },
});
defItem({
  key: 'static_jar', name: 'Jar of Liquid Static', cat: 'anomaly', weight: 0.4, fluidCap: 0.5, startFluid: ['static', 0.5], fluids: ['static'],
  anomaly: 'static', tags: ['fluidcontainer', 'anomalous', 'static'],
  desc: 'It pours like water and sounds like a dead channel. Do not drink. Batteries left in it come out charged.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.042, 0.11, 10, S_STATIC, { fit: false, uvScale: 4, emissive: 0.2 });
    mb.cylinder(0, 0.11, 0, 0.036, 0.016, 10, { sides: T.tin, top: T.tinTop }, { fit: true });
    mb.box(0.026, 0.02, 0.026, 0.006, 0.07, 0.006, 'i_white', { color: 0xf0f4f8 });
  },
});
defItem({
  key: 'memory_shard', name: 'Memory Shard', cat: 'anomaly', weight: 0.02, anomaly: 'memory', lore: 'memory_shard', tags: ['collectible', 'shard', 'anomalous'],
  desc: 'A sliver of crystallised recollection. Hold it to the light and you see a birthday party that may have been yours.',
  model: (mb) => {
    prism(mb, [[-0.02, 0.0], [0.0, 0.015], [0.03, 0.006], [0.02, -0.012], [-0.005, -0.014]], 0, 0.012, S_SHARD, S_SHARD, { emissive: 0.3 });
    mb.push().translate(0.004, 0.012, 0).rotateZ(0.3); prism(mb, [[-0.006, 0.0], [0.0, 0.006], [0.014, 0.0], [0.0, -0.006]], 0, 0.02, S_SHARD, S_SHARD, { emissive: 0.35 }); mb.pop();
  },
});
defItem({
  key: 'broken_pixel', name: 'Broken Pixel', cat: 'anomaly', weight: 0.01, anomaly: 'pixel', tags: ['collectible', 'anomalous'],
  desc: 'A cube of the world that failed to load. It is exactly the wrong colour from every angle.',
  model: (mb) => {
    mb.box(0, 0.01, 0, 0.03, 0.03, 0.03, S_MISSING, { fit: true, emissive: 1.0 });
    mb.box(0.01, 0.0, 0.012, 0.008, 0.008, 0.008, S_MISSING, { fit: true, emissive: 1.0 });
  },
});
defItem({
  key: 'signal_crystal', name: 'Signal Crystal', cat: 'anomaly', weight: 0.3, anomaly: 'signal', tags: ['crystal', 'anomalous'],
  desc: 'Violet quartz that hums when a radio is keyed nearby — louder near exits and the things that guard them.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.04, 0.015, 6, 'stone_rough', { color: 0x8a8a94 });
    for (const [x, z, h, a] of [[0, 0, 0.09, 0], [0.018, 0.01, 0.06, 0.4], [-0.016, 0.012, 0.05, -0.5], [0.004, -0.018, 0.045, 0.3]] as [number, number, number, number][]) {
      mb.push().translate(x, 0.01, z).rotateZ(a * 0.5).rotateX(a * 0.4);
      mb.cylinder(0, 0, 0, 0.011, h * 0.8, 6, S_CRYSTAL, { fit: true, emissive: 0.35 });
      mb.cylinder(0, h * 0.8, 0, 0.011, h * 0.2, 6, S_CRYSTAL, { fit: true, rTop: 0.001, emissive: 0.4 });
      mb.pop();
    }
  },
});
defItem({
  key: 'sim_patch', name: 'Sim Patch', cat: 'anomaly', weight: 0.08, uses: 1, rare: true, anomaly: 'checksum', tags: ['injector', 'anomalous'],
  medical: { type: 'checksum', power: 1 },
  desc: 'An auto-injector of something that is not a liquid. Halts simulation corruption completely — once.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.16, 0.025, 0.06, T.plastic, { color: 0x1c1c24 });
    mb.box(0, 0.025, 0, 0.15, 0.002, 0.05, T.plastic, { color: 0x2a2a34 });
    rodX(mb, -0.06, 0.05, 0.034, 0.009, 0.009, 8, 'i_glass', { color: 0x30c8f0, emissive: 0.5 });
    rodX(mb, 0.05, 0.07, 0.034, 0.009, 0.003, 6, T.steel);
    rodX(mb, -0.075, -0.06, 0.034, 0.011, 0.011, 8, T.white, { color: 0xff6ad8 });
  },
});

// ---------------------------------------------------------------- mission items (placed by story code only)
defItem({
  key: 'keycard_admin', name: 'Admin Keycard', cat: 'key', weight: 0.01, rare: true, tags: ['key', 'keycard', 'mission'],
  desc: 'MERIDIAN INSTITUTE — ADMINISTRATOR — LEVEL 5. Opens the doors that are not supposed to exist.',
  model: (mb) => {
    slab(mb, 0.085, 0.002, 0.055, D_KEYCARD, T.white, 0xf2f2ee, { rot: 0.3 });
    mb.push().rotateY(0.3); mb.box(-0.05, 0, 0, 0.02, 0.002, 0.01, T.plastic, { color: 0x2a2a2a }); mb.pop();
  },
});
defItem({
  key: 'data_drive', name: 'Data Drive', cat: 'anomaly', weight: 0.05, tags: ['data', 'mission', 'electronics'],
  desc: 'A rugged drive labelled in marker: "SNAPSHOT — DO NOT RESTORE". Something on it is still running.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.09, 0.016, 0.05, T.plastic, { color: 0xe86a1a });
    mb.flat(0, 0.0161, 0, 0.08, 0.044, D_DRIVE, { rot: Math.PI / 2 });
    mb.box(0.054, 0.004, 0, 0.018, 0.008, 0.016, 'chrome');
    mb.box(-0.03, 0.016, 0.015, 0.004, 0.002, 0.004, T.white, { color: 0x4af06a, emissive: 1.5 });
  },
});
defItem({
  key: 'fuse_special', name: 'Master Fuse', cat: 'key', weight: 0.4, rare: true, tags: ['fuse_master', 'mission'],
  desc: 'An industrial cartridge fuse rated for a load nothing in this building should draw. The breaker room is waiting for it.',
  model: (mb) => {
    rodX(mb, -0.06, 0.06, 0.025, 0.022, 0.022, 10, D_MFUSE, { fit: true });
    for (const x of [-0.08, 0.06]) rodX(mb, x, x + 0.02, 0.025, 0.025, 0.025, 10, 'metal_brass');
    for (const x of [-0.095, 0.08]) mb.box(x + 0.0075, 0.015, 0, 0.015, 0.02, 0.03, 'metal_brass');
    mb.box(0, 0.047, 0, 0.03, 0.002, 0.012, T.white, { color: 0x6af0ff, emissive: 0.8 });
  },
});
defItem({
  key: 'exit_code_fragment', name: 'Exit Code Fragment', cat: 'key', weight: 0.005, rare: true, tags: ['exitcode', 'mission'], noStack: true,
  desc: 'A strip of paper with a row of glowing digits. One part of three. The digits rearrange when nobody is looking.',
  model: (mb) => slab(mb, 0.12, 0.002, 0.04, D_EXITCODE, T.white, 0xf6f2e6, { rot: -0.2, emissive: 0.6 }),
});

// ---------------------------------------------------------------- lore objects
defItem({
  key: 'tape_cassette', name: 'Cassette Tape', cat: 'lore', weight: 0.05, lore: 'tape_cassette', tags: ['tape_lore', 'lore'], noStack: true,
  desc: 'Label: "SESSION 12 — DO NOT LISTEN ALONE". Needs a cassette player.',
  literature: { text: '[hiss] ...okay it is recording. My name is— [static] —we have been down here eleven days. The hum changes pitch near the exits. If you can hear it go up, you are close. If it goes silent, run. [long pause] I think I hear it now.' },
  model: (mb) => slab(mb, 0.1, 0.012, 0.064, D_CASSETTE, T.black, 0x2a2a2e, { rot: 0.25 }),
});
defItem({
  key: 'vhs_tape', name: 'VHS Tape', cat: 'lore', weight: 0.25, lore: 'vhs_tape', tags: ['vhs', 'lore'], noStack: true,
  desc: 'Handwritten label: "ORIENTATION — 1994". Needs a working TV and player.',
  literature: { text: '[Footage of a beige corridor. A cheerful voice-over:] "Welcome, instance! Meridian\'s Continuity Program keeps you safe, rested and observed. The rooms will rearrange for your comfort." [The camera turns. Something tall is standing at the end of the corridor. The tape skips.]' },
  model: (mb) => slab(mb, 0.19, 0.026, 0.105, D_VHS, T.black, 0x1c1c20, { rot: -0.3 }),
});
defItem({
  key: 'floppy_disk', name: 'Floppy Disk', cat: 'lore', weight: 0.02, lore: 'floppy_disk', tags: ['floppy', 'lore', 'data'], noStack: true,
  desc: '3.5" disk, label in red pen: "seed list — DON\'T LOSE".',
  literature: { text: 'SEEDLIST.TXT\nSECTOR-YELLOW  0x5EED0  stable\nPOOL HALL      0x0A11   stable\nNIGHT SUBURB   0x0DD5   unstable — do not stay past 03:00\nEXIT           0x?????  [three fragments required]' },
  model: (mb) => slab(mb, 0.09, 0.004, 0.09, D_FLOPPY, T.plastic, 0x2a4a8a, { rot: 0.15 }),
});
defItem({
  key: 'photo_old', name: 'Old Photograph', cat: 'lore', weight: 0.01, lore: 'photo_old', tags: ['photo', 'lore'], noStack: true,
  desc: 'An instant photo of this exact room. Someone is standing in the doorway. The date on the back is tomorrow.',
  model: (mb) => slab(mb, 0.088, 0.002, 0.107, D_PHOTO, T.white, 0xf2ecdc, { rot: -0.35 }),
});
defItem({
  key: 'note', name: 'Note', cat: 'lore', weight: 0.005, lore: 'note', tags: ['note', 'lore', 'paper'], noStack: true,
  desc: 'A torn page, written in a hurry.',
  literature: { text: 'If the lights start flickering in sequence, get to a room with a door and close it. Count to three hundred. Do not open it for anyone who knows your name.' },
  model: (mb) => slab(mb, 0.1, 0.002, 0.12, D_NOTE, T.white, 0xf2ecd2, { rot: 0.5 }),
});
defItem({
  key: 'id_badge', name: 'Meridian ID Badge', cat: 'lore', weight: 0.02, lore: 'id_badge', tags: ['lore', 'badge'], noStack: true,
  desc: 'Staff badge for "Instance Supervisor". The photo is you. You have never worked here. Have you?',
  model: (mb) => {
    slab(mb, 0.055, 0.003, 0.085, D_IDBADGE, T.white, 0xf2f2ee, { rot: 0.2 });
    mb.push().rotateY(0.2); mb.box(0, 0.003, -0.05, 0.012, 0.003, 0.02, 'chrome'); mb.box(0, 0.001, -0.1, 0.012, 0.002, 0.09, T.white, { color: 0x2a5a9a }); mb.pop();
  },
});
defItem({
  key: 'specimen_jar', name: 'Specimen Jar', cat: 'lore', weight: 0.6, lore: 'specimen_jar', tags: ['lore', 'lab', 'anomalous'],
  desc: 'Formaldehyde and a single eye that tracks you. Label: "ENTITY 0x2A — ocular, still responsive".',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.045, 0.12, 10, 'i_glass', { color: 0xd8ead8, fit: true });
    mb.cylinder(0, 0.02, 0, 0.0455, 0.025, 10, L_SPECIMEN, { fit: true, caps: false });
    mb.sphere(0, 0.07, 0, 0.022, 8, 5, D_EYE, { fit: true });
    mb.cylinder(0, 0.12, 0, 0.042, 0.015, 10, T.black, { fit: true });
  },
});

void K; void rp; void dk; void lt; void txtC; void stamp; void stampC; void band; void rodZ; void bayer;
