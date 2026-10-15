// Items stream — THE CONTRACT: what the Remittance Programme issues its
// debtors at intake (the BAILIFF band bolted through the wrist, canvas
// slip-ons, a drab issue pack, a ration bar and a water pouch), what is left
// of a band that was cut off, and the passage ticket the depot kiosk prints
// once the debt is cleared. Rules for the band live in src/game/debt/band.ts.
import { defItem } from '../../items/item';
import { tex, decal, T, rp, dk, lt, txt, txtC, stamp, dashes, rodX, ph, MB } from './_kit';

// ---------------------------------------------------------------- textures
const S_BANDSTEEL = tex('i_band_steel', 8, 8, (pc) => {
  const R = rp(0x3a3e46, 6, 0.5);
  pc.each((x, y) => pc.set(x, y, R[2 + ((x + y * 2) % 7 === 0 ? 2 : 0) - (ph(x, y, 61) < 0.1 ? 1 : 0)]));
  pc.hline(0, 7, 0, R[4]);
}, true);
const D_BAND_FACE = decal('i_band_face', 14, 10, (pc) => {
  // the BAILIFF housing: black glass, a red status pip, the stencilled serial and the lens
  pc.fill(0x16181c);
  pc.strokeRect(0, 0, 14, 10, 0x4a4e58);
  pc.hline(1, 12, 1, 0x2a2e36);
  txt(pc, 'BLF', 1, 2, 0xb8c0c8);
  pc.rect(9, 2, 4, 4, 0x0a0c10); pc.set(10, 3, 0x6af0ff); pc.set(11, 4, 0x2a8aa0); // projector lens
  pc.set(2, 8, 0xff2a1a); pc.set(3, 8, 0x8a1a10); // status pip
  dashes(pc, 5, 8, 7, 0x5a606a, 9);
});
const D_BOLT = decal('i_band_bolt', 4, 4, (pc) => { pc.fill(0x8a9098); pc.set(1, 1, 0xd8dce2); pc.hline(0, 3, 2, 0x4a4e56); });
const S_CANVAS = tex('i_issue_canvas', 8, 8, (pc) => {
  const R = rp(0x6a6a48, 5, 0.35);
  pc.each((x, y) => pc.set(x, y, R[2 + ((x + y) % 2 === 0 ? 0 : (ph(x, y, 71) < 0.3 ? 1 : -1))]));
}, true);
const D_PACK_FRONT = decal('i_issue_pack_front', 12, 12, (pc) => {
  const R = rp(0x6a6a48, 5, 0.35);
  pc.each((x, y) => pc.set(x, y, R[2 + ((x + y) % 2 === 0 ? 0 : 1)]));
  pc.strokeRect(0, 0, 12, 12, R[0]);
  txtC(pc, 'D-', 6, 2, 0x1a1a10);
  pc.rect(2, 8, 8, 2, 0xd8b02a); for (let x = 2; x < 10; x += 2) pc.set(x, 8, 0x1a1a10); // hazard tab
});
const D_SLIPON = decal('i_slipon_top', 10, 16, (pc) => {
  pc.fill(0xd8d2c0);
  pc.each((x, y) => { if ((x + y) % 2 === 0 && ph(x, y, 5) < 0.4) pc.set(x, y, 0xc8c2b0); });
  pc.rect(2, 3, 6, 6, 0x9a9282); pc.rect(3, 4, 4, 4, 0x2a2622); // the opening
  for (let x = 1; x < 9; x++) { pc.set(x, 12, 0xb8b2a0); pc.set(x, 15, 0xe8e2d2); }
  pc.strokeRect(0, 0, 10, 16, 0xa8a290);
});
const D_RATION = decal('i_ration_bar', 16, 8, (pc) => {
  pc.fill(0x8a8a6a);
  pc.rect(0, 0, 16, 2, 0x5a5a42); pc.rect(0, 6, 16, 2, 0x5a5a42);
  txt(pc, 'RTN', 1, 2, 0x1a1a10);
  pc.rect(12, 2, 3, 4, 0xd8b02a); pc.set(13, 3, 0x1a1a10); pc.set(13, 4, 0x1a1a10);
});
const D_POUCH = decal('i_water_pouch', 12, 14, (pc) => {
  const R = rp(0xb8c0c8, 5, 0.45);
  pc.each((x, y) => pc.set(x, y, R[2 + ((x * 2 + y) % 9 === 0 ? 2 : 0) - (ph(x >> 1, y >> 1, 11) < 0.2 ? 1 : 0)]));
  pc.rect(1, 4, 10, 6, 0xf2f2ee);
  txtC(pc, 'H2O', 6, 5, 0x2a5aa8);
  pc.hline(1, 10, 11, 0x2a5aa8);
  pc.rect(4, 0, 4, 2, 0x2a5aa8);
});
const D_TICKET = decal('i_passage_ticket', 16, 10, (pc) => {
  pc.fill(0xece2c8);
  pc.each((x, y) => { if (ph(x, y, 91) < 0.06) pc.set(x, y, 0xddd2b4); });
  pc.rect(0, 0, 16, 2, 0x1a1a1e);
  txt(pc, 'ADMIT', 1, 3, 0x1a1a1e);
  txt(pc, '1', 13, 3, 0xb8302a);
  dashes(pc, 1, 8, 10, 0x4a4a52, 3);
  for (let y = 0; y < 10; y += 2) pc.set(11, y, 0x8a8270); // perforation
  pc.set(14, 8, 0xb8302a); pc.set(15, 8, 0xb8302a);
});

