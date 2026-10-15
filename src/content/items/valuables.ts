// Items stream — VALUABLES: the things the Remittance Programme wants back.
// Rings sewn into sofa cushions, watches in desk drawers, cash rolls behind
// skirting, jewellery boxes, old electronics stripped for copper and boards.
// Every one carries an explicit scrip `value` (the debt contract pays that,
// scaled by condition) and the tag 'valuable' (tut:valuable, hopper scan
// lines). Furniture spills them when it is smashed (src/game/debt/values.ts).
import { defItem } from '../../items/item';
import { lootTable } from '../../items/loot';
import { tex, decal, T, K, rp, dk, lt, txt, txtC, stamp, stampC, dashes, slab, rodX, rodZ, ph, MB, PixelCanvas } from './_kit';

// ---------------------------------------------------------------- shared metal / fabric textures
/** polished metal: hue-shifted ramp in diagonal bands with crisp 1px glints */
function metal(name: string, base: number, w = 8, h = 8) {
  return tex(name, w, h, (pc) => {
    const R = rp(base, 6, 0.6);
    pc.each((x, y) => {
      const d = ((x + y * 2) % 8) / 8;
      const band = d < 0.18 ? 5 : d < 0.4 ? 3 : d < 0.75 ? 2 : 1;
      pc.set(x, y, R[Math.min(5, band + (ph(x >> 1, y >> 1, 41) < 0.12 ? 1 : 0))]);
    });
    pc.set(1, 1, 0xfff6dc); pc.set(5, 3, 0xfff6dc);
  }, true);
}
const S_GOLD = metal('i_v_gold', 0xd2a63e);
const S_GOLD_DK = metal('i_v_gold_dk', 0xa8792a);
const S_SILVER = metal('i_v_silver', 0xb8bec6);
const S_BRASS = metal('i_v_brass', 0xb08a40);
const S_COPPER = metal('i_v_copper', 0xc0683a);
const S_VELVET = tex('i_v_velvet', 8, 8, (pc) => { const R = rp(0x6a1a2a, 5, 0.4); pc.each((x, y) => pc.set(x, y, R[1 + Math.round(ph(x >> 1, y >> 1, 7) * 1.4 + ((x + y) % 5 === 0 ? 1 : 0))])); }, true);
const S_VELVET_B = tex('i_v_velvet_b', 8, 8, (pc) => { const R = rp(0x1e2a5a, 5, 0.4); pc.each((x, y) => pc.set(x, y, R[1 + Math.round(ph(x >> 1, y >> 1, 9) * 1.4 + ((x + y) % 5 === 0 ? 1 : 0))])); }, true);
const S_PEARL = tex('i_v_pearl', 4, 4, (pc) => { pc.fill(0xece6dc); pc.set(1, 1, 0xffffff); pc.set(2, 1, 0xf8f4f0); pc.set(3, 3, 0xc8c0b8); pc.set(2, 3, 0xd8d0c8); pc.set(0, 2, 0xe2dce8); });
const S_PORC = tex('i_v_porc', 8, 8, (pc) => { pc.fill(0xf4f0ea); pc.each((x, y) => { if (ph(x, y, 13) < 0.08) pc.set(x, y, 0xe6e2dc); }); pc.set(2, 1, 0xffffff); pc.set(3, 1, 0xffffff); }, true);
const S_WALNUT = tex('i_v_walnut', 8, 16, (pc) => {
  const R = rp(0x5a3420, 5, 0.4);
  pc.each((x, y) => { const g = Math.sin((x * 1.2 + Math.sin(y * 0.4) * 1.6)) * 0.5 + 0.5; pc.set(x, y, R[1 + Math.round(g * 2)]); });
  for (let y = 0; y < 16; y += 5) pc.set((y * 3) % 8, y, R[4]);
}, true);
const S_BLACKLAC = tex('i_v_lacquer', 8, 8, (pc) => { pc.fill(0x1c1a1e); pc.hline(0, 7, 0, 0x3a3640); pc.set(2, 2, 0x4a4652); pc.set(6, 5, 0x2a2830); }, true);

