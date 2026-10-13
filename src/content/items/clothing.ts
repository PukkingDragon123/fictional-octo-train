// Items stream — CLOTHING. Slots (layer order on the torso: tshirt < shirt <
// sweater < jacket): tshirt, shirt, sweater, jacket, fullsuit, pants, socks,
// shoes, hands, hat, eyes, mask, neck. `look` drives the character mesh:
// jacket-slot items map to the rig's torsoOuter; legs-kind comes from the tex
// (c_shorts → shorts, c_skirt → skirt, else pants); fullsuit items should
// paint both torso and legs with their tex. Models are folded garments (fold
// decals are neutral grey and tinted by the garment colour unless noted).
import { defItem, BodyPart, ClothingProps } from '../../items/item';
import { tex, decal, T, K, rp, dk, lt, txt, txtC, stamp, dashes, band, slab, folded, rodX, rodZ, prism, ph, bayer, mixHex, MB, PixelCanvas } from './_kit';

// ---------------------------------------------------------------- body part groups
const TORSO: BodyPart[] = ['torso_u', 'torso_l'];
const UARMS: BodyPart[] = ['uarm_l', 'uarm_r'];
const FARMS: BodyPart[] = ['farm_l', 'farm_r'];
const ARMS: BodyPart[] = [...UARMS, ...FARMS];
const LEGS: BodyPart[] = ['groin', 'thigh_l', 'thigh_r', 'shin_l', 'shin_r'];
const UPPER_LEGS: BodyPart[] = ['groin', 'thigh_l', 'thigh_r'];
const FEET: BodyPart[] = ['foot_l', 'foot_r'];
const HANDS: BodyPart[] = ['hand_l', 'hand_r'];

