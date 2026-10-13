// Story items: keycards, keys and the CONTINUITY root key.
import { defItem } from '../../items/item';
import { tex, txt, K, T, rp, slab } from './_kit';

const CARD_FAC = tex('i_card_facilities', 16, 10, (pc) => {
  pc.fill(K.white);
  pc.rect(0, 0, 16, 3, K.blue);
  txt(pc, 'FAC', 1, 4, K.ink);
  pc.rect(11, 4, 4, 5, K.sky); pc.rect(12, 5, 2, 2, K.tan); pc.rect(11, 7, 4, 2, K.blueDk); // photo
  pc.hline(1, 9, 9, K.greyLt);
});
const CARD_LAB = tex('i_card_lab', 16, 10, (pc) => {
  pc.fill(0xd8dcd0);
  pc.rect(0, 0, 16, 3, K.green);
  txt(pc, 'M4', 1, 4, K.ink);
  pc.rect(11, 4, 4, 5, K.greyLt); pc.rect(12, 5, 2, 2, K.tan); pc.rect(11, 7, 4, 2, K.greenDk);
  pc.rect(1, 9, 8, 1, K.gold);
});
const ROOT = tex('i_root_key', 12, 16, (pc) => {
  const R = rp(0x1c2430, 5, 0.6);
  pc.fill(R[1]);
  pc.rect(2, 2, 8, 9, 0x0c1418);
  for (let y = 3; y < 10; y++) for (let x = 3; x < 9; x++) if ((x * 7 + y * 3) % 5 === 0) pc.set(x, y, K.neonC);
  pc.rect(4, 5, 4, 3, 0x9ff8ff);
  txt(pc, 'R', 4, 11, K.neonC);
});
const BRASS = tex('i_brass', 8, 8, (pc) => { const R = rp(0xc8a040, 5, 0.5); pc.each((x, y) => pc.set(x, y, R[(x + y) % 3 + 1])); }, true);
const DINO = tex('i_dino', 8, 8, (pc) => { pc.fill(0x5ab04a); pc.set(2, 2, K.ink); pc.hline(0, 7, 6, 0x3a8a3a); });

defItem({
  key: 'keycard_facilities', name: 'Facilities Keycard', cat: 'key', weight: 0.01, rare: true, noStack: true,
  tags: ['key', 'keycard', 'mission'],
  desc: 'R. Doyle, Facilities. The photo has been scratched out with a key. Opens service doors on the office floor.',
  model: (mb) => slab(mb, 0.085, 0.003, 0.054, CARD_FAC, T.white, 0xf3efe6),
});
defItem({
  key: 'keycard_lab', name: 'Meridian Lab Badge', cat: 'key', weight: 0.01, rare: true, noStack: true,
  tags: ['key', 'keycard', 'mission'],
  desc: 'FACILITY 4 — LEVEL B CLEARANCE. Laminated, warm, as if someone was holding it a moment ago.',
  model: (mb) => slab(mb, 0.085, 0.003, 0.054, CARD_LAB, T.white, 0xd8dcd0),
});
defItem({
  key: 'house_key', name: 'Brass House Key', cat: 'key', weight: 0.02, rare: true, noStack: true,
  tags: ['key', 'mission'],
  desc: 'A front door key on a plastic dinosaur keychain. The dinosaur has a name written on its belly: MIA.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.05, 0.004, 0.012, BRASS);
    mb.cylinder(-0.03, 0, 0, 0.012, 0.004, 8, BRASS);
    mb.box(-0.06, 0, 0.005, 0.03, 0.01, 0.02, DINO, { fit: true });
  },
});
defItem({
  key: 'root_key', name: 'Root Key', cat: 'anomaly', weight: 0.1, rare: true, noStack: true,
  tags: ['key', 'mission', 'anomalous'],
  desc: 'A translucent cartridge with something bright moving inside it. It feels like holding a held breath. CONTINUITY KERNEL — ROOT.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.06, 0.012, 0.08, { top: ROOT, all: 'i_tin' }, { fit: { top: true }, emissive: 0.6 });
    mb.box(0, 0.004, 0.045, 0.04, 0.006, 0.012, T.tin);
  },
});