// ---------------------------------------------------------------- decals
const D_WATCH_GOLD = decal('i_v_watch_gold', 10, 10, (pc) => {
  const R = rp(0xd2a63e, 6, 0.6);
  pc.fill(R[2]);
  pc.each((x, y) => { const d = Math.hypot(x + 0.5 - 5, y + 0.5 - 5); if (d < 4) pc.set(x, y, 0xf4ecd4); if (d >= 4 && d < 4.8) pc.set(x, y, x + y < 9 ? R[5] : R[1]); });
  for (const [x, y] of [[5, 1], [8, 5], [5, 8], [1, 5]]) pc.set(x, y, 0x3a3020);
  pc.vline(5, 3, 5, 0x1a1410); pc.hline(5, 7, 5, 0x1a1410); pc.set(4, 6, 0xc8302a);
});
const D_POCKETW = decal('i_v_pocketwatch', 12, 12, (pc) => {
  const R = rp(0xd2a63e, 6, 0.6);
  pc.each((x, y) => {
    const d = Math.hypot(x + 0.5 - 6, y + 0.5 - 6);
    if (d > 5.9) return;
    if (d > 4.8) pc.set(x, y, x + y < 11 ? R[5] : R[2]);
    else { pc.set(x, y, 0xf2ead2); if (d > 4.2) pc.set(x, y, 0xd8ccae); }
  });
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; pc.set(Math.round(6 + Math.cos(a) * 3.6 - 0.5), Math.round(6 + Math.sin(a) * 3.6 - 0.5), 0x2a2018); }
  pc.line(6, 6, 6, 3, 0x1a1410); pc.line(6, 6, 8, 7, 0x1a1410); pc.set(6, 8, 0x8a2a20); pc.set(6, 9, 0x8a2a20);
});
const D_CASH_SIDE = tex('i_v_cash_side', 16, 6, (pc) => {
  // banknote layers seen on a rolled bundle: green-grey paper, printed bands, a red rubber band
  pc.each((x, y) => pc.set(x, y, y % 2 === 0 ? 0x9ab08a : 0x7e9672));
  for (let x = 0; x < 16; x += 3) pc.set(x, 2, 0x5a6e50);
  pc.vline(7, 0, 5, 0xb83a2a); pc.vline(8, 0, 5, 0x8a2a22);
  pc.hline(0, 15, 0, 0xb8c8a8);
}, true);
const D_CASH_END = decal('i_v_cash_end', 8, 8, (pc) => {
  pc.fill(0x7e9672);
  pc.each((x, y) => {
    const d = Math.hypot(x + 0.5 - 4, y + 0.5 - 4), a = Math.atan2(y + 0.5 - 4, x + 0.5 - 4);
    if (d > 3.9) return;
    const s = (d * 1.4 + a / (Math.PI * 2) * 1.4) % 1;
    pc.set(x, y, s < 0.35 ? 0x5a6e50 : 0xb8c8a8);
  });
});
const D_COINJAR = tex('i_v_coinjar', 16, 12, (pc) => {
  // coins seen through a glass jar: stacked discs, glass glints, the fill line
  pc.fill(0x9aa6a8);
  const C = [0xc8a24a, 0xb08a3a, 0xd8dce0, 0xa8acb2, 0xd6b45a, 0x8a6a32];
  for (let y = 3; y < 12; y++) for (let x = 0; x < 16; x++) {
    const c = C[Math.floor(ph(x >> 1, y, 21) * C.length)];
    pc.set(x, y, (x + y * 3) % 5 === 0 ? dk(c, 0.7) : c);
  }
  pc.hline(0, 15, 3, 0x6a5a3a);
  for (let y = 0; y < 12; y++) { pc.blend(3, y, 0xffffff, 0.55); pc.blend(4, y, 0xffffff, 0.25); pc.blend(11, y, 0xffffff, 0.3); }
}, true);
const D_COINS_TOP = decal('i_v_coins_top', 10, 10, (pc) => {
  const C = [0xc8a24a, 0xd8dce0, 0xb08a3a, 0xa8acb2];
  pc.fill(0x6a5a3a);
  for (let i = 0; i < 9; i++) {
    const cx = 1.5 + ph(i, 1, 31) * 7, cy = 1.5 + ph(i, 2, 31) * 7, c = C[i % 4];
    pc.each((x, y) => { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (d < 1.7) pc.set(x, y, d < 0.9 ? lt(c, 0.2) : c); });
  }
});
const D_CAMEO = decal('i_v_cameo', 10, 12, (pc) => {
  // a carved profile in pale shell on terracotta, gold rope rim
  const G = rp(0xd2a63e, 5, 0.5);
  pc.each((x, y) => {
    const d = Math.hypot((x + 0.5 - 5) / 5, (y + 0.5 - 6) / 6);
    if (d > 1) return;
    pc.set(x, y, d > 0.82 ? ((x + y) % 2 ? G[4] : G[2]) : 0xb0583e);
  });
  stamp(pc, 3, 2, ['.ww.', 'wwww', '.www', '..ww', '.www', 'www.', '.ww.'], { w: 0xf4e6d8 });
  pc.set(6, 4, 0xf4e6d8); pc.set(2, 7, 0xe8d6c6);
});
const D_DOLL_FACE = decal('i_v_doll_face', 8, 10, (pc) => {
  pc.fill(0xf6eee6);
  pc.rect(0, 0, 8, 3, 0x7a4a26); pc.set(0, 3, 0x7a4a26); pc.set(7, 3, 0x7a4a26); pc.set(0, 4, 0x7a4a26); pc.set(7, 4, 0x7a4a26);
  pc.set(2, 4, 0x2a3a6a); pc.set(5, 4, 0x2a3a6a); pc.set(2, 3, 0x3a2a1a); pc.set(5, 3, 0x3a2a1a);
  pc.set(1, 6, 0xe8a0a0); pc.set(6, 6, 0xe8a0a0);
  pc.set(3, 7, 0xb8303a); pc.set(4, 7, 0xb8303a);
  // a hairline crack across one cheek
  pc.set(5, 5, 0x9a8a80); pc.set(6, 6, 0x9a8a80); pc.set(6, 7, 0x9a8a80);
});
const D_DOLL_DRESS = tex('i_v_doll_dress', 8, 8, (pc) => { pc.fill(0x8a3a5a); pc.each((x, y) => { if ((x + y) % 4 === 0) pc.set(x, y, 0xa8507a); if (y === 7) pc.set(x, y, 0xf2ece4); }); }, true);
const D_FILMCAN = decal('i_v_filmcan', 12, 12, (pc) => {
  const R = rp(0x8a9096, 5, 0.45);
  pc.each((x, y) => {
    const d = Math.hypot(x + 0.5 - 6, y + 0.5 - 6);
    if (d > 5.9) return;
    pc.set(x, y, d > 5.2 ? R[4] : d > 4.7 ? R[1] : R[2 + (d < 2.5 ? 1 : 0)]);
  });
  pc.rect(3, 5, 6, 2, 0xece4d0); dashes(pc, 3, 5, 6, 0x2a2a2a, 3); txt(pc, 'R', 4, 7, 0x2a2a2a);
  pc.set(6, 6, 0x2a2a2a);
});
const D_VHS_SPINE = decal('i_v_vhs_spine', 16, 4, (pc) => { pc.fill(0x1c1c20); pc.rect(1, 0, 10, 4, 0xece4d0); dashes(pc, 2, 1, 8, 0x2a2a2a, 5); pc.rect(12, 1, 3, 2, 0xc83a2a); });
const D_VHS_TOP = decal('i_v_vhs_top', 14, 8, (pc) => {
  pc.fill(0x202024); pc.rect(1, 1, 12, 6, 0x2a2a30);
  pc.rect(2, 2, 3, 3, 0x0e0e10); pc.rect(9, 2, 3, 3, 0x0e0e10);
  pc.set(3, 3, 0x6a6a72); pc.set(10, 3, 0x6a6a72);
  pc.rect(5, 2, 4, 3, 0xf0b040); txt(pc, 'BE', 5, 2, 0x2a1a08);
});
const D_CAMCORDER = decal('i_v_camcorder', 18, 8, (pc) => {
  pc.fill(0x2a2a2e);
  pc.rect(1, 1, 7, 6, 0x1a1a1e); pc.rect(2, 2, 5, 4, 0x3a3a42);
  txt(pc, 'VHS', 9, 1, 0xd8d8d0); pc.hline(9, 16, 7, 0xc83a2a);
  pc.set(16, 2, 0xff3a2a);
});
const D_BOOMBOX = decal('i_v_boombox', 24, 12, (pc) => {
  pc.fill(0x2e2e34); pc.strokeRect(0, 0, 24, 12, 0x1a1a1e);
  for (const cx of [4.5, 19.5]) pc.each((x, y) => { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - 6.5); if (d < 4.2) pc.set(x, y, d < 1.2 ? 0x6a6a72 : d < 3.4 ? ((x + y) % 2 ? 0x141416 : 0x26262a) : 0x8a8a92); });
  pc.rect(9, 3, 6, 4, 0x18181c); pc.strokeRect(9, 3, 6, 4, 0x8a8a92); pc.rect(10, 4, 1, 2, 0x5a5a62); pc.rect(13, 4, 1, 2, 0x5a5a62);
  for (let x = 9; x < 15; x += 2) pc.set(x, 9, 0xc8c8c0);
  pc.hline(9, 14, 1, 0xd89a2a);
});
const D_PCB = tex('i_v_pcb', 16, 12, (pc) => {
  pc.fill(0x2a6a3a);
  pc.each((x, y) => { if (ph(x, y, 51) < 0.06) pc.set(x, y, 0x3a8a4a); });
  for (const [x, y, l] of [[1, 2, 10], [3, 6, 8], [0, 9, 14], [6, 4, 7]] as const) pc.hline(x, x + l, y, 0xc8a24a);
  for (const [x, y, l] of [[2, 1, 6], [12, 2, 8], [9, 5, 6]] as const) pc.vline(x, y, y + l, 0xc8a24a);
  pc.rect(4, 3, 5, 3, 0x1a1a1e); pc.rect(10, 7, 4, 3, 0x1a1a1e); pc.rect(1, 10, 3, 1, 0x1a1a1e);
  for (let x = 4; x < 9; x++) { pc.set(x, 2, 0xd8dce0); pc.set(x, 6, 0xd8dce0); }
  pc.set(13, 1, 0xc83a2a); pc.set(14, 1, 0x3a5ac8); pc.set(2, 7, 0xe8c040);
});
const D_TYPEKEYS = decal('i_v_type_keys', 20, 10, (pc) => {
  pc.fill(0x1e2622);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 9 - (r === 3 ? 4 : 0); c++) {
    const x = 1 + c * 2 + (r % 2) + (r === 3 ? 4 : 0), y = 1 + r * 2;
    pc.set(x, y, 0xe8e2d2); pc.set(x + 1, y, 0xc8c2b2);
  }
  pc.hline(5, 14, 9, 0xe8e2d2);
});
const D_TYPEPAPER = decal('i_v_type_paper', 10, 12, (pc) => { pc.fill(0xf2ece0); for (let y = 2; y < 11; y += 2) dashes(pc, 1, y, 8, 0x3a3a3a, y + 2, 0.8); txt(pc, 'I', 1, 0, 0x2a2a2a); });
const D_AWARD = decal('i_v_award', 12, 8, (pc) => {
  const G = rp(0xd2a63e, 5, 0.5);
  pc.fill(G[3]); pc.strokeRect(0, 0, 12, 8, G[1]); pc.hline(1, 10, 1, G[4]);
  txtC(pc, 'NO.1', 6, 2, 0x3a2a10);
});
const D_JBOX_LID = decal('i_v_jbox_lid', 14, 10, (pc) => {
  pc.fill(0xd8b0c0); pc.strokeRect(0, 0, 14, 10, 0x9a6a7e); pc.strokeRect(1, 1, 12, 8, 0xf2d8e2);
  stampC(pc, 7, 3, ['.r.r.', 'rrrrr', '.rrr.', '..r..'], { r: 0xc83a5a });
});
const D_MIRROR = decal('i_v_mirror', 8, 8, (pc) => { pc.fill(0xb8c8d4); pc.set(1, 1, 0xffffff); pc.set(2, 2, 0xeef4f8); pc.set(6, 5, 0x8aa0b0); });
const D_STAMPS = decal('i_v_stamps', 16, 12, (pc) => {
  pc.fill(0x2a3a5a); pc.strokeRect(0, 0, 16, 12, 0x1a2440);
  const P = [0xc83a2a, 0x3a8a4a, 0xd8a83a, 0x5a6ab8, 0x8a3a8a, 0xe8862a];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
    const x = 1 + c * 4, y = 1 + r * 5;
    pc.rect(x, y, 3, 4, 0xf4ece0); pc.rect(x + 1, y + 1, 1, 2, P[(r * 4 + c) % P.length]);
    for (let k = 0; k < 4; k += 2) { pc.set(x, y + k, 0x2a3a5a); pc.set(x + 2, y + k + 1, 0x2a3a5a); }
  }
  txt(pc, 'A', 13, 6, 0xd2a63e);
});
const D_DRIVE = decal('i_v_drive', 14, 10, (pc) => {
  pc.fill(0x9aa0a6); pc.strokeRect(0, 0, 14, 10, 0x6a7076);
  pc.each((x, y) => { const d = Math.hypot(x + 0.5 - 6, y + 0.5 - 5); if (d < 3.6) pc.set(x, y, d < 1 ? 0x5a6066 : 0xc8ced4); });
  pc.rect(9, 1, 4, 3, 0xece6d4); dashes(pc, 9, 2, 4, 0x2a2a2a, 4);
  pc.set(1, 1, 0x3a3a3a); pc.set(12, 8, 0x3a3a3a); pc.set(1, 8, 0x3a3a3a);
});
const D_MEDALS = decal('i_v_medals', 16, 10, (pc) => {
  pc.fill(0x1e2a5a);
  pc.strokeRect(0, 0, 16, 10, 0x6a4a2a);
  const ribbons: [number, number[]][] = [[2, [0xc83a2a, 0xf2f2ee, 0x2a4aa8]], [7, [0x3a8a4a, 0xe8c040, 0x3a8a4a]], [12, [0x8a2a5a, 0xf2f2ee, 0x8a2a5a]]];
  for (const [x, cols] of ribbons) {
    for (let i = 0; i < 3; i++) pc.vline(x + i - 1, 1, 4, cols[i]);
    pc.each((px, py) => { const d = Math.hypot(px + 0.5 - (x + 0.5), py + 0.5 - 6.5); if (d < 1.8) pc.set(px, py, d < 0.8 ? 0xf4dc8a : 0xd2a63e); });
  }
});
const D_EARRINGS = decal('i_v_earbox', 10, 10, (pc) => {
  pc.fill(0x1e2a5a);
  pc.each((x, y) => { if ((x + y) % 5 === 0) pc.set(x, y, 0x26346a); });
  for (const cx of [3, 7]) { pc.set(cx, 3, 0xd2a63e); pc.set(cx, 4, 0xffffff); pc.set(cx - 1, 5, 0xc8e8ff); pc.set(cx, 5, 0xffffff); pc.set(cx + 1, 5, 0x9ac8f0); pc.set(cx, 6, 0xc8e8ff); }
});
const D_DECANTER = tex('i_v_crystal', 8, 12, (pc) => {
  pc.fill(0xc8d8de);
  for (let y = 0; y < 12; y++) for (let x = 0; x < 8; x++) if ((x + y) % 3 === 0) pc.set(x, y, 0xe8f2f6); else if ((x - y + 12) % 3 === 0) pc.set(x, y, 0x9ab0ba);
  for (let y = 5; y < 12; y++) for (let x = 0; x < 8; x++) pc.blend(x, y, 0xa8602a, 0.55);
  pc.vline(1, 0, 11, 0xffffff);
}, true);
const D_LIGHTER = decal('i_v_lighter', 6, 10, (pc) => {
  const G = rp(0xd2a63e, 5, 0.5);
  pc.fill(G[3]); pc.vline(0, 0, 9, G[4]); pc.vline(5, 0, 9, G[1]);
  pc.hline(0, 5, 3, G[1]);
  for (let y = 5; y < 9; y++) for (let x = 1; x < 5; x++) if ((x + y) % 2 === 0) pc.set(x, y, G[2]);
});
const D_SILVERWARE = decal('i_v_silverware', 20, 12, (pc) => {
  // inside of the open case: blue velvet with fitted cut-outs holding the cutlery
  pc.fill(0x22306a);
  pc.each((x, y) => { if ((x * 3 + y) % 7 === 0) pc.set(x, y, 0x2a3a7a); });
  const S = 0xdfe4ea, Sd = 0x9aa2ac;
  for (let i = 0; i < 4; i++) { const x = 1 + i * 2; pc.vline(x, 1, 10, S); pc.set(x, 1, 0xffffff); pc.set(x, 10, Sd); } // knives
  for (let i = 0; i < 3; i++) { const x = 10 + i * 3; pc.vline(x, 4, 10, S); pc.set(x - 1, 1, S); pc.set(x + 1, 1, S); pc.set(x, 1, S); pc.vline(x - 1, 1, 3, S); pc.vline(x + 1, 1, 3, S); } // forks
  pc.rect(18, 1, 1, 3, S); pc.vline(18, 4, 10, Sd);
});
const D_TROPHY_PLATE = decal('i_v_trophy_plate', 10, 4, (pc) => { pc.fill(0xd2a63e); pc.strokeRect(0, 0, 10, 4, 0x8a6a2a); dashes(pc, 1, 1, 8, 0x3a2a10, 6); dashes(pc, 2, 2, 6, 0x3a2a10, 7); });
const D_CANDLE = tex('i_v_candle', 4, 8, (pc) => { pc.fill(0xf2ead8); pc.vline(0, 0, 7, 0xffffff); pc.vline(3, 0, 7, 0xd8ccb4); pc.set(1, 2, 0xe8dcc4); }, true);
const D_FIG_FACE = decal('i_v_fig_face', 6, 6, (pc) => { pc.fill(0xf6f0ea); pc.set(1, 2, 0x2a3a6a); pc.set(4, 2, 0x2a3a6a); pc.set(2, 4, 0xd85a6a); pc.set(3, 4, 0xd85a6a); pc.set(0, 3, 0xf0c0c0); pc.set(5, 3, 0xf0c0c0); });
const D_FIG_DRESS = tex('i_v_fig_dress', 8, 8, (pc) => { pc.fill(0xb8d0e8); pc.each((x, y) => { if ((x * 2 + y) % 6 === 0) pc.set(x, y, 0xf2c0d0); if (y === 7) pc.set(x, y, 0xd2a63e); }); }, true);
const D_REEL_SIDE = tex('i_v_reel_side', 16, 4, (pc) => { pc.fill(0x2a2620); for (let x = 0; x < 16; x++) { pc.set(x, 1, 0x4a4030); pc.set(x, 2, (x % 3 === 0) ? 0x6a5a42 : 0x3a3428); } }, true);
const D_SOVEREIGN = decal('i_v_sovereign', 8, 8, (pc) => {
  const R = rp(0xc0c6cc, 5, 0.5);
  pc.each((x, y) => { const d = Math.hypot(x + 0.5 - 4, y + 0.5 - 4); if (d < 3.9) pc.set(x, y, d > 3.2 ? R[4] : R[2]); });
  stamp(pc, 2, 2, ['.ww', 'www', '.w.', 'ww.'], { w: R[4] });
});
const D_PEARL_CLASP = decal('i_v_clasp', 4, 4, (pc) => { pc.fill(0xd2a63e); pc.set(1, 1, 0xfff0c0); pc.set(2, 2, 0x8a6a2a); });