// ---------------------------------------------------------------- fold decal painters (neutral greys → tinted)
const N = { base: 0xd8d8d6, mid: 0xbcbcba, dark: 0x8e8e8c, deep: 0x6a6a68, hi: 0xf2f2f0 };
function foldBase(pc: PixelCanvas) {
  pc.fill(N.base);
  pc.each((x, y) => { if (ph(x >> 1, y >> 1, 5) < 0.12) pc.set(x, y, 0xcfcfcd); });
  pc.hline(0, pc.w - 1, pc.h - 1, N.mid);
  pc.vline(pc.w - 1, 0, pc.h - 1, N.mid);
  pc.hline(0, pc.w - 1, 0, N.hi);
}
const sleeves = (pc: PixelCanvas) => { pc.vline(3, 2, pc.h - 2, N.mid); pc.vline(pc.w - 4, 2, pc.h - 2, N.mid); pc.vline(4, 2, pc.h - 2, N.hi); };
const F_TEE = tex('i_fold_tee', 16, 14, (pc) => {
  foldBase(pc); sleeves(pc);
  for (let x = 5; x <= 10; x++) { const y = Math.round(2.6 - Math.abs(x - 7.5) * 0.5); pc.set(x, y, N.dark); pc.set(x, y - 1, N.mid); }
  pc.rect(6, 0, 4, 1, N.dark);
  for (let x = 1; x < 15; x += 2) pc.set(x, 12, N.hi);
});
const F_TEE_STRIPE = tex('i_fold_tee_stripe', 16, 14, (pc) => {
  foldBase(pc);
  for (let y = 3; y < 13; y += 3) { pc.hline(0, 15, y, N.deep); pc.hline(0, 15, y + 1, N.dark); }
  sleeves(pc);
  for (let x = 5; x <= 10; x++) { const y = Math.round(2.6 - Math.abs(x - 7.5) * 0.5); pc.set(x, y, N.dark); }
  pc.rect(6, 0, 4, 1, N.dark);
});
const F_SHIRT = tex('i_fold_shirt', 16, 14, (pc) => {
  foldBase(pc); sleeves(pc);
  stamp(pc, 4, 0, ['hhh.....hhh', '.hhh...hhh.', '..dhh.hhd..'], { h: N.hi, d: N.dark });
  pc.vline(8, 3, 13, N.mid); for (let y = 4; y < 13; y += 3) pc.set(8, y, N.deep);
  pc.strokeRect(10, 5, 3, 3, N.mid);
});
const F_SWEATER = tex('i_fold_sweater', 16, 14, (pc) => {
  pc.each((x, y) => pc.set(x, y, x % 2 === 0 ? N.base : ((y + (x >> 1)) % 2 === 0 ? 0xcacac8 : N.mid)));
  pc.rect(0, 11, 16, 3, N.mid); for (let x = 0; x < 16; x += 2) pc.vline(x, 11, 13, N.dark);
  for (let x = 5; x <= 10; x++) { const y = Math.round(2.6 - Math.abs(x - 7.5) * 0.5); pc.set(x, y, N.dark); pc.set(x, y + 1, N.mid); }
  pc.rect(6, 0, 4, 1, N.deep);
  pc.vline(3, 1, 10, N.dark); pc.vline(12, 1, 10, N.dark);
});
const F_HOODIE = tex('i_fold_hoodie', 16, 16, (pc) => {
  foldBase(pc); sleeves(pc);
  for (let x = 3; x <= 12; x++) { const y = Math.round(4 - Math.abs(x - 7.5) * 0.45); for (let k = 0; k <= y; k++) pc.set(x, k, k === y ? N.dark : N.mid); }
  pc.vline(6, 4, 8, N.hi); pc.vline(9, 4, 8, N.hi); pc.set(6, 9, N.deep); pc.set(9, 9, N.deep);
  pc.strokeRect(4, 10, 8, 4, N.dark); pc.hline(5, 10, 10, N.mid);
});
const F_JACKET = tex('i_fold_jacket', 16, 16, (pc) => {
  foldBase(pc); sleeves(pc);
  pc.rect(3, 0, 10, 3, N.mid); pc.hline(3, 12, 3, N.dark);
  pc.vline(8, 3, 15, N.hi); pc.vline(7, 3, 15, N.dark);
  pc.line(4, 9, 6, 11, N.dark); pc.line(11, 9, 9, 11, N.dark);
});
const F_DENIMJ = tex('i_fold_denimjacket', 16, 16, (pc) => {
  const R = rp(0x4a6a9a, 5, 0.35);
  pc.each((x, y) => pc.set(x, y, R[2 + ((x + y) % 3 === 0 ? 1 : 0) - ((x - y + 32) % 5 === 0 ? 1 : 0)]));
  pc.rect(3, 0, 10, 3, R[1]); pc.hline(3, 12, 3, R[0]);
  pc.vline(8, 3, 15, R[0]);
  for (let y = 5; y < 16; y += 3) pc.set(9, y, 0xc8803a);
  pc.strokeRect(3, 5, 4, 3, 0xc8803a); pc.strokeRect(10, 5, 4, 3, 0xc8803a);
  pc.set(5, 6, 0xd8a050); pc.set(12, 6, 0xd8a050);
  pc.vline(3, 9, 15, R[1]); pc.vline(12, 9, 15, R[1]);
});
const F_LEATHER = tex('i_fold_leather', 16, 16, (pc) => {
  const R = rp(0x3a2a22, 5, 0.45);
  pc.each((x, y) => pc.set(x, y, R[2 + (ph(x >> 1, y >> 1, 4) < 0.25 ? 1 : 0)]));
  for (let i = 0; i < 6; i++) pc.set(2 + i * 2, 4 + (i % 3), R[4]);
  pc.rect(2, 0, 12, 3, R[1]); pc.set(2, 3, R[0]); pc.set(13, 3, R[0]);
  pc.line(10, 3, 6, 15, 0xc8ccd0); pc.line(11, 3, 7, 15, 0x8a8e94);
  pc.hline(2, 5, 8, 0xc8ccd0); pc.hline(10, 13, 10, 0xc8ccd0);
});
const F_COAT = tex('i_fold_coat', 16, 16, (pc) => {
  foldBase(pc);
  for (let y = 4; y < 16; y += 3) { pc.hline(0, 15, y, N.dark); pc.hline(0, 15, y + 1, N.hi); }
  pc.rect(2, 0, 12, 4, 0xe8e2d4); pc.each((x, y) => { if (y < 4 && x >= 2 && x < 14 && ph(x, y, 9) < 0.35) pc.set(x, y, 0xc8bca4); });
  pc.vline(8, 4, 15, N.deep); sleeves(pc);
});
const F_HIVIZ = tex('i_fold_hiviz', 16, 14, (pc) => {
  pc.fill(0xd8f02a); pc.each((x, y) => { if (ph(x >> 1, y >> 1, 3) < 0.1) pc.set(x, y, 0xc8e020); });
  for (const y of [4, 9]) { pc.hline(0, 15, y, 0xd8dce0); pc.hline(0, 15, y + 1, 0xa8acb0); }
  pc.vline(4, 0, 13, 0xd8dce0); pc.vline(11, 0, 13, 0xd8dce0);
  pc.hline(0, 15, 13, 0xa8c020);
});
const F_LABCOAT = tex('i_fold_labcoat', 16, 18, (pc) => {
  foldBase(pc);
  pc.line(4, 0, 8, 7, N.dark); pc.line(11, 0, 8, 7, N.dark); pc.line(5, 0, 8, 6, N.hi);
  pc.vline(8, 7, 17, N.mid); for (const y of [9, 12, 15]) pc.set(9, y, N.deep);
  pc.strokeRect(11, 9, 3, 3, N.mid); pc.vline(12, 7, 9, 0x2a5aa8); pc.set(12, 7, 0x1a3a7a);
  sleeves(pc);
});
const F_SCRUBS = tex('i_fold_scrubs', 16, 14, (pc) => {
  foldBase(pc); sleeves(pc);
  pc.line(5, 0, 8, 4, N.dark); pc.line(10, 0, 8, 4, N.dark);
  pc.strokeRect(10, 6, 3, 3, N.mid);
});
const F_PANTS = tex('i_fold_pants', 12, 18, (pc) => {
  foldBase(pc);
  pc.rect(0, 0, 12, 3, N.mid); pc.hline(0, 11, 3, N.dark);
  for (const x of [2, 6, 9]) pc.vline(x, 0, 3, N.dark);
  pc.vline(6, 4, 17, N.dark); pc.vline(7, 4, 17, N.hi);
  pc.line(1, 4, 3, 7, N.dark); pc.line(10, 4, 8, 7, N.dark);
});
const F_JEANS = tex('i_fold_jeans', 12, 18, (pc) => {
  const R = rp(0x3a5a8a, 5, 0.35);
  pc.each((x, y) => pc.set(x, y, R[2 + ((x + y) % 3 === 0 ? 1 : 0) - ((x * 2 + y) % 7 === 0 ? 1 : 0)]));
  pc.rect(0, 0, 12, 3, R[1]); for (let x = 0; x < 12; x += 2) pc.set(x, 2, 0xc8803a);
  for (const x of [2, 9]) pc.vline(x, 0, 3, R[0]);
  pc.rect(8, 4, 3, 2, 0x8a5a3a);
  for (let x = 1; x < 6; x++) pc.set(x, 7 + Math.round(Math.abs(x - 3.2) * 0.6), 0xc8803a);
  pc.vline(6, 4, 17, R[0]); pc.set(1, 4, 0xd8a050); pc.set(10, 4, 0xd8a050);
  for (let y = 4; y < 18; y += 2) pc.set(6, y, 0xc8803a);
});
const F_SHORTS = tex('i_fold_shorts', 12, 10, (pc) => {
  foldBase(pc);
  pc.rect(0, 0, 12, 3, N.mid); pc.hline(0, 11, 3, N.dark);
  for (const x of [2, 9]) pc.vline(x, 0, 3, N.dark);
  pc.vline(6, 4, 9, N.dark); pc.hline(0, 11, 8, N.mid);
});
const F_SWEATS = tex('i_fold_sweatpants', 12, 18, (pc) => {
  foldBase(pc);
  pc.rect(0, 0, 12, 3, N.mid); for (let x = 0; x < 12; x += 2) pc.vline(x, 0, 2, N.dark);
  pc.vline(5, 3, 6, N.hi); pc.vline(7, 3, 6, N.hi);
  pc.vline(6, 4, 14, N.mid);
  pc.rect(0, 15, 12, 3, N.mid); for (let x = 0; x < 12; x += 2) pc.vline(x, 15, 17, N.dark);
});
const F_SKIRT = tex('i_fold_skirt', 14, 12, (pc) => {
  foldBase(pc);
  pc.rect(0, 0, 14, 2, N.dark);
  for (let x = 1; x < 14; x += 3) pc.line(x, 2, x + (x < 7 ? -1 : 1), 11, N.mid);
});
const F_PAJAMA = tex('i_fold_pajama', 16, 14, (pc) => {
  foldBase(pc);
  pc.each((x, y) => { if ((x + y * 3) % 7 === 0 && y > 2) pc.set(x, y, N.dark); });
  pc.line(5, 0, 8, 4, N.deep); pc.line(10, 0, 8, 4, N.deep);
  pc.hline(0, 15, 13, N.dark); sleeves(pc);
  for (const y of [6, 9, 12]) pc.set(8, y, N.hi);
});
const F_RAINCOAT = tex('i_fold_raincoat', 16, 16, (pc) => {
  pc.fill(N.base);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((x + y) % 9 === 0 || (x + y) % 9 === 1) pc.set(x, y, N.hi);
  pc.rect(3, 0, 10, 3, N.mid); pc.hline(3, 12, 3, N.dark);
  pc.vline(8, 4, 15, N.dark); for (const y of [6, 10, 14]) pc.set(9, y, N.deep);
  sleeves(pc);
});
const F_COVERALL = tex('i_fold_coverall', 16, 18, (pc) => {
  foldBase(pc); sleeves(pc);
  pc.rect(3, 0, 10, 2, N.mid);
  pc.vline(8, 2, 17, N.hi); pc.vline(7, 2, 17, N.dark);
  pc.rect(10, 4, 4, 2, 0xf2f2f0); pc.hline(10, 13, 5, 0xc8302a);
  pc.strokeRect(2, 10, 4, 3, N.mid); pc.strokeRect(10, 10, 4, 3, N.mid);
});
const F_UNIFORM = tex('i_fold_uniform', 16, 14, (pc) => {
  const R = rp(0x2a3048, 5, 0.4);
  pc.each((x, y) => pc.set(x, y, R[2 + (ph(x >> 1, y >> 1, 6) < 0.15 ? 1 : 0)]));
  stamp(pc, 4, 0, ['hhh.....hhh', '.hhh...hhh.'], { h: R[3] });
  pc.vline(8, 2, 13, R[1]); for (let y = 4; y < 13; y += 3) pc.set(8, y, 0xc8ccd0);
  stamp(pc, 10, 4, ['.y.', 'yyy', '.y.'], { y: 0xe0b84a });
  pc.strokeRect(3, 5, 4, 3, R[3]);
  pc.rect(1, 1, 2, 2, 0xc8a050);
  pc.vline(3, 2, 13, R[1]); pc.vline(12, 2, 13, R[1]);
});
const F_SCARF = tex('i_scarf', 16, 6, (pc) => {
  pc.fill(N.base);
  for (let x = 0; x < 16; x += 4) { pc.vline(x, 0, 5, N.dark); pc.vline(x + 1, 0, 5, N.mid); }
  pc.hline(0, 15, 5, N.mid);
}, true);
const S_SOCK = tex('i_sock', 8, 8, (pc) => {
  pc.fill(0xf0f0ec); for (let x = 0; x < 8; x += 2) pc.vline(x, 0, 7, 0xd8d8d4);
  pc.hline(0, 7, 1, 0xc8302a); pc.hline(0, 7, 3, 0x2a5aa8);
}, true);
const S_GLOVE = tex('i_glove', 8, 8, (pc) => { pc.fill(N.base); pc.each((x, y) => { if (ph(x, y, 2) < 0.15) pc.set(x, y, N.mid); }); pc.hline(0, 7, 7, N.dark); }, true);
const D_SNEAKER = tex('i_sneaker_side', 16, 6, (pc) => {
  pc.fill(0xf4f2ec); pc.hline(0, 15, 5, 0xd8d6cc);
  for (let x = 2; x < 13; x++) pc.set(x, 3 - Math.round((x - 2) * 0.18), 0x2a5aa8); for (let x = 3; x < 12; x++) pc.set(x, 4 - Math.round((x - 3) * 0.18), 0x2a5aa8);
  pc.set(14, 1, 0xc8302a);
});
const D_LACES = tex('i_laces', 6, 10, (pc) => { pc.fill(0xf4f2ec); for (let y = 1; y < 10; y += 2) pc.hline(1, 4, y, 0xd8d8d0); pc.vline(0, 0, 9, 0xb8b8b0); pc.vline(5, 0, 9, 0xb8b8b0); });
const S_FUZZ = tex('i_fuzz', 8, 8, (pc) => pc.each((x, y) => pc.set(x, y, ph(x, y, 13) < 0.3 ? N.hi : ph(x, y, 14) < 0.2 ? N.mid : N.base)), true);
const D_LENS = tex('i_lens_glass', 6, 4, (pc) => { pc.fill(0xc8dce8); pc.set(1, 1, 0xffffff); pc.set(2, 1, 0xf2f8ff); pc.hline(0, 5, 3, 0x9ab4c8); });
const D_LENS_DARK = tex('i_lens_dark', 6, 4, (pc) => { pc.fill(0x1c2028); pc.set(1, 1, 0x5a6878); pc.set(2, 1, 0x3a4450); });
const S_CAP_PANEL = tex('i_cap_panel', 12, 6, (pc) => { pc.fill(N.base); for (let x = 0; x < 12; x += 3) pc.vline(x, 0, 5, N.mid); pc.hline(0, 11, 5, N.dark); pc.set(1, 1, N.hi); }, true);
const S_VENTS = tex('i_helmet_vents', 12, 6, (pc) => { pc.fill(N.base); for (let x = 1; x < 12; x += 3) { pc.vline(x, 1, 3, 0x2a2a2e); pc.vline(x + 1, 1, 3, 0x3a3a40); } pc.hline(0, 11, 5, N.dark); }, true);
const D_MASK = tex('i_mask_pleats', 12, 8, (pc) => { pc.fill(N.base); for (const y of [2, 4, 6]) pc.hline(0, 11, y, N.mid); pc.hline(0, 11, 0, N.dark); pc.hline(0, 11, 7, N.dark); pc.hline(3, 8, 1, N.hi); });