// ---------------------------------------------------------------- the band
function bandModel(mb: MB, cut = false) {
  // a thick hinged steel cuff (lying on its side) with the BAILIFF housing on top and the bolt through
  const segs = 12, r = 0.034;
  for (let i = 0; i < segs; i++) {
    if (cut && (i === 0 || i === 1)) continue;
    const a = (i / segs) * Math.PI * 2, l = (2 * Math.PI * r) / segs + 0.002;
    mb.push().translate(Math.cos(a) * r, 0, Math.sin(a) * r).rotateY(-a + Math.PI / 2);
    mb.box(0, 0, 0, l, 0.03, 0.009, S_BANDSTEEL);
    mb.pop();
  }
  mb.box(0, 0.0, r + 0.006, 0.05, 0.034, 0.02, { all: S_BANDSTEEL, south: D_BAND_FACE, top: S_BANDSTEEL }, { fit: { south: true } });
  mb.box(0.018, 0.034, r + 0.006, 0.008, 0.004, 0.008, 'led_red', { emissive: cut ? 0 : 1.5 });
  // the bolt that goes through the wrist, with a crust of old blood on it
  rodX(mb, -r - 0.012, r + 0.012, 0.015, 0.0035, 0.0035, 6, cut ? 'metal_rusty' : 'chrome');
  mb.box(-r - 0.012, 0.015, 0, 0.004, 0.012, 0.012, D_BOLT, { fit: true });
  mb.box(r + 0.012, 0.015, 0, 0.004, 0.012, 0.012, D_BOLT, { fit: true });
  mb.box(-r + 0.004, 0.009, 0.0, 0.006, 0.012, 0.01, T.white, { color: 0x6a1a14 });
  if (cut) { mb.box(r * 0.8, 0.0, r * 0.55, 0.012, 0.03, 0.01, 'metal_rusty'); mb.box(0.0, 0.0, -r, 0.02, 0.006, 0.006, 'wire'); }
}

defItem({
  key: 'bailiff_band', name: 'BAILIFF Band', cat: 'electronics', weight: 0.35, value: 0, noStack: true,
  tags: ['band', 'bailiff', 'no_deposit', 'monitor', 'watch'],
  desc: 'Remittance Programme debtor monitor, model BLF-7. Bolted through the wrist between the bones. It tracks your vitals, your location and what you owe, projects your handler, and it will not come off. Tampering, absconding or approaching the Seam triggers a warning, then the charge.',
  clothing: { slot: 'wrist', covers: [], insulation: 0, wind: 0, bite: 4, scratch: 4, water: 1, look: { part: 'hands', tex: 'watch', color: 0x23262b } },
  grid: [1, 1],
  model: (mb) => bandModel(mb),
});
defItem({
  key: 'bailiff_band_cut', name: 'Severed BAILIFF Band', cat: 'electronics', weight: 0.3, value: 0, noStack: true,
  tags: ['band', 'no_deposit', 'scrap'],
  desc: 'The band, cut open at the hinge, the bolt pulled. Its pip is dark. Somewhere a ledger flagged you as ABSCONDED. It is still warm.',
  grid: [1, 1],
  model: (mb) => bandModel(mb, true),
});