// ---------------------------------------------------------------- model helpers
/** a ring lying flat: a band built from short segments around a circle */
function ringBand(mb: MB, r: number, h: number, t: number, tex: string, segs = 12, o: { x?: number; y?: number; z?: number; tilt?: number } = {}) {
  mb.push().translate(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  if (o.tilt) mb.rotateX(o.tilt);
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2, l = (2 * Math.PI * r) / segs + 0.0008;
    mb.push().translate(Math.cos(a) * r, 0, Math.sin(a) * r).rotateY(-a + Math.PI / 2);
    mb.box(0, 0, 0, l, h, t, tex);
    mb.pop();
  }
  mb.pop();
}
/** a hanging chain / strand of beads following a loop on the floor */
function beadLoop(mb: MB, rx: number, rz: number, n: number, r: number, tex: string, o: { x?: number; z?: number; color?: number; segs?: number } = {}) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const wob = 1 + Math.sin(a * 3) * 0.06;
    mb.sphere((o.x ?? 0) + Math.cos(a) * rx * wob, r, (o.z ?? 0) + Math.sin(a) * rz * wob, r, o.segs ?? 5, 3, tex, { color: o.color ?? 0xffffff });
  }
}
function chainLinks(mb: MB, pts: [number, number][], y: number, tex: string, s = 0.004) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const steps = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / (s * 2.4)));
    for (let k = 0; k < steps; k++) {
      const t = k / steps, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      mb.push().translate(x, y, z).rotateY(Math.atan2(z1 - z0, x1 - x0) * -1 + (k % 2 ? Math.PI / 2 : 0));
      mb.box(0, 0, 0, s * 2.2, s * 0.6, s, tex);
      mb.pop();
    }
  }
}