// ---------------------------------------------------------------- model helpers
/** low-poly dome (hemisphere) built from stacked frustums */
export function dome(mb: MB, x: number, y: number, z: number, r: number, h: number, segs: number, t: string, o: { color?: number; sx?: number; sz?: number; fit?: boolean } = {}) {
  const ang = [0, 0.5, 0.95, 1.35, Math.PI / 2];
  mb.push().translate(x, y, z).scale(o.sx ?? 1, 1, o.sz ?? 1);
  for (let i = 0; i < ang.length - 1; i++) {
    const r0 = r * Math.cos(ang[i]), r1 = r * Math.cos(ang[i + 1]);
    const y0 = h * Math.sin(ang[i]), y1 = h * Math.sin(ang[i + 1]);
    mb.cylinder(0, y0, 0, r0, y1 - y0, segs, t, { color: o.color, rTop: Math.max(0.0001, r1), caps: i === ang.length - 2, fit: o.fit ?? true });
  }
  mb.pop();
}
/** a pair of shoes; build(mb) builds ONE shoe pointing +x centred at origin */
function pair(mb: MB, build: (mb: MB) => void, gap = 0.06) {
  mb.push().translate(0, 0, -gap).rotateY(0.12); build(mb); mb.pop();
  mb.push().translate(0.02, 0, gap).rotateY(-0.05); build(mb); mb.pop();
}
function shoe(mb: MB, o: { len: number; w: number; sole: number; soleC: number; upperH: number; upper: string; upperC: number; side?: string; top?: string; shaft?: number }) {
  const { len, w } = o;
  mb.box(0, 0, 0, len, o.sole, w, T.rubber, { color: o.soleC });
  mb.box(-len * 0.12, o.sole, 0, len * 0.76, o.upperH, w * 0.92, { all: o.upper, north: o.side ?? o.upper, south: o.side ?? o.upper, top: o.top ?? o.upper }, { color: o.upperC, fit: true });
  mb.box(len * 0.3, o.sole, 0, len * 0.36, o.upperH * 0.62, w * 0.9, o.upper, { color: o.upperC, fit: true });
  if (o.shaft) mb.box(-len * 0.22, o.sole + o.upperH, 0, len * 0.46, o.shaft, w * 0.9, o.upper, { color: o.upperC, fit: true });
}

