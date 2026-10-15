// The Remittance Programme's wardrobe: the debtor's yellow jumpsuit (prisoner
// number on the chest patch and stencilled across the back), the Meridian
// Custody Officers' grey uniform and riot helmet, and their baton. The
// garments register their own painters with the character texture baker
// (defGarment), so the number on a survivor's back is derived from the same
// rig seed the intro uses for the mugshot monitors (prisonerNumber).
import { defItem, BodyPart } from '../../items/item';
import { defGarment, garmentKit as GK, Paint } from '../../entities/humanClothes';
import type { Surf } from '../../entities/humanPaint';
import { hashStr } from '../../core/rng';
import { tex, rp, stamp, folded, rodX, rodZ, ph, mixHex, MB, T } from './_kit';

const TORSO: BodyPart[] = ['torso_u', 'torso_l'];
const ARMS: BodyPart[] = ['uarm_l', 'uarm_r', 'farm_l', 'farm_r'];
const LEGS: BodyPart[] = ['groin', 'thigh_l', 'thigh_r', 'shin_l', 'shin_r'];

/** the debtor number a survivor carries, from their rig seed (HumanRig.seed): "D-4471" */
export function prisonerNumber(rigSeed: number): string {
  const n = 1000 + (Math.abs(Math.imul(rigSeed | 0, 2654435761) >>> 0) % 9000);
  return 'D-' + n;
}
/** the number for a live rig (falls back to a fixed one) */
export function rigNumber(rig: unknown): string {
  const s = (rig as { seed?: number } | null)?.seed;
  return typeof s === 'number' ? prisonerNumber(s) : 'D-4471';
}
const numberOf = (P: Paint) => prisonerNumber(P.seed - hashStr(P.lp.tex + (P.lp.item || '')));

export const JUMPSUIT_YELLOW = 0xeeb415;
export const GUARD_GREY = 0x62686a;

// ------------------------------------------------------------------ painters
/** sun-faded, scrubbed-thin, stained: the jumpsuit has been through other people first */
function wornOut(S: Surf, P: Paint, top: number, bot: number, seed: number) {
  const y0 = Math.round(S.Y(top)), y1 = Math.round(S.Y(bot));
  for (let y = y0; y <= y1; y++) for (let x = 0; x < S.w; x++) {
    const n = S.fbm(x, y, 3, 2, seed);
    if (n > 0.66) S.pc.blend(x, y, P.R[5], (n - 0.66) * 1.4);           // bleached patches
    else if (n < 0.22) S.pc.blend(x, y, mixHex(P.R[1], 0x5a4a2a, 0.4), (0.22 - n) * 1.6); // old stains
    if (ph(x, y, seed + 7) < 0.012) S.pc.set(x, y, P.R[1]);                 // pills and snags
  }
}
const ZIP = (S: Surf, top: number, bot: number) => {
  const x = Math.round(S.X(0) - 0.5);
  for (let y = Math.round(S.Y(top)); y < S.Y(bot); y++) S.pc.set(x, y, y % 2 ? 0x9a9488 : 0x5a564e);
};