const V = (o: { key: string; name: string; value: number; weight: number; cat?: any; desc: string; grid?: [number, number]; rare?: boolean; tags?: string[]; model: (mb: MB) => void; extra?: any }) => defItem({
  key: o.key, name: o.name, cat: o.cat ?? 'misc', weight: o.weight, value: o.value, rare: o.rare, grid: o.grid,
  tags: ['valuable', 'shiny', ...(o.tags || [])], desc: o.desc, model: o.model, noStack: true, ...(o.extra || {}),
});

// ---------------------------------------------------------------- jewellery
V({
  key: 'wedding_ring', name: 'Wedding Ring', value: 320, weight: 0.006, grid: [1, 1], tags: ['jewelry', 'gold'],
  desc: 'A plain gold band, worn thin on one side. Engraved inside: "ALWAYS — R." It was sewn into a cushion seam, like someone hid it from someone.',
  model: (mb) => { ringBand(mb, 0.011, 0.004, 0.0025, S_GOLD, 14, { y: 0.0 }); ringBand(mb, 0.0098, 0.0042, 0.0006, S_GOLD_DK, 14, { y: 0.0 }); },
});
V({
  key: 'engagement_ring', name: 'Engagement Ring', value: 880, weight: 0.007, grid: [1, 1], rare: true, tags: ['jewelry', 'gold', 'diamond'],
  desc: 'White gold, a single stone in a six-claw setting. The stone throws the fluorescent light back as tiny rainbows. Real, as far as anything is.',
  model: (mb) => {
    mb.push().rotateX(-Math.PI / 2).translate(0, 0, 0.0115);
    ringBand(mb, 0.0105, 0.0035, 0.0022, S_SILVER, 14);
    mb.pop();
    // claws and the stone on top
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; mb.box(Math.cos(a) * 0.0032, 0.0225, Math.sin(a) * 0.0032, 0.0012, 0.004, 0.0012, S_SILVER); }
    mb.cylinder(0, 0.0235, 0, 0.0038, 0.002, 6, 'i_v_crystal', { rTop: 0.0028, color: 0xeaf6ff, emissive: 0.5 });
    mb.cylinder(0, 0.0215, 0, 0.0012, 0.002, 6, 'i_v_crystal', { rTop: 0.0038, color: 0xc8e4ff, emissive: 0.3 });
  },
});
V({
  key: 'gold_chain', name: 'Heavy Gold Chain', value: 640, weight: 0.08, grid: [1, 1], rare: true, tags: ['jewelry', 'gold'],
  desc: 'Thick curb links, a lobster clasp, a hallmark that reads 9CT. Somebody wore this every day until they stopped.',
  model: (mb) => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI * 2; pts.push([Math.cos(a) * 0.05 + Math.sin(a * 2) * 0.008, Math.sin(a) * 0.035]); }
    chainLinks(mb, pts, 0.002, S_GOLD, 0.0045);
    mb.box(0.052, 0.002, 0.0, 0.012, 0.005, 0.006, S_GOLD_DK);
  },
});
V({
  key: 'pearl_necklace', name: 'Pearl Necklace', value: 690, weight: 0.05, grid: [1, 1], rare: true, tags: ['jewelry', 'pearl'],
  desc: 'One strand, hand-knotted, graduated pearls with a gold box clasp. Cold for a moment when you pick it up, then not.',
  model: (mb) => {
    beadLoop(mb, 0.052, 0.04, 30, 0.0042, S_PEARL, { segs: 5 });
    mb.box(0.054, 0.003, 0, 0.008, 0.005, 0.006, D_PEARL_CLASP, { fit: true });
  },
});
V({
  key: 'cameo_brooch', name: 'Cameo Brooch', value: 290, weight: 0.02, grid: [1, 1], tags: ['jewelry', 'antique'],
  desc: 'A carved shell profile of a woman looking left, on terracotta, in a gold rope frame. The pin on the back is bent from being torn off a lapel.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.018, 0.005, 10, { sides: S_GOLD, top: D_CAMEO, bottom: S_GOLD_DK }, { fit: true });
    mb.push().scale(1, 1, 1.25); mb.cylinder(0, 0.005, 0, 0.0155, 0.002, 10, { sides: S_GOLD, top: D_CAMEO }, { fit: true }); mb.pop();
    mb.box(0.0, 0.0, -0.002, 0.03, 0.0015, 0.0015, S_GOLD_DK);
  },
});
V({
  key: 'diamond_earrings', name: 'Diamond Earrings', value: 780, weight: 0.03, grid: [1, 1], rare: true, tags: ['jewelry', 'diamond'],
  desc: 'A pair of drop earrings in a navy velvet box. The box still has the jeweller\'s receipt folded under the cushion. The date on it is tomorrow.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.05, 0.022, 0.05, S_VELVET_B);
    mb.flat(0, 0.0221, 0.002, 0.044, 0.042, D_EARRINGS, { emissive: 0.15 });
    // lid standing open behind
    mb.push().translate(0, 0.022, -0.025).rotateX(-1.75);
    mb.box(0, 0, 0.025, 0.05, 0.008, 0.05, S_VELVET_B);
    mb.pop();
    mb.box(0, 0.0, 0.0, 0.052, 0.004, 0.052, S_GOLD_DK);
  },
});
V({
  key: 'jewellery_box', name: 'Jewellery Box', value: 210, weight: 0.6, grid: [2, 2], tags: ['antique', 'music'],
  desc: 'Pink lacquer, a mirror in the lid, a ballerina that still turns. The tune is one you know and can\'t name. The ring slots are empty; somebody got here first.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.16, 0.07, 0.11, T.plastic, { color: 0xd8a8bc });
    mb.box(0, 0.002, 0.056, 0.15, 0.03, 0.002, T.plastic, { color: 0xc890a8 });
    mb.box(0, 0.016, 0.058, 0.02, 0.006, 0.004, S_GOLD); // drawer pull
    mb.box(0, 0.07, 0, 0.152, 0.004, 0.102, S_VELVET);
    for (const x of [-0.05, -0.02, 0.01]) mb.box(x, 0.074, 0.02, 0.006, 0.006, 0.05, S_VELVET);
    // ballerina on her spring
    mb.cylinder(0.045, 0.074, 0.01, 0.002, 0.03, 4, S_GOLD);
    mb.cylinder(0.045, 0.1, 0.01, 0.009, 0.012, 6, T.white, { rTop: 0.002, color: 0xf2d8e2 });
    mb.sphere(0.045, 0.118, 0.01, 0.004, 5, 3, S_PORC);
    // lid propped open
    mb.push().translate(0, 0.07, -0.055).rotateX(-1.85);
    mb.box(0, 0, 0.055, 0.16, 0.012, 0.11, T.plastic, { color: 0xd8a8bc });
    mb.flat(0, 0.0121, 0.055, 0.14, 0.09, D_JBOX_LID);
    mb.flat(0, -0.0005, 0.055, 0.12, 0.08, D_MIRROR, { rot: Math.PI, emissive: 0.2 });
    mb.pop();
  },
});