// ---------------------------------------------------------------- definitions
type Rip = 'rag' | 'denim_strips' | 'leather_strips';
export interface RipInfo { key: string; name: string; rip: Rip; count: number; cutter: boolean }
/** every rippable garment (consumed by the recipes stream) */
export const CLOTHING_RIPS: RipInfo[] = [];

interface ClothOpts {
  key: string; name: string; weight: number; slot: string; covers: BodyPart[];
  ins: number; wind: number; bite: number; scratch: number; water: number;
  look: ClothingProps['look']; rip?: Rip; ripCount?: number; speed?: number;
  desc?: string; tags?: string[]; model: (mb: MB) => void; noPatch?: boolean;
}
function cloth(o: ClothOpts) {
  const tags = ['clothing', ...(o.tags ?? [])];
  if (!o.noPatch) tags.push('patchable');
  defItem({
    key: o.key, name: o.name, cat: 'clothing', weight: o.weight, tags, desc: o.desc, burn: o.rip ? 0.3 : undefined,
    clothing: { slot: o.slot, covers: o.covers, insulation: o.ins, wind: o.wind, bite: o.bite, scratch: o.scratch, water: o.water, look: o.look, rip: o.rip, ripCount: o.ripCount, speed: o.speed },
    model: o.model,
  });
  if (o.rip) CLOTHING_RIPS.push({ key: o.key, name: o.name, rip: o.rip, count: o.ripCount ?? 2, cutter: o.rip !== 'rag' });
}
const fold = (top: string, color: number, w = 0.26, d = 0.22, h = 0.035) => (mb: MB) => folded(mb, w, d, h, top, color);

// ---- tops
cloth({ key: 'tshirt', name: 'T-Shirt', weight: 0.15, slot: 'tshirt', covers: [...TORSO, ...UARMS], ins: 0.15, wind: 0.05, bite: 0, scratch: 5, water: 0,
  look: { part: 'torso', tex: 'c_shirt', color: 0xe8e6de, sleeve: 'short' }, rip: 'rag', ripCount: 3, model: fold(F_TEE, 0xf2f0ea, 0.24, 0.2, 0.025) });
cloth({ key: 'tshirt_stripe', name: 'Striped T-Shirt', weight: 0.15, slot: 'tshirt', covers: [...TORSO, ...UARMS], ins: 0.15, wind: 0.05, bite: 0, scratch: 5, water: 0,
  look: { part: 'torso', tex: 'c_shirt_stripe', color: 0x4a6aa8, sleeve: 'short' }, rip: 'rag', ripCount: 3, model: fold(F_TEE_STRIPE, 0x6a8ac8, 0.24, 0.2, 0.025) });
