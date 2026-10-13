// Items stream — FOOD. Hunger/thirst on the 0..100 scale (a full meal ≈ 25–40,
// a can of beans ≈ 18). Calories are realistic for the item's real mass.
// fresh/rot in days (undefined = shelf stable). Sealed cans: canned:true +
// openedInto; the opened variant carries freshness and leaves 'empty_can'.
// Items with both `food` and `uses` (peanut butter, sugar, salt, oil, coffee,
// tea, gum…) describe ONE use / portion; recipes drain `uses` fractions.
import { defItem, FoodProps, ItemDef } from '../../items/item';
import {
  tex, labelTex, decal, T, K, rp, dk, lt, txt, txtC, stamp, stampC, dashes, bev, band, panels,
  can, bottle, pack, slab, rodX, rodZ, prism, at, ph, bayer, mixHex, MB, PixelCanvas,
} from './_kit';
import { IN, pot, bowl } from './_vessels';

// =====================================================================================
// texture painters
// =====================================================================================
/** content surface of an opened container (fit disc / top) */
function fillTex(name: string, base: number, specks: [number, number][], seed = 1, size = 10) {
  return tex(name, size, size, (pc) => {
    const R = rp(base, 4, 0.3);
    pc.each((x, y) => {
      let c = R[1 + (ph(x >> 1, y >> 1, seed) < 0.4 ? 1 : 0)];
      let acc = 0; const v = ph(x, y, seed + 7);
      for (const [col, p] of specks) { acc += p; if (v < acc) { c = col; break; } }
      pc.set(x, y, c);
    });
  });
}

/** wrap-around skin for round produce (u around, v top→bottom); highlight faces the camera */
function skinTex(name: string, base: number, o: { hl?: number; spots?: [number, number]; stripes?: number; top?: number; bottom?: number; seed?: number; w?: number; h?: number; amp?: number } = {}) {
  const W = o.w ?? 16, H = o.h ?? 8;
  return tex(name, W, H, (pc) => {
    const R = rp(base, 5, 0.45);
    pc.each((x, y) => {
      const ang = ((x + 0.5) / W - 0.125) * Math.PI * 2;
      const lit = Math.cos(ang) * 0.5 + 0.5;
      const vert = 1 - y / Math.max(1, H - 1);
      let v = 0.3 + lit * 0.3 + vert * 0.18 + (ph(x, y, o.seed ?? 3) - 0.5) * (o.amp ?? 0.14);
      if (o.stripes && x % o.stripes === 0) v -= 0.18;
      pc.set(x, y, R[Math.max(0, Math.min(4, Math.round(v * 4 + (bayer(x, y) - 0.5) * 0.7)))]);
      if (o.spots && ph(x, y, (o.seed ?? 3) + 5) < o.spots[1]) pc.set(x, y, o.spots[0]);
    });
    if (o.top !== undefined) for (let x = 0; x < W; x++) pc.set(x, 0, o.top);
    if (o.bottom !== undefined) for (let x = 0; x < W; x++) pc.set(x, H - 1, o.bottom);
    if (o.hl !== undefined) { const hx = Math.round(W * 0.125); pc.set(hx, 1, o.hl); pc.set(hx + 1, 2, o.hl); }
  }, true);
}

/** tileable item-density surface (meat, crust, cheese…) */
function surf(name: string, w: number, h: number, base: number, fn?: (pc: PixelCanvas, x: number, y: number) => void, spread = 0.4) {
  return tex(name, w, h, (pc) => {
    const R = rp(base, 5, spread);
    pc.each((x, y) => {
      const v = 0.5 + (ph(x >> 1, y >> 1, 9) - 0.5) * 0.4 + (ph(x, y, 10) - 0.5) * 0.15;
      pc.set(x, y, R[Math.max(0, Math.min(4, Math.round(v * 4)))]);
      if (fn) fn(pc, x, y);
    });
  }, true);
}

// =====================================================================================
// textures
// =====================================================================================
// ---- can labels (24x12, 2 panels; first panel faces the camera)
const L_BEANS = labelTex('i_can_beans', 24, 12, {
  bg: 0x2a8a86, band: 0xe2bf62, bandB: 0xe2bf62, iconY: 4,
  icon: ['..bb.bb.', '.bBbbBbb', 'bbBbbbBb', '.bbbbbb.'], pal: { b: 0xa8461e, B: 0xe0782e },
});
const L_SOUP = tex('i_can_soup', 24, 12, (pc) => {
  pc.fill(0xc0302a);
  pc.rect(0, 6, 24, 6, 0xeee4d2);
  pc.hline(0, 23, 6, 0xd4c8b2); pc.hline(0, 23, 0, 0x8e2220);
  panels(pc, 1, (x0, pw) => {
    const cx = x0 + pw / 2;
    dashes(pc, Math.round(cx) - 4, 2, 9, 0xf6efe0, 3); dashes(pc, Math.round(cx) - 3, 4, 7, 0xf6efe0, 6);
    // gold medallion
    pc.rect(Math.round(cx) - 1, 8, 3, 3, 0xd8b04a); pc.set(Math.round(cx), 9, 0xf4dc8a);
    dashes(pc, Math.round(cx) - 9, 9, 6, 0x8e2220, 4); dashes(pc, Math.round(cx) + 3, 9, 6, 0x8e2220, 5);
  });
}, true);
const L_PEACH = labelTex('i_can_peaches', 24, 12, {
  bg: 0xe8a038, band: 0x6a3a1c, bandB: 0x6a3a1c, iconY: 4,
  icon: ['.oo.oo.', 'oOboOOo', 'oOOoObo', '.oo.oo.'], pal: { o: 0xe0702a, O: 0xf6b84e, b: 0x8a3a1a },
});
const L_TUNA = labelTex('i_can_tuna', 24, 8, {
  bg: 0x2c5b94, stripe: 0xd8d8d0, iconY: 2, icon: ['..sss..s', '.sSSSsss', 'swSSSs.s', '..sss...'],
  pal: { s: 0x6a8eb0, S: 0xa8c4dc, w: 0x14202c },
});
const L_CORN = labelTex('i_can_corn', 24, 12, {
  bg: 0x3d7a38, band: 0xe4c443, bandB: 0xe4c443, iconY: 4,
  icon: ['.yyyy.', 'yYyYyg', 'yyYyYg', '.yyyy.'], pal: { y: 0xd8a62a, Y: 0xf6dc6a, g: 0x5a9a3a },
});
const L_DOG = tex('i_can_dogfood', 24, 12, (pc) => {
  pc.fill(0x8a3a26);
  band(pc, 0, 2, 0xe8c84a); pc.hline(0, 23, 2, 0x5a2416);
  band(pc, 11, 1, 0xe8c84a);
  panels(pc, 2, (x0, pw) => {
    const cx = x0 + pw / 2;
    stampC(pc, cx, 3, ['ww...ww', '.wwwww.', 'ww...ww'], { w: 0xf6efe2 });
    txtC(pc, 'DOG', cx, 6, 0xe8c84a);
  });
}, true);
const D_SPAM = decal('i_spam_front', 16, 12, (pc) => {
  pc.fill(0x2a4b8a);
  pc.rect(0, 1, 16, 6, 0xf0c419); pc.hline(0, 15, 7, 0xb08a10);
  txtC(pc, 'MEAT', 8, 1, 0x2a4b8a);
  pc.rect(3, 8, 10, 3, 0xe08a8a); pc.hline(3, 12, 8, 0xf2b4b0); pc.hline(3, 12, 10, 0xb86060);
  pc.set(5, 9, 0xf6d0c8); pc.set(9, 9, 0xf6d0c8);
});

// ---- opened-can contents
const F_BEANS = fillTex('i_fill_beans', 0x9a4a22, [[0x6a2e14, 0.25], [0xc87038, 0.25]], 2);
const F_SOUP = fillTex('i_fill_soup', 0xd08a3a, [[0xf0d090, 0.2], [0xe0702a, 0.06], [0x6a9a3a, 0.05]], 3);
const F_PEACH = fillTex('i_fill_peaches', 0xe8b860, [[0xf3982a, 0.35], [0xffe0a0, 0.1]], 4);
const F_TUNA = fillTex('i_fill_tuna', 0xcdb49a, [[0xa88a70, 0.3], [0xe8d8c4, 0.15]], 5);
const F_CORN = tex('i_fill_corn', 10, 10, (pc) => pc.each((x, y) => pc.set(x, y, (x + y) % 2 === 0 ? 0xf0c838 : (ph(x, y, 6) < 0.3 ? 0xc8961c : 0xe0ae24))));
const F_DOG = fillTex('i_fill_dogfood', 0x6a3a22, [[0x8a5232, 0.3], [0x9a7040, 0.12], [0x3e2012, 0.1]], 7);
const F_SPAM = fillTex('i_fill_spam', 0xd88a8a, [[0xf2b4b0, 0.18], [0xb86a6a, 0.12]], 8);