// ---------------------------------------------------------------- watches & cash
V({
  key: 'gold_watch', name: 'Gold Wristwatch', value: 580, weight: 0.09, grid: [1, 1], rare: true, tags: ['watch', 'gold'],
  desc: 'A gold-plated dress watch on a jubilee bracelet. Still ticking. It runs four minutes slow, then four minutes fast, then right.',
  model: (mb) => {
    mb.cylinder(0, 0.004, 0, 0.019, 0.009, 12, { sides: S_GOLD, top: D_WATCH_GOLD }, { fit: true });
    mb.box(0.021, 0.008, 0, 0.004, 0.003, 0.003, S_GOLD_DK);
    for (const s of [-1, 1]) for (let k = 0; k < 5; k++) mb.box(0, 0.003 - k * 0.0003, s * (0.024 + k * 0.009), 0.017, 0.0035, 0.008, k % 2 ? S_GOLD_DK : S_GOLD);
  },
});
V({
  key: 'pocket_watch', name: 'Pocket Watch', value: 440, weight: 0.11, grid: [1, 1], tags: ['watch', 'gold', 'antique'],
  desc: 'A hunter-case pocket watch on a fob chain. The lid is engraved with a railway engine. Wound tight. The hands point at a time with no number.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.025, 0.012, 14, { sides: S_GOLD, top: D_POCKETW, bottom: S_GOLD_DK }, { fit: true });
    mb.cylinder(0, 0.0, -0.028, 0.004, 0.008, 6, S_GOLD); // crown
    ringBand(mb, 0.005, 0.002, 0.0015, S_GOLD, 8, { z: -0.035, y: 0.003 });
    // the open lid, flipped back flat
    mb.cylinder(0, 0.0, 0.054, 0.024, 0.003, 14, { sides: S_GOLD, top: S_GOLD, bottom: S_GOLD_DK });
    chainLinks(mb, [[0, -0.04], [0.03, -0.06], [0.06, -0.05], [0.075, -0.02], [0.07, 0.01]], 0.002, S_GOLD, 0.003);
    mb.box(0.07, 0.002, 0.016, 0.014, 0.004, 0.005, S_GOLD_DK);
  },
});
V({
  key: 'cash_roll', name: 'Roll of Banknotes', value: 260, weight: 0.12, grid: [1, 1], tags: ['cash', 'paper'],
  desc: 'Old notes rolled tight under a red rubber band, the kind people kept behind a loose skirting board for emergencies. Every face on them has been scratched out with a pin.',
  model: (mb) => {
    rodX(mb, -0.035, 0.035, 0.018, 0.018, 0.018, 10, D_CASH_SIDE, { fit: true });
    mb.push().translate(0.0352, 0.018, 0).rotateZ(Math.PI / 2); mb.flat(0, 0, 0, 0.034, 0.034, D_CASH_END); mb.pop();
    mb.push().translate(-0.0352, 0.018, 0).rotateZ(-Math.PI / 2); mb.flat(0, 0, 0, 0.034, 0.034, D_CASH_END); mb.pop();
    // a loose note curling off the roll
    mb.push().translate(0.0, 0.002, 0.028).rotateY(0.3); mb.box(0, 0, 0, 0.06, 0.001, 0.028, 'i_v_cash_side', { color: 0xd8e4c8 }); mb.pop();
  },
});
V({
  key: 'coin_jar', name: 'Jar of Coins', value: 130, weight: 1.6, cat: 'material', grid: [1, 2], tags: ['coins', 'glass'],
  desc: 'A pickle jar three-quarters full of change, a holiday fund that never got spent. Heavy enough to brain somebody with.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.055, 0.15, 10, { sides: D_COINJAR, top: D_COINS_TOP, bottom: T.glass }, { fit: true });
    mb.cylinder(0, 0.15, 0, 0.045, 0.012, 10, T.glass, { rTop: 0.042, color: 0xd8e4e8 });
    mb.cylinder(0, 0.162, 0, 0.046, 0.016, 10, { sides: T.tin, top: T.tinTop }, { fit: true, color: 0xc8a050 });
  },
});
V({
  key: 'silver_dollars', name: 'Silver Dollar Roll', value: 250, weight: 0.5, cat: 'material', grid: [1, 1], tags: ['coins', 'silver'],
  desc: 'A paper roll of heavy silver coins, the end torn open. Somebody\'s grandmother\'s collection, every coin a different year, every year a leap year.',
  model: (mb) => {
    rodX(mb, -0.045, 0.045, 0.02, 0.0195, 0.0195, 10, T.pages, { color: 0xc8a878 });
    mb.push().translate(0.05, 0.02, 0).rotateZ(Math.PI / 2); mb.cylinder(0, -0.006, 0, 0.019, 0.006, 10, { sides: S_SILVER, top: D_SOVEREIGN }, { fit: true }); mb.pop();
    for (let i = 0; i < 3; i++) mb.cylinder(0.072 + i * 0.012, 0.0, 0.012 - i * 0.01, 0.019, 0.004, 10, { sides: S_SILVER, top: D_SOVEREIGN }, { fit: true });
  },
});
V({
  key: 'gold_teeth', name: 'Gold Teeth', value: 390, weight: 0.03, grid: [1, 1], tags: ['gold', 'grim'],
  desc: 'Five gold crowns in a twist of clear plastic, one still with a root on it. You don\'t want to know whose. You put them in your pocket anyway.',
  model: (mb) => {
    mb.sphere(0, 0.012, 0, 0.022, 7, 4, T.plastic, { sy: 0.55, color: 0xe8eef0 });
    mb.cylinder(0, 0.02, -0.024, 0.004, 0.012, 5, T.plastic, { color: 0xe8eef0, rTop: 0.008 });
    const P: [number, number, number][] = [[-0.008, 0.012, 0.004], [0.006, 0.013, 0.006], [0.0, 0.015, -0.006], [0.012, 0.011, -0.004], [-0.012, 0.012, -0.008]];
    for (const [x, y, z] of P) { mb.cylinder(x, y - 0.004, z, 0.0042, 0.006, 6, S_GOLD, { rTop: 0.0034 }); mb.cylinder(x, y + 0.002, z, 0.0034, 0.002, 6, S_GOLD_DK, { rTop: 0.002 }); }
  },
});
V({
  key: 'dentures', name: 'Dentures', value: 140, weight: 0.05, grid: [1, 1], tags: ['grim', 'gold'],
  desc: 'A full upper plate, pink acrylic and yellowed teeth, one gold molar. Hoppers pay for the gold. They take the rest too.',
  model: (mb) => {
    mb.push().scale(1, 1, 0.9);
    for (let i = 0; i < 12; i++) {
      const a = Math.PI * (0.08 + (i / 11) * 0.84);
      const x = Math.cos(a) * 0.026, z = -Math.sin(a) * 0.024 + 0.012;
      mb.box(x, 0, z, 0.007, 0.008, 0.008, T.plastic, { color: 0xd87a80 });
      mb.box(x, 0.008, z + 0.001, 0.0058, 0.008, 0.0058, i === 9 ? S_GOLD : T.white, { color: i === 9 ? 0xffffff : 0xf0e8d0 });
    }
    mb.pop();
  },
});