cloth({ key: 'shirt_office', name: 'Office Shirt', weight: 0.25, slot: 'shirt', covers: [...TORSO, ...ARMS], ins: 0.2, wind: 0.1, bite: 0, scratch: 8, water: 0,
  look: { part: 'torso', tex: 'c_shirt_button', color: 0xd8e4ee, sleeve: 'long' }, rip: 'rag', ripCount: 4, model: fold(F_SHIRT, 0xd8e6f2, 0.25, 0.21, 0.03) });
cloth({ key: 'sweater', name: 'Sweater', weight: 0.5, slot: 'sweater', covers: [...TORSO, ...ARMS], ins: 0.4, wind: 0.2, bite: 2, scratch: 10, water: 0,
  look: { part: 'torso', tex: 'c_sweater', color: 0x8a3a3a, sleeve: 'long' }, rip: 'rag', ripCount: 4, model: fold(F_SWEATER, 0xa84a48, 0.27, 0.22, 0.05) });
cloth({ key: 'hoodie', name: 'Hoodie', weight: 0.6, slot: 'sweater', covers: [...TORSO, ...ARMS], ins: 0.35, wind: 0.25, bite: 2, scratch: 10, water: 0.1,
  look: { part: 'torso', tex: 'c_hoodie', color: 0x5a6a7a, sleeve: 'long' }, rip: 'rag', ripCount: 5, model: fold(F_HOODIE, 0x7a8a9a, 0.28, 0.24, 0.055) });
cloth({ key: 'scrubs_top', name: 'Scrubs Top', weight: 0.2, slot: 'shirt', covers: [...TORSO, ...UARMS], ins: 0.12, wind: 0.05, bite: 0, scratch: 4, water: 0,
  look: { part: 'torso', tex: 'c_scrubs', color: 0x4aa0a0, sleeve: 'short' }, rip: 'rag', ripCount: 3, model: fold(F_SCRUBS, 0x5ab4b0, 0.24, 0.2, 0.025) });
cloth({ key: 'security_uniform', name: 'Security Uniform', weight: 0.5, slot: 'shirt', covers: [...TORSO, ...ARMS], ins: 0.2, wind: 0.15, bite: 2, scratch: 10, water: 0,
  look: { part: 'torso', tex: 'c_uniform', color: 0x2a3048, sleeve: 'long' }, rip: 'rag', ripCount: 4,
  desc: 'Navy shirt with a tin badge: MERIDIAN SECURITY.', model: fold(F_UNIFORM, 0xffffff, 0.25, 0.21, 0.035) });

// ---- outer layers
cloth({ key: 'jacket_denim', name: 'Denim Jacket', weight: 1.0, slot: 'jacket', covers: [...TORSO, ...ARMS], ins: 0.3, wind: 0.4, bite: 8, scratch: 25, water: 0.1,
  look: { part: 'torso', tex: 'c_jacket', color: 0x4a6a9a, sleeve: 'long' }, rip: 'denim_strips', ripCount: 4, model: fold(F_DENIMJ, 0xffffff, 0.28, 0.24, 0.05) });
cloth({ key: 'jacket_leather', name: 'Leather Jacket', weight: 1.8, slot: 'jacket', covers: [...TORSO, ...ARMS], ins: 0.35, wind: 0.7, bite: 20, scratch: 40, water: 0.4,
  look: { part: 'torso', tex: 'c_jacket_leather', color: 0x3a2a22, sleeve: 'long' }, rip: 'leather_strips', ripCount: 4, model: fold(F_LEATHER, 0xffffff, 0.28, 0.24, 0.055) });
cloth({ key: 'coat_winter', name: 'Winter Coat', weight: 2.2, slot: 'jacket', covers: [...TORSO, ...ARMS, 'groin', 'neck'], ins: 0.7, wind: 0.8, bite: 8, scratch: 20, water: 0.5,
  look: { part: 'torso', tex: 'c_coat', color: 0x4a5a3a, sleeve: 'long' }, rip: 'rag', ripCount: 6, model: fold(F_COAT, 0x6a7a52, 0.3, 0.26, 0.08) });
cloth({ key: 'vest_hiviz', name: 'Hi-Vis Vest', weight: 0.2, slot: 'jacket', covers: [...TORSO], ins: 0.05, wind: 0.05, bite: 0, scratch: 3, water: 0,
  look: { part: 'torso', tex: 'c_vest_hiviz', color: 0xe8f02a, sleeve: 'none' }, rip: 'rag', ripCount: 2,
  desc: 'Easy for your friends to spot in the dark. Easy for everything else, too.', model: fold(F_HIVIZ, 0xffffff, 0.25, 0.2, 0.02) });
cloth({ key: 'lab_coat', name: 'Lab Coat', weight: 0.6, slot: 'jacket', covers: [...TORSO, ...ARMS, ...UPPER_LEGS], ins: 0.15, wind: 0.15, bite: 2, scratch: 10, water: 0.05,
  look: { part: 'torso', tex: 'c_labcoat', color: 0xf2f2ee, sleeve: 'long' }, rip: 'rag', ripCount: 6,
  desc: 'A Meridian Institute name tag is still clipped to the pocket. The name has been scratched out.', model: fold(F_LABCOAT, 0xf6f6f2, 0.26, 0.26, 0.035) });
cloth({ key: 'raincoat', name: 'Raincoat', weight: 0.6, slot: 'jacket', covers: [...TORSO, ...ARMS, ...UPPER_LEGS, 'neck'], ins: 0.15, wind: 0.7, bite: 2, scratch: 10, water: 0.95,
  look: { part: 'torso', tex: 'c_coat', color: 0xf0c419, sleeve: 'long' }, noPatch: true,
  desc: 'Waterproof. For the flooded levels and the ceilings that drip.', model: fold(F_RAINCOAT, 0xf8d02a, 0.27, 0.24, 0.04) });