// ---- snacks & dry goods
const D_CHIPS = decal('i_chips_top', 14, 18, (pc) => {
  const R = rp(0xc8302a, 5, 0.4);
  pc.each((x, y) => pc.set(x, y, R[2 + (x < 3 ? 1 : 0) - (x > 11 ? 1 : 0)]));
  band(pc, 0, 2, R[0]); band(pc, 16, 2, R[0]);
  for (let x = 0; x < 14; x += 2) { pc.set(x, 1, R[1]); pc.set(x, 16, R[1]); }
  // yellow burst + chips
  pc.ellipse(7, 7, 5, 4, 0xf2c83a); pc.ellipse(7, 7, 4, 3, 0xf8dc6a);
  txtC(pc, 'CHIP', 7, 5, 0xc8302a);
  stamp(pc, 3, 11, ['.yy..yy..', 'yYYyyYYy.', '.yy.yYYyy', '....yy...'], { y: 0xd8a03a, Y: 0xf6d478 });
});
const D_CRACK = decal('i_crackers_front', 12, 18, (pc) => {
  pc.fill(0xc23a2a); band(pc, 0, 1, 0x8a2420); band(pc, 17, 1, 0x8a2420);
  bev(pc, 1, 3, 10, 5, 0xf2ecd8); dashes(pc, 2, 5, 8, 0xc23a2a, 2);
  // cracker squares with dock holes
  bev(pc, 2, 9, 8, 7, 0xe2b870, 0xf4d498, 0xb88a48);
  pc.set(4, 11, 0xa8783a); pc.set(7, 11, 0xa8783a); pc.set(4, 14, 0xa8783a); pc.set(7, 14, 0xa8783a); pc.set(5, 12, 0xa8783a);
});
const D_CANDY = decal('i_candy_top', 16, 6, (pc) => {
  pc.fill(0x5a3018); band(pc, 0, 1, 0x7a4424); band(pc, 5, 1, 0x3e2010);
  pc.rect(4, 1, 8, 4, 0xd8442a); txtC(pc, '', 8, 1, 0xffffff); dashes(pc, 5, 2, 6, 0xf6e6c8, 3); dashes(pc, 5, 3, 5, 0xf6e6c8, 4);
  for (let y = 0; y < 6; y++) { pc.set(0, y, y % 2 ? 0x3e2010 : 0x7a4424); pc.set(15, y, y % 2 ? 0x3e2010 : 0x7a4424); }
});
const D_CEREAL = decal('i_cereal_front', 16, 22, (pc) => {
  pc.fill(0xe8c230);
  for (let y = 0; y < 22; y++) for (let x = 0; x < 16; x++) if ((x + y) % 7 === 0) pc.set(x, y, 0xf2d250);
  pc.rect(0, 1, 16, 7, 0xc8302a); pc.hline(0, 15, 8, 0x8a2420);
  txtC(pc, 'OATY', 8, 2, 0xf8f0d8, 0x8a2420);
  // bowl with loops
  pc.ellipse(8, 15, 6, 2, 0xf6f2ea); pc.rect(3, 15, 11, 3, 0xf0ece2); pc.hline(4, 12, 18, 0xc8c2b6); pc.hline(5, 11, 19, 0xb8b2a6);
  for (const [x, y, c] of [[5, 13, 0xe87a2a], [8, 12, 0xd8402a], [11, 13, 0xe87a2a], [7, 14, 0xf0a02a], [10, 14, 0xd8402a]] as [number, number, number][]) {
    pc.set(x, y, c); pc.set(x + 1, y, c); pc.set(x, y + 1, dk(c));
  }
  dashes(pc, 2, 20, 12, 0x8a6a10, 6);
});
const D_GRANOLA = decal('i_granola_top', 14, 5, (pc) => {
  pc.fill(0x3e7a3a); band(pc, 0, 1, 0x2a5a2a); band(pc, 4, 1, 0x2a5a2a);
  pc.rect(4, 1, 6, 3, 0xc89a5a); for (let x = 4; x < 10; x++) if (ph(x, 2, 3) < 0.4) pc.set(x, 2, 0x8a6a3a);
  dashes(pc, 1, 2, 2, 0xe8e0c8, 1); dashes(pc, 11, 2, 2, 0xe8e0c8, 2);
});
const L_COOKIE = tex('i_cookies_wrap', 16, 10, (pc) => {
  pc.fill(0x2a4a9a);
  band(pc, 0, 1, 0x1a2e6a); band(pc, 9, 1, 0x1a2e6a);
  panels(pc, 2, (x0, pw) => {
    const cx = x0 + pw / 2;
    for (const dy of [2, 6]) {
      pc.rect(Math.round(cx) - 2, dy, 4, 1, 0x2e1c14); pc.rect(Math.round(cx) - 2, dy + 1, 4, 1, 0xf2ece0); pc.rect(Math.round(cx) - 2, dy + 2, 4, 1, 0x3e281c);
    }
  });
}, true);
const L_PB = labelTex('i_pb_label', 24, 8, {
  bg: 0xf2ead8, band: 0xc8302a, iconY: 3, icon: ['.tt.tt', 'tTttTt', '.tt.tt'], pal: { t: 0xb07a3a, T: 0xd8a868 },
});
const S_CRUST = tex('i_bread_crust', 8, 8, (pc) => {
  const R = rp(0xc08848, 5, 0.3);
  pc.each((x, y) => pc.set(x, y, R[2 + (ph(x >> 2, y >> 2, 21) < 0.35 ? 1 : 0)]));
  pc.set(2, 3, 0xf0e2c8); pc.set(6, 6, 0xf0e2c8); pc.set(5, 1, R[1]);
}, true);
const D_RICE = decal('i_rice_top', 16, 22, (pc) => {
  pc.fill(0xf2f0ea);
  pc.each((x, y) => { if (y > 9 && (x * 3 + y * 5) % 7 === 0) pc.set(x, y, 0xdcd6c6); });
  pc.rect(0, 2, 16, 7, 0xc8302a); pc.hline(0, 15, 9, 0x8a2420);
  txtC(pc, 'RICE', 8, 3, 0xf8f0d8);
  pc.ellipse(8, 15, 4, 3, 0xe8e2d2); for (let i = 0; i < 6; i++) pc.set(6 + (i % 3) * 2, 14 + (i >> 1) % 3, 0xffffff);
  dashes(pc, 2, 20, 12, 0x8a2420, 7);
});
const D_PASTA = decal('i_pasta_top', 24, 8, (pc) => {
  pc.fill(0x2a4f9a); band(pc, 0, 1, 0x1a2e6a); band(pc, 7, 1, 0x1a2e6a);
  // window with spaghetti
  pc.rect(9, 2, 13, 4, 0xe8c66a);
  for (let x = 9; x < 22; x++) { if (x % 2 === 0) pc.set(x, 3, 0xc89a3a); if (x % 3 === 0) pc.set(x, 4, 0xf6dc8a); }
  pc.strokeRect(8, 1, 15, 6, 0xf2ece0);
  txt(pc, 'PAS', 1, 1, 0xf2ece0); pc.hline(1, 6, 7, 0xe8c66a);
});
const L_NOODLE = labelTex('i_noodle_cup', 24, 10, {
  bg: 0xf4f0e6, band: 0xc8302a, bandB: 0xc8302a, iconY: 3, icon: ['y.y.y.', '.y.y.y', 'y.y.y.', 'oooooo'],
  pal: { y: 0xe0b04a, o: 0xe87a2a },
});
const D_NOODLE_LID = tex('i_noodle_lid', 10, 10, (pc) => {
  pc.fill(0xd8dce0); pc.each((x, y) => { if (ph(x, y, 3) < 0.2) pc.set(x, y, 0xeef2f6); });
  pc.ellipse(4.5, 4.5, 3, 3, 0xc8302a); txtC(pc, '', 5, 3, 0xffffff); pc.rect(8, 7, 2, 3, 0xb8bcc0);
});
const D_COFFEE = decal('i_coffee_front', 12, 18, (pc) => {
  const R = rp(0xb08a5a, 5, 0.35); calmFill(pc, R);
  pc.rect(0, 3, 12, 6, 0x3a2416); txtC(pc, 'CAF', 6, 4, 0xe8d0a8);
  stamp(pc, 3, 11, ['.bbb.', 'bBbBb', 'bbBbb', '.bbb.'], { b: 0x4a2c18, B: 0x7a4a2a });
  pc.circle(9, 15, 1.2, 0x2a1a10); dashes(pc, 1, 16, 5, 0x5a3a20, 3);
});
function calmFill(pc: PixelCanvas, R: number[]) { pc.each((x, y) => pc.set(x, y, R[2 + (ph(x >> 1, y >> 1, 5) < 0.2 ? 1 : 0)])); }
const D_TEA = decal('i_tea_front', 14, 8, (pc) => {
  pc.fill(0x3e7a44); band(pc, 0, 1, 0x2a5a30); band(pc, 7, 1, 0x2a5a30);
  stamp(pc, 2, 2, ['wwww.', 'wttw.', 'wwwww', '.ww..'], { w: 0xf2ece0, t: 0xa8682a });
  stamp(pc, 9, 2, ['..g', '.gG', 'gG.', 'g..'], { g: 0x9ad25a, G: 0xc8f08a });
});
const D_SUGAR = decal('i_sugar_front', 12, 16, (pc) => {
  pc.fill(0xf4f2ec); pc.rect(0, 2, 12, 5, 0x2a5aa8); txtC(pc, 'SUG', 6, 2, 0xf4f2ec);
  bev(pc, 3, 9, 3, 3, 0xffffff, 0xffffff, 0xc8ccd4); bev(pc, 6, 10, 3, 3, 0xffffff, 0xffffff, 0xc8ccd4);
  dashes(pc, 1, 14, 10, 0x2a5aa8, 5);
});
const L_SALT = tex('i_salt_label', 24, 12, (pc) => {
  pc.fill(0x2a5aa8); band(pc, 0, 1, 0x1a3a7a); band(pc, 11, 1, 0x1a3a7a);
  panels(pc, 2, (x0, pw) => {
    const cx = Math.round(x0 + pw / 2);
    stampC(pc, cx, 2, ['.www.', 'wwwww', '..w..', '..w..', '.ww..'], { w: 0xf4f2ec });   // umbrella
    dashes(pc, cx - 4, 8, 9, 0xa8c4ec, 2);
  });
}, true);
const L_OIL = labelTex('i_oil_label', 16, 8, { bg: 0x3a7a3a, band: 0xe8c44a, iconY: 3, icon: ['.y.', 'yYy', 'yyy'], pal: { y: 0xd8b02a, Y: 0xf6e07a }, panelsN: 2 });
const L_ALMOND = labelTex('i_almond_label', 16, 6, { bg: 0xf0e6cc, band: 0x8a5a2a, iconY: 2, icon: ['.bb.', 'bBBb', '.bb.'], pal: { b: 0x8a5a2a, B: 0xc8925a } });
const S_PULP = surf('i_pulp', 8, 8, 0xa8a49a, (pc, x, y) => { if (ph(x, y, 4) < 0.1) pc.set(x, y, 0xc8c4ba); });
const D_MILK = decal('i_milk_front', 10, 20, (pc) => {
  pc.fill(0xf6f4ee);
  pc.rect(0, 0, 10, 5, 0x2a6ac8); pc.hline(0, 9, 5, 0x1a4a98);
  for (let x = 0; x < 10; x++) pc.set(x, 6 + (x % 4 === 0 ? 1 : 0), 0x8ab8ec);
  // glass of milk
  pc.rect(3, 10, 4, 6, 0xffffff); pc.strokeRect(3, 10, 4, 6, 0xb8c8dc); pc.hline(4, 5, 11, 0xe8f0fa);
  dashes(pc, 1, 18, 8, 0x2a6ac8, 4); txtC(pc, '', 5, 1, 0xffffff);
  for (let x = 1; x < 9; x += 2) pc.set(x, 2, 0xf6f4ee);
});
const S_CHEESE = surf('i_cheese', 8, 8, 0xe8b83a, (pc, x, y) => {
  if (Math.hypot(x - 2, y - 2) < 1.2 || Math.hypot(x - 6, y - 5) < 1.5 || Math.hypot(x - 1, y - 6) < 0.8) pc.set(x, y, 0xb8861a);
}, 0.25);
const SK_APPLE = skinTex('i_apple', 0xc2302a, { hl: 0xff9a7a, spots: [0xe0c04a, 0.06], seed: 31, stripes: 5, top: 0x7a2a1a });
const SK_ORANGE = skinTex('i_orange', 0xe8862a, { hl: 0xffd08a, spots: [0xc86818, 0.15], seed: 32 });
const SK_TOMATO = skinTex('i_tomato', 0xd8402e, { hl: 0xffb8a0, seed: 33, amp: 0.05 });
const SK_POTATO = skinTex('i_potato', 0xa9814f, { spots: [0x6a4a2a, 0.08], seed: 34, amp: 0.25 });
const SK_ONION = skinTex('i_onion', 0xc8924a, { stripes: 3, seed: 35, top: 0x8a5a2a });
const SK_CABBAGE = skinTex('i_cabbage', 0x8cbc66, { stripes: 4, seed: 36, amp: 0.2 });
const SK_LETTUCE = skinTex('i_lettuce', 0x8ccc5a, { seed: 37, amp: 0.35 });
const SK_DREAM = tex('i_dreamfruit', 16, 8, (pc) => {
  pc.each((x, y) => {
    const t = (y + Math.sin(x * 0.8) * 1.2) / 8;
    const c = t < 0.3 ? 0xe070d0 : t < 0.55 ? 0xa070e8 : t < 0.8 ? 0x50a8f0 : 0x30d0c0;
    pc.set(x, y, (x + y) % 5 === 0 ? lt(c, 0.4) : c);
  });
  // a small closed eye — slightly wrong fruit
  pc.hline(1, 4, 4, 0x6a4a8a); pc.set(2, 5, 0x6a4a8a); pc.set(3, 5, 0x6a4a8a);
}, true);
const S_CARROT = tex('i_carrot', 12, 6, (pc) => pc.each((x, y) => pc.set(x, y, y % 3 === 0 ? 0xc8601a : (ph(x, y, 4) < 0.15 ? 0xf6a050 : 0xe8802a))), true);
const S_BANANA = tex('i_banana', 8, 6, (pc) => {
  pc.each((x, y) => pc.set(x, y, y === 0 ? 0xf6e27a : y === 5 ? 0xc8a020 : (ph(x, y, 2) < 0.08 ? 0x7a5a20 : 0xeccc3a)));
  pc.vline(0, 0, 5, 0xb08a2a); pc.vline(4, 1, 4, 0xd8b42a);
}, true);
const S_STRAW = surf('i_strawberry', 6, 6, 0xd02a2a, (pc, x, y) => { if ((x + y * 2) % 4 === 0) pc.set(x, y, 0xf6e07a); });
const S_MEAT = surf('i_meat_raw', 8, 8, 0xb83030, (pc, x, y) => { if ((ph(x, y >> 1, 3) < 0.12)) pc.set(x, y, 0xf0d8d0); });
const S_VENISON = surf('i_meat_dark', 8, 8, 0x7a1e22, (pc, x, y) => { if (ph(x, y, 13) < 0.06) pc.set(x, y, 0xc84a4a); });
const S_HOUND = surf('i_meat_hound', 8, 8, 0x7a5a6a, (pc, x, y) => { if ((x + y) % 5 === 0) pc.set(x, y, 0xc8b8c0); if (ph(x, y, 6) < 0.08) pc.set(x, y, 0x4a3448); });
const S_POULTRY = surf('i_poultry', 8, 8, 0xf0c8b0, (pc, x, y) => { if (ph(x, y, 7) < 0.12) pc.set(x, y, 0xd8a890); }, 0.25);
const D_STEAK = decal('i_steak_top', 14, 10, (pc) => {
  pc.fill(0xf0e2cc);
  pc.ellipse(7, 5, 6.2, 4.2, 0xb02a2a); pc.ellipse(7, 5, 5, 3, 0xc23a34);
  for (let i = 0; i < 9; i++) pc.set(3 + ((i * 5) % 9), 3 + ((i * 3) % 5), 0xf2c8c0);
  pc.ellipse(10, 6, 1.2, 1, 0xf0e8d8);
});
const D_TRAY = tex('i_tray', 8, 8, (pc) => { pc.fill(0xeeeee8); pc.strokeRect(0, 0, 8, 8, 0xd8d8d2); pc.each((x, y) => { if (ph(x, y, 8) < 0.08) pc.set(x, y, 0xfafaf6); }); });
const D_MRE = decal('i_mre_top', 22, 11, (pc) => {
  const R = rp(0x8a7a52, 5, 0.3); calmFill(pc, R);
  band(pc, 0, 1, R[0]); band(pc, 10, 1, R[0]);
  for (let x = 0; x < 22; x += 2) { pc.set(x, 0, R[1]); pc.set(x, 10, R[1]); }
  txt(pc, 'MRE', 2, 2, 0x1e1a14);
  dashes(pc, 2, 8, 16, 0x2e2a1e, 3); dashes(pc, 14, 3, 6, 0x2e2a1e, 4); dashes(pc, 14, 5, 5, 0x2e2a1e, 5);
});
const L_BABY = labelTex('i_babyfood_label', 24, 8, { bg: 0xf6f2ea, band: 0x6aa8e0, iconY: 2, icon: ['.ff.', 'fbbf', 'fmmf', '.ff.'], pal: { f: 0xf2c8a0, b: 0x3a4a6a, m: 0xd87a7a } });
const L_CAKE = tex('i_cake_side', 24, 8, (pc) => {
  pc.fill(0xe88ab8);
  pc.each((x, y) => { if (y === 3 || y === 4) pc.set(x, y, 0xf6e4c8); });
  for (let x = 0; x < 24; x++) { pc.set(x, 0, x % 2 ? 0xffffff : 0xf8e8f2); pc.set(x, 7, x % 2 ? 0xffffff : 0xf0d0e4); }
  for (let x = 1; x < 24; x += 4) pc.set(x, 2, 0x8ad0f0);
  for (let x = 3; x < 24; x += 4) pc.set(x, 5, 0xf6e07a);
}, true);
const D_CAKE_TOP = tex('i_cake_top', 14, 14, (pc) => {
  pc.fill(0xf0a0c8);
  pc.each((x, y) => { const d = Math.hypot(x - 6.5, y - 6.5); if (d > 5.6) pc.set(x, y, (x + y) % 2 ? 0xffffff : 0xf8e8f2); });
  stamp(pc, 4, 5, ['r.r', 'rrr', '.r.'], { r: 0xe24a6a });
  for (const [x, y, c] of [[3, 3, 0x8ad0f0], [10, 4, 0xf6e07a], [9, 10, 0x9ae08a], [4, 10, 0x8ad0f0], [11, 8, 0xc89af0]] as [number, number, number][]) pc.set(x, y, c);
});
const S_CANDY = tex('i_candy_wrap', 8, 4, (pc) => pc.each((x, y) => pc.set(x, y, [0xf080b8, 0x70c0f0, 0xf0d060, 0xb090f0][((x + y) >> 1) % 4])), true);
const S_LEAF = surf('i_leaf', 8, 8, 0x5a9a3a, (pc, x, y) => { if (x === 3 || (y === 4 && x > 3)) pc.set(x, y, 0x9ad26a); }, 0.3);
const S_MUSH = skinTex('i_mushroom_cap', 0x9a6a3a, { spots: [0xd8c0a0, 0.08], seed: 41, top: 0x7a4a24 });
const D_BREADSLICE = tex('i_bread_slice', 10, 10, (pc) => {
  pc.fill(0xf0e2c0);
  pc.each((x, y) => { if (ph(x, y, 9) < 0.12) pc.set(x, y, 0xd8c49a); });
  pc.strokeRect(0, 0, 10, 10, 0xb47838); pc.hline(1, 8, 0, 0x9a6028);
  pc.set(0, 0, 0x8a5222); pc.set(9, 0, 0x8a5222);
});
const D_PIZZA = decal('i_pizza_top', 16, 16, (pc) => {
  pc.fill(0xc8302a);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (x < 2 || y < 2) pc.set(x, y, 0xf2ece0);
  pc.circle(9, 9, 5.6, 0xd8a050); pc.circle(9, 9, 4.6, 0xe86a2a); pc.circle(9, 9, 3.8, 0xf2c860);
  for (const [x, y] of [[7, 7], [11, 8], [9, 11], [7, 11], [11, 11], [9, 6]]) { pc.set(x, y, 0xa8281e); pc.set(x + 1, y, 0xa8281e); }
  txt(pc, 'PIZ', 3, 2, 0xf2ece0, 0x8a1e18);
});
const L_ICECREAM = labelTex('i_icecream_label', 24, 10, {
  bg: 0xf6d8e6, band: 0x7a4a2a, bandB: 0x7a4a2a, iconY: 3, icon: ['.bb.', 'bBBb', 'wwww', '.cc.'], pal: { b: 0x8a5a3a, B: 0xb07a52, w: 0xfaf6f0, c: 0xd8a868 },
});
const D_ICELID = tex('i_icecream_lid', 12, 12, (pc) => { pc.fill(0xf6d8e6); pc.circle(5.5, 5.5, 4, 0x7a4a2a); pc.circle(5.5, 5.5, 3, 0xf8eef2); txtC(pc, '', 6, 4, 0x7a4a2a); pc.set(5, 5, 0xe24a6a); });
const D_GUM = decal('i_gum_top', 12, 5, (pc) => { pc.fill(0x7ad0a8); band(pc, 2, 1, 0xf6faf6); dashes(pc, 1, 0, 10, 0x3a8a6a, 1); pc.vline(0, 0, 4, 0x4a9a7a); });
const D_CIG = decal('i_cig_front', 8, 12, (pc) => {
  pc.fill(0xf4f2ec);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 8; x++) if (y < 2 || Math.abs(x - 3.5) > y - 1) pc.set(x, y, 0xc8302a);
  pc.hline(0, 7, 3, 0xc8302a); dashes(pc, 1, 8, 6, 0x3a3a3a, 2); pc.rect(1, 10, 6, 1, 0x1e1e1e);
});
const D_JERKY = decal('i_jerky_front', 12, 18, (pc) => {
  pc.fill(0x2a2422); band(pc, 0, 2, 0x3e3632);
  pc.rect(1, 3, 10, 4, 0xe87a2a); txtC(pc, 'BBQ', 6, 3, 0x2a2422);
  pc.rect(2, 9, 8, 7, 0x5a2a16); for (let y = 10; y < 15; y += 2) pc.hline(3, 8, y, 0x8a4a28); pc.strokeRect(2, 9, 8, 7, 0x8a8682);
});
const S_SCRAPS = fillTex('i_scraps', 0x6a5a3a, [[0x8a7a52, 0.2], [0x6a8a3a, 0.12], [0x3e3424, 0.15], [0xc8b88a, 0.05]], 12, 12);
const D_DONUT = tex('i_donut_top', 12, 12, (pc) => {
  pc.fill(0xc8904a);
  pc.each((x, y) => {
    const d = Math.hypot(x - 5.5, y - 5.5);
    if (d < 4.8 && d > 2.0) pc.set(x, y, 0xf2a0c4);
    if (d <= 2.0) pc.set(x, y, 0x6a4422);
    if (d < 4.8 && d > 2.0 && ph(x, y, 4) < 0.2) pc.set(x, y, [0xffffff, 0x8ad0f0, 0xf6e07a, 0x9ae08a][Math.floor(ph(x, y, 5) * 4)]);
  });
});
const S_DONUT = tex('i_donut_side', 16, 4, (pc) => pc.each((x, y) => pc.set(x, y, y === 0 ? 0xf2a0c4 : y === 3 ? 0xa8703a : 0xc8904a)), true);