// ---------------------------------------------------------------- household antiques
V({
  key: 'silverware_set', name: 'Silverware Canteen', value: 370, weight: 2.4, grid: [3, 2], tags: ['silver', 'antique'],
  desc: 'A walnut canteen of sterling cutlery for six, every piece monogrammed with the same initial. Two forks are missing. Nobody here eats with forks.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.34, 0.07, 0.22, S_WALNUT);
    mb.box(0, 0.002, 0.111, 0.33, 0.06, 0.002, S_WALNUT, { color: 0xc89070 });
    mb.flat(0, 0.0705, 0.0, 0.32, 0.2, D_SILVERWARE, { emissive: 0.1 });
    mb.box(0, 0.035, 0.113, 0.03, 0.018, 0.004, S_BRASS);
    // lid hinged open behind
    mb.push().translate(0, 0.07, -0.11).rotateX(-1.7);
    mb.box(0, 0, 0.11, 0.34, 0.02, 0.22, S_WALNUT);
    mb.box(0, -0.001, 0.11, 0.32, 0.002, 0.2, S_VELVET_B);
    mb.pop();
  },
});
V({
  key: 'silver_candlestick', name: 'Silver Candlestick', value: 180, weight: 0.9, grid: [1, 2], tags: ['silver', 'antique'],
  desc: 'Weighted silver, a knopped stem, a stub of white candle still in the cup. The wax is warm. Nothing in this room is lit.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.055, 0.016, 10, S_SILVER, { rTop: 0.04 });
    mb.cylinder(0, 0.016, 0, 0.014, 0.05, 8, S_SILVER, { rTop: 0.011 });
    mb.sphere(0, 0.075, 0, 0.018, 8, 4, S_SILVER, { sy: 0.7 });
    mb.cylinder(0, 0.085, 0, 0.011, 0.08, 8, S_SILVER, { rTop: 0.014 });
    mb.sphere(0, 0.168, 0, 0.016, 8, 4, S_SILVER, { sy: 0.6 });
    mb.cylinder(0, 0.172, 0, 0.026, 0.022, 10, S_SILVER, { rTop: 0.03 });
    mb.cylinder(0, 0.19, 0, 0.011, 0.05, 8, D_CANDLE, { fit: true });
    mb.box(0, 0.24, 0, 0.002, 0.008, 0.002, T.black);
  },
});
V({
  key: 'porcelain_doll', name: 'Porcelain Doll', value: 170, weight: 0.7, grid: [1, 2], tags: ['antique', 'doll', 'creepy'],
  desc: 'Bisque head, glass eyes, a burgundy velvet dress with a lace hem. There is a hairline crack across one cheek. Its eyes are open when you put it down and open when you look back. It never blinked. That is worse.',
  model: (mb) => {
    // seated, legs out: dress skirt, bodice, head, ringlets
    mb.cylinder(0, 0, 0, 0.065, 0.06, 8, D_DOLL_DRESS, { rTop: 0.035 });
    mb.cylinder(0, 0.06, 0, 0.032, 0.06, 8, D_DOLL_DRESS, { rTop: 0.026 });
    mb.box(0, 0.11, 0.0, 0.034, 0.008, 0.03, T.white, { color: 0xf2ece4 }); // lace collar
    for (const s of [-1, 1]) { mb.push().translate(s * 0.03, 0.105, 0.0).rotateZ(s * 0.5); mb.box(0, -0.04, 0, 0.012, 0.045, 0.012, D_DOLL_DRESS); mb.box(0, -0.065, 0, 0.01, 0.012, 0.01, S_PORC); mb.pop(); }
    for (const s of [-1, 1]) { mb.box(s * 0.018, 0.005, 0.07, 0.016, 0.014, 0.05, T.white, { color: 0xf2f0ea }); mb.box(s * 0.018, 0.004, 0.1, 0.018, 0.016, 0.02, T.black); }
    mb.sphere(0, 0.148, 0.0, 0.032, 8, 5, S_PORC);
    mb.panel(-0.022, 0.0315, 0.022, 0.0315, 0.13, 0.166, D_DOLL_FACE, { fit: true });
    mb.sphere(0, 0.162, -0.006, 0.034, 8, 4, 'i_v_walnut', { sy: 0.8, color: 0x9a5a2a });
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) mb.cylinder(s * 0.03, 0.105 + k * 0.015, -0.004, 0.007, 0.014, 5, 'i_v_walnut', { color: 0x9a5a2a });
    mb.box(0.0, 0.178, -0.015, 0.05, 0.012, 0.012, T.white, { color: 0x8a3a5a }); // bow
  },
});
V({
  key: 'antique_figurine', name: 'Porcelain Figurine', value: 220, weight: 0.4, grid: [1, 2], tags: ['antique', 'porcelain'],
  desc: 'A shepherdess with a crook and a lamb, glazed pale blue, gilt at the hem. Factory mark on the base. She is facing the wall no matter how you set her down.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.04, 0.012, 10, { sides: S_GOLD, top: S_PORC }, { color: 0xffffff });
    mb.cylinder(0, 0.012, 0, 0.034, 0.07, 8, D_FIG_DRESS, { rTop: 0.016 });
    mb.cylinder(0, 0.082, 0, 0.014, 0.035, 8, D_FIG_DRESS, { rTop: 0.012 });
    mb.sphere(0, 0.13, 0, 0.014, 7, 4, S_PORC);
    mb.panel(-0.009, 0.0141, 0.009, 0.0141, 0.122, 0.138, D_FIG_FACE, { fit: true });
    mb.cylinder(0, 0.14, 0, 0.022, 0.004, 8, S_PORC, { color: 0xf2e8b0 }); // bonnet brim
    mb.sphere(0, 0.143, -0.002, 0.012, 6, 3, S_PORC, { color: 0xf2e8b0, sy: 0.7 });
    mb.box(0.03, 0.012, 0.0, 0.004, 0.13, 0.004, S_GOLD); // crook
    mb.box(0.026, 0.14, 0.0, 0.012, 0.004, 0.004, S_GOLD);
    mb.sphere(-0.03, 0.03, 0.02, 0.016, 6, 4, S_PORC, { sy: 0.8 }); // lamb
    mb.sphere(-0.044, 0.04, 0.026, 0.008, 5, 3, S_PORC);
  },
});
V({
  key: 'crystal_decanter', name: 'Crystal Decanter', value: 230, weight: 1.3, grid: [1, 2], tags: ['glass', 'antique'],
  desc: 'Cut lead crystal, a ball stopper, two fingers of something amber left in the bottom. It smells like a father\'s study on a Sunday.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.055, 0.12, 8, D_DECANTER, { fit: true, rTop: 0.06 });
    mb.cylinder(0, 0.12, 0, 0.06, 0.03, 8, D_DECANTER, { fit: true, rTop: 0.022 });
    mb.cylinder(0, 0.15, 0, 0.018, 0.035, 8, 'i_v_crystal', { color: 0xe8f2f6 });
    mb.sphere(0, 0.198, 0, 0.026, 8, 5, 'i_v_crystal', { color: 0xf2f8fa, emissive: 0.15 });
  },
});
V({
  key: 'stamp_album', name: 'Stamp Album', value: 330, weight: 0.9, cat: 'literature', grid: [2, 2], tags: ['paper', 'antique'],
  desc: 'A blue leather stock book, every page full: empires that don\'t exist, a queen on a stamp twice, a misprint with the plane flying upside down. Someone spent a whole life on it.',
  model: (mb) => {
    slab(mb, 0.22, 0.03, 0.17, D_STAMPS, T.leather, 0x2a3a6a);
    mb.box(-0.105, 0, 0, 0.012, 0.031, 0.17, T.leather, { color: 0x1a2440 });
    mb.box(0.002, 0.004, 0.0, 0.212, 0.022, 0.162, T.pages);
    mb.box(0.03, 0.031, 0.084, 0.05, 0.0015, 0.01, S_GOLD);
  },
});
V({
  key: 'medal_case', name: 'Medal Case', value: 410, weight: 0.5, grid: [2, 1], tags: ['antique', 'gold'],
  desc: 'Three service medals pinned to navy felt in a glass-fronted frame. The name card has been taken out. The medals are for wars with no names either.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.2, 0.025, 0.13, S_WALNUT);
    mb.flat(0, 0.0251, 0, 0.18, 0.11, D_MEDALS, { emissive: 0.08 });
    mb.box(0, 0.025, -0.06, 0.2, 0.004, 0.01, S_WALNUT); mb.box(0, 0.025, 0.06, 0.2, 0.004, 0.01, S_WALNUT);
    mb.box(-0.095, 0.025, 0, 0.01, 0.004, 0.13, S_WALNUT); mb.box(0.095, 0.025, 0, 0.01, 0.004, 0.13, S_WALNUT);
    mb.flat(0, 0.0275, 0, 0.18, 0.11, 'glass_dark', { color: 0xd8e8f0, emissive: 0.05 });
  },
});
V({
  key: 'gold_award', name: 'Gold-Plated Award', value: 270, weight: 1.8, grid: [1, 2], tags: ['gold', 'office'],
  desc: 'MERIDIAN INSTITUTE — EMPLOYEE OF THE DECADE. Gold plate over pot metal on a marble plinth. The engraved name has been ground off and re-engraved, three times.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.11, 0.04, 0.09, 'marble', { color: 0x2a2a30 });
    mb.box(0, 0.04, 0, 0.09, 0.018, 0.07, 'marble', { color: 0x3a3a42 });
    mb.panel(-0.035, 0.0455, 0.035, 0.0455, 0.008, 0.032, D_TROPHY_PLATE, { fit: true });
    mb.cylinder(0, 0.058, 0, 0.01, 0.06, 8, S_GOLD);
    mb.cylinder(0, 0.118, 0, 0.012, 0.02, 8, S_GOLD, { rTop: 0.04 });
    mb.cylinder(0, 0.138, 0, 0.04, 0.05, 10, S_GOLD, { rTop: 0.046 });
    for (const s of [-1, 1]) { mb.push().translate(s * 0.05, 0.16, 0).rotateZ(s * 0.4); mb.box(0, 0, 0, 0.008, 0.035, 0.006, S_GOLD_DK); mb.pop(); }
    mb.panel(-0.025, 0.031, 0.025, 0.031, 0.06, 0.09, D_AWARD, { fit: true });
  },
});
V({
  key: 'gold_lighter', name: 'Gold Lighter', value: 200, weight: 0.08, grid: [1, 1], tags: ['gold', 'lighter'],
  desc: 'A heavy gold-plated petrol lighter with a lid that clacks. It still lights. A rare thing in here that is worth something AND useful. Decide which.',
  extra: { uses: 1, durability: 400 },
  model: (mb) => {
    mb.box(0, 0, 0, 0.038, 0.058, 0.014, { all: S_GOLD, south: D_LIGHTER, north: D_LIGHTER }, { fit: { south: true, north: true } });
    mb.box(0.0, 0.058, 0, 0.038, 0.002, 0.014, S_GOLD_DK);
    // lid flipped open, chimney and wheel
    mb.push().translate(0.019, 0.06, 0).rotateZ(-2.2); mb.box(-0.019, 0, 0, 0.038, 0.018, 0.014, S_GOLD); mb.pop();
    mb.box(-0.004, 0.06, 0, 0.016, 0.018, 0.012, S_SILVER);
    mb.cylinder(0.01, 0.07, -0.004, 0.004, 0.008, 6, S_SILVER);
  },
});