// ---- full suits
cloth({ key: 'pajamas', name: 'Pajamas', weight: 0.5, slot: 'fullsuit', covers: [...TORSO, ...ARMS, ...LEGS], ins: 0.25, wind: 0.1, bite: 0, scratch: 4, water: 0,
  look: { part: 'torso', tex: 'c_pajama', color: 0x8ab0d8, sleeve: 'long' }, rip: 'rag', ripCount: 6,
  desc: 'You were wearing these when you woke up here. You think.', model: fold(F_PAJAMA, 0x9ac0e8, 0.26, 0.22, 0.045) });
cloth({ key: 'janitor_uniform', name: 'Janitor Coveralls', weight: 1.0, slot: 'fullsuit', covers: [...TORSO, ...ARMS, ...LEGS], ins: 0.3, wind: 0.35, bite: 4, scratch: 15, water: 0.1,
  look: { part: 'torso', tex: 'c_uniform', color: 0x5a6a7a, sleeve: 'long' }, rip: 'rag', ripCount: 6, model: fold(F_COVERALL, 0x6a7a8a, 0.27, 0.27, 0.055) });

// ---- legs
cloth({ key: 'jeans', name: 'Jeans', weight: 0.75, slot: 'pants', covers: [...LEGS], ins: 0.2, wind: 0.3, bite: 5, scratch: 15, water: 0.05,
  look: { part: 'legs', tex: 'c_jeans', color: 0x3a5a8a }, rip: 'denim_strips', ripCount: 4, model: fold(F_JEANS, 0xffffff, 0.2, 0.3, 0.045) });
cloth({ key: 'slacks', name: 'Slacks', weight: 0.5, slot: 'pants', covers: [...LEGS], ins: 0.18, wind: 0.2, bite: 2, scratch: 8, water: 0,
  look: { part: 'legs', tex: 'c_slacks', color: 0x3a3a42 }, rip: 'rag', ripCount: 3, model: fold(F_PANTS, 0x5a5a64, 0.19, 0.29, 0.035) });
cloth({ key: 'scrubs_pants', name: 'Scrubs Pants', weight: 0.25, slot: 'pants', covers: [...LEGS], ins: 0.12, wind: 0.05, bite: 0, scratch: 4, water: 0,
  look: { part: 'legs', tex: 'c_sweatpants', color: 0x4aa0a0 }, rip: 'rag', ripCount: 3, model: fold(F_SWEATS, 0x5ab4b0, 0.19, 0.27, 0.03) });
cloth({ key: 'shorts', name: 'Shorts', weight: 0.25, slot: 'pants', covers: [...UPPER_LEGS], ins: 0.06, wind: 0.05, bite: 0, scratch: 3, water: 0,
  look: { part: 'legs', tex: 'c_shorts', color: 0xc8a878 }, rip: 'rag', ripCount: 2, model: fold(F_SHORTS, 0xd8bc8c, 0.2, 0.17, 0.035) });
cloth({ key: 'sweatpants', name: 'Sweatpants', weight: 0.45, slot: 'pants', covers: [...LEGS], ins: 0.25, wind: 0.15, bite: 2, scratch: 6, water: 0,
  look: { part: 'legs', tex: 'c_sweatpants', color: 0x6a6a72 }, rip: 'rag', ripCount: 4, model: fold(F_SWEATS, 0x8a8a94, 0.2, 0.29, 0.045) });
cloth({ key: 'skirt', name: 'Skirt', weight: 0.3, slot: 'pants', covers: [...UPPER_LEGS], ins: 0.08, wind: 0.05, bite: 0, scratch: 2, water: 0,
  look: { part: 'legs', tex: 'c_skirt', color: 0x6a3a5a }, rip: 'rag', ripCount: 2, model: fold(F_SKIRT, 0x8a4a74, 0.24, 0.2, 0.03) });

// ---- feet
cloth({ key: 'socks', name: 'Socks', weight: 0.05, slot: 'socks', covers: [...FEET], ins: 0.05, wind: 0.02, bite: 0, scratch: 2, water: 0,
  look: { part: 'feet', tex: 'c_shirt', color: 0xf0f0ec }, rip: 'rag', ripCount: 1,
  model: (mb) => { rodZ(mb, -0.035, 0.035, 0.022, 0.022, 0.022, 8, S_SOCK, { cx: -0.02, fit: true }); rodZ(mb, -0.03, 0.03, 0.02, 0.02, 0.02, 8, S_SOCK, { cx: 0.02, fit: true }); } });
cloth({ key: 'sneakers', name: 'Sneakers', weight: 0.8, slot: 'shoes', covers: [...FEET], ins: 0.1, wind: 0.1, bite: 5, scratch: 10, water: 0.1, noPatch: true,
  look: { part: 'feet', tex: 'c_shoes_sneaker', color: 0xe8e8e2 }, speed: 1.0,
  model: (mb) => pair(mb, (m) => shoe(m, { len: 0.27, w: 0.095, sole: 0.025, soleC: 0xf2f2ee, upperH: 0.06, upper: T.white, upperC: 0xf4f2ec, side: D_SNEAKER, top: D_LACES })) });
cloth({ key: 'boots_work', name: 'Work Boots', weight: 1.8, slot: 'shoes', covers: [...FEET, 'shin_l', 'shin_r'], ins: 0.2, wind: 0.3, bite: 30, scratch: 30, water: 0.4, noPatch: true,
  look: { part: 'feet', tex: 'c_shoes_boot', color: 0x6a4a2a }, speed: 0.97,
  desc: 'Steel toes, thick soles. Glass and teeth have a harder time.',
  model: (mb) => pair(mb, (m) => shoe(m, { len: 0.29, w: 0.105, sole: 0.035, soleC: 0x2a2220, upperH: 0.07, upper: T.leather, upperC: 0xc89a6a, shaft: 0.07 }), 0.065) });