// =====================================================================================
// item helpers
// =====================================================================================
type Extra = Partial<ItemDef>;
function food(key: string, name: string, weight: number, f: FoodProps, model: (mb: MB) => void, x: Extra = {}) {
  return defItem({ key, name, cat: 'food', weight, food: f, model, ...x });
}

/** sealed can + opened variant */
function canned(key: string, openKey: string, name: string, openName: string, weight: number, f: FoodProps, build: (mb: MB, open: boolean) => void, tags: string[] = [], desc?: string) {
  food(key, name, weight, { ...f, canned: true, openedInto: openKey }, (mb) => build(mb, false), { tags: ['canned', ...tags], desc: desc ?? 'Sealed. Needs a can opener — or a knife and some patience.' });
  food(openKey, openName, weight - 0.01, { ...f, fresh: 2, rot: 4, leaves: 'empty_can', cookable: true, cookMins: 8 }, (mb) => build(mb, true), { tags: ['opened_can', ...tags] });
}

// =====================================================================================
// CANNED
// =====================================================================================
canned('canned_beans', 'beans_open', 'Canned Beans', 'Opened Canned Beans', 0.45,
  { hunger: 18, thirst: -2, calories: 380, unhappy: 2, ingredient: 'veg' },
  (mb, o) => can(mb, L_BEANS, 0.037, 0.11, { open: o, fill: F_BEANS }), ['stewveg']);