// ---------------------------------------------------------------- media & electronics
V({
  key: 'film_reel', name: 'Film Reel', value: 140, weight: 1.1, cat: 'electronics', grid: [2, 2], tags: ['film', 'media'],
  desc: 'A 16mm reel in a dented steel can, the label typed: "RECALL TRIAL 4 — DO NOT SCREEN". The film inside smells of vinegar. Hold a frame to the light: a corridor, a door, you.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.1, 0.02, 14, { sides: 'chrome', top: D_FILMCAN, bottom: 'metal_grey' }, { fit: true });
    // the reel half out of the can, tilted against it
    mb.push().translate(0.07, 0.05, 0.03).rotateZ(1.25).rotateY(0.3);
    mb.cylinder(0, 0, 0, 0.085, 0.004, 12, 'chrome');
    mb.cylinder(0, 0.004, 0, 0.07, 0.016, 12, { sides: D_REEL_SIDE, top: 'i_v_lacquer' });
    mb.cylinder(0, 0.02, 0, 0.085, 0.004, 12, 'chrome');
    mb.pop();
  },
});
V({
  key: 'vhs_stack', name: 'Stack of VHS Tapes', value: 70, weight: 0.8, cat: 'electronics', grid: [1, 2], tags: ['media', 'tape'],
  desc: 'Three rental tapes from a shop called BE KIND, never returned. Handwritten labels: "BIRTHDAY 89", "DO NOT TAPE OVER", and one that just says "WATCH".',
  model: (mb) => {
    for (let i = 0; i < 3; i++) {
      mb.push().translate(i * 0.006 - 0.006, i * 0.026, i * 0.004).rotateY((i - 1) * 0.12);
      mb.box(0, 0, 0, 0.188, 0.025, 0.104, { all: T.black, top: D_VHS_TOP, south: D_VHS_SPINE }, { fit: { top: true, south: true } });
      mb.pop();
    }
  },
});
V({
  key: 'camcorder', name: 'VHS Camcorder', value: 310, weight: 1.9, cat: 'electronics', grid: [3, 2], rare: true, tags: ['media', 'camera'],
  desc: 'A shoulder-strap VHS camcorder, the tape door taped shut. The red light comes on by itself when nobody is holding it. The tape inside is full. It is labelled with today\'s date.',
  model: (mb) => {
    mb.box(0, 0.02, 0, 0.26, 0.11, 0.1, { all: 'plastic_black', east: D_CAMCORDER, west: D_CAMCORDER }, { fit: { east: true, west: true } });
    mb.box(-0.02, 0.0, 0, 0.2, 0.02, 0.08, 'plastic_black', { color: 0x3a3a3e });
    rodX(mb, 0.13, 0.2, 0.08, 0.035, 0.032, 10, 'plastic_black', { color: 0x2a2a2e });
    mb.push().translate(0.2005, 0.08, 0).rotateZ(Math.PI / 2); mb.cylinder(0, 0, 0, 0.026, 0.004, 10, { sides: 'plastic_black', top: 'glass_dark' }, { emissive: 0.25, color: 0x8ab0d0 }); mb.pop();
    mb.box(-0.08, 0.13, 0, 0.12, 0.03, 0.06, 'plastic_black', { color: 0x2e2e32 }); // handle
    rodX(mb, -0.15, -0.09, 0.105, 0.016, 0.016, 8, 'plastic_black', { color: 0x1a1a1e }); // viewfinder
    mb.box(0.11, 0.115, 0.03, 0.006, 0.006, 0.006, 'led_red', { emissive: 1.6 });
    mb.box(0.0, 0.07, 0.051, 0.06, 0.03, 0.002, 'screen_off');
  },
});
V({
  key: 'boombox', name: 'Boombox', value: 240, weight: 3.6, cat: 'electronics', grid: [3, 2], tags: ['media', 'music', 'radio'],
  desc: 'A twin-speaker stereo cassette boombox, chrome trim, a carry handle worn smooth. There is a tape in the deck: a mixtape titled "FOR THE WAY HOME".',
  model: (mb) => {
    mb.box(0, 0, 0, 0.46, 0.22, 0.12, { all: 'plastic_black', south: D_BOOMBOX }, { fit: { south: true }, color: 0x4a4a52 });
    mb.box(0, 0.22, 0, 0.44, 0.01, 0.1, 'chrome');
    for (const s of [-1, 1]) mb.box(s * 0.19, 0.23, 0, 0.02, 0.05, 0.03, 'chrome');
    mb.box(0, 0.27, 0, 0.4, 0.016, 0.03, 'plastic_black');
    rodX(mb, -0.2, 0.2, 0.26, 0.004, 0.004, 4, 'chrome', { cz: -0.05 }); // antenna
    for (const s of [-1, 1]) mb.box(s * 0.2, -0.004, 0.0, 0.04, 0.008, 0.1, 'rubber_black');
  },
});
V({
  key: 'circuit_board', name: 'Circuit Boards', value: 90, weight: 0.4, cat: 'electronics', grid: [2, 1], tags: ['electronics', 'scrap'],
  desc: 'Green boards prised out of something expensive: gold-fingered edge connectors, ceramic chips, a crystal oscillator. Hoppers love the gold in the traces.',
  model: (mb) => {
    for (let i = 0; i < 3; i++) {
      mb.push().translate((i - 1) * 0.012, i * 0.007, (i - 1) * 0.01).rotateY((i - 1) * 0.35);
      mb.box(0, 0, 0, 0.16, 0.003, 0.1, { all: 'plastic_black', top: D_PCB }, { fit: { top: true }, color: 0x2a6a3a });
      mb.box(0.03, 0.003, 0.01, 0.03, 0.006, 0.02, 'plastic_black', { color: 0x1a1a1e });
      mb.box(-0.04, 0.003, -0.02, 0.02, 0.004, 0.012, 'plastic_black', { color: 0x1a1a1e });
      mb.box(0.0, 0.003, -0.045, 0.1, 0.002, 0.006, S_GOLD);
      mb.cylinder(-0.06, 0.003, 0.03, 0.006, 0.012, 6, 'metal_grey', { color: 0x3a5ab0 });
      mb.pop();
    }
  },
});
V({
  key: 'copper_bundle', name: 'Copper Wire Bundle', value: 110, weight: 2.2, cat: 'material', grid: [2, 2], tags: ['wire', 'scrap', 'copper'],
  desc: 'A fat coil of stripped copper wire, pulled out of a wall in one long piece. It is warm in the middle, like it was carrying current until a moment ago.',
  model: (mb) => {
    for (let k = 0; k < 4; k++) ringBand(mb, 0.07 - k * 0.006, 0.012, 0.016, S_COPPER, 14, { y: k * 0.011 });
    for (let k = 0; k < 3; k++) mb.box(0.02 + k * 0.01, 0.044, 0.0, 0.008, 0.008, 0.11, 'i_v_copper', { color: 0xffffff });
    mb.box(0.075, 0.0, 0.03, 0.06, 0.006, 0.006, S_COPPER);
    mb.box(-0.06, 0.04, -0.04, 0.03, 0.03, 0.006, 'plastic_black', { color: 0x2a2a30 }); // tie
  },
});
V({
  key: 'hard_drive_old', name: 'Old Hard Drive', value: 120, weight: 0.7, cat: 'electronics', grid: [1, 1], tags: ['electronics', 'data'],
  desc: 'A full-height hard disk with a Meridian asset tag. It clicks when nothing is plugged into it. The tag says it contains "PERSONNEL — RECALL — ALL".',
  model: (mb) => {
    mb.box(0, 0, 0, 0.15, 0.04, 0.1, { all: 'metal_grey', top: D_DRIVE }, { fit: { top: true } });
    mb.box(0, 0.0, 0.05, 0.14, 0.03, 0.006, 'plastic_black');
    for (let i = 0; i < 6; i++) mb.box(-0.06 + i * 0.012, 0.012, 0.054, 0.006, 0.008, 0.004, 'chrome');
  },
});
V({
  key: 'typewriter', name: 'Typewriter', value: 250, weight: 7, cat: 'electronics', grid: [3, 3], tags: ['office', 'antique'],
  desc: 'A green portable typewriter, a page still in the roller. Every line on it is the same sentence: I WILL PAY WHAT I OWE. The carriage return dings by itself sometimes.',
  extra: { heavy: true },
  model: (mb) => {
    const G = 0x3a6a52;
    mb.box(0, 0, 0, 0.36, 0.06, 0.3, 'metal_painted_green', { color: 0xffffff });
    mb.wedge(0, 0.06, 0.04, 0.34, 0.2, 0.05, 0.02, 'metal_painted_green');
    mb.flat(0, 0.0705, 0.06, 0.3, 0.16, D_TYPEKEYS, { rot: 0 });
    mb.box(0, 0.06, -0.09, 0.36, 0.09, 0.12, 'metal_painted_green', { color: 0xffffff });
    rodX(mb, -0.2, 0.2, 0.16, 0.025, 0.025, 10, 'rubber_black'); // platen
    mb.cylinder(-0.21, 0.16, 0, 0.018, 0.02, 8, 'chrome');
    mb.box(0.23, 0.17, -0.02, 0.06, 0.01, 0.01, 'chrome'); // return lever
    mb.push().translate(0, 0.17, -0.1).rotateX(-0.25); mb.box(0, 0, 0, 0.2, 0.2, 0.002, D_TYPEPAPER, { fit: true }); mb.pop();
    for (const s of [-1, 1]) mb.box(s * 0.15, -0.006, 0.0, 0.04, 0.008, 0.26, 'rubber_black');
    void G;
  },
});