cloth({ key: 'dress_shoes', name: 'Dress Shoes', weight: 1.0, slot: 'shoes', covers: [...FEET], ins: 0.08, wind: 0.1, bite: 5, scratch: 8, water: 0.1, noPatch: true,
  look: { part: 'feet', tex: 'c_shoes_dress', color: 0x2a2220 }, speed: 0.98,
  model: (mb) => pair(mb, (m) => shoe(m, { len: 0.28, w: 0.09, sole: 0.018, soleC: 0x3a2a20, upperH: 0.05, upper: T.leather, upperC: 0x3a3030 })) });
cloth({ key: 'slippers', name: 'Slippers', weight: 0.3, slot: 'shoes', covers: [...FEET], ins: 0.1, wind: 0.05, bite: 0, scratch: 2, water: 0, rip: 'rag', ripCount: 1,
  look: { part: 'feet', tex: 'c_shoes_sneaker', color: 0xd8a0b8 }, speed: 0.95,
  desc: 'Fluffy. Quiet on hard floors.',
  model: (mb) => pair(mb, (m) => { m.box(0, 0, 0, 0.26, 0.022, 0.1, T.rubber, { color: 0xc8b8c0 }); m.box(0.04, 0.022, 0, 0.16, 0.045, 0.095, S_FUZZ, { color: 0xe8a8c4, uvScale: 3 }); }) });

// ---- hands
const glove = (mb: MB, color: number, t: string) => {
  mb.box(0, 0, 0, 0.1, 0.018, 0.085, t, { color, uvScale: 3 });
  for (let i = 0; i < 4; i++) mb.box(0.085, 0, -0.03 + i * 0.02, 0.07 - Math.abs(i - 1.5) * 0.012, 0.016, 0.017, t, { color, uvScale: 3 });
  mb.push().translate(0.03, 0, 0.05).rotateY(-0.6); mb.box(0.03, 0, 0, 0.06, 0.016, 0.022, t, { color, uvScale: 3 }); mb.pop();
  mb.box(-0.07, 0, 0, 0.05, 0.02, 0.09, t, { color: dk(color, 0.85), uvScale: 3 });
};
cloth({ key: 'gloves_work', name: 'Work Gloves', weight: 0.2, slot: 'hands', covers: [...HANDS], ins: 0.1, wind: 0.2, bite: 10, scratch: 25, water: 0.1,
  look: { part: 'hands', tex: 'c_gloves', color: 0xc8a050 },
  desc: 'Leather palms. Handle glass and wire without bleeding.',
  model: (mb) => { mb.push().translate(-0.02, 0, -0.06).rotateY(0.2); glove(mb, 0xd8b068, S_GLOVE); mb.pop(); mb.push().translate(0.02, 0.018, 0.04).rotateY(-0.3); glove(mb, 0xc8a058, S_GLOVE); mb.pop(); } });
cloth({ key: 'gloves_rubber', name: 'Rubber Gloves', weight: 0.05, slot: 'hands', covers: [...HANDS], ins: 0.02, wind: 0.05, bite: 2, scratch: 5, water: 0.9, noPatch: true,
  look: { part: 'hands', tex: 'c_gloves', color: 0xe8d050 },
  desc: 'Keep your hands dry and clean. The rubber is good for slingshot bands.',
  model: (mb) => { mb.push().translate(-0.02, 0, -0.06).rotateY(0.25); glove(mb, 0xf0d850, T.white); mb.pop(); mb.push().translate(0.02, 0.018, 0.04).rotateY(-0.2); glove(mb, 0xe8cc48, T.white); mb.pop(); } });

// ---- head
cloth({ key: 'hat_cap', name: 'Baseball Cap', weight: 0.1, slot: 'hat', covers: ['head'], ins: 0.05, wind: 0.05, bite: 0, scratch: 3, water: 0.1,
  look: { part: 'head', tex: 'c_hat_cap', color: 0xc8302a, hat: 'cap' }, rip: 'rag', ripCount: 1,
  model: (mb) => {
    dome(mb, -0.02, 0, 0, 0.095, 0.085, 8, S_CAP_PANEL, { color: 0xd8403a });
    prism(mb, [[0.04, 0.075], [0.17, 0.05], [0.17, -0.05], [0.04, -0.075]], 0.004, 0.008, T.white, T.white, { color: 0xc0302a });
    mb.cylinder(-0.02, 0.083, 0, 0.012, 0.008, 6, T.white, { color: 0xc0302a });
  } });
cloth({ key: 'beanie', name: 'Beanie', weight: 0.1, slot: 'hat', covers: ['head'], ins: 0.25, wind: 0.2, bite: 0, scratch: 3, water: 0.05,
  look: { part: 'head', tex: 'c_beanie', color: 0x3a5a3a, hat: 'beanie' }, rip: 'rag', ripCount: 1,
  model: (mb) => {
    dome(mb, 0, 0.03, 0, 0.09, 0.1, 8, T.knit, { color: 0x4a7a4a });
    mb.cylinder(0, 0, 0, 0.095, 0.035, 8, T.knit, { color: 0x3a6a3a, fit: true });
    mb.sphere(0, 0.14, 0, 0.025, 6, 4, S_FUZZ, { color: 0xe8e2d4, fit: true });
  } });
cloth({ key: 'hard_hat', name: 'Hard Hat', weight: 0.4, slot: 'hat', covers: ['head'], ins: 0.05, wind: 0.1, bite: 30, scratch: 40, water: 0.5, noPatch: true,
  look: { part: 'head', tex: 'c_hardhat', color: 0xf0c419, hat: 'hardhat' },
  desc: 'Takes a falling ceiling tile — or a bite — for you.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.14, 0.012, 10, T.plastic, { color: 0xe8b818, fit: true });
    dome(mb, 0, 0.01, 0, 0.11, 0.1, 10, T.plastic, { color: 0xf6c81a });
    mb.box(0, 0.08, 0, 0.03, 0.035, 0.18, T.plastic, { color: 0xe8b818 });
  } });