defGarment('c_jumpsuit', {
  torso: (S, P) => {
    GK.topBase(S, P, 'canvas', 'collar');
    ZIP(S, 1.47, 0.86);
    wornOut(S, P, 1.48, P.sh.topHem, 31);
    // number patch on the left breast: white tape, black stencil
    const num = numberOf(P);
    const px = S.X(-30), py = S.Y(1.36);
    GK.rectAt(S, -30, 1.36, 15, 7, 0xe8e4d6);
    GK.rectAt(S, -30, 1.36 + 0.005, 15, 1, 0xb8b2a2);
    GK.text(S, num.slice(2), px, py + 1, 0x1c1a18);
    // a pen-crossed-out previous number under it (somebody wore this before)
    GK.rectAt(S, 30, 1.37, 9, 3, mixHex(P.R[3], 0xe8e4d6, 0.35));
    for (let i = 0; i < 9; i++) S.pc.set(Math.round(S.X(30) - 4 + i), Math.round(S.Y(1.37)) + 1, 0x3a2e28);
    // big stencil across the back
    GK.text(S, num, S.X(180), S.Y(1.38), mixHex(P.R[0], 0x141210, 0.6));
    GK.text(S, 'REMIT', S.X(180), S.Y(1.27), mixHex(P.R[1], 0x141210, 0.4));
    // breast pocket with a torn corner
    GK.pocket(S, P, 32, 1.3, 7, 6);
    S.pc.set(Math.round(S.X(32) + 3), Math.round(S.Y(1.3)), P.R[0]);
  },
  pelvis: (S, P) => {
    // one piece down to the crotch: the zip continues, an elastic waist cinch
    GK.cloth(S, P, 'canvas', 1.0, 0.8);
    ZIP(S, 1.0, 0.88);
    const r = Math.round(S.Y(0.96));
    for (let x = 0; x < S.w; x++) { S.pc.set(x, r, P.R[x % 2 ? 2 : 3]); S.pc.blend(x, r - 1, P.R[6], 0.4); }
    for (const d of [-150, 150]) GK.pocket(S, P, d, 0.93, 6, 5);
    wornOut(S, P, 1.0, 0.8, 33);
  },
  arm: (S, P) => {
    GK.sleeveBase(S, P, 'canvas', P.lp.sleeve || 'long', 'hem');
    wornOut(S, P, 0.07, -0.5, 35);
    // a reflective stripe high on each arm (so the towers can see you at night)
    GK.rectAt(S, 90, -0.05, 9, 2, 0xc8c4b4, 0.85);
  },
  leg: (S, P) => {
    GK.pantsLeg(S, P, 'canvas', {});
    wornOut(S, P, 0.06, -0.83, 37);
    // grimed knees and cuffs
    for (let y = Math.round(S.Y(-0.36)); y < S.Y(-0.48); y++) for (let x = Math.round(S.X(-30)); x < S.X(30); x++) if (ph(x, y, 41) < 0.55) S.pc.blend(x, y, 0x4a3a20, 0.3);
    for (let y = Math.round(S.Y(-0.76)); y < S.Y(-0.83); y++) for (let x = 0; x < S.w; x++) if (ph(x, y, 43) < 0.6) S.pc.blend(x, y, 0x3a3020, 0.35);
  },
  collar: (S, P) => GK.collarPaint(S, P, 'canvas'),
}, {
  top: { sleeve: 'long', thick: 0.008, hem: 0.93, collar: 'shirt', tuck: true },
  leg: { kind: 'pants', thick: 0.01, flare: 0.012 },
});

defGarment('c_guard', {
  torso: (S, P) => {
    GK.topBase(S, P, 'canvas', 'collar');
    // button placket, two flap pockets, chest tab, badge, name tape
    const x = Math.round(S.X(0) - 0.5);
    for (let y = Math.round(S.Y(1.46)); y <= S.Y(P.sh.topHem); y++) { S.pc.blend(x - 1, y, P.R[2], 0.6); S.pc.blend(x + 1, y, P.R[5], 0.4); }
    for (let yy = 1.42; yy > P.sh.topHem; yy -= 0.07) S.pc.set(x, Math.round(S.Y(yy)), 0x2a2c2e);
    GK.pocket(S, P, -34, 1.35, 7, 6, true); GK.pocket(S, P, 34, 1.35, 7, 6, true);
    // badge: a dull steel shield
    const bx = Math.round(S.X(-34)), by = Math.round(S.Y(1.42));
    S.pc.set(bx, by, 0xb8bcc0); S.pc.set(bx - 1, by, 0x9a9ea2); S.pc.set(bx + 1, by, 0x9a9ea2); S.pc.set(bx, by + 1, 0x8a8e92); S.pc.set(bx, by - 1, 0xd8dce0);
    GK.rectAt(S, 34, 1.425, 9, 2, 0x1e2022);
    GK.text(S, 'CUSTODY', S.X(180), S.Y(1.4), 0x1c1e20);
    // epaulettes
    for (const d of [70, -70]) GK.rectAt(S, d, 1.47, 5, 2, P.R[2]);
  },
  pelvis: (S, P) => {
    GK.pantsTorso(S, P, 'canvas', {});
    // duty belt: black web, pouches, a ring for the baton
    const r = Math.round(S.Y(P.sh.waist)) + 1;
    for (let x = 0; x < S.w; x++) { S.pc.set(x, r, 0x1a1a1c); S.pc.set(x, r + 1, 0x242426); S.pc.set(x, r + 2, 0x141416); }
    for (const d of [-60, 60, -120, 120]) GK.rectAt(S, d, P.sh.waist - 0.01, 4, 4, 0x202022);
    GK.rectAt(S, 95, P.sh.waist - 0.012, 3, 3, 0x6a6e72);
  },
  arm: (S, P) => {
    GK.sleeveBase(S, P, 'canvas', P.lp.sleeve || 'long', 'button');
    // shoulder flash: black and amber
    GK.rectAt(S, 90, -0.045, 5, 5, 0x1c1c1e);
    GK.rectAt(S, 90, -0.04, 3, 2, 0xc89030);
  },
  leg: (S, P) => GK.pantsLeg(S, P, 'canvas', { cargo: true }),
  collar: (S, P) => GK.collarPaint(S, P, 'canvas'),
}, {
  top: { sleeve: 'long', thick: 0.008, hem: 0.93, collar: 'shirt', tuck: true },
  leg: { kind: 'pants', thick: 0.011, flare: 0.004 },
});