canned('canned_soup', 'soup_open', 'Canned Soup', 'Opened Canned Soup', 0.42,
  { hunger: 12, thirst: 10, calories: 220, ingredient: 'veg' },
  (mb, o) => can(mb, L_SOUP, 0.034, 0.1, { open: o, fill: F_SOUP }), []);
canned('canned_peaches', 'peaches_open', 'Canned Peaches', 'Opened Canned Peaches', 0.45,
  { hunger: 9, thirst: 12, calories: 250, unhappy: -6, ingredient: 'fruit' },
  (mb, o) => can(mb, L_PEACH, 0.04, 0.115, { open: o, fill: F_PEACH }), ['sweet']);
canned('canned_tuna', 'tuna_open', 'Canned Tuna', 'Opened Canned Tuna', 0.17,
  { hunger: 8, thirst: -2, calories: 190, ingredient: 'fish' },
  (mb, o) => can(mb, L_TUNA, 0.043, 0.04, { open: o, fill: F_TUNA, segs: 12 }), ['stewmeat', 'sandwichfill']);
canned('canned_corn', 'corn_open', 'Canned Corn', 'Opened Canned Corn', 0.43,
  { hunger: 11, thirst: 4, calories: 230, ingredient: 'veg' },
  (mb, o) => can(mb, L_CORN, 0.037, 0.11, { open: o, fill: F_CORN }), ['stewveg']);
canned('canned_dogfood', 'dogfood_open', 'Canned Dog Food', 'Opened Dog Food', 0.4,
  { hunger: 15, thirst: 2, calories: 380, unhappy: 20, boredom: 5, ingredient: 'meat' },
  (mb, o) => can(mb, L_DOG, 0.042, 0.105, { open: o, fill: F_DOG }), [], 'Technically edible. The label insists it has "real gravy".');
canned('canned_spam', 'spam_open', 'Canned Luncheon Meat', 'Opened Luncheon Meat', 0.37,
  { hunger: 22, thirst: -8, calories: 1000, ingredient: 'meat' },
  (mb, o) => {
    const w = 0.098, h = 0.076, d = 0.05;
    if (!o) {
      pack(mb, w, h, d, D_SPAM, 0xb8bcc0, { side: T.tin, top: T.tin });
      mb.box(0.03, h, 0, 0.03, 0.006, 0.012, T.tin);          // key tab
    } else {
      mb.box(0, 0, 0, w, h - 0.01, d, { all: T.tin, top: F_SPAM }, { fit: { top: true } });
      mb.panel(-w / 2, d / 2 + 0.0015, w / 2, d / 2 + 0.0015, 0, h - 0.01, D_SPAM, { fit: true });
      mb.box(-0.02, h - 0.01, -d / 2 - 0.004, w * 0.9, 0.004, 0.03, T.tin);    // peeled lid
    }
  }, ['stewmeat', 'sandwichfill']);

// =====================================================================================
// SNACKS & DRY GOODS
// =====================================================================================
food('chips', 'Bag of Chips', 0.15, { hunger: 10, thirst: -6, calories: 780, unhappy: -5, boredom: -3, ingredient: 'grain' }, (mb) => {
  mb.box(0, 0, 0, 0.17, 0.04, 0.19, T.foil, { color: 0xe05040 });
  mb.flat(0, 0.0402, 0, 0.17, 0.19, D_CHIPS);
  for (const s of [-1, 1]) mb.box(0, 0.012, s * 0.105, 0.172, 0.014, 0.022, T.foil, { color: 0xb83a30 });
}, { tags: ['snack'] });