cloth({ key: 'helmet_bike', name: 'Bike Helmet', weight: 0.35, slot: 'hat', covers: ['head'], ins: 0.05, wind: 0.05, bite: 25, scratch: 35, water: 0.3, noPatch: true,
  look: { part: 'head', tex: 'c_hardhat', color: 0x3a8ac8, hat: 'helmet' },
  model: (mb) => {
    dome(mb, 0, 0, 0, 0.11, 0.11, 10, S_VENTS, { color: 0x4a9ad8, sx: 1.25 });
    for (const s of [-1, 1]) mb.box(0.0, 0.0, s * 0.105, 0.012, 0.004, 0.06, T.black);
  } });
cloth({ key: 'scarf', name: 'Scarf', weight: 0.15, slot: 'neck', covers: ['neck'], ins: 0.2, wind: 0.3, bite: 2, scratch: 5, water: 0,
  look: { part: 'face', tex: 'c_mask', color: 0xa83a3a }, rip: 'rag', ripCount: 2,
  desc: 'Wrap it up over your nose and mouth against the cold and the dust.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.22, 0.03, 0.12, { all: F_SCARF, top: F_SCARF }, { color: 0xc04a44, fit: true });
    for (let i = 0; i < 5; i++) mb.box(0.12, 0.0, -0.045 + i * 0.022, 0.025, 0.006, 0.008, T.white, { color: 0xa83a3a });
  } });

// ---- eyes & face
const frames = (mb: MB, lens: string, color: number, thick = 0.004) => {
  for (const s of [-1, 1]) {
    mb.box(0, 0.004, s * 0.032, 0.012, 0.03, 0.046, lens, { fit: true });
    mb.box(0, 0.004, s * 0.032, thick + 0.002, 0.036, 0.052, T.black, { color, skip: ['east', 'west'] });
    mb.push().translate(-0.06, 0.012, s * 0.06).rotateY(s * 0.1); mb.box(0, 0, 0, 0.12, 0.004, 0.004, T.black, { color }); mb.pop();
  }
  mb.box(0, 0.026, 0, 0.006, 0.006, 0.02, T.black, { color });
};
cloth({ key: 'glasses', name: 'Glasses', weight: 0.03, slot: 'eyes', covers: [], ins: 0, wind: 0, bite: 0, scratch: 0, water: 0, noPatch: true,
  look: { part: 'eyes', tex: 'c_glasses', color: 0x2a2a2a }, desc: 'Prescription lenses. The world is sharper — that is not always a comfort.',
  model: (mb) => frames(mb, D_LENS, 0x3a2a22) });
cloth({ key: 'sunglasses', name: 'Sunglasses', weight: 0.03, slot: 'eyes', covers: [], ins: 0, wind: 0, bite: 0, scratch: 0, water: 0, noPatch: true,
  look: { part: 'eyes', tex: 'c_glasses', color: 0x1a1a1a }, desc: 'Cuts the glare of a thousand fluorescent tubes.',
  model: (mb) => frames(mb, D_LENS_DARK, 0x1c1c1c) });
cloth({ key: 'swim_goggles', name: 'Swim Goggles', weight: 0.05, slot: 'eyes', covers: [], ins: 0, wind: 0, bite: 0, scratch: 0, water: 0.5, noPatch: true,
  look: { part: 'eyes', tex: 'c_glasses', color: 0x4aa0d8 }, desc: 'See clearly underwater in the pool halls.',
  model: (mb) => {
    for (const s of [-1, 1]) mb.cylinder(0, 0, s * 0.03, 0.024, 0.02, 8, { sides: T.plastic, top: D_LENS, bottom: T.plastic }, { color: 0x4aa0d8, fit: true });
    mb.box(0, 0.006, 0, 0.012, 0.008, 0.02, T.plastic, { color: 0x2a6a9a });
    for (const s of [-1, 1]) mb.box(-0.05, 0.004, s * 0.055, 0.1, 0.004, 0.01, T.rubber, { color: 0x2a5a8a });
  } });
cloth({ key: 'face_mask', name: 'Face Mask', weight: 0.01, slot: 'mask', covers: [], ins: 0.02, wind: 0.05, bite: 0, scratch: 0, water: 0, noPatch: true,
  look: { part: 'face', tex: 'c_mask', color: 0x8ac0d8 }, desc: 'Paper mask. Filters dust and spores, not much else.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.17, 0.008, 0.09, { all: T.white, top: D_MASK }, { color: 0xa8d4e8, fit: true });
    for (const s of [-1, 1]) for (const z of [-0.03, 0.03]) mb.box(s * 0.11, 0.002, z, 0.05, 0.003, 0.004, T.white, { color: 0xf2f2ee });
  } });
cloth({ key: 'gas_mask', name: 'Gas Mask', weight: 0.7, slot: 'mask', covers: ['head'], ins: 0.05, wind: 0.2, bite: 5, scratch: 10, water: 0.2, noPatch: true,
  look: { part: 'face', tex: 'c_mask', color: 0x3a3a3a }, desc: 'Filters toxic air and spores. Breathing in it is loud.',
  model: (mb) => {
    dome(mb, 0, 0, 0, 0.09, 0.07, 8, T.rubber, { color: 0x4a4a4e, sz: 1.15 });
    for (const s of [-1, 1]) mb.cylinder(0.035, 0.045, s * 0.04, 0.024, 0.03, 8, { sides: T.black, top: D_LENS_DARK }, { fit: true });
    mb.push().translate(0.07, 0.025, 0).rotateZ(-1.2); mb.cylinder(0, 0, 0, 0.032, 0.05, 8, { sides: T.metal, top: T.tinTop }, { color: 0x6a7a5a, fit: true }); mb.pop();
    for (const s of [-1, 1]) mb.box(-0.08, 0.02, s * 0.07, 0.06, 0.004, 0.012, T.rubber);
  } });

void K; void txt; void txtC; void dashes; void band; void slab; void lt; void mixHex; void bayer; void decal;
