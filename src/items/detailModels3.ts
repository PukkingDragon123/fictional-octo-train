// The art pass (wave 3): the items you see most, in the hotbar and lying about,
// rebuilt as small, real objects. Each keeps its own pixel textures and size
// (so packing, holding and icons stay in frame) and gains a true silhouette and
// the parts a real one has: a curled page and its punched holes, a torn note
// folded once, crimped wrapper ends, a coin stack with reeded edges, a split
// ring with cut keys, a D cell's crimped can, a pencil's ferrule and graphite,
// a coiled rope with whippings and a frayed tail, a crushed can, a towel's
// folded layers... New decals are drawn at twice the old density for the
// close-ups and the turning icons. Merged into DETAIL (./detailModels.ts).
import type { ModelBuilder } from '../gfx/modelBuilder';
import type { Detail } from './detailModels';
import { tex, decal, txt, dashes, rp, ph } from '../content/items/_kit';

type MB = ModelBuilder;

// ---------------------------------------------------------------- shared parts
/**
 * A sheet (paper, photo, cloth) as a grid of quads: w along x, d along z, lying at y = 0,
 * its height given by h(u, v) (u 0..1 along +x, v 0..1 along -z, as mb.flat maps a decal).
 * `rep` > 0 tiles the texture every `rep` metres instead of fitting it once.
 */