defGarment('c_riot_helmet', {
  hat: (S, P) => {
    // glossy dark shell with a hard specular stripe, a white unit number, a rim
    S.fill(P.R, (x, y) => GK.BASE + 0.3 + Math.exp(-((S.deg(x) + 35) ** 2) / 500) * Math.exp(-((y - S.h * 0.32) ** 2) / 14) * 2.6 - (y > S.h * 0.7 ? 0.9 : 0));
    for (let x = 0; x < S.w; x++) { S.pc.set(x, Math.round(S.h * 0.7), 0x101012); S.pc.set(x, Math.round(S.h * 0.72), 0x2a2a2e); }
    GK.text(S, '07', S.X(180), S.h * 0.32, 0xd8d8d0);
    GK.rectAt(S, 0, 0, 3, 2, 0xc89030);
  },
});

// ------------------------------------------------------------------ folded / item textures
const F_JUMP = tex('i_fold_jumpsuit', 16, 18, (pc) => {
  const R = rp(JUMPSUIT_YELLOW, 5, 0.45);
  pc.each((x, y) => pc.set(x, y, R[2 + (ph(x >> 1, y >> 1, 61) < 0.18 ? 1 : 0) - (ph(x >> 2, y >> 2, 62) < 0.1 ? 1 : 0)]));
  pc.hline(0, 15, 0, R[4]); pc.hline(0, 15, 17, R[1]); pc.vline(15, 0, 17, R[1]);
  pc.rect(3, 0, 10, 2, R[1]);                              // collar
  pc.vline(8, 2, 17, 0x8a8478); pc.vline(7, 2, 17, R[1]);  // zip
  pc.rect(2, 5, 5, 3, 0xe8e4d6);                           // number tape
  for (const x of [3, 5]) pc.vline(x, 6, 6, 0x1c1a18);
  pc.set(4, 6, 0x1c1a18);
  pc.vline(3, 2, 17, R[1]); pc.vline(12, 2, 17, R[1]);     // sleeves folded in
  for (let x = 1; x < 15; x += 3) if (ph(x, 9, 63) < 0.5) pc.set(x, 12 + (x % 3), R[0]);
});
const F_GUARD = tex('i_fold_guard', 16, 14, (pc) => {
  const R = rp(GUARD_GREY, 5, 0.4);
  pc.each((x, y) => pc.set(x, y, R[2 + (ph(x >> 1, y >> 1, 64) < 0.15 ? 1 : 0)]));
  stamp(pc, 4, 0, ['hhh.....hhh', '.hhh...hhh.'], { h: R[3] });
  pc.vline(8, 2, 13, R[1]); for (let y = 4; y < 13; y += 3) pc.set(8, y, 0x2a2c2e);
  pc.strokeRect(2, 5, 4, 3, R[1]); pc.strokeRect(10, 5, 4, 3, R[1]);
  pc.set(4, 3, 0xb8bcc0); pc.rect(11, 3, 3, 1, 0x1e2022);
  pc.rect(0, 1, 2, 2, 0xc89030);
});
const S_SHELL = tex('i_riot_shell', 12, 8, (pc) => {
  const R = rp(0x2e3236, 5, 0.6);
  pc.each((x, y) => pc.set(x, y, R[2 + (y < 3 ? 1 : 0)]));
  pc.hline(0, 11, 1, R[4]); pc.set(3, 1, 0xf0f0f0); pc.set(4, 1, 0xd8d8d8);
  pc.hline(0, 11, 7, R[0]);
}, true);
const D_VISOR = tex('i_riot_visor', 12, 6, (pc) => {
  pc.fill(0x16181c);
  pc.hline(0, 11, 0, 0x2e3440); pc.hline(1, 6, 1, 0x4a5868); pc.set(2, 2, 0x6a7888);
  pc.hline(0, 11, 5, 0x0a0a0c);
});
const S_BATON = tex('i_baton_rib', 8, 8, (pc) => {
  pc.fill(0x1c1c1e);
  for (let y = 0; y < 8; y += 2) pc.hline(0, 7, y, 0x2c2c30);
  pc.vline(1, 0, 7, 0x3a3a40);
}, true);