food('crackers', 'Box of Crackers', 0.25, { hunger: 12, thirst: -6, calories: 1080, unhappy: 2, ingredient: 'grain' },
  (mb) => pack(mb, 0.115, 0.2, 0.075, D_CRACK, 0xc23a2a), { tags: ['snack'] });

food('candy_bar', 'Candy Bar', 0.06, { hunger: 4, calories: 280, unhappy: -8, boredom: -3, stress: -2, ingredient: 'sweet' }, (mb) => {
  slab(mb, 0.125, 0.014, 0.04, D_CANDY, T.card, 0x5a3018);
  for (const s of [-1, 1]) mb.box(s * 0.067, 0.003, 0, 0.01, 0.008, 0.042, T.foil, { color: 0x7a4424 });
}, { tags: ['snack', 'sweet'] });

food('cereal', 'Box of Cereal', 0.5, { hunger: 30, thirst: -8, calories: 1880, unhappy: -2, ingredient: 'grain' },
  (mb) => pack(mb, 0.19, 0.28, 0.065, D_CEREAL, 0xe8c230), { tags: ['snack'] });

food('granola_bar', 'Granola Bar', 0.04, { hunger: 4, calories: 190, unhappy: -2, ingredient: 'grain' }, (mb) => {
  slab(mb, 0.1, 0.012, 0.035, D_GRANOLA, T.card, 0x3e7a3a);
}, { tags: ['snack'] });

food('cookies', 'Pack of Cookies', 0.3, { hunger: 12, thirst: -5, calories: 1450, unhappy: -10, boredom: -4, ingredient: 'sweet' }, (mb) => {
  rodX(mb, -0.1, 0.1, 0.031, 0.031, 0.031, 10, L_COOKIE, { fit: true });
  for (const s of [-1, 1]) rodX(mb, s * 0.1 - 0.006, s * 0.1 + 0.006, 0.031, 0.026, 0.026, 8, T.foil, { color: 0x1a2e6a });
}, { tags: ['snack', 'sweet'] });

food('peanut_butter', 'Peanut Butter', 0.5, { hunger: 3, thirst: -1, calories: 265, unhappy: -1, ingredient: 'sauce' }, (mb) => {
  mb.cylinder(0, 0, 0, 0.045, 0.1, 10, T.plastic, { color: 0xb0763a, fit: true });
  mb.cylinder(0, 0.025, 0, 0.0465, 0.055, 10, L_PB, { fit: true, caps: false });
  mb.cylinder(0, 0.1, 0, 0.047, 0.022, 10, T.cap, { color: 0xc8302a, fit: true });
}, { uses: 10, tags: ['sandwichfill_uses'], desc: 'About ten spoonfuls. Values are per spoonful.' });

food('bread', 'Loaf of Bread', 0.5, { hunger: 30, thirst: -5, calories: 1300, fresh: 3, rot: 6, ingredient: 'grain' }, (mb) => {
  mb.box(0, 0, 0, 0.12, 0.06, 0.25, S_CRUST, { uvScale: 2.5 });
  rodZ(mb, -0.125, 0.125, 0.06, 0.06, 0.06, 8, { sides: S_CRUST, top: D_BREADSLICE, bottom: D_BREADSLICE }, { uvScale: 2.5 });
  for (const z of [-0.06, 0, 0.06]) mb.box(0, 0.115, z, 0.05, 0.008, 0.012, S_CRUST, { color: 0xf0e2c8 });
}, { tags: ['bread'] });

food('bread_slice', 'Slice of Bread', 0.08, { hunger: 5, thirst: -1, calories: 210, fresh: 3, rot: 6, ingredient: 'grain' }, (mb) => {
  mb.box(0, 0, 0, 0.11, 0.012, 0.11, { all: S_CRUST, top: D_BREADSLICE }, { fit: { top: true }, uvScale: 4 });
}, { tags: ['bread'] });

food('rice', 'Bag of Rice', 0.5, { hunger: 20, thirst: -20, calories: 1800, unhappy: 15, ingredient: 'grain' }, (mb) => {
  slab(mb, 0.14, 0.05, 0.22, D_RICE, T.plastic, 0xf2f0ea);
}, { desc: 'Uncooked. Boil it in a pot of water (Cook Rice).' });

food('pot_rice', 'Pot of Rice', 2.2, { hunger: 50, thirst: 5, calories: 1800, unhappy: 2, boredom: 3, fresh: 3, rot: 5, ingredient: 'grain', leaves: 'pot' },
  (mb) => pot(mb, IN.rice), { tags: ['cooked_dish'] });

food('pasta', 'Box of Pasta', 0.5, { hunger: 18, thirst: -15, calories: 1780, unhappy: 15, ingredient: 'grain' }, (mb) => {
  slab(mb, 0.27, 0.03, 0.075, D_PASTA, T.card, 0x2a4f9a);
}, { desc: 'Dry spaghetti. Boil it in a pot of water (Cook Pasta).' });

food('pot_pasta', 'Pot of Pasta', 2.2, { hunger: 48, thirst: 5, calories: 1780, unhappy: -4, fresh: 3, rot: 5, ingredient: 'grain', leaves: 'pot' },
  (mb) => pot(mb, IN.pasta), { tags: ['cooked_dish'] });

food('instant_noodles', 'Instant Noodles', 0.085, { hunger: 8, thirst: -8, calories: 380, unhappy: 4, ingredient: 'grain' }, (mb) => {
  mb.cylinder(0, 0, 0, 0.04, 0.095, 10, { sides: L_NOODLE, top: D_NOODLE_LID, bottom: T.white }, { fit: true, rTop: 0.048 });
}, { tags: ['snack'], desc: 'Crunchy dry. Much better with boiling water.' });

food('noodles_cooked', 'Bowl of Noodles', 0.55, { hunger: 12, thirst: 10, calories: 380, unhappy: -8, fresh: 1, rot: 2, ingredient: 'grain', leaves: 'bowl' },
  (mb) => bowl(mb, IN.noodles, 0xd8483a), { tags: ['cooked_dish'] });

food('coffee_beans', 'Ground Coffee', 0.25, { hunger: 0, thirst: -1, calories: 2, unhappy: 2, ingredient: 'spice' }, (mb) => {
  pack(mb, 0.1, 0.16, 0.06, D_COFFEE, 0xb08a5a);
  mb.box(0, 0.16, 0, 0.1, 0.02, 0.025, T.card, { color: 0x8a6a42 });
}, { uses: 10, tags: ['caffeine', 'coffee'], desc: 'Ten brews. Brew it in a mug with boiling water.' });

food('tea_bags', 'Tea Bags', 0.05, { hunger: 0, calories: 0, unhappy: 1, ingredient: 'spice' },
  (mb) => pack(mb, 0.12, 0.07, 0.065, D_TEA, 0x3e7a44), { uses: 20, tags: ['tea'] });

food('sugar', 'Bag of Sugar', 1.0, { hunger: 1, thirst: -1, calories: 195, unhappy: -1, ingredient: 'sweet' }, (mb) => {
  pack(mb, 0.1, 0.16, 0.07, D_SUGAR, 0xf4f2ec);
  mb.box(0, 0.16, 0, 0.1, 0.015, 0.03, T.card, { color: 0xe8e6e0 });
}, { uses: 20, tags: ['sweet'] });

food('salt', 'Salt', 0.75, { hunger: 0, thirst: -3, calories: 0, unhappy: 2, ingredient: 'spice' }, (mb) => {
  mb.cylinder(0, 0, 0, 0.04, 0.13, 10, { sides: L_SALT, top: T.tinTop, bottom: T.tin }, { fit: true });
  mb.box(0.012, 0.13, 0.012, 0.022, 0.006, 0.012, T.tin);
}, { uses: 30, tags: ['salt'] });

food('cooking_oil', 'Cooking Oil', 0.95, { hunger: 1, thirst: -1, calories: 800, unhappy: 4, ingredient: 'sauce' }, (mb) => {
  bottle(mb, { r: 0.04, h: 0.27, neckR: 0.014, neckH: 0.03, shoulder: 0.05, body: T.plastic, bodyColor: 0xe8c040, label: L_OIL, labelY: 0.06, labelH: 0.08, cap: 0x3a7a3a, capH: 0.02 });
}, { uses: 10, tags: ['oil'] });

food('almond_extract', 'Almond Extract', 0.06, { hunger: 0, thirst: -1, calories: 10, unhappy: 2, ingredient: 'spice' }, (mb) => {
  bottle(mb, { r: 0.017, h: 0.095, neckR: 0.007, neckH: 0.012, shoulder: 0.012, body: T.glass, bodyColor: 0x7a4a22, label: L_ALMOND, labelY: 0.015, labelH: 0.035, cap: 0x2a2a2a, capH: 0.014 });
}, { uses: 4, tags: ['almond'], desc: 'Baking flavour. Smells exactly like the water down here.' });

food('eggs', 'Eggs (half dozen)', 0.36, { hunger: 18, calories: 430, raw: true, cookable: true, cookMins: 5, poison: 0.1, fresh: 14, rot: 28, ingredient: 'egg', cookedName: 'Scrambled Eggs' }, (mb) => {
  mb.box(0, 0, 0, 0.16, 0.03, 0.105, S_PULP, { uvScale: 4 });
  for (let i = 0; i < 6; i++) mb.sphere(-0.05 + (i % 3) * 0.05, 0.035, i < 3 ? -0.025 : 0.025, 0.021, 6, 5, T.white, { color: i === 4 ? 0xe8c8a0 : 0xf2eadc, sy: 1.25 });
}, { tags: ['egg'] });