export function sheetGrid(mb: MB, w: number, d: number, nx: number, nz: number, top: string, back: string, h: (u: number, v: number) => number,
  o: { color?: number; backColor?: number; rep?: number; edge?: (u: number, v: number) => number } = {}) {
  const P = (i: number, j: number) => {
    const u = i / nx, v = j / nz;
    const e = o.edge ? o.edge(u, v) : 0;
    return [-w / 2 + u * w + e * 0.3, h(u, v), d / 2 - v * d + e];
  };
  const UV = (i: number, j: number): number[] => o.rep ? [(i / nx) * w / o.rep, (j / nz) * d / o.rep] : [Math.min(0.999, i / nx), Math.min(0.999, j / nz)];
  const c = o.color ?? 0xffffff, cb = o.backColor ?? c;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = P(i, j), b = P(i + 1, j), cc = P(i + 1, j + 1), dd = P(i, j + 1);
    mb.quadRaw([a, b, cc, dd], [UV(i, j), UV(i + 1, j), UV(i + 1, j + 1), UV(i, j + 1)], top, c, 1);
    const lift = 0.0006;
    mb.quadRaw([[dd[0], dd[1] - lift, dd[2]], [cc[0], cc[1] - lift, cc[2]], [b[0], b[1] - lift, b[2]], [a[0], a[1] - lift, a[2]]], [UV(i, j + 1), UV(i + 1, j + 1), UV(i + 1, j), UV(i, j)], back, cb, 0.6);
  }
}
/** a ring (annulus tube): outer radius r1, inner r0, height h, standing on y; inner wall faces in */
function tube(mb: MB, x: number, y: number, z: number, r0: number, r1: number, h: number, segs: number, side: string, face: string, inner: string, o: { color?: number; innerColor?: number; faceColor?: number } = {}) {
  const c = o.color ?? 0xffffff, ci = o.innerColor ?? c, cf = o.faceColor ?? c;
  const pt = (r: number, a: number, yy: number) => [x + Math.cos(a) * r, yy, z + Math.sin(a) * r];
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2, u0 = i / segs, u1 = (i + 1) / segs;
    // outer wall (seen from outside)
    mb.quadRaw([pt(r1, a1, y), pt(r1, a0, y), pt(r1, a0, y + h), pt(r1, a1, y + h)], [[u1, 0], [u0, 0], [u0, 0.999], [u1, 0.999]], side, c, 0.92);
    // inner wall (seen from the hole)
    mb.quadRaw([pt(r0, a0, y), pt(r0, a1, y), pt(r0, a1, y + h), pt(r0, a0, y + h)], [[u0, 0], [u1, 0], [u1, 0.999], [u0, 0.999]], inner, ci, 0.7);
    // top and bottom faces
    const tu = (r: number, a: number) => [0.5 + Math.cos(a) * r / r1 * 0.499, 0.5 - Math.sin(a) * r / r1 * 0.499];
    mb.quadRaw([pt(r0, a0, y + h), pt(r0, a1, y + h), pt(r1, a1, y + h), pt(r1, a0, y + h)], [tu(r0, a0), tu(r0, a1), tu(r1, a1), tu(r1, a0)], face, cf, 1);
    mb.quadRaw([pt(r1, a0, y), pt(r1, a1, y), pt(r0, a1, y), pt(r0, a0, y)], [tu(r1, a0), tu(r1, a1), tu(r0, a1), tu(r0, a0)], face, cf, 0.55);
  }
}
/** a torus-ish loop of short rods: centre, loop radius R, rope radius r, n segments, tilt about x */
function loop(mb: MB, x: number, y: number, z: number, R: number, r: number, n: number, t: string, color = 0xffffff, tilt = 0, from = 0, to = 1) {
  mb.push().translate(x, y, z).rotateX(tilt);
  const seg = (2 * Math.PI * R) / n;
  for (let i = Math.floor(from * n); i < Math.ceil(to * n); i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    mb.push().translate(Math.cos(a) * R, 0, Math.sin(a) * R).rotateY(-a);
    mb.cylinderZ(0, 0, 0, r, seg * 1.08, 6, t, { color, uvScale: 3, bevel: false });
    mb.pop();
  }
  mb.pop();
}
/** crimped seal: a row of thin pleats across a wrapper end (x = end centre, spanning d along z) */
function crimp(mb: MB, x: number, y: number, d: number, w: number, h: number, t: string, color: number, n = 7) {
  for (let i = 0; i < n; i++) {
    const z = -d / 2 + (i + 0.5) * (d / n);
    mb.box(x, y + (i % 2 ? 0.0006 : 0), z, w, h * (i % 2 ? 0.8 : 1), d / n * 0.62, t, { color: i % 2 ? color : mix(color, 0x000000, 0.18), bevel: false });
  }
}
function mix(a: number, b: number, t: number) {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t) << s;
  return ch(16) | ch(8) | ch(0);
}
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- decals (twice the old density)
const D_PAPER = decal('i3_paper', 24, 32, (pc) => {
  const R = rp(0xf2eee2, 5, 0.18);
  pc.each((x, y) => pc.set(x, y, R[3 - (ph(x >> 2, y >> 2, 3) < 0.18 ? 1 : 0)]));
  for (let y = 6; y < 31; y += 3) pc.hline(1, 22, y, 0xb8cce0);
  pc.vline(5, 0, 31, 0xe0a0a0);
  for (const y of [5, 15, 25]) { pc.set(2, y, 0x6a6458); pc.set(3, y, 0x8a8478); pc.set(2, y + 1, 0x8a8478); }
  // a coffee ring from a mug set down on it
  pc.stain(16, 21, 4, 0xf2eee2, 0xc8a878, 5);
  pc.line(9, 9, 15, 8, 0x8a8a92); pc.line(15, 8, 13, 12, 0x8a8a92);
  pc.hline(0, 23, 31, 0xd8d0bc); pc.vline(23, 0, 31, 0xe0d8c4);
});
const D_PAPER_BACK = decal('i3_paper_back', 8, 8, (pc) => { pc.fill(0xe6e0d0); pc.set(2, 3, 0xd8d0bc); pc.set(5, 6, 0xdcd4c2); });
const D_NOTE = decal('i3_note', 20, 24, (pc) => {
  const R = rp(0xefe4c4, 5, 0.22);
  pc.each((x, y) => pc.set(x, y, R[3 - (ph(x >> 1, y >> 1, 9) < 0.14 ? 1 : 0) + (ph(x, y, 4) < 0.05 ? 1 : 0)]));
  // torn top: a ragged dark lip
  for (let x = 0; x < 20; x++) { const k = 1 + (ph(x, 0, 2) < 0.5 ? 1 : 0); for (let y = 0; y < k; y++) pc.set(x, y, 0xd8cca8); }
  for (let y = 4; y < 23; y += 3) pc.hline(1, 18, y, 0xc8d4e0);
  // hurried handwriting in blue ink, a word underlined in red, a tally of the count
  for (let y = 3; y < 15; y += 3) dashes(pc, 2, y, 15 - (y % 6), 0x22306a, y + 3, 1);
  pc.hline(3, 9, 9, 0xb02a24);
  for (let i = 0; i < 4; i++) pc.vline(3 + i * 2, 16, 19, 0x22306a);
  pc.line(2, 19, 10, 16, 0x22306a);
  // a little door, and an arrow away from it
  pc.strokeRect(13, 15, 5, 7, 0x22306a); pc.set(16, 18, 0x22306a);
  pc.hline(11, 12, 21, 0xb02a24); pc.set(11, 20, 0xb02a24);
  pc.stain(5, 21, 2, 0xefe4c4, 0xc8b088, 2);
});
const D_NOTE_BACK = decal('i3_note_back', 8, 8, (pc) => { pc.fill(0xe2d8b8); pc.hline(1, 6, 3, 0xd4cba6); pc.set(5, 5, 0xc8bc98); });
const D_NEWS = decal('i3_news', 32, 40, (pc) => {
  const R = rp(0xe4dcc6, 5, 0.18);
  pc.each((x, y) => pc.set(x, y, R[3 - (ph(x >> 2, y >> 2, 7) < 0.2 ? 1 : 0)]));
  // masthead
  txt(pc, 'THE DAY', 3, 2, 0x1c1a20); pc.rect(30, 2, 1, 5, 0xb02a24);
  pc.hline(1, 30, 8, 0x1c1a20); pc.hline(1, 30, 10, 0x6a665e);
  // headline bars
  pc.rect(2, 12, 28, 2, 0x2a2830); pc.rect(2, 15, 19, 2, 0x2a2830);
  // a halftone photo
  for (let y = 19; y < 30; y++) for (let x = 2; x < 15; x++) {
    const d = Math.hypot(x - 8, y - 23) / 7; const lum = 0.75 - (y > 26 ? 0.2 : 0) - (d < 0.45 ? 0.35 : 0);
    pc.set(x, y, ((x + y) & 1) && ph(x, y, 5) > lum ? 0x3a3840 : 0xcfc8b4);
  }
  pc.strokeRect(2, 19, 13, 11, 0x5a5850);
  // body columns
  for (let y = 19; y < 38; y += 2) { dashes(pc, 17, y, 13, 0x4a4850, y, 1); if (y > 31) dashes(pc, 2, y, 13, 0x4a4850, y + 9, 1); }
  pc.vline(16, 19, 38, 0xb8b2a0);
  pc.hline(0, 31, 39, 0xc8c0aa);
});
const D_CANDY = decal('i3_candy', 32, 10, (pc) => {
  pc.fill(0x5a2c16);
  pc.hline(0, 31, 0, 0x7a4224); pc.hline(0, 31, 9, 0x3a1c0e);
  pc.rect(0, 2, 32, 1, 0xd83a2a); pc.rect(0, 7, 32, 1, 0xd83a2a);
  pc.rect(7, 2, 18, 6, 0xf2c83a); pc.strokeRect(7, 2, 18, 6, 0xfff0a0);
  txt(pc, 'NOMA', 9, 3, 0x5a2c16);
  pc.set(3, 4, 0xfff0a0); pc.set(2, 5, 0xfff0a0); pc.set(4, 5, 0xfff0a0); pc.set(3, 6, 0xfff0a0);
  for (let x = 26; x < 31; x += 2) pc.set(x, 5, 0xc89a6a);
});
const D_CHIPS = decal('i3_chips', 28, 32, (pc) => {
  const R = rp(0xd23a2e, 5, 0.4);
  pc.each((x, y) => pc.set(x, y, R[2 + (Math.abs(x - 6 - y * 0.3) < 2 ? 2 : 0) - (y > 28 ? 1 : 0)]));
  // a big yellow chip with ridges
  pc.ellipse(14, 17, 8, 6, 0xe8b63a); pc.ellipse(13, 16, 6, 4, 0xf6d468);
  for (let i = -6; i <= 6; i += 3) pc.line(14 + i - 2, 12, 14 + i + 2, 22, 0xd89a2a);
  // logo
  pc.rect(3, 3, 22, 7, 0xf6eedc); pc.strokeRect(3, 3, 22, 7, 0x8a1a14);
  txt(pc, 'CRISP', 5, 4, 0x8a1a14);
  pc.rect(19, 25, 7, 5, 0xf6eedc); txt(pc, '9', 21, 25, 0x8a1a14);
});
decal('i3_photo_back', 8, 10, (pc) => { pc.fill(0xe8e0cc); for (let y = 2; y < 8; y += 2) dashes(pc, 1, y, 6, 0x6a6a8a, y, 1); pc.set(6, 8, 0xd0c4a4); });
const D_WALLET_IN = decal('i3_wallet_card', 12, 8, (pc) => {
  pc.fill(0x2a5a9a); pc.rect(0, 5, 12, 2, 0x1a2a4a); pc.rect(1, 1, 3, 2, 0xd8b04a); pc.hline(6, 10, 2, 0xb8c8e8);
});
const D_TAG = decal('i3_keytag', 8, 12, (pc) => {
  pc.fill(0xe8c24a); pc.strokeRect(0, 0, 8, 12, 0x9a7420);
  pc.set(3, 1, 0x4a3a10); pc.set(4, 1, 0x4a3a10); pc.set(3, 2, 0x4a3a10); pc.set(4, 2, 0x4a3a10);
  txt(pc, '14', 1, 5, 0x4a3410);
});
const S_PENCIL = tex('i3_pencil', 16, 4, (pc) => {
  pc.fill(0xf0c419); pc.hline(0, 15, 0, 0xf8dc5a); pc.hline(0, 15, 3, 0xc89a10);
  for (let x = 2; x < 13; x += 2) pc.set(x, 1, 0x3a3010);
  for (let x = 3; x < 12; x += 3) pc.set(x, 2, 0x3a3010);
}, true);