// ---------------------------------------------------------------- loot: valuables also turn up in the usual places
// (smashing furniture is the main source; see src/game/debt/values.ts). Runs after every table is registered.
queueMicrotask(() => {
  const add = (table: string, entry: [string, number, number?, number?]) => { const t = lootTable(table); if (t && !t.entries.some((e) => e[0] === entry[0])) t.entries.push(entry as any); };
  for (const [k, w] of [['wedding_ring', 0.8], ['gold_chain', 0.4], ['pearl_necklace', 0.4], ['cameo_brooch', 0.5], ['jewellery_box', 0.6], ['diamond_earrings', 0.2]] as const) add('bedroom_dresser', [k, w]);
  for (const [k, w] of [['wedding_ring', 0.5], ['pocket_watch', 0.3], ['dentures', 0.4], ['cash_roll', 0.4]] as const) add('nightstand', [k, w]);
  for (const [k, w] of [['cash_roll', 0.5], ['gold_watch', 0.25], ['gold_lighter', 0.3], ['hard_drive_old', 0.4]] as const) add('office_desk', [k, w]);
  for (const [k, w] of [['gold_award', 0.5], ['medal_case', 0.3]] as const) add('security_office', [k, w]);
  for (const [k, w] of [['silverware_set', 0.6], ['silver_candlestick', 0.5], ['crystal_decanter', 0.4], ['coin_jar', 0.6]] as const) add('kitchen_cabinet', [k, w]);
  for (const [k, w] of [['stamp_album', 0.6], ['antique_figurine', 0.5], ['film_reel', 0.3], ['vhs_stack', 0.6]] as const) add('bookshelf', [k, w]);
  for (const [k, w] of [['camcorder', 1], ['boombox', 1], ['vhs_stack', 1.5], ['circuit_board', 1]] as const) add('store_electronics', [k, w]);
  for (const [k, w] of [['circuit_board', 1.5], ['hard_drive_old', 0.6]] as const) add('electronics_small', [k, w]);
  for (const [k, w] of [['copper_bundle', 1], ['circuit_board', 0.6]] as const) add('garage_shelf', [k, w]);
  for (const [k, w] of [['wedding_ring', 1], ['gold_teeth', 0.6], ['gold_watch', 0.5], ['cash_roll', 0.8]] as const) add('survivor_corpse', [k, w]);
  for (const [k, w] of [['cash_roll', 1.5], ['gold_chain', 0.5], ['silver_dollars', 0.6]] as const) add('survivor_stash', [k, w]);
  for (const [k, w] of [['cash_roll', 0.6], ['gold_watch', 0.2]] as const) add('car_glovebox', [k, w]);
  for (const [k, w] of [['porcelain_doll', 0.5]] as const) add('toy_box', [k, w]);
});

void K; void dk; void lt; void txt; void stampC; void rodZ; void PixelCanvas;