// ---------------------------------------------------------------- intake kit
defItem({
  key: 'canvas_slipons', name: 'Canvas Slip-Ons', cat: 'clothing', weight: 0.5, value: 4, noStack: true,
  desc: 'Remittance issue. Off-white canvas, no laces (laces are a ligature risk), soles thin enough to feel every staple in the carpet.',
  clothing: { slot: 'shoes', covers: ['foot_l', 'foot_r'], insulation: 0.05, wind: 0.05, bite: 2, scratch: 4, water: 0.05, look: { part: 'feet', tex: 'c_shoes_sneaker', color: 0xd8d2c0 }, speed: 0.99, rip: 'rag', ripCount: 1 },
  grid: [2, 1],
  model: (mb) => {
    for (const s of [-1, 1]) {
      mb.push().translate(s * 0.06, 0, 0).rotateY(s * 0.08);
      mb.box(0, 0, 0, 0.09, 0.016, 0.26, T.rubber, { color: 0xe8e4da });
      mb.box(0, 0.016, -0.01, 0.084, 0.045, 0.22, { all: S_CANVAS, top: D_SLIPON }, { fit: { top: true }, color: 0xf2eee0 });
      mb.wedge(0, 0.016, 0.11, 0.084, 0.04, 0.045, 0.02, S_CANVAS, { color: 0xf2eee0 });
      mb.box(0, 0.002, 0.13, 0.092, 0.02, 0.006, T.rubber, { color: 0xe8e4da });
      mb.pop();
    }
  },
});
defItem({
  key: 'issue_pack', name: 'Issue Pack', cat: 'bag', weight: 0.5, value: 6, noStack: true, tags: ['bag', 'backpack'],
  desc: 'A drab canvas daypack with your debtor number stencilled on the flap. Small on purpose: the Programme wants you carrying valuables to the hopper, not hoarding.',
  bag: { capacity: 8, reduction: 0.2, slot: 'back' },
  clothing: { slot: 'back', covers: [], insulation: 0, wind: 0, bite: 0, scratch: 0, water: 0.1, look: { part: 'back', tex: 'c_backpack', color: 0x5e5e40 } },
  grid: [2, 2],
  model: (mb) => {
    mb.box(0, 0, 0, 0.26, 0.3, 0.13, S_CANVAS, { uvScale: 3 });
    rodX(mb, -0.13, 0.13, 0.3, 0.065, 0.065, 8, S_CANVAS, { uvScale: 3 });
    mb.box(0, 0.12, 0.066, 0.24, 0.2, 0.012, D_PACK_FRONT, { fit: true });
    for (const s of [-1, 1]) { mb.box(s * 0.07, 0.12, 0.074, 0.025, 0.012, 0.006, 'metal_grey'); mb.box(s * 0.08, 0.02, -0.075, 0.04, 0.26, 0.02, S_CANVAS, { color: 0x4a4a32 }); }
  },
});
defItem({
  key: 'ration_bar', name: 'Ration Bar', cat: 'food', weight: 0.12, value: 2,
  food: { hunger: 14, thirst: -4, calories: 400, unhappy: 3, ingredient: 'grain' },
  desc: 'Remittance issue. Compressed something, flavoured as "Savoury". Four hundred calories and a lingering taste of cardboard and pennies. Earn the next one.',
  grid: [1, 1],
  model: (mb) => { mb.box(0, 0, 0, 0.12, 0.022, 0.05, { all: T.foil, top: D_RATION }, { fit: { top: true }, color: 0xb8b896 }); mb.box(0.062, 0.004, 0, 0.006, 0.014, 0.048, T.foil, { color: 0x8a8a6a }); },
});
defItem({
  key: 'water_pouch', name: 'Water Pouch', cat: 'drink', weight: 0.02, value: 1, fluidCap: 0.35, startFluid: ['water', 0.35],
  tags: ['fluidcontainer'],
  desc: 'A foil pouch of issue water with a screw spout. Three hundred and fifty millilitres. Refillable, if you can find a tap that runs clean.',
  grid: [1, 1],
  model: (mb) => {
    mb.box(0, 0, 0, 0.1, 0.02, 0.13, { all: T.foil, top: D_POUCH }, { fit: { top: true } });
    mb.wedge(0, 0.0, -0.068, 0.1, 0.012, 0.016, 0.004, T.foil);
    mb.cylinder(0, 0.018, -0.06, 0.009, 0.014, 6, T.cap, { color: 0x2a5aa8 });
  },
});
defItem({
  key: 'passage_ticket', name: 'Passage Ticket', cat: 'misc', weight: 0.005, value: 0, noStack: true, tags: ['ticket', 'no_deposit', 'paper'],
  desc: 'A stiff card ticket printed by the depot kiosk. ADMIT ONE. The destination line is printed, then printed over, then printed over again until it is a black bar.',
  grid: [1, 1],
  model: (mb) => { mb.box(0, 0, 0, 0.09, 0.0015, 0.055, { all: T.card, top: D_TICKET }, { fit: { top: true } }); },
});

void dk; void lt; void stamp;