food('milk', 'Carton of Milk', 1.05, { hunger: 8, thirst: 30, calories: 640, fresh: 5, rot: 9, ingredient: 'dairy' }, (mb) => {
  const w = 0.07, h = 0.19;
  pack(mb, w, h, w, D_MILK, 0xf6f4ee);
  mb.wedge(0, h, w / 4, w, w / 2, 0.03, 0.0, { top: T.card, east: T.card }, { color: 0xeef2f8 });
  mb.wedge(0, h, -w / 4, w, w / 2, 0.0, 0.03, { top: T.card, east: T.card }, { color: 0xe2e8f0 });
  mb.box(0, h + 0.028, 0, w, 0.014, 0.006, T.card, { color: 0xe8ecf2 });
  mb.cylinder(0.018, h + 0.006, 0.014, 0.008, 0.012, 6, T.cap, { color: 0x2a6ac8, fit: true });
}, { tags: ['dairy'] });

food('cheese', 'Block of Cheese', 0.45, { hunger: 20, thirst: -5, calories: 1800, unhappy: -4, fresh: 14, rot: 20, ingredient: 'dairy' }, (mb) => {
  prism(mb, [[-0.075, 0.0], [0.06, 0.055], [0.06, -0.055]], 0, 0.06, S_CHEESE, S_CHEESE);
  mb.box(0.064, 0, 0, 0.008, 0.06, 0.112, 'i_white', { color: 0xc8582a });   // waxed rind
}, { tags: ['dairy'] });

// =====================================================================================
// PRODUCE
// =====================================================================================
food('apple', 'Apple', 0.18, { hunger: 6, thirst: 4, calories: 95, fresh: 6, rot: 12, ingredient: 'fruit' }, (mb) => {
  mb.sphere(0, 0.038, 0, 0.04, 8, 6, SK_APPLE, { fit: true, sy: 0.95 });
  mb.cylinder(0, 0.07, 0, 0.003, 0.018, 4, 'i_black', { color: 0x6a4a2a });
  mb.push().translate(0.008, 0.082, 0).rotateZ(-0.6); mb.box(0.012, 0, 0, 0.022, 0.003, 0.012, S_LEAF); mb.pop();
}, { tags: ['produce', 'fruit'] });

food('banana', 'Banana', 0.12, { hunger: 6, thirst: 1, calories: 105, fresh: 4, rot: 7, ingredient: 'fruit' }, (mb) => {
  const segs = 5, R = 0.11;
  for (let i = 0; i < segs; i++) {
    const a0 = -0.6 + (i / segs) * 1.2, a1 = -0.6 + ((i + 1) / segs) * 1.2;
    const am = (a0 + a1) / 2;
    const rr = i === 0 || i === segs - 1 ? 0.012 : 0.018;
    mb.push().translate(Math.sin(am) * R, 0, -Math.cos(am) * R + R * 0.85).rotateY(-am);
    rodX(mb, -0.024, 0.024, 0.018, rr, rr, 6, S_BANANA, { fit: true });
    mb.pop();
  }
  mb.push().translate(Math.sin(0.62) * R, 0, -Math.cos(0.62) * R + R * 0.85).rotateY(-0.62); rodX(mb, 0.02, 0.034, 0.018, 0.006, 0.006, 5, 'i_black', { color: 0x5a3a1a }); mb.pop();
}, { tags: ['produce', 'fruit'] });

food('orange', 'Orange', 0.2, { hunger: 6, thirst: 8, calories: 85, fresh: 6, rot: 12, ingredient: 'fruit' }, (mb) => {
  mb.sphere(0, 0.04, 0, 0.041, 8, 6, SK_ORANGE, { fit: true });
  mb.box(0, 0.08, 0, 0.006, 0.004, 0.006, 'i_black', { color: 0x4a7a2a });
}, { tags: ['produce', 'fruit'] });

food('carrot', 'Carrot', 0.07, { hunger: 4, thirst: 2, calories: 30, fresh: 5, rot: 10, cookable: true, cookMins: 15, ingredient: 'veg' }, (mb) => {
  rodX(mb, -0.08, 0.07, 0.018, 0.004, 0.018, 7, S_CARROT, { fit: true });
  for (const [a, l] of [[-0.5, 0.06], [0, 0.07], [0.45, 0.055]]) {
    mb.push().translate(0.07, 0.022, 0).rotateY(a); mb.box(l / 2, 0, 0, l, 0.004, 0.012, S_LEAF); mb.pop();
  }
}, { tags: ['produce', 'stewveg', 'saladveg'] });

food('potato', 'Potato', 0.2, { hunger: 8, thirst: 1, calories: 155, unhappy: 3, fresh: 7, rot: 14, cookable: true, cookMins: 25, ingredient: 'veg', cookedName: 'Baked Potato' }, (mb) => {
  mb.push().scale(1.3, 1, 1); mb.sphere(0, 0.03, 0, 0.042, 8, 6, SK_POTATO, { fit: true, sy: 0.72 }); mb.pop();
}, { tags: ['produce', 'stewveg'] });

food('tomato', 'Tomato', 0.12, { hunger: 4, thirst: 5, calories: 22, fresh: 4, rot: 8, ingredient: 'veg' }, (mb) => {
  mb.sphere(0, 0.03, 0, 0.034, 8, 6, SK_TOMATO, { fit: true, sy: 0.86 });
  mb.box(0, 0.058, 0, 0.026, 0.004, 0.005, S_LEAF); mb.box(0, 0.058, 0, 0.005, 0.004, 0.026, S_LEAF);
  mb.box(0, 0.06, 0, 0.004, 0.008, 0.004, S_LEAF);
}, { tags: ['produce', 'stewveg', 'saladveg'] });

food('cabbage', 'Cabbage', 0.9, { hunger: 14, thirst: 8, calories: 225, fresh: 5, rot: 10, cookable: true, cookMins: 20, ingredient: 'veg' }, (mb) => {
  mb.sphere(0, 0.065, 0, 0.075, 8, 6, SK_CABBAGE, { fit: true, sy: 0.88 });
  mb.sphere(0, 0.04, 0, 0.085, 8, 4, S_LEAF, { fit: true, sy: 0.5, color: 0x6aa84a });
}, { tags: ['produce', 'stewveg', 'saladveg'] });

food('strawberries', 'Strawberries', 0.25, { hunger: 4, thirst: 5, calories: 80, unhappy: -4, fresh: 3, rot: 5, ingredient: 'fruit' }, (mb) => {
  mb.box(0, 0, 0, 0.12, 0.045, 0.09, T.plastic, { color: 0x4aa04a });
  mb.box(0, 0.044, 0, 0.11, 0.003, 0.08, T.plastic, { color: 0x2a6a2a });
  const pos = [[-0.035, -0.02], [0, -0.025], [0.035, -0.018], [-0.03, 0.02], [0.005, 0.015], [0.038, 0.022], [-0.012, 0.0]];
  pos.forEach(([x, z], i) => mb.sphere(x, 0.052, z, 0.016, 6, 4, S_STRAW, { fit: true, sy: 1.15, color: i % 3 === 0 ? 0xe8e8e8 : 0xffffff }));
}, { tags: ['produce', 'fruit'] });

food('lettuce', 'Lettuce', 0.4, { hunger: 6, thirst: 7, calories: 60, fresh: 3, rot: 5, ingredient: 'veg' }, (mb) => {
  mb.sphere(0, 0.05, 0, 0.06, 8, 5, SK_LETTUCE, { fit: true, sy: 0.85 });
  mb.sphere(0, 0.03, 0, 0.075, 8, 4, SK_LETTUCE, { fit: true, sy: 0.45, color: 0xb8e8a0 });
}, { tags: ['produce', 'saladveg'] });

food('onion', 'Onion', 0.15, { hunger: 3, thirst: 1, calories: 60, unhappy: 5, fresh: 7, rot: 14, cookable: true, cookMins: 10, ingredient: 'veg' }, (mb) => {
  mb.sphere(0, 0.036, 0, 0.038, 8, 6, SK_ONION, { fit: true, sy: 0.92 });
  mb.cylinder(0, 0.066, 0, 0.01, 0.022, 6, SK_ONION, { fit: true, rTop: 0.002 });
  mb.box(0, 0, 0, 0.012, 0.004, 0.012, 'i_black', { color: 0xd8c8a0 });
}, { tags: ['produce', 'stewveg', 'saladveg'] });

// =====================================================================================
// MEAT
// =====================================================================================
function tray(mb: MB, w = 0.18, d = 0.13) { mb.box(0, 0, 0, w, 0.014, d, D_TRAY, { fit: true }); }
food('meat_raw', 'Meat', 0.5, { hunger: 25, calories: 1150, raw: true, cookable: true, cookMins: 20, poison: 0.3, fresh: 1.5, rot: 3, ingredient: 'meat', cookedName: 'Cooked Meat' }, (mb) => {
  tray(mb);
  mb.box(-0.01, 0.014, 0, 0.12, 0.035, 0.085, S_MEAT, { uvScale: 4 });
  mb.box(0.045, 0.014, 0.01, 0.05, 0.028, 0.06, S_MEAT, { uvScale: 4 });
}, { tags: ['rawmeat', 'stewmeat'] });

