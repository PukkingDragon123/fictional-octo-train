// Items stream — open vessels (pots, mugs, bowls, buckets, pans). Open tops are
// modelled as closed cylinders whose top cap carries a painted "interior"
// disc (rim highlight, inner wall crescent, contents), which reads correctly
// from the isometric camera without needing inside-facing geometry.
import { tex, rp, dk, lt, T, MB, ph, bayer, PixelCanvas } from './_kit';

/**
 * Paint an interior disc (fit on a cylinder top). Texture rows run front (+z,
 * row 0) to back (-z); columns run -x → +x. The visible inner wall is the
 * far (-x,-z) side: bottom-left of the texture.
 */
export function interiorTex(name: string, o: { rim: number; wall: number; fill?: number; fillR?: number; pattern?: (pc: PixelCanvas, x: number, y: number, d: number) => void; size?: number }) {
  const S = o.size ?? 14;
  return tex(name, S, S, (pc) => {
    const c = (S - 1) / 2;
    const rimR = S / 2, wallR = S / 2 - 1.2, fillR = (o.fillR ?? 0.78) * (S / 2);
    const W = rp(o.wall, 5, 0.45);
    pc.each((x, y) => {
      const dx = x - c, dy = y - c;
      const d = Math.hypot(dx, dy);
      let col: number;
      if (d > wallR) col = (dx + dy < 0) ? lt(o.rim, 0.25) : o.rim;               // rim lip
      else {
        // inner wall: lit on the far side (bottom-left of texture = -x,-z)
        const far = (-dx + dy) / (d + 0.001);
        const t = 0.5 + far * 0.35 + (d / wallR) * 0.15;
        col = W[Math.max(0, Math.min(4, Math.round(t * 4 + (bayer(x, y) - 0.5) * 0.5)))];
        if (o.fill !== undefined && d < fillR) col = o.fill;
      }
      pc.set(x, y, col);
      if (o.pattern && o.fill !== undefined && d < fillR) o.pattern(pc, x, y, d);
    });
    // darker ring just inside the rim on the near side (shadow under the lip)
    pc.each((x, y) => {
      const dx = x - c, dy = y - c, d = Math.hypot(dx, dy);
      if (d <= wallR && d > wallR - 1 && dx + dy > 0) pc.blend(x, y, 0x000000, 0.25);
    });
  });
}

// --- shared interiors
export const IN = {
  potEmpty: interiorTex('i_in_pot', { rim: 0xd2d6da, wall: 0x8a9096 }),
  potWater: interiorTex('i_in_pot_water', { rim: 0xd2d6da, wall: 0x8a9096, fill: 0x5c86a0, pattern: (pc, x, y) => { if (ph(x, y, 3) < 0.12) pc.set(x, y, 0x9cc2d6); } }),
  stew: interiorTex('i_in_stew', { rim: 0xd2d6da, wall: 0x8a9096, fill: 0x7a4422, pattern: (pc, x, y) => {
    const v = ph(x, y, 11);
    if (v < 0.12) pc.set(x, y, 0xe07a2a);          // carrot
    else if (v < 0.2) pc.set(x, y, 0xd8c08a);      // potato
    else if (v < 0.28) pc.set(x, y, 0x5a2a18);     // meat
    else if (v < 0.32) pc.set(x, y, 0x6a9a3a);     // herbs
  } }),
  soup: interiorTex('i_in_soup', { rim: 0xd2d6da, wall: 0x8a9096, fill: 0xc8742e, pattern: (pc, x, y) => {
    const v = ph(x, y, 12);
    if (v < 0.1) pc.set(x, y, 0xe8b04a); else if (v < 0.17) pc.set(x, y, 0x5e8a34); else if (v < 0.21) pc.set(x, y, 0xf0d08a);
  } }),
  rice: interiorTex('i_in_rice', { rim: 0xd2d6da, wall: 0x8a9096, fill: 0xeae6da, pattern: (pc, x, y) => { if (ph(x, y, 13) < 0.25) pc.set(x, y, 0xd4cebe); if (ph(x, y, 14) < 0.08) pc.set(x, y, 0xffffff); } }),
  pasta: interiorTex('i_in_pasta', { rim: 0xd2d6da, wall: 0x8a9096, fill: 0xe8c66a, pattern: (pc, x, y) => { if ((x + y * 2) % 4 === 0) pc.set(x, y, 0xc89a3a); if (ph(x, y, 15) < 0.15) pc.set(x, y, 0xb83a22); } }),
  mugEmpty: interiorTex('i_in_mug', { rim: 0xf0ece4, wall: 0xb8b2a8, size: 10 }),
  coffee: interiorTex('i_in_coffee', { rim: 0xf0ece4, wall: 0xb8b2a8, fill: 0x3a2214, fillR: 0.8, size: 10, pattern: (pc, x, y) => { if (x === 3 && y === 4) pc.set(x, y, 0x7a5232); } }),
  tea: interiorTex('i_in_tea', { rim: 0xf0ece4, wall: 0xb8b2a8, fill: 0x9a5a1e, fillR: 0.8, size: 10, pattern: (pc, x, y) => { if (x === 4 && y === 3) pc.set(x, y, 0xd89a4a); } }),
  lucid: interiorTex('i_in_lucid', { rim: 0xf0ece4, wall: 0xb8b2a8, fill: 0xb89ae8, fillR: 0.8, size: 10, pattern: (pc, x, y) => { if (ph(x, y, 5) < 0.2) pc.set(x, y, 0xe8d8ff); } }),
  bowlEmpty: interiorTex('i_in_bowl', { rim: 0xf2eee6, wall: 0xc8c2b6 }),
  salad: interiorTex('i_in_salad', { rim: 0xf2eee6, wall: 0xc8c2b6, fill: 0x6aa83a, fillR: 0.85, pattern: (pc, x, y) => {
    const v = ph(x, y, 16);
    if (v < 0.14) pc.set(x, y, 0xd8402e); else if (v < 0.3) pc.set(x, y, 0x9ad25a); else if (v < 0.36) pc.set(x, y, 0xe8862a); else if (v < 0.45) pc.set(x, y, 0x4a7a2a);
  } }),
  noodles: interiorTex('i_in_noodles', { rim: 0xf2eee6, wall: 0xc8c2b6, fill: 0xd8a24a, fillR: 0.85, pattern: (pc, x, y) => {
    if ((x * 3 + y) % 5 === 0 || (x + y * 3) % 7 === 0) pc.set(x, y, 0xf0d48a);
    if (ph(x, y, 17) < 0.06) pc.set(x, y, 0x4a8a3a);
  } }),
  bucket: interiorTex('i_in_bucket', { rim: 0xd8dcd8, wall: 0x8a9290, size: 16 }),
  pan: interiorTex('i_in_pan', { rim: 0x5a5a60, wall: 0x2e2e34, fill: 0x26262c, fillR: 0.84, size: 14 }),
  cup: interiorTex('i_in_cup', { rim: 0xf6f6f2, wall: 0xc8c8c4, size: 10 }),
};

