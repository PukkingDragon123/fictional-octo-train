// The Remittance hazmat suit: what every debtor wears through the wall. A yellow rubberised one-piece with an
// attached hood, a clear visor and a chin respirator, taped seams, black rubber gloves and boots, the Meridian
// patch on the breast and the debtor's number on the chest tape and across the back. The character painter
// (src/entities/gg/paint.ts, look tex 'c_hazmat') draws it; the player's rig always shows it (Player.computeOutfit).
import { defItem, BodyPart } from '../../items/item';
import { tex, rp, folded, ph, MB } from './_kit';

export const HAZMAT_YELLOW = 0xe8c228;
const ALL: BodyPart[] = ['torso_u', 'torso_l', 'uarm_l', 'uarm_r', 'farm_l', 'farm_r', 'groin', 'thigh_l', 'thigh_r', 'shin_l', 'shin_r', 'head', 'neck', 'hand_l', 'hand_r', 'foot_l', 'foot_r'];

const F_HAZMAT = tex('i_fold_hazmat', 16, 18, (pc) => {
  const R = rp(HAZMAT_YELLOW, 5, 0.5);
  pc.each((x, y) => pc.set(x, y, R[2 + (ph(x >> 1, y, 71) < 0.2 ? 1 : 0) - (ph(x >> 2, y >> 2, 72) < 0.12 ? 1 : 0)]));
  pc.hline(0, 15, 0, R[4]); pc.hline(0, 15, 17, R[1]); pc.vline(15, 0, 17, R[1]);
  // the folded hood with its visor on top, a grey tape seam, the patch, a glove poking out
  pc.rect(4, 1, 8, 5, R[3]); pc.rect(5, 2, 6, 3, 0x9ab4b8); pc.hline(5, 10, 2, 0xdce8ea); pc.strokeRect(4, 1, 8, 5, 0x1c1e1e);
  pc.rect(7, 6, 2, 2, 0x2a2c2a);
  pc.vline(8, 8, 17, 0xb0b2ac); pc.vline(7, 8, 17, 0x8a8c86);
  pc.rect(2, 9, 4, 4, 0x203440); pc.set(3, 10, 0xdec460); pc.set(4, 11, 0xdec460);
  pc.rect(10, 10, 4, 2, 0xece8dc); pc.hline(10, 13, 11, 0x1c1a18);
  pc.rect(12, 14, 3, 3, 0x222422);
});

defItem({
  key: 'hazmat_suit', name: 'Remittance Hazmat Suit', cat: 'clothing', weight: 2.2, tags: ['clothing', 'patchable', 'prison'],
  desc: 'Yellow rubber, taped at every seam, a hood with a visor that fogs when you panic. The Meridian patch is stitched on crooked. Your number is on the chest and across the back, in case they need to find what is left.',
  clothing: {
    slot: 'fullsuit', covers: ALL, insulation: 0.3, wind: 0.85, bite: 8, scratch: 22, water: 0.95,
    look: { part: 'torso', tex: 'c_hazmat', color: HAZMAT_YELLOW, sleeve: 'long' }, rip: 'rag', ripCount: 5,
  },
  value: 12, grid: [2, 2],
  model: (mb: MB) => folded(mb, 0.29, 0.28, 0.07, F_HAZMAT, 0xffffff),
});