food('venison_raw', 'Venison', 0.6, { hunger: 28, calories: 950, raw: true, cookable: true, cookMins: 22, poison: 0.3, fresh: 2, rot: 4, ingredient: 'meat', cookedName: 'Venison Roast' }, (mb) => {
  mb.box(0, 0, 0, 0.22, 0.004, 0.17, T.card, { color: 0xd8c8a8 });
  mb.box(-0.02, 0.004, 0, 0.14, 0.05, 0.09, S_VENISON, { uvScale: 4 });
  mb.box(0.06, 0.004, -0.015, 0.06, 0.035, 0.06, S_VENISON, { uvScale: 4 });
  mb.box(-0.02, 0.054, 0, 0.13, 0.004, 0.02, T.white, { color: 0xe8dcc8 });
}, { tags: ['rawmeat', 'stewmeat'], desc: 'Lean, dark meat from one of the long-legged deer of the fields.' });

food('hound_meat_raw', 'Hound Meat', 0.4, { hunger: 16, calories: 560, raw: true, cookable: true, cookMins: 30, poison: 0.4, unhappy: 12, stress: 3, fresh: 1, rot: 3, ingredient: 'meat', cookedName: 'Cooked Hound Meat' }, (mb) => {
  mb.push().rotateY(0.3); mb.box(0, 0, 0, 0.13, 0.035, 0.06, S_HOUND, { uvScale: 4 }); mb.pop();
  mb.push().rotateY(-0.4); mb.box(0.03, 0.01, 0.02, 0.08, 0.03, 0.045, S_HOUND, { uvScale: 4 }); mb.pop();
  for (const z of [-0.02, 0.0, 0.025]) rodX(mb, -0.08, 0.07, 0.04, 0.003, 0.003, 4, T.white, { color: 0xd8c8d0, cz: z });
}, { tags: ['rawmeat', 'stewmeat'], desc: 'Stringy grey meat, threaded with sinew. Smells like wet carpet.' });

food('bird_meat_raw', 'Small Bird', 0.25, { hunger: 12, calories: 420, raw: true, cookable: true, cookMins: 15, poison: 0.4, fresh: 1, rot: 3, ingredient: 'meat', cookedName: 'Roast Bird' }, (mb) => {
  mb.sphere(0, 0.035, 0, 0.045, 8, 5, S_POULTRY, { fit: true, sy: 0.75 });
  for (const s of [-1, 1]) {
    mb.sphere(0.035, 0.03, s * 0.025, 0.018, 6, 4, S_POULTRY, { fit: true });
    rodX(mb, 0.045, 0.075, 0.03, 0.004, 0.003, 4, T.white, { color: 0xe8d8c8, cz: s * 0.025 });
  }
}, { tags: ['rawmeat', 'stewmeat'] });

food('steak_raw', 'Steak', 0.35, { hunger: 22, calories: 850, raw: true, cookable: true, cookMins: 12, poison: 0.2, unhappy: -6, fresh: 2, rot: 4, ingredient: 'meat', cookedName: 'Steak' }, (mb) => {
  tray(mb, 0.18, 0.14);
  mb.box(0, 0.014, 0, 0.15, 0.025, 0.105, { all: S_MEAT, top: D_STEAK }, { fit: { top: true }, uvScale: 4 });
}, { tags: ['rawmeat', 'stewmeat'] });

food('chicken_raw', 'Chicken Breasts', 0.4, { hunger: 18, calories: 660, raw: true, cookable: true, cookMins: 20, poison: 0.6, fresh: 1, rot: 3, ingredient: 'meat', cookedName: 'Cooked Chicken' }, (mb) => {
  tray(mb);
  mb.sphere(-0.035, 0.022, 0, 0.05, 8, 4, S_POULTRY, { fit: true, sy: 0.35 });
  mb.sphere(0.04, 0.022, 0.005, 0.045, 8, 4, S_POULTRY, { fit: true, sy: 0.35, color: 0xf6e6e0 });
}, { tags: ['rawmeat', 'stewmeat'] });

food('jerky', 'Beef Jerky', 0.1, { hunger: 8, thirst: -8, calories: 410, unhappy: -2, ingredient: 'meat' }, (mb) => {
  pack(mb, 0.12, 0.17, 0.03, D_JERKY, 0x2a2422);
  mb.box(0, 0.17, 0, 0.122, 0.008, 0.032, T.card, { color: 0x3e3632 });
}, { tags: ['snack', 'sandwichfill'] });

// =====================================================================================
// RATIONS, TREATS, DREAM FOOD
// =====================================================================================
food('mre', 'MRE', 0.7, { hunger: 35, thirst: -6, calories: 1250, unhappy: 3 }, (mb) => {
  slab(mb, 0.25, 0.03, 0.12, D_MRE, T.card, 0x7a6a46);
}, { tags: ['ration'], desc: 'Meal, Ready-to-Eat. Heats itself, tastes like the bag.' });

food('baby_food', 'Baby Food', 0.12, { hunger: 3, thirst: 1, calories: 70, unhappy: 6, boredom: 5, fresh: undefined }, (mb) => {
  mb.cylinder(0, 0, 0, 0.028, 0.05, 8, T.glass, { color: 0xe8a050, fit: true });
  mb.cylinder(0, 0.01, 0, 0.0292, 0.03, 8, L_BABY, { fit: true, caps: false });
  mb.cylinder(0, 0.05, 0, 0.03, 0.012, 8, { sides: T.tin, top: T.tinTop, bottom: T.tin }, { fit: true, color: 0x8ab8e8 });
}, { tags: ['jar'] });

food('birthday_cake', 'Birthday Cake', 1.2, { hunger: 40, thirst: -10, calories: 3600, unhappy: -40, boredom: -20, stress: -15, fresh: 4, rot: 8, ingredient: 'sweet' }, (mb) => {
  mb.cylinder(0, 0, 0, 0.15, 0.01, 12, T.white, { color: 0xf2f2ee, fit: true });
  mb.cylinder(0, 0.01, 0, 0.12, 0.08, 12, { sides: L_CAKE, top: D_CAKE_TOP, bottom: T.white }, { fit: true });
  const cols = [0x8ad0f0, 0xf6e07a, 0x9ae08a, 0xf2a0c4, 0xc89af0];
  cols.forEach((c, i) => {
    const a = (i / cols.length) * Math.PI * 2 + 0.3;
    const x = Math.cos(a) * 0.075, z = Math.sin(a) * 0.075;
    mb.cylinder(x, 0.09, z, 0.006, 0.045, 4, T.white, { color: c });
    mb.box(x, 0.137, z, 0.01, 0.018, 0.01, 'i_white', { color: 0xffb030, emissive: 1.6 });
    mb.box(x, 0.141, z, 0.005, 0.01, 0.005, 'i_white', { color: 0xfff0b0, emissive: 1.8 });
  });
}, { tags: ['party', 'sweet'], desc: 'Five candles, already lit. Somebody wrote your name in the icing.' });

food('candy_dream', 'Dream Candy', 0.02, { hunger: 1, calories: 50, unhappy: -10, boredom: -5, lucidity: 8, ingredient: 'sweet' }, (mb) => {
  const pos: [number, number, number, number][] = [[-0.026, 0.012, 0, 0.4], [0.024, 0.012, 0.016, -0.5], [0.0, 0.03, -0.006, 1.2]];
  pos.forEach(([x, y, z, a], i) => {
    mb.push().translate(x, y, z).rotateY(a);
    mb.sphere(0, 0, 0, 0.015, 6, 4, S_CANDY, { fit: true, sy: 0.8, color: [0xffffff, 0xd8e8ff, 0xffe0f0][i] });
    for (const s of [-1, 1]) mb.box(s * 0.02, -0.006, 0, 0.012, 0.012, 0.016, S_CANDY, { fit: true });
    mb.pop();
  });
}, { tags: ['sweet', 'anomalous'], desc: 'Pastel sweets that taste like a half-remembered birthday. Clears the head.' });

food('dream_fruit', 'Dream Fruit', 0.2, { hunger: 8, thirst: 8, calories: 120, lucidity: 12, unhappy: -6, stress: 4, fresh: 3, rot: 5, ingredient: 'weird' }, (mb) => {
  mb.sphere(0, 0.042, 0, 0.042, 8, 6, SK_DREAM, { fit: true, sy: 1.0, emissive: 0.7 });
  mb.cylinder(0, 0.08, 0, 0.003, 0.016, 4, 'i_black', { color: 0x8a6a9a });
  mb.push().translate(0.004, 0.09, 0).rotateZ(-0.5); mb.box(0.012, 0, 0, 0.024, 0.003, 0.014, S_LEAF, { color: 0xc8f0e0 }); mb.pop();
}, { tags: ['fruit', 'anomalous', 'wild'], desc: 'Grows in the bright fields. Faintly warm, faintly glowing. It is watching, a little.' });

// =====================================================================================
// WILD / FORAGED
// =====================================================================================
food('wild_greens', 'Wild Greens', 0.1, { hunger: 3, thirst: 1, calories: 20, unhappy: 2, fresh: 2, rot: 4, ingredient: 'veg' }, (mb) => {
  for (let i = 0; i < 5; i++) {
    mb.push().translate(0, 0.003 + i * 0.002, 0).rotateY(-0.5 + i * 0.25);
    mb.box(0.03, 0, 0, 0.07, 0.003, 0.018, S_LEAF, { color: [0xffffff, 0xd8f0c0, 0xc8e0b0, 0xe8f8d8, 0xb8d8a0][i] });
    mb.pop();
  }
  mb.box(-0.004, 0.0, 0, 0.012, 0.016, 0.016, 'i_black', { color: 0xc8a878 });
}, { tags: ['wild', 'stewveg', 'saladveg', 'herb'] });