// --- painted metal for pots (world-ish density, tints well)
export const POT_SIDE = tex('i_pot_side', 16, 6, (pc) => {
  const R = rp(0xb8bec4, 6, 0.5);
  pc.each((x, y) => {
    const v = 0.55 + Math.sin(x * 0.8) * 0.12 + (ph(x, y, 4) - 0.5) * 0.08;
    pc.set(x, y, R[Math.max(0, Math.min(5, Math.round(v * 5)))]);
  });
  pc.hline(0, 15, 0, R[5]); pc.hline(0, 15, 5, R[1]);
  // highlight streak facing the camera (u≈0.125)
  pc.vline(2, 1, 4, R[5]); pc.vline(10, 1, 4, R[4]);
});

/** Cooking pot (3 L): body, rolled rim, two side handles. `inside` = interior disc texture */
export function pot(mb: MB, inside: string) {
  const r = 0.105, h = 0.12;
  mb.cylinder(0, 0, 0, r, h, 12, { sides: POT_SIDE, top: inside, bottom: T.tin }, { fit: true });
  mb.cylinder(0, h - 0.008, 0, r + 0.004, 0.008, 12, { sides: T.tin, top: inside, bottom: T.tin }, { fit: true });
  for (const s of [-1, 1]) {
    mb.box(s * (r + 0.02), h - 0.03, 0, 0.04, 0.012, 0.05, 'i_black');
    mb.box(s * (r + 0.006), h - 0.035, 0, 0.012, 0.02, 0.03, T.metal);
  }
}

/** Ceramic mug with handle on +x */
export function mug(mb: MB, inside: string, color: number, o: { decal?: string } = {}) {
  const r = 0.04, h = 0.095;
  mb.cylinder(0, 0, 0, r, h, 10, { sides: o.decal ?? T.white, top: T.white, bottom: T.white }, { fit: true, color: o.decal ? 0xffffff : color, caps: false });
  // untinted interior disc
  mb.cylinder(0, h - 0.0015, 0, r, 0.0015, 10, { sides: T.white, top: inside, bottom: T.white }, { fit: true });
  // handle: three small boxes forming a C on the +x side
  mb.box(r + 0.012, h - 0.028, 0, 0.026, 0.012, 0.014, T.white, { color });
  mb.box(r + 0.012, 0.02, 0, 0.026, 0.012, 0.014, T.white, { color });
  mb.box(r + 0.022, 0.02, 0, 0.012, h - 0.036, 0.014, T.white, { color });
}

/** Bowl (flared); the interior disc is not tinted by the bowl colour */
export function bowl(mb: MB, inside: string, color: number, r = 0.075, h = 0.055) {
  mb.cylinder(0, 0, 0, r * 0.55, 0.01, 10, T.white, { color, fit: true });
  mb.cylinder(0, 0.008, 0, r * 0.62, h - 0.008, 10, T.white, { fit: true, color, rTop: r, caps: false });
  mb.cylinder(0, h - 0.0015, 0, r, 0.0015, 10, { sides: T.white, top: inside, bottom: T.white }, { fit: true });
}

export { dk };
