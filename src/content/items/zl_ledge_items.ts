// Items of the Ledge (src/world/gen/z_ledge.ts) and its survey: Ledge wax
// (a lump of the melt: anomalous, sample it for the codex entry AN-07,
// src/world/anomalies/data.ts), the survey foil (carry it: the Ledge's heat
// gets into you slower, src/world/anomalies/ledge.ts) and the survey cache.
import { defItem } from '../../items/item';
import { defLoot } from '../../items/loot';
import { tex, rp, ph, type MB } from './_kit';
import { blob, tube } from '../../creatures/kit/anomalies';

const S_WAX = tex('i_ledge_wax', 8, 8, (pc) => { const R = rp(0xe08a2a, 6, 0.55); pc.each((x, y) => pc.set(x, y, R[2 + (ph(x, y, 91) < 0.3 ? 1 : 0) + (ph(x >> 1, y >> 1, 92) < 0.2 ? 2 : 0)])); pc.set(2, 2, 0xfff4dc); pc.set(5, 4, 0xfff0d0); }, true);
const S_FOIL = tex('i_ledge_foil', 12, 12, (pc) => {
  pc.each((x, y) => { const v = Math.sin(x * 1.3 + y * 0.7) * 0.5 + Math.sin(x * 0.4 - y * 1.9) * 0.5; pc.set(x, y, v > 0.5 ? 0xfff8e8 : v > 0 ? 0xd8d4cc : v > -0.5 ? 0xb0aca4 : 0x8a8680); });
  for (let x = 0; x < 12; x++) pc.set(x, 0, 0xe8c228);
}, true);

defItem({
  key: 'ledge_wax', name: 'Ledge Wax', cat: 'anomaly', weight: 0.3, anomaly: 'ledge', tags: ['anomalous', 'ledge'], value: 30,
  desc: 'A lump of the Ledge, set hard on the way out. It is warm in the hand and slowly loses its shape in a pocket. Take a residue sample for the lab.',
  model: (mb: MB) => {
    blob(mb, [0, 0.03, 0], [0.06, 0.035, 0.05], 10, 5, S_WAX, { disp: (d, u) => 1 + 0.18 * Math.sin(u * Math.PI * 6) * (d[1] + 0.4) });
    blob(mb, [0.03, 0.06, 0.01], [0.025, 0.02, 0.022], 7, 4, S_WAX);
    tube(mb, [[-0.04, 0.02, 0.02], [-0.06, 0.0, 0.03], [-0.065, -0.01, 0.035]], 0.008, 5, S_WAX, { capEnd: true });
  },
});
defItem({
  key: 'ledge_foil', name: 'Survey Foil', cat: 'tool', weight: 0.2, tags: ['ledge', 'research'], value: 14,
  desc: 'A Meridian survey blanket, reflective on both sides, folded to the size of a wallet. Carried on you in the Ledge, the heat gets in a lot more slowly.',
  model: (mb: MB) => {
    mb.box(0, 0, 0, 0.11, 0.02, 0.08, S_FOIL, { fit: true });
    mb.box(0.002, 0.02, 0.001, 0.104, 0.008, 0.074, S_FOIL, { fit: true });
  },
});

defLoot('lg_survey', [2, 4], [['ledge_foil', 4], ['water_bottle', 3], ['bandage', 2], ['ration_bar', 2], ['ledge_wax', 2], ['battery', 1], ['note', 1]], 0);