food('wild_berries', 'Wild Berries', 0.1, { hunger: 3, thirst: 3, calories: 45, fresh: 2, rot: 4, ingredient: 'fruit' }, (mb) => {
  mb.box(0, 0, 0, 0.08, 0.003, 0.05, S_LEAF);
  const pts = [[-0.02, 0], [0, -0.01], [0.018, 0.006], [-0.006, 0.014], [0.01, -0.016], [-0.024, -0.014]];
  pts.forEach(([x, z], i) => mb.sphere(x, 0.011, z, 0.009, 6, 4, T.white, { color: i % 2 ? 0x4a2a6a : 0x6a2a5a }));
}, { tags: ['wild', 'fruit'] });

food('wild_mushroom', 'Wild Mushroom', 0.06, { hunger: 2, calories: 20, poison: 0.6, fresh: 2, rot: 4, cookable: true, cookMins: 8, ingredient: 'veg' }, (mb) => {
  for (const [x, z, s] of [[-0.016, 0, 1.4], [0.026, 0.016, 1.0]] as [number, number, number][]) {
    mb.cylinder(x, 0, z, 0.007 * s, 0.03 * s, 6, T.white, { color: 0xe8e0cc });
    mb.cylinder(x, 0.026 * s, z, 0.026 * s, 0.016 * s, 8, S_MUSH, { fit: true, rTop: 0.008 * s });
  }
}, { tags: ['wild', 'mushroom'], desc: 'Could be edible. Could be not. Experienced foragers can tell.' });

food('dandelion', 'Dandelion', 0.03, { hunger: 1, calories: 10, unhappy: 1, fresh: 2, rot: 3, ingredient: 'veg' }, (mb) => {
  rodX(mb, -0.05, 0.03, 0.004, 0.002, 0.002, 4, S_LEAF);
  mb.sphere(0.035, 0.012, 0, 0.012, 6, 4, T.white, { color: 0xf6d02a, sy: 0.7 });
  for (const a of [-0.6, 0.5]) { mb.push().translate(-0.03, 0.002, 0).rotateY(a); mb.box(0.025, 0, 0, 0.05, 0.003, 0.012, S_LEAF); mb.pop(); }
}, { tags: ['wild', 'saladveg', 'herb'] });

// =====================================================================================
// COOKED DISHES
// =====================================================================================
food('stew', 'Pot of Stew', 2.4, { hunger: 60, thirst: 15, calories: 1700, unhappy: -15, boredom: -5, fresh: 3, rot: 6, leaves: 'pot' },
  (mb) => pot(mb, IN.stew), { tags: ['cooked_dish'], desc: 'Hearty. Several meals, eat it in portions.' });
food('soup_pot', 'Pot of Soup', 2.4, { hunger: 40, thirst: 35, calories: 800, unhappy: -10, fresh: 3, rot: 6, leaves: 'pot' },
  (mb) => pot(mb, IN.soup), { tags: ['cooked_dish'] });
food('salad', 'Salad', 0.5, { hunger: 10, thirst: 8, calories: 150, unhappy: -6, fresh: 1, rot: 2, leaves: 'bowl' },
  (mb) => bowl(mb, IN.salad, 0xf2eee6), { tags: ['cooked_dish'] });
food('sandwich', 'Sandwich', 0.25, { hunger: 14, thirst: -2, calories: 480, unhappy: -8, fresh: 2, rot: 4 }, (mb) => {
  const S = 0.105;
  mb.box(0, 0, 0, S, 0.012, S, { all: S_CRUST, top: D_BREADSLICE }, { fit: { top: true }, uvScale: 4 });
  mb.box(0.002, 0.012, -0.002, S + 0.012, 0.005, S + 0.008, S_LEAF, { color: 0x9ad25a });
  mb.box(0, 0.017, 0, S + 0.004, 0.006, S + 0.002, T.white, { color: 0xe89a9a });
  mb.push().translate(0, 0.023, 0).rotateY(0.785); mb.box(0, 0, 0, S * 0.95, 0.003, S * 0.95, S_CHEESE); mb.pop();
  mb.box(0, 0.026, 0, S, 0.012, S, { all: S_CRUST, top: D_BREADSLICE }, { fit: { top: true }, uvScale: 4 });
}, { tags: ['cooked_dish'] });

// =====================================================================================
// FROZEN
// =====================================================================================
food('pizza_frozen', 'Frozen Pizza', 0.45, { hunger: 30, thirst: -6, calories: 1150, cookable: true, cookMins: 15, frozenOk: true, fresh: 3, rot: 5, ingredient: 'grain', cookedName: 'Pizza' }, (mb) => {
  slab(mb, 0.28, 0.035, 0.28, D_PIZZA, T.card, 0xc8302a);
}, { tags: ['frozen'], desc: 'Keep frozen. Bake it in an oven for 15 minutes.' });

food('ice_cream', 'Tub of Ice Cream', 0.5, { hunger: 12, thirst: 4, calories: 1000, unhappy: -20, boredom: -8, fresh: 0.25, rot: 0.5, frozenOk: true, ingredient: 'sweet' }, (mb) => {
  mb.cylinder(0, 0, 0, 0.058, 0.1, 10, { sides: L_ICECREAM, top: T.white, bottom: T.white }, { fit: true, rTop: 0.066 });
  mb.cylinder(0, 0.1, 0, 0.069, 0.012, 10, { sides: T.white, top: D_ICELID, bottom: T.white }, { fit: true, color: 0xf6d8e6 });
}, { tags: ['frozen', 'sweet'], desc: 'Melts fast outside a freezer.' });

food('popsicle', 'Popsicle', 0.07, { hunger: 1, thirst: 6, calories: 60, unhappy: -6, fresh: 0.25, rot: 0.5, frozenOk: true, ingredient: 'sweet' }, (mb) => {
  mb.box(-0.06, 0, 0, 0.05, 0.004, 0.01, 'i_wood');
  mb.box(-0.022, 0, 0, 0.026, 0.018, 0.034, T.white, { color: 0x3a6ad8 });
  mb.box(0.004, 0, 0, 0.026, 0.018, 0.034, T.white, { color: 0xf6f2ea });
  mb.box(0.03, 0, 0, 0.026, 0.018, 0.034, T.white, { color: 0xd8302a });
}, { tags: ['frozen', 'sweet'] });

// =====================================================================================
// MISC FOOD
// =====================================================================================
defItem({
  key: 'empty_can', name: 'Empty Can', cat: 'misc', weight: 0.05, fluidCap: 0.3,
  tags: ['can', 'scrap', 'fluidcontainer', 'boiler'],
  desc: 'Rinse it, fill it, boil water in it over a fire. Or string a few together as an alarm.',
  model: (mb) => can(mb, T.tin, 0.037, 0.11, { open: true, fill: T.tinTop }),
});

food('gum', 'Chewing Gum', 0.03, { hunger: 0, calories: 2, boredom: -5, stress: -3, unhappy: -1 },
  (mb) => slab(mb, 0.075, 0.016, 0.022, D_GUM, T.card, 0x5ab88a), { uses: 5, tags: ['snack'] });

food('cigarettes', 'Cigarettes', 0.03, { hunger: 0, calories: 0, stress: -12, unhappy: -4 }, (mb) => {
  pack(mb, 0.055, 0.085, 0.022, D_CIG, 0xf4f2ec);
}, { uses: 20, tags: ['smokable'], desc: 'Twenty smokes. Needs a lighter or matches. Calms the nerves.' });

food('food_scraps', 'Food Scraps', 0.3, { hunger: 2, calories: 50, poison: 0.5, unhappy: 15 }, (mb) => {
  mb.sphere(0, 0.012, 0, 0.05, 7, 4, S_SCRAPS, { fit: true, sy: 0.35 });
  mb.sphere(0.03, 0.01, 0.02, 0.025, 6, 4, S_SCRAPS, { fit: true, sy: 0.5, color: 0xd8e0b0 });
  mb.box(-0.03, 0.01, -0.01, 0.03, 0.006, 0.012, 'i_white', { color: 0xc8a048 });
}, { tags: ['compostable', 'bait_source'], desc: 'Rotten leftovers. Good for compost or bait, not for you.' });

food('donut', 'Donut', 0.07, { hunger: 5, calories: 260, unhappy: -6, fresh: 2, rot: 5, ingredient: 'sweet' }, (mb) => {
  mb.cylinder(0, 0, 0, 0.045, 0.026, 12, { sides: S_DONUT, top: D_DONUT, bottom: S_DONUT }, { fit: true });
}, { tags: ['snack', 'sweet'] });

const D_RATION = decal('i_ration_top', 16, 6, (pc) => {
  pc.fill(0x5a6a3a); band(pc, 0, 1, 0x3e4a28); band(pc, 5, 1, 0x3e4a28);
  pc.rect(3, 1, 10, 4, 0xd8cca0); dashes(pc, 4, 2, 8, 0x2a2a1e, 3); dashes(pc, 4, 3, 6, 0x2a2a1e, 5);
});
food('ration_bar', 'Ration Bar', 0.12, { hunger: 15, thirst: -4, calories: 700, unhappy: 2, ingredient: 'grain' }, (mb) => {
  slab(mb, 0.12, 0.022, 0.045, D_RATION, T.card, 0x5a6a3a);
}, { tags: ['ration', 'snack'], desc: 'Dense, chewy, homemade. Keeps forever.' });