// ---------------------------------------------------------------- the models
export const DETAIL3: Record<string, Detail> = {
  // ------------------------------------------------ paper
  paper: {
    build: (mb) => {
      mb.push().rotateY(0.35);
      // a loose A4 sheet: soft wave along its length, the top edge rolled a little, one corner lifted
      sheetGrid(mb, 0.21, 0.28, 5, 7, D_PAPER, D_PAPER_BACK, (u, v) => 0.0012 + 0.0025 * Math.sin(v * Math.PI * 1.4) * (0.5 + u * 0.5) + 0.012 * smooth(0.8, 1, v) ** 2 + 0.022 * smooth(1.55, 2, u + v) ** 1.5);
      mb.pop();
    },
    poi: [
      { at: [0, 0.004, 0], label: 'SHEET', note: 'Ruled A4, three punched holes, a coffee ring. Blank enough to write on.' },
      { at: [0.09, 0.02, -0.12], label: 'CORNER', note: 'Dog-eared. Someone kept their place with it.' },
    ],
  },
  note: {
    build: (mb) => {
      mb.push().rotateY(0.5);
      // folded once down the middle and opened again: a low tent along the crease, the torn edge curling
      sheetGrid(mb, 0.1, 0.12, 6, 5, D_NOTE, D_NOTE_BACK, (u, v) => 0.001 + 0.007 * (1 - Math.abs(u * 2 - 1)) ** 1.6 + 0.006 * smooth(0.82, 1, v) ** 2,
        { edge: (u, v) => v > 0.99 ? (ph(Math.round(u * 6), 1, 3) - 0.5) * 0.006 : 0 });
      // a strip of yellowed tape that held it to a wall
      mb.push().translate(0.0, 0.0105, -0.058).rotateY(0.12).rotateZ(0.02);
      mb.box(0, 0, 0, 0.034, 0.0006, 0.012, 'i_plastic', { color: 0xe8d898, bevel: false });
      mb.pop();
      mb.pop();
    },
    poi: [
      { at: [0, 0.008, 0], label: 'WRITING', note: 'Blue ballpoint pressed hard enough to dent the page. A tally, a door, an arrow away from it.' },
      { at: [0, 0.011, -0.06], label: 'TAPE', note: 'Torn off a wall in a hurry. The tape still holds a flake of yellow paint.' },
    ],
  },
  newspaper: {
    build: (mb) => {
      mb.push().rotateY(0.15);
      const w = 0.3, d = 0.19;
      // the folded broadsheet: two halves with the fold rolled round on -z, pages fanning at the open edge
      for (let i = 0; i < 4; i++) mb.box(0.002 * i, 0.0016 * i, 0.003 * i, w - 0.004 * i, 0.0018, d - 0.006, 'i_pages', { color: 0xddd4bc, bevel: false });
      mb.cylinderX(0, 0.0075, -d / 2 + 0.002, 0.0072, w, 8, 'i_pages', { color: 0xd8d0b8, caps: false });
      sheetGrid(mb, w, d, 4, 4, D_NEWS, 'i_pages', (u, v) => 0.0138 + 0.0018 * Math.sin(u * 3.1) + 0.006 * smooth(0.85, 1, v) * smooth(0.6, 1, u), { backColor: 0xd0c8b0 });
      // a torn-out coupon hole and a pencil ring round an advert
      mb.box(0.1, 0.0141, 0.05, 0.032, 0.0006, 0.02, 'i_pages', { color: 0xb8b09a, bevel: false });
      mb.pop();
    },
    poi: [{ at: [0, 0.016, 0], label: 'FRONT PAGE', note: 'Yesterday\'s paper. A coupon cut out of the back page.' }],
  },
  photo_old: {
    build: (mb) => {
      mb.push().rotateY(-0.35);
      // a stiff print: barely curved, the top corner curled up from years in a wallet
      sheetGrid(mb, 0.088, 0.107, 4, 5, 'i_photo_old', 'i3_photo_back', (u, v) => 0.0012 + 0.0016 * Math.sin(u * Math.PI) + 0.014 * smooth(1.5, 2, u + v) ** 1.6);
      mb.push().translate(-0.034, 0.0022, 0.048).rotateY(0.7); mb.box(0, 0, 0, 0.024, 0.0005, 0.009, 'i_plastic', { color: 0xe0cc88, bevel: false }); mb.pop();
      mb.pop();
    },
    poi: [{ at: [0, 0.004, 0], label: 'PRINT', note: 'Sepia, the corners soft. Someone in a doorway you almost recognise.' }],
  },
  // ------------------------------------------------ power and metal
  battery: {
    build: (mb) => {
      const r = 0.016, h = 0.058;
      mb.cylinder(0, 0.0025, 0, r, h - 0.005, 14, { sides: 'i_battery_label', top: 'i_tin_top', bottom: 'i_tin_top' }, { fit: true, caps: false });
      // the crimped can: a rolled lip top and bottom, the shrink wrap tucked over it
      for (const y of [0, h - 0.0028]) mb.cylinder(0, y, 0, r * 0.985, 0.0028, 14, 'i_steel', { color: 0xc8ccd0 });
      for (const y of [0.0026, h - 0.0034]) mb.cylinder(0, y, 0, r * 1.012, 0.0008, 14, 'i_black', { color: 0x2a2a2e, caps: false });
      // positive nub with a vent ring, the flat negative cap with its pressed ring
      mb.cylinder(0, h, 0, 0.0055, 0.0012, 12, 'i_steel', { color: 0xb8bcc0 });
      mb.cylinder(0, h + 0.0012, 0, 0.0045, 0.0022, 12, 'chrome', { color: 0xe8ecef, rTop: 0.004 });
      mb.cylinder(0, -0.0004, 0, r * 0.7, 0.0005, 12, 'i_steel', { color: 0x9a9ea2 });
      // a seam down the wrap and a scuff of dirt
      mb.box(r * 0.99, 0.003, 0, 0.0008, h - 0.006, 0.0018, 'i_black', { color: 0x3a3a40, bevel: false });
    },
    poi: [
      { at: [0, 0.062, 0], label: 'TERMINAL', note: 'Positive nub, a little tarnished. Lick-test at your own risk.' },
      { at: [0.016, 0.03, 0], label: 'CHARGE', note: (it) => (it.uses !== undefined ? Math.round(it.uses) + '% charge left.' : 'Charge unknown.') },
    ],
  },
  coins: {
    build: (mb) => {
      const coin = (x: number, y: number, z: number, r: number, c: number, tilt = 0, ry = 0) => {
        mb.push().translate(x, y, z).rotateY(ry).rotateZ(tilt);
        mb.cylinder(0, 0, 0, r, 0.0026, 14, { sides: 'i_tin', top: 'i_coin_top', bottom: 'i_coin_top' }, { fit: true, color: c });
        // the raised rim, and reeding on the silver ones
        mb.cylinder(0, 0.0026, 0, r, 0.0005, 14, 'i_metal', { color: mix(c, 0xffffff, 0.2), caps: false });
        if (c === SILVER) for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; mb.box(Math.cos(a) * r, 0.0003, Math.sin(a) * r, 0.0007, 0.002, 0.0007, 'i_black', { color: 0x6a6e72, bevel: false }); }
        mb.pop();
      };
      const SILVER = 0xd8dce0, COPPER = 0xd08a5a, BRASS = 0xf0d070;
      // a short stack, slipped sideways
      [[0, SILVER, 0.0125], [0.0012, COPPER, 0.0105], [-0.001, SILVER, 0.0125], [0.0018, BRASS, 0.0115]].forEach(([dx, c, r], i) => coin(dx as number, i * 0.0027, 0.0006 * i, r as number, c as number));
      // loose ones, one leaning on the stack
      coin(0.024, 0, 0.012, 0.0105, COPPER, 0, 0.4);
      coin(-0.022, 0, 0.015, 0.0125, SILVER, 0, 1.2);
      coin(0.006, 0, -0.026, 0.0115, BRASS, 0, 2.2);
      coin(-0.017, 0.0105, -0.006, 0.0105, COPPER, 0.9, 0.3);
    },
    poi: [{ at: [0, 0.012, 0], label: 'CHANGE', note: 'Copper, brass and silver from three different mints. None of them from here.' }],
  },
  fuse: {
    build: (mb) => {
      const y = 0.008;
      mb.cylinderX(0, y, 0, 0.0068, 0.036, 12, 'i_glass', { color: 0xe8f4f4 });
      for (const s of [-1, 1]) {
        mb.cylinderX(s * 0.0225, y, 0, 0.0078, 0.011, 12, 'i_steel', { color: 0xd8c890 });
        mb.cylinderX(s * 0.0172, y, 0, 0.0081, 0.0012, 12, 'i_brass', { color: 0xc8a050 });
        mb.cylinderX(s * 0.0282, y, 0, 0.0081, 0.0012, 12, 'i_brass', { color: 0xc8a050 });
        mb.cylinderX(s * 0.0288, y, 0, 0.0055, 0.0004, 10, 'i_steel', { color: 0x9a9070 });
      }
      // the element inside: a thin strip with a pinched middle
      mb.box(-0.009, y - 0.0004, 0, 0.016, 0.0008, 0.0012, 'chrome', { color: 0xd8dce0, bevel: false });
      mb.box(0.009, y - 0.0004, 0, 0.016, 0.0008, 0.0012, 'chrome', { color: 0xd8dce0, bevel: false });
      mb.box(0, y - 0.0003, 0, 0.003, 0.0006, 0.0005, 'i_black', { color: 0x4a4a4a, bevel: false });
      // the rating printed on one cap
      mb.box(0.0225, y + 0.0078, 0, 0.006, 0.0003, 0.002, 'i_black', { bevel: false });
    },
    poi: [{ at: [0, 0.008, 0], label: 'ELEMENT', note: 'Intact. 15 amps, slow blow. It will die for the circuit once.' }],
  },
  keyring: {
    build: (mb) => {
      // the split ring: two turns, one riding over the other where it overlaps
      loop(mb, 0, 0.0016, 0, 0.0185, 0.0013, 18, 'chrome', 0xd8dce0);
      loop(mb, 0, 0.0042, 0, 0.0185, 0.0013, 18, 'chrome', 0xd0d4d8, 0, 0, 0.3);
      const key = (a: number, metal: string, color: number, cut: number[], head?: number) => {
        mb.push().translate(Math.cos(a) * 0.0185, 0.0018, Math.sin(a) * 0.0185).rotateY(-a);
        // bow with its hole, shoulder, then the cut blade and its groove
        mb.cylinder(0.011, 0, 0, 0.0105, 0.0022, 12, metal, { color });
        mb.cylinder(0.006, 0.0022, 0, 0.0028, 0.0003, 8, 'i_black', { color: 0x1a1a1a, bevel: false });
        if (head !== undefined) mb.cylinder(0.012, 0.0022, 0, 0.0085, 0.0014, 12, 'i_rubber', { color: head });
        mb.box(0.024, 0, 0.0005, 0.006, 0.0022, 0.012, metal, { color });
        mb.box(0.041, 0, 0.001, 0.03, 0.0022, 0.0056, metal, { color });
        mb.box(0.041, 0.0022, -0.0002, 0.026, 0.0003, 0.0008, 'i_black', { color: 0x3a3a3a, bevel: false });
        cut.forEach((c, i) => mb.box(0.03 + i * 0.0045, 0, -0.0028 - c * 0.0012, 0.0032, 0.0022, 0.0028 + c * 0.0024, metal, { color, bevel: false }));
        mb.box(0.0565, 0, 0.0005, 0.003, 0.0022, 0.0035, metal, { color });
        mb.pop();
      };
      key(0.4, 'metal_brass', 0xf0d080, [1, 0.3, 0.8, 0.2, 1, 0.5]);
      key(1.5, 'chrome', 0xd8dce0, [0.4, 1, 0.1, 0.7, 0.3, 0.9], 0xc8302a);
      key(2.5, 'chrome', 0xc8ccd0, [0.8, 0.2, 0.6, 1, 0.1, 0.4], 0x2a6ac8);
      // a stamped brass tag on a short chain
      mb.push().translate(Math.cos(4.4) * 0.0185, 0.0018, Math.sin(4.4) * 0.0185).rotateY(-4.4);
      for (let i = 0; i < 3; i++) mb.cylinder(0.004 + i * 0.0035, 0, 0, 0.0018, 0.0012, 6, 'chrome', { color: 0xc8ccd0 });
      mb.box(0.026, 0, 0, 0.026, 0.0016, 0.017, 'metal_brass', { color: 0xe8c24a });
      mb.flat(0.026, 0.0017, 0, 0.026, 0.017, 'i3_keytag', { rot: Math.PI / 2 });
      mb.pop();
    },
    poi: [
      { at: [0.03, 0.004, 0.02], label: 'KEYS', note: 'Three cut keys: one brass, two nickel with rubber heads.' },
      { at: [-0.01, 0.004, -0.04], label: 'TAG', note: 'Stamped brass tag: 14. A room number, or a locker.' },
    ],
  },
  // ------------------------------------------------ snacks
  candy_bar: {
    build: (mb) => {
      const w = 0.125, d = 0.04;
      // the pillowed wrapper over the bar, its back seam, and the crimped, fanned ends
      mb.box(0, 0, 0, w - 0.02, 0.011, d, 'i_foil', { color: 0x5a2c16 });
      mb.box(0, 0.011, 0, w - 0.024, 0.0025, d - 0.006, 'i_foil', { color: 0x6a3418 });
      mb.flat(0, 0.0136, 0, w - 0.026, d - 0.008, D_CANDY);
      mb.box(0, -0.0004, 0, w - 0.02, 0.0012, 0.006, 'i_foil', { color: 0x4a2410, bevel: false });
      for (const s of [-1, 1]) crimp(mb, s * (w / 2 - 0.006), 0.002, d + 0.002, 0.012, 0.0045, 'i_foil', 0x7a4424, 9);
    },
    poi: [{ at: [0, 0.014, 0], label: 'WRAPPER', note: 'Sealed. Nougat, caramel and a promise of peanuts.' }],
  },
  granola_bar: {
    build: (mb) => {
      const w = 0.1, d = 0.035;
      mb.box(0, 0, 0, w - 0.016, 0.0095, d, 'i_foil', { color: 0x3e7a3a });
      mb.box(0, 0.0095, 0, w - 0.02, 0.002, d - 0.005, 'i_foil', { color: 0x4a8a44 });
      mb.flat(0, 0.0116, 0, w - 0.02, d - 0.006, 'i_granola_top');
      // a clear window onto the oats
      mb.box(0.018, 0.0117, 0, 0.022, 0.0004, 0.014, 'i_scraps', { color: 0xe8c890, bevel: false });
      for (const s of [-1, 1]) crimp(mb, s * (w / 2 - 0.005), 0.0015, d + 0.002, 0.01, 0.004, 'i_foil', 0xc8ccd0, 8);
    },
  },
  chips: {
    build: (mb) => {
      const w = 0.17, d = 0.19;
      // a bag full of air: stacked pillows rounding to the seals, the seals ridged, a tear notch
      mb.box(0, 0, 0, w, 0.016, d - 0.03, 'i_foil', { color: 0xc23428 });
      mb.box(0, 0.016, 0, w - 0.012, 0.014, d - 0.05, 'i_foil', { color: 0xd23a2e });
      mb.box(0, 0.03, 0, w - 0.03, 0.008, d - 0.08, 'i_foil', { color: 0xd8402e });
      sheetGrid(mb, w - 0.034, d - 0.084, 4, 4, D_CHIPS, 'i_foil', (u, v) => 0.0381 + 0.004 * Math.sin(u * Math.PI) * Math.sin(v * Math.PI));
      for (const s of [-1, 1]) {
        mb.push().translate(0, 0.006, s * (d / 2 - 0.012)).rotateY(Math.PI / 2);
        crimp(mb, 0, 0, w + 0.002, 0.024, 0.008, 'i_foil', 0xb8302a, 14);
        mb.pop();
      }
      mb.box(w / 2 - 0.012, 0.006, d / 2 - 0.006, 0.006, 0.009, 0.004, 'i_black', { color: 0x5a1410, bevel: false });
    },
    poi: [{ at: [0, 0.04, 0], label: 'BAG', note: 'Mostly air, as always. It crackles when you squeeze it.' }],
  },
  gum: {
    build: (mb) => {
      mb.box(0, 0, 0, 0.075, 0.016, 0.022, 'i_card', { color: 0x5ab88a });
      mb.flat(0, 0.0161, 0, 0.075, 0.022, 'i_gum_top');
      // the end torn open and three sticks slid out at different lengths
      mb.box(0.036, 0.004, 0, 0.003, 0.012, 0.02, 'i_foil', { color: 0xd8dce0, bevel: false });
      [[0.012, 0.0045], [0.022, 0.0085], [0.006, 0.0125]].forEach(([out, y], i) => {
        mb.box(0.03 + out / 2, y, -0.0055 + i * 0.0055, 0.03 + out, 0.0018, 0.0052, 'i_foil', { color: 0xe0e4e8, bevel: false });
        mb.box(0.042 + out, y + 0.0018, -0.0055 + i * 0.0055, 0.012, 0.0003, 0.0053, 'i_white', { color: 0x7ad0a8, bevel: false });
      });
    },
  },
  crackers: {
    build: (mb) => {
      const w = 0.115, h = 0.2, d = 0.075;
      mb.box(0, 0, 0, w, h, d, { all: 'i_card', top: 'i_card' }, { color: 0xc23a2a });
      mb.panel(-w / 2, d / 2 + 0.0015, w / 2, d / 2 + 0.0015, 0, h, 'i_crackers_front', { fit: true });
      // the top tucked open: a flap standing up at the back, the waxed sleeve showing
      mb.box(0, h - 0.004, 0, w - 0.006, 0.006, d - 0.006, 'i_foil', { color: 0xf2eedc });
      mb.push().translate(0, h, -d / 2 + 0.001).rotateX(-0.45); mb.box(0, 0, 0.0, w - 0.002, 0.07, 0.0016, 'i_card', { color: 0xa8301f, bevel: false }); mb.pop();
      mb.push().translate(0, h, d / 2 - 0.001).rotateX(0.9); mb.box(0, 0, 0, w - 0.002, 0.022, 0.0016, 'i_card', { color: 0xb8342a, bevel: false }); mb.pop();
      // a perforated tear strip down the side
      for (let i = 0; i < 12; i++) mb.box(w / 2 + 0.0008, 0.03 + i * 0.012, d / 2 - 0.01, 0.0004, 0.006, 0.002, 'i_black', { color: 0x6a1a12, bevel: false });
    },
  },
  juice_box: {
    build: (mb) => {
      const w = 0.062, h = 0.1, d = 0.04;
      mb.box(0, 0, 0, w, h, d, 'i_card', { color: 0xf0a030 });
      mb.panel(-w / 2, d / 2 + 0.0015, w / 2, d / 2 + 0.0015, 0, h, 'i_juice_front', { fit: true });
      // the folded gable ears glued down the sides, the top seam and the foil straw hole
      for (const s of [-1, 1]) {
        mb.push().translate(s * (w / 2 + 0.001), h - 0.014, 0).rotateZ(s * 0.08);
        mb.box(0, 0, 0, 0.0016, 0.012, d - 0.004, 'i_card', { color: 0xe08a20, bevel: false });
        mb.pop();
      }
      mb.box(0, h, -d / 2 + 0.004, w, 0.004, 0.008, 'i_card', { color: 0xd88a28, bevel: false });
      mb.cylinder(0.016, h, 0.006, 0.004, 0.0006, 10, 'i_foil', { color: 0xe8ecf0 });
      // the bendy straw in its cellophane, stuck to the back
      mb.push().translate(0.012, 0.012, -d / 2 - 0.004).rotateZ(-0.12);
      mb.cylinder(0, 0, 0, 0.0034, 0.085, 8, 'i_plastic', { color: 0xf0f0ea });
      for (let i = 0; i < 4; i++) mb.cylinder(0, 0.062 + i * 0.0024, 0, 0.0039, 0.0012, 8, 'i_plastic', { color: 0xf8b0c8, caps: false });
      mb.pop();
      mb.box(0.012, 0.03, -d / 2 - 0.0005, 0.012, 0.012, 0.001, 'i_plastic', { color: 0xe8e8e0, bevel: false });
    },
  },
  mug: {
    add: (mb) => {
      // a chip out of the rim, a dried drip down the front and a tea ring inside
      mb.box(-0.028, 0.0905, 0.0285, 0.009, 0.005, 0.006, 'i_white', { color: 0xd8d0c0, bevel: false });
      for (let i = 0; i < 3; i++) mb.box(0.012 - i * 0.0015, 0.064 - i * 0.012, 0.0402, 0.003, 0.014, 0.0008, 'i_white', { color: 0xa87a4a, bevel: false });
      mb.cylinder(0, 0.0935, 0, 0.034, 0.0006, 12, 'i_white', { color: 0xb08a5a, caps: false });
      mb.cylinder(0, -0.0006, 0, 0.033, 0.0012, 12, 'i_white', { color: 0x9a948a });
    },
    poi: [{ at: [0, 0.07, 0.04], label: 'MUG', note: 'Institute mug, chipped at the rim, a tea ring that never washes out.' }],
  },
  food_scraps: {
    build: (mb) => {
      // an apple core: the two browned ends, the bitten waist, pips and a stalk
      mb.push().translate(0.012, 0, 0.004).rotateZ(Math.PI / 2 - 0.15);
      mb.sphere(0, 0.0, 0, 0.017, 10, 6, 'i_white', { color: 0xc89a4a, sy: 0.55 });
      mb.cylinder(0, 0.002, 0, 0.0085, 0.032, 8, 'i_white', { color: 0xe8d8a8, rTop: 0.007 });
      mb.sphere(0, 0.036, 0, 0.015, 10, 6, 'i_white', { color: 0xb84a2a, sy: 0.6 });
      mb.box(0, 0.045, 0, 0.002, 0.008, 0.002, 'i_wood', { color: 0x5a3a1a });
      for (const s of [-1, 1]) mb.sphere(s * 0.0055, 0.018, 0.004, 0.0022, 5, 3, 'i_black', { color: 0x3a2214, sy: 1.4 });
      mb.pop();
      // a crust bent into a crescent
      for (let i = 0; i < 6; i++) {
        const a = -0.6 + i * 0.32;
        mb.push().translate(-0.025 + Math.cos(a) * 0.03, 0, 0.0 + Math.sin(a) * 0.03).rotateY(-a);
        mb.box(0, 0, 0, 0.007, 0.009, 0.0165, 'i_white', { color: i % 2 ? 0x9a5a28 : 0xa8642e });
        mb.box(-0.004, 0.0005, 0, 0.002, 0.008, 0.015, 'i_white', { color: 0xe8d4a0, bevel: false });
        mb.pop();
      }
      // a gnawed chicken bone with knuckled ends
      mb.push().translate(-0.006, 0.006, -0.026).rotateY(0.5);
      mb.cylinderX(0, 0, 0, 0.0038, 0.045, 8, 'i_white', { color: 0xe8dcc0 });
      for (const s of [-1, 1]) { mb.sphere(s * 0.024, 0, 0.003, 0.0052, 7, 4, 'i_white', { color: 0xf0e4c8 }); mb.sphere(s * 0.024, 0, -0.003, 0.0048, 7, 4, 'i_white', { color: 0xe8dcc0 }); }
      mb.box(0.006, 0.003, 0, 0.012, 0.002, 0.005, 'i_white', { color: 0xa8603a, bevel: false });
      mb.pop();
      // peas and a curl of wrapper
      for (const [x, z] of [[0.034, -0.012], [0.03, -0.02], [0.038, -0.018]]) mb.sphere(x, 0.0035, z, 0.0035, 6, 4, 'i_white', { color: 0x7aa83a });
      mb.push().translate(0.028, 0.002, 0.026).rotateY(0.8).rotateZ(0.3); mb.box(0, 0, 0, 0.02, 0.006, 0.012, 'i_foil', { color: 0xd8dce0 }); mb.pop();
    },
    poi: [{ at: [0, 0.02, 0], label: 'SCRAPS', note: 'An apple core, a crust, a gnawed bone. Bait, compost, or a very bad day.' }],
  },
  // ------------------------------------------------ writing
  pen: {
    build: (mb) => {
      const y = 0.0055;
      mb.cylinderX(-0.012, y, 0, 0.0052, 0.104, 10, 'i_plastic', { color: 0xf2f2ee });
      // the ink tube seen through the barrel
      mb.box(-0.012, y + 0.0049, 0, 0.09, 0.0006, 0.0018, 'i_black', { color: 0x2a4a9a, bevel: false });
      // grip ridges, the cone and its brass tip, the click button and the clip
      for (let i = 0; i < 6; i++) mb.cylinderX(0.03 + i * 0.0035, y, 0, 0.0058, 0.0016, 10, 'i_rubber', { color: 0x2a4a9a });
      mb.push().translate(0.064, y, 0).rotateZ(-Math.PI / 2); mb.cylinder(0, -0.024, 0, 0.0052, 0.016, 10, 'i_plastic', { color: 0xf2f2ee, rTop: 0.002 }); mb.cylinder(0, -0.008, 0, 0.0018, 0.003, 8, 'i_brass', { color: 0xe0c070, rTop: 0.0007 }); mb.pop();
      mb.cylinderX(-0.066, y, 0, 0.0046, 0.004, 10, 'i_plastic', { color: 0x2a4a9a });
      mb.cylinderX(-0.071, y, 0, 0.0032, 0.007, 10, 'i_plastic', { color: 0x2a4a9a });
      mb.box(-0.05, y + 0.0058, 0, 0.04, 0.0016, 0.0026, 'chrome', { color: 0xd8dce0, bevel: false });
      mb.box(-0.069, y + 0.0045, 0, 0.004, 0.003, 0.0026, 'chrome', { color: 0xc8ccd0, bevel: false });
      mb.cylinderX(-0.031, y + 0.0074, 0, 0.0012, 0.0024, 6, 'chrome', { color: 0xe8ecef });
    },
    poi: [{ at: [0.075, 0.0055, 0], label: 'TIP', note: 'Blue ballpoint, clicks out. Half the ink left.' }],
  },
  pencil: {
    build: (mb) => {
      const y = 0.0045, r = 0.0045;
      mb.push().translate(-0.012, y, 0).rotateZ(-Math.PI / 2).rotateY(Math.PI / 6);
      mb.cylinder(0, -0.054, 0, r, 0.104, 6, { sides: S_PENCIL, top: 'i_wood', bottom: 'i_wood' }, { color: 0xffffff, uvScale: 1, bevel: false });
      mb.cylinder(0, 0.05, 0, r, 0.016, 6, 'i_wood', { color: 0xe8c898, rTop: 0.0016, bevel: false });
      mb.cylinder(0, 0.066, 0, 0.0016, 0.004, 6, 'i_black', { color: 0x3a3a40, rTop: 0.0003, bevel: false });
      mb.pop();
      // the ferrule's crimped rings and a worn eraser
      mb.cylinderX(-0.07, y, 0, r * 1.06, 0.009, 10, 'i_brass', { color: 0xd8c070 });
      for (const dx of [-0.0675, -0.0725]) mb.cylinderX(dx, y, 0, r * 1.12, 0.0012, 10, 'i_brass', { color: 0xb89a4a, caps: false });
      mb.cylinderX(-0.0795, y, 0, r * 0.98, 0.01, 10, 'i_rubber', { color: 0xe890a0 });
      mb.cylinderX(-0.0848, y - 0.0004, 0.0005, r * 0.8, 0.0012, 10, 'i_rubber', { color: 0x9a6a6a });
    },
    poi: [{ at: [0.06, 0.0045, 0], label: 'POINT', note: 'Sharpened with a knife. HB, chewed at the other end.' }],
  },
  chalk: {
    build: (mb) => {
      const w = 0.08, d = 0.06, h = 0.02;
      mb.box(0, 0, 0, w, h, d, 'i_card', { color: 0x8ad0f0 });
      mb.box(0, h - 0.0015, 0, w - 0.004, 0.0012, d - 0.004, 'i_card', { color: 0x3a6a8a, bevel: false });
      // the lid folded back on its hinge, its printed face up
      mb.push().translate(0, h, -d / 2).rotateX(-1.95);
      mb.box(0, 0, -d / 2, w, 0.0016, d, 'i_card', { color: 0x8ad0f0, bevel: false });
      mb.flat(0, -0.0003, -d / 2, w, d, 'i_chalk_box', { rot: Math.PI });
      mb.pop();
      // sticks in their rows, ends showing, one taken out and snapped
      const C = [0xf6f2ea, 0xf6a0c4, 0xf6e07a, 0x9ae08a, 0x8ac8f6, 0xf6f2ea];
      C.forEach((c, i) => mb.cylinder(-0.03 + (i % 6) * 0.012, h - 0.004, -0.012 + (i % 2) * 0.012, 0.0055, 0.006, 8, 'i_white', { color: c }));
      mb.cylinderX(0.012, 0.0055 + h, 0.016, 0.0055, 0.05, 8, 'i_white', { color: 0xf6e07a });
      mb.push().translate(0.05, 0.0055, 0.04).rotateY(0.6); mb.cylinderX(0, 0, 0, 0.0055, 0.024, 8, 'i_white', { color: 0xf6a0c4 }); mb.pop();
      mb.push().translate(0.03, 0.0055, 0.052).rotateY(-0.3); mb.cylinderX(0, 0, 0, 0.0055, 0.016, 8, 'i_white', { color: 0xf6a0c4 }); mb.pop();
      // a smear of dust where it lay
      mb.box(0.042, 0, 0.044, 0.04, 0.0003, 0.018, 'i_white', { color: 0xf0d0dc, bevel: false });
    },
  },
  // ------------------------------------------------ materials
  duct_tape: {
    build: (mb) => {
      const r1 = 0.055, r0 = 0.036, h = 0.048;
      // the roll with its real hole: grey tape wound on a brown card core
      tube(mb, 0, 0, 0, r0 + 0.003, r1, h, 20, 'i_tape_side', 'i_tape_roll_top', 'i_card', { innerColor: 0x8a6a42 });
      tube(mb, 0, 0.0005, 0, r0, r0 + 0.003, h - 0.001, 20, 'i_card', 'i_card', 'i_card', { color: 0xa88458, faceColor: 0xc8a070 });
      // the loose end peeled up and curling off the roll
      mb.push().translate(r1 * Math.cos(0.4), 0, r1 * Math.sin(0.4)).rotateY(-0.4 - Math.PI / 2);
      for (let i = 0; i < 4; i++) { mb.push().translate(0, 0, -0.006 * i).rotateX(-0.08 * i); mb.box(-0.004 * i, 0.001, -0.003, 0.0008, h - 0.002, 0.0075, 'i_tape_side', { color: 0xa8aeb4, bevel: false }); mb.pop(); }
      mb.pop();
    },
    poi: [{ at: [0, 0.048, 0], label: 'ROLL', note: (it) => (it.uses !== undefined ? Math.round(it.uses) + ' strips left.' : 'A good roll.') + ' The end is already lifted.' }],
  },
  rope: {
    build: (mb) => {
      // a figure coil: four loops lying on each other, two whippings round the bundle, a tail with a frayed end
      for (let i = 0; i < 5; i++) loop(mb, [0, 0.016, -0.012, 0.01, -0.006][i], 0.011 + i * 0.0085, [0, -0.01, 0.012, 0.016, -0.014][i], [0.085, 0.08, 0.083, 0.078, 0.081][i], 0.0105, 22, 'i_rope', i % 2 ? 0xe8e0d0 : 0xffffff, [0.04, -0.06, 0.08, -0.03, 0.05][i]);
      for (const a of [0.5, 3.6]) {
        mb.push().translate(Math.cos(a) * 0.083, 0.03, Math.sin(a) * 0.083).rotateY(-a);
        for (let k = 0; k < 4; k++) mb.cylinderZ(0, 0, -0.006 + k * 0.004, 0.026, 0.003, 8, 'i_rope', { color: 0x8a6a3a, caps: false, bevel: false });
        mb.pop();
      }
      mb.push().translate(0.08, 0.0105, 0.03).rotateY(-0.5);
      mb.cylinderX(0.05, 0, 0, 0.0105, 0.1, 6, 'i_rope', { uvScale: 3 });
      for (let k = 0; k < 5; k++) { mb.push().translate(0.101, 0, 0).rotateY((k - 2) * 0.28); mb.box(0.008, (k % 2) * 0.002 - 0.001, 0, 0.016, 0.0018, 0.0018, 'i_rope', { color: 0xd8c08a, bevel: false }); mb.pop(); }
      mb.pop();
    },
    poi: [{ at: [0.15, 0.01, -0.05], label: 'END', note: 'Frayed. Burn it or whip it before it unlays any further.' }],
  },
  rag_dirty: {
    build: (mb) => {
      mb.push().rotateY(0.3);
      sheetGrid(mb, 0.16, 0.13, 7, 6, 'i_rag_dirty', 'i_rag_dirty', (u, v) => 0.002 + 0.02 * Math.max(0, Math.sin(u * 7.3 + v * 2.1)) * (0.3 + v) + 0.006 * Math.max(0, Math.sin(v * 9 - u * 3)) + 0.03 * smooth(0.55, 0, Math.hypot(u - 0.35, v - 0.55)),
        { rep: 0.06, backColor: 0xc8c0a8, edge: (u, v) => (u < 0.01 || u > 0.99 || v < 0.01 || v > 0.99) ? (ph(Math.round(u * 7), Math.round(v * 6), 4) - 0.5) * 0.008 : 0 });
      // a knot of fabric where it was wrung out
      mb.sphere(-0.02, 0.012, -0.004, 0.016, 7, 4, 'i_rag_dirty', { sy: 0.6, color: 0xd8d0b8 });
      mb.pop();
    },
  },
  painkillers: {
    add: (mb) => {
      // the child-proof cap: ridges, the push-and-turn arrows; a cotton plug and two tablets that got out
      for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; mb.box(Math.cos(a) * 0.0247, 0.057, Math.sin(a) * 0.0247, 0.0016, 0.012, 0.0016, 'i_cap', { color: 0xe8e8e2, bevel: false }); }
      mb.box(0, 0.0702, 0.008, 0.012, 0.0004, 0.0016, 'i_black', { color: 0xc8302a, bevel: false });
      mb.box(0.006, 0.0702, 0.006, 0.003, 0.0004, 0.004, 'i_black', { color: 0xc8302a, bevel: false });
      for (const [x, z, c] of [[0.038, 0.012, 0xf6f4ee], [0.032, 0.026, 0xf6f4ee]] as const) {
        mb.cylinder(x, 0, z, 0.0055, 0.003, 10, 'i_white', { color: c });
        mb.box(x, 0.003, z, 0.009, 0.0003, 0.0008, 'i_black', { color: 0xc8c4bc, bevel: false });
      }
    },
  },
  toy_rubber_duck: {
    build: (mb) => {
      const Y = 0xf6d02a, YD = 0xe8b818, OR = 0xf27a1a;
      mb.sphere(0, 0.03, 0, 0.036, 12, 7, 'i_plastic', { color: Y, sy: 0.78 });
      mb.cylinder(0, 0, 0, 0.03, 0.006, 12, 'i_plastic', { color: YD });
      // tail flicked up, wings tucked to the sides
      mb.push().translate(-0.034, 0.044, 0).rotateZ(0.7); mb.sphere(0, 0, 0, 0.012, 8, 5, 'i_plastic', { color: Y, sy: 1.5 }); mb.pop();
      for (const s of [-1, 1]) { mb.push().translate(-0.004, 0.036, s * 0.03).rotateX(s * 0.3); mb.sphere(0, 0, 0, 0.016, 8, 5, 'i_plastic', { color: YD, sy: 0.6 }); mb.pop(); }
      // head, two-part beak, the painted eyes with a glint
      mb.sphere(0.022, 0.07, 0, 0.023, 12, 7, 'i_plastic', { color: Y });
      mb.push().translate(0.043, 0.066, 0).rotateZ(-0.12);
      mb.box(0.006, 0, 0, 0.016, 0.006, 0.02, 'i_plastic', { color: OR }); mb.box(0.004, -0.0045, 0, 0.012, 0.004, 0.015, 'i_plastic', { color: 0xd85a10 });
      mb.pop();
      for (const s of [-1, 1]) {
        mb.sphere(0.036, 0.078, s * 0.0135, 0.0052, 8, 5, 'i_white', { color: 0xf6f6f2 });
        mb.sphere(0.0398, 0.0784, s * 0.0148, 0.003, 6, 4, 'i_black', { color: 0x141418 });
        mb.box(0.0418, 0.0798, s * 0.0148, 0.0008, 0.0012, 0.0012, 'i_white', { color: 0xffffff, bevel: false });
      }
      mb.box(0.03, 0.002, 0, 0.012, 0.0005, 0.006, 'i_black', { color: 0xc89a10, bevel: false });
    },
    poi: [{ at: [0.045, 0.066, 0], label: 'BEAK', note: 'It squeaks. Somewhere in the walls, something squeaks back.' }],
  },
  wallet: {
    build: (mb) => {
      const w = 0.11, d = 0.085;
      // a bifold: the back cover, the card slots peeking at the open edge, the front cover a little sprung
      mb.box(0, 0, 0, w, 0.006, d, 'i_leather', { color: 0x5a3a22 });
      [[0x2a5a9a, 0.0025], [0xc8a040, -0.004], [0xe8e4dc, 0.008]].forEach(([c, dx], i) => mb.box(dx, 0.006 + i * 0.0012, d / 2 - 0.01 - i * 0.004, w - 0.024, 0.0011, 0.03, 'i_white', { color: c, bevel: false }));
      mb.flat(0.003, 0.0098, d / 2 - 0.018, 0.05, 0.026, 'i3_wallet_card');
      mb.push().translate(0, 0.0105, 0).rotateZ(0.02);
      mb.box(0, 0, 0, w, 0.006, d, { all: 'i_leather', top: 'i_wallet_top' }, { fit: { top: true }, color: 0xffffff });
      mb.pop();
      mb.cylinderX(0, 0.008, -d / 2, 0.008, w, 8, 'i_leather', { color: 0x4a2e1a, caps: false });
      // a banknote sticking out of the back, folded once
      mb.push().translate(-w / 2 - 0.008, 0.0068, -0.004).rotateY(0.12); mb.box(0, 0, 0, 0.03, 0.0012, 0.062, 'i_white', { color: 0x9ac08a, bevel: false }); mb.box(0.002, 0.0012, 0.01, 0.01, 0.0002, 0.012, 'i_black', { color: 0x4a6a3a, bevel: false }); mb.pop();
      // stitching round both covers and the snap
      for (const y of [0.0061, 0.0166]) {
        for (let i = 0; i < 14; i++) { const x = -w / 2 + 0.006 + i * ((w - 0.012) / 13); mb.box(x, y, d / 2 - 0.004, 0.004, 0.0004, 0.0008, 'i_white', { color: 0xd8c8a0, bevel: false }); }
      }
      mb.cylinder(w / 2 - 0.01, 0.0165, 0.004, 0.0045, 0.002, 10, 'i_brass', { color: 0xd8b860 });
      mb.cylinder(w / 2 - 0.01, 0.0185, 0.004, 0.002, 0.0008, 8, 'i_brass', { color: 0xf0d890 });
    },
    poi: [
      { at: [0.04, 0.019, 0], label: 'SNAP', note: 'Brass snap, worn bright. The leather is soft as cloth.' },
      { at: [-0.06, 0.008, 0], label: 'NOTE', note: 'A banknote, folded. Not a currency anyone here takes.' },
    ],
  },
  soda_can_empty: {
    build: (mb) => {
      const r = 0.033;
      // crushed in the middle by a heel: the two ends angled, accordion folds between them
      mb.push().translate(0, r * 0.75, 0).rotateZ(Math.PI / 2);
      mb.push().rotateX(0.18).translate(0, 0.012, 0);
      mb.cylinder(0, 0, 0, r, 0.026, 12, { sides: 'i_soda_label', top: 'i_alu_top', bottom: 'i_tin' }, { fit: true, caps: true, color: 0xffffff });
      mb.cylinder(0, 0.026, 0, r * 0.82, 0.004, 12, 'i_tin', { color: 0xc8ccd0, rTop: r * 0.7 });
      mb.pop();
      mb.push().rotateX(-0.22).translate(0, -0.038, 0);
      mb.cylinder(0, 0, 0, r, 0.026, 12, { sides: 'i_soda_label', top: 'i_tin', bottom: 'i_tin_top' }, { fit: true, color: 0xffffff });
      mb.cylinder(0, -0.004, 0, r * 0.88, 0.004, 12, 'i_tin', { color: 0xb8bcc0 });
      mb.pop();
      for (let i = 0; i < 4; i++) mb.cylinder(0, -0.012 + i * 0.006, 0, r * (i % 2 ? 0.82 : 0.95), 0.006, 9, 'i_soda_label', { color: i % 2 ? 0xb83030 : 0xd8d8dc, caps: false });
      mb.pop();
      // the opened tab bent up
      mb.box(0.042, r * 0.75 + 0.008, 0, 0.002, 0.012, 0.008, 'i_metal', { color: 0xd8dce0, bevel: false });
    },
  },
  towel_item: {
    build: (mb) => {
      const w = 0.24, d = 0.18;
      // folded in three: the layers show at the rolled edge, a hanging loop sewn into a corner
      for (let i = 0; i < 3; i++) {
        mb.box(0.002 * (i % 2), 0.015 * i, 0, w - 0.004 * i, 0.014, d - 0.004 * i, 'i_knit', { color: i === 2 ? 0x6ab0d8 : 0x5aa0c8 });
        mb.cylinderZ(-w / 2 + 0.003 * i, 0.007 + 0.015 * i, 0, 0.0075, d - 0.006 * i, 8, 'i_knit', { color: 0x5a98c0, caps: false });
      }
      sheetGrid(mb, w - 0.012, d - 0.012, 4, 4, 'i_towel_top', 'i_knit', (u, v) => 0.0452 + 0.002 * Math.sin(u * 6) * Math.sin(v * 3));
      // the woven band across each end
      for (const s of [-1, 1]) mb.box(0, 0.0455, s * (d / 2 - 0.022), w - 0.014, 0.0015, 0.012, 'i_knit', { color: 0xf0f0ea, bevel: false });
      mb.cylinderX(w / 2 - 0.02, 0.046, -d / 2 + 0.006, 0.0035, 0.018, 6, 'i_cloth', { color: 0xe8e8e0 });
    },
  },
};