// ------------------------------------------------------------------ items
defItem({
  key: 'prison_jumpsuit', name: 'Remittance Jumpsuit', cat: 'clothing', weight: 0.9, tags: ['clothing', 'patchable', 'prison'],
  desc: 'Programme issue, yellow so they can find you. Somebody else\'s number is crossed out under yours. It smells of bleach and of whoever that was.',
  clothing: { slot: 'fullsuit', covers: [...TORSO, ...ARMS, ...LEGS], insulation: 0.25, wind: 0.2, bite: 3, scratch: 10, water: 0.05,
    look: { part: 'torso', tex: 'c_jumpsuit', color: JUMPSUIT_YELLOW, sleeve: 'long' }, rip: 'rag', ripCount: 6 },
  value: 1, grid: [2, 2],
  model: (mb: MB) => folded(mb, 0.27, 0.27, 0.05, F_JUMP, 0xffffff),
});
defItem({
  key: 'guard_uniform', name: 'Custody Officer Uniform', cat: 'clothing', weight: 1.2, tags: ['clothing', 'patchable', 'custody'],
  desc: 'Meridian Custody grey. The name tape has been cut off. The duty belt still smells of gun oil and floor polish.',
  clothing: { slot: 'fullsuit', covers: [...TORSO, ...ARMS, ...LEGS], insulation: 0.32, wind: 0.35, bite: 6, scratch: 18, water: 0.1,
    look: { part: 'torso', tex: 'c_guard', color: GUARD_GREY, sleeve: 'long' }, rip: 'rag', ripCount: 6 },
  value: 18, grid: [2, 2],
  model: (mb: MB) => folded(mb, 0.27, 0.25, 0.055, F_GUARD, 0xffffff),
});
defItem({
  key: 'riot_helmet', name: 'Riot Helmet', cat: 'clothing', weight: 1.4, tags: ['clothing', 'custody'],
  desc: 'A dark visor you can\'t see a face through. The inside of the lining is warm, as if somebody just took it off.',
  clothing: { slot: 'hat', covers: ['head'], insulation: 0.1, wind: 0.2, bite: 45, scratch: 60, water: 0.6,
    look: { part: 'head', tex: 'c_riot_helmet', color: 0x2e3236, hat: 'helmet' } },
  value: 30, grid: [2, 2],
  model: (mb: MB) => {
    mb.sphere(0, 0.13, 0, 0.13, 10, 6, S_SHELL, { sy: 1.0 });
    mb.box(0, 0.02, 0.0, 0.25, 0.04, 0.24, S_SHELL);
    mb.push().translate(0, 0.1, 0.11).rotateX(-0.25);
    mb.box(0, 0, 0, 0.22, 0.11, 0.02, { all: T.plastic, south: D_VISOR }, { color: 0x30343a, fit: { south: true } });
    mb.pop();
    mb.box(0, 0.24, 0, 0.04, 0.02, 0.16, S_SHELL);
  },
});
defItem({
  key: 'custody_baton', name: 'Custody Baton', cat: 'weapon', weight: 0.7, tags: ['baton', 'custody'],
  desc: 'Black polycarbonate, ribbed for grip, a steel cap worn bright. A wrist loop. It has been used a lot, mostly downward.',
  weapon: { kind: 'blunt', dmg: [6, 9], range: 1.2, speed: 1.35, endurance: 0.035, crit: 0.14, knock: 0.55, durability: 220, noise: 6 },
  value: 14, grid: [1, 3],
  model: (mb: MB) => {
    rodX(mb, -0.3, 0.31, 0.018, 0.016, 0.018, 8, 'plastic_black');
    rodX(mb, -0.3, -0.1, 0.018, 0.018, 0.018, 8, S_BATON, { uvScale: 3 });
    rodX(mb, 0.31, 0.335, 0.018, 0.018, 0.012, 8, 'metal_grey');
    rodX(mb, -0.33, -0.3, 0.018, 0.02, 0.02, 8, 'metal_grey');
    mb.push().translate(-0.33, 0.018, 0); rodZ(mb, -0.004, 0.004, 0, 0.03, 0.03, 8, 'rubber_black'); mb.pop();
  },
});
