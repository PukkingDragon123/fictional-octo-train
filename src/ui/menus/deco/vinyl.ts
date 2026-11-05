// "HEADCASES": big-head vinyl figures of the game's own people and things.
// One body plan (hex base, block feet, stub legs, a tapered torso, short
// arms and a huge chamfered head on a neck pivot so it can wobble) dressed
// per character with faceted parts, painted on the vinyl textures. Black
// bead eyes with a white glint, no mouth. Each spec only says what is
// different: colours, the head, hair, hats, props.
import * as THREE from 'three';
import { DecoBuilder, type DMats, at, cbox, prism, lathe, extrude, ngon, printMat, paintPix } from './kit';
import { dome, ball, limb, knob, leafGeo, vinylBase, labelCanvas, Glint, Spring, scaled, type DecoModel, type V3 } from './parts';

/** where the neck pivot sits (u) and the head's box */
const NECK = 0.415;
const HEAD: { w: number; h: number; d: number; c?: number } = { w: 0.46, h: 0.4, d: 0.4 };
const FACE_Z = HEAD.d / 2;

export interface VinylSpec {
  label: string;
  skin: number; top: number; bottom: number; shoes: number;
  sleeves?: number; hands?: number;
  /** body extras (u, origin on the floor) */
  body?(b: DecoBuilder): void;
  /** head extras (u, origin at the neck pivot); headless: replace the default head entirely */
  head?(h: DecoBuilder): void;
  headless?: boolean;
  /** eyes on the face: [x, y] (head space) and size; [] = none */
  eyes?: [number, number, number?][];
  /** brow tilt (radians, + = stern), null = no brows */
  brow?: number | null;
  browCol?: number;
  /** hand positions (u): left, right */
  handL?: V3; handR?: V3;
  /** skip the default arms (the spec draws its own) */
  noArms?: boolean;
  legs?: boolean;
  /** head box override */
  headBox?: { w: number; h: number; d: number; c?: number };
  /** push the eyes out of the face (behind a visor) */
  eyeZ?: number;
  base?: number;
}

const SH_L: V3 = [-0.135, 0.375, 0], SH_R: V3 = [0.135, 0.375, 0];

/** build a figure of total height `size` metres */
export function buildVinyl(spec: VinylSpec, mats: DMats, size: number, seed = 1): DecoModel {
  const b = new DecoBuilder(), h = new DecoBuilder();
  vinylBase(b, 0.23, 0.045, spec.base ?? 0x18171a);
  // a printed series strip on the base's front face
  const strip = printMat('vlabel:' + spec.label, () => labelCanvas(spec.label.toUpperCase(), 0x141316, '#e6d6a8', 64));
  b.print(strip, 0.2, 0.2 * 18 / 64, 0.006, at(0, 0.024, 0.2, -0.0, 0, 0));
  if (spec.legs !== false) {
    for (const s of [-1, 1]) {
      b.add('vinyl', cbox(0.09, 0.05, 0.13, 0.02), spec.shoes, at(s * 0.062, 0.07, 0.016));
      limb(b, 'vinyl', [s * 0.06, 0.09, 0], [s * 0.06, 0.205, 0], 0.046, 0.05, spec.bottom);
    }
    b.add('vinyl', cbox(0.24, 0.07, 0.15, 0.03), spec.bottom, at(0, 0.215, 0));
  }
  b.add('vinyl', cbox(0.25, 0.2, 0.16, 0.035, 0.12), spec.top, at(0, 0.3, 0));
  b.add('vinyl', prism(0.048, 0.04, 6), spec.skin, at(0, 0.405, 0));
  if (!spec.noArms) {
    const hl = spec.handL ?? [-0.172, 0.236, 0.02], hr = spec.handR ?? [0.172, 0.236, 0.02];
    for (const [sh, hd] of [[SH_L, hl], [SH_R, hr]] as [V3, V3][]) {
      const el: V3 = [sh[0] + (hd[0] - sh[0]) * 0.55, sh[1] + (hd[1] - sh[1]) * 0.55, sh[2] + (hd[2] - sh[2]) * 0.55];
      limb(b, 'vinyl', sh, el, 0.04, 0.036, spec.sleeves ?? spec.top);
      limb(b, 'vinyl', el, hd, 0.036, 0.032, spec.sleeves ?? spec.top);
      knob(b, 'vinyl', sh, 0.042, spec.sleeves ?? spec.top);
      knob(b, 'vinyl', hd, 0.036, spec.hands ?? spec.skin);
    }
  }
  spec.body?.(b);
  // ---- the head (its own node: it wobbles)
  const hb = spec.headBox ?? HEAD;
  if (!spec.headless) {
    h.add('vinyl', cbox(hb.w, hb.h, hb.d, hb.c ?? 0.11), spec.skin, at(0, hb.h / 2, 0));
    // a little nose and the ears
    h.add('vinyl', cbox(0.034, 0.03, 0.026, 0.01), spec.skin, at(0, hb.h * 0.36, hb.d / 2 + 0.006));
  }
  for (const [x, y, r = 0.044] of spec.eyes ?? [[-0.095, 0.17], [0.095, 0.17]]) {
    h.add('gloss', dome(r, r * 0.55, 8), 0x0c0b0e, at(x, y, (spec.headBox ?? HEAD).d / 2 - 0.004 + (spec.eyeZ ?? 0), Math.PI / 2, 0, 0, [1, 1, 1.22]));
    h.add('glow', cbox(r * 0.36, r * 0.36, 0.01, 0.002), 0xffffff, at(x - r * 0.32, y + r * 0.42, (spec.headBox ?? HEAD).d / 2 + r * 0.44 + (spec.eyeZ ?? 0)));
  }
  if (spec.brow !== null && !spec.headless) {
    const t = spec.brow ?? 0;
    for (const s of [-1, 1]) h.add('vinyl', cbox(0.07, 0.016, 0.02, 0.006), spec.browCol ?? 0x2a1a12, at(s * 0.095, 0.235, FACE_Z + 0.004, 0, 0, s * t));
  }
  spec.head?.(h);
  // ---- assemble
  const root = new THREE.Group();
  const body = b.build(mats);
  const head = new THREE.Group();
  head.add(h.build(mats));
  head.position.y = NECK;
  body.add(head);
  root.add(body);
  const k = size / 0.86;
  const out = scaled(root, k);
  const glint = new Glint([[-0.12, NECK + hb.h * 0.85, hb.d * 0.3], [0.14, NECK + hb.h * 0.7, hb.d * 0.42], [0.1, 0.33, 0.09], [-0.17, NECK + hb.h * 0.5, hb.d * 0.42]], 0.11, seed);
  root.add(glint.sprite);
  const nod = new Spring(70, 5), tilt = new Spring(55, 4);
  return {
    obj: out,
    update(t, dt) {
      // a slow sway, as if the shelf were breathing, and the wobble from a poke
      const a = nod.step(dt), c = tilt.step(dt);
      head.rotation.x = a + Math.sin(t * 0.9 + seed) * 0.012;
      head.rotation.z = c + Math.sin(t * 0.6 + seed * 2) * 0.016;
      glint.update(dt);
    },
    poke() { nod.kick(2.4 + Math.random()); tilt.kick((Math.random() - 0.5) * 4); },
  };
}

// ------------------------------------------------------------------ helpers for specs
const hairCap = (h: DecoBuilder, col: number, o: { front?: number; back?: number; top?: number } = {}) => {
  h.add('vinyl', cbox(HEAD.w + 0.025, 0.14 + (o.top ?? 0), HEAD.d + 0.025, 0.06), col, at(0, HEAD.h - 0.04 + (o.top ?? 0) / 2, -0.004 - (o.back ?? 0)));
  // the back of the head
  h.add('vinyl', cbox(HEAD.w + 0.02, HEAD.h * 0.62, 0.1, 0.05), col, at(0, HEAD.h * 0.62, -HEAD.d / 2 + 0.035 - (o.back ?? 0)));
  // a jagged fringe
  const f: [number, number][] = [[-0.235, 0], [-0.2, -0.07], [-0.14, -0.03], [-0.09, -0.09 - (o.front ?? 0)], [-0.03, -0.04], [0.03, -0.085 - (o.front ?? 0)], [0.1, -0.035], [0.16, -0.075], [0.235, -0.02], [0.235, 0.05], [-0.235, 0.05]];
  h.add('vinyl', extrude(f, 0.05, 0.008), col, at(0, HEAD.h - 0.05, FACE_Z - 0.01));
};
const patch = (key: string, text: string, bg: number, fg: string) => printMat('patch:' + key, () => labelCanvas(text, bg, fg, 40));
const band = (b: DecoBuilder, hand: V3) => {
  b.add('rubber', prism(0.046, 0.034, 8, { c: 0.008 }), 0x1a1c1e, at(hand[0], hand[1] + 0.035, hand[2]));
  b.add('glow', cbox(0.018, 0.012, 0.01, 0.002), 0xff3a20, at(hand[0], hand[1] + 0.04, hand[2] + 0.045));
};

// ------------------------------------------------------------------ the cast
export const VINYL: Record<string, VinylSpec> = {
  debtor: {
    label: 'The Debtor', skin: 0xd39b6c, top: 0xe2b21e, bottom: 0xd8a818, shoes: 0x24201c, brow: 0.12,
    body(b) {
      b.add('vinyl', cbox(0.15, 0.03, 0.12, 0.01), 0xc49410, at(0, 0.398, 0));
      b.add('vinyl', cbox(0.008, 0.16, 0.012, 0.003), 0x8a6a10, at(0.004, 0.31, 0.08));
      b.print(patch('dnum', 'D-0413', 0x16151a, '#f0f0e8'), 0.08, 0.036, 0.006, at(-0.062, 0.34, 0.077, 0, 0, 0));
      band(b, [-0.172, 0.236, 0.02]);
    },
    head(h) { hairCap(h, 0x3b2a1e); },
  },
  hazmat: {
    label: 'Hazmat Debtor', skin: 0xe8c420, top: 0xe8c420, bottom: 0xe0bc1c, shoes: 0x2a2a2a, hands: 0x2e3a30, brow: null, eyeZ: 0.022,
    body(b) {
      for (const s of [-1, 1]) {
        b.add('cloth', prism(0.05, 0.03, 8), 0x8a8a84, at(s * 0.06, 0.12, 0));
        b.add('cloth', prism(0.042, 0.026, 8), 0x8a8a84, at(s * 0.17, 0.262, 0.02));
      }
      b.add('vinyl', cbox(0.12, 0.08, 0.04, 0.012), 0x2a2a2a, at(0, 0.29, 0.08));
      b.print(patch('hz', 'BIO', 0xe8c420, '#141414'), 0.07, 0.032, 0.005, at(0, 0.36, 0.08));
      band(b, [-0.172, 0.236, 0.02]);
    },
    head(h) {
      // the hood's visor (the face behind the glass) and the respirator
      h.add('gloss', cbox(0.36, 0.24, 0.05, 0.03), 0x3a5a54, at(0, 0.2, FACE_Z - 0.01));
      h.add('glow', cbox(0.2, 0.012, 0.01, 0.002), 0xd8f8f0, at(-0.04, 0.29, FACE_Z + 0.018, 0, 0, 0.12));
      for (const s of [-1, 1]) {
        h.add('rubber', prism(0.046, 0.06, 8, { c: 0.01 }), 0x26282a, at(s * 0.085, 0.045, FACE_Z + 0.02, Math.PI / 2, 0, 0));
        h.add('brass', prism(0.048, 0.012, 8, { c: 0 }), 0xa0a4a0, at(s * 0.085, 0.045, FACE_Z + 0.052, Math.PI / 2, 0, 0));
      }
      h.add('vinyl', cbox(0.2, 0.03, 0.03, 0.01), 0x9a9a94, at(0, HEAD.h - 0.02, 0));
    },
  },
  voss: {
    label: 'Sgt. Voss', skin: 0xb67a4c, top: 0x4b5638, bottom: 0x434d32, shoes: 0x18171a, brow: 0.32, browCol: 0x1a120c,
    headBox: { w: 0.46, h: 0.41, d: 0.4, c: 0.075 },
    handL: [0.07, 0.31, 0.1], handR: [-0.06, 0.335, 0.105],
    body(b) {
      b.add('cloth', cbox(0.27, 0.03, 0.17, 0.01), 0x2a2418, at(0, 0.215, 0));
      b.add('brass', cbox(0.04, 0.026, 0.02, 0.006), 0xc0a050, at(0, 0.215, 0.085));
      b.print(patch('vrank', 'SSGT', 0x2a3020, '#e8d890'), 0.06, 0.03, 0.005, at(-0.17, 0.36, 0.0, 0, -Math.PI / 2, 0));
      b.add('brass', cbox(0.026, 0.036, 0.006, 0.004), 0xd0d0c8, at(0.05, 0.37, 0.081));
    },
    head(h) {
      // stubble round the jaw, the beret pulled over to the right, its badge
      h.add('vinyl', cbox(0.4, 0.1, 0.06, 0.03), 0x7a5232, at(0, 0.07, FACE_Z - 0.02));
      h.add('cloth', cbox(0.5, 0.11, 0.44, 0.05, 0.1, 0.05), 0x5c1c18, at(0.02, HEAD.h + 0.01, -0.01, 0, 0, -0.14));
      h.add('cloth', cbox(0.48, 0.03, 0.42, 0.012), 0x3a120e, at(0, HEAD.h - 0.035, 0, 0, 0, -0.1));
      h.add('brass', extrude(ngon(0.03, 5, 0.25), 0.01, 0.002), 0xd8b450, at(-0.12, HEAD.h + 0.0, FACE_Z + 0.012, 0, 0, -0.1));
      for (const s of [-1, 1]) h.add('vinyl', cbox(0.04, 0.08, 0.06, 0.015), 0xb07448, at(s * 0.235, 0.17, 0));
    },
  },
  guard: {
    label: 'Meridian Guard', skin: 0xe8b98f, top: 0x34406a, bottom: 0x2c3658, shoes: 0x141414, brow: 0.18,
    handR: [0.17, 0.24, 0.05],
    body(b) {
      b.add('brass', extrude([[0, 0.03], [0.022, 0.02], [0.02, -0.012], [0, -0.03], [-0.02, -0.012], [-0.022, 0.02]], 0.01, 0.002), 0xd0b060, at(-0.06, 0.35, 0.081));
      b.add('rubber', cbox(0.27, 0.035, 0.17, 0.01), 0x111214, at(0, 0.215, 0));
      // the baton
      b.add('rubber', prism(0.017, 0.24, 8, { c: 0.004 }), 0x161616, at(0.17, 0.2, 0.08, 0.35, 0, 0));
      b.add('metal', prism(0.02, 0.02, 8), 0x8a8e92, at(0.17, 0.25, 0.064, 0.35, 0, 0));
    },
    head(h) {
      h.add('vinyl', cbox(HEAD.w + 0.05, 0.2, HEAD.d + 0.05, 0.08, 0.12), 0x2a3450, at(0, HEAD.h - 0.06, -0.01));
      h.add('rubber', cbox(HEAD.w + 0.07, 0.03, HEAD.d + 0.07, 0.01), 0x0e1018, at(0, HEAD.h - 0.15, -0.01));
      // the visor, flipped up
      h.add('glass', cbox(0.42, 0.13, 0.02, 0.01), 0x6a8aa0, at(0, HEAD.h + 0.03, FACE_Z + 0.02, -0.5, 0, 0));
      h.add('gloss', cbox(0.05, 0.03, 0.02, 0.008), 0xc0a040, at(0, HEAD.h - 0.03, FACE_Z + 0.03));
    },
  },
  researcher: {
    label: 'Dr. Calder', skin: 0xf0c8a8, top: 0xeceae2, bottom: 0x2a2a36, shoes: 0x3a2018, brow: -0.08, browCol: 0x5a2410,
    handR: [0.1, 0.27, 0.11], handL: [-0.17, 0.24, 0.03],
    body(b) {
      // the coat's skirt, the blouse in the V, lapels, the clipboard and the badge
      b.add('cloth', lathe([[0.14, 0.11], [0.15, 0.13], [0.135, 0.22]], 7, 0.5), 0xe4e2da, at(0, 0, 0, 0, 0, 0, [1, 1, 0.78]));
      b.add('cloth', extrude([[-0.045, 0.06], [0.045, 0.06], [0, -0.03]], 0.01, 0), 0x2a8a8a, at(0, 0.35, 0.078));
      for (const s of [-1, 1]) b.add('cloth', extrude([[0, 0.05], [s * 0.05, 0.05], [s * 0.015, -0.05]], 0.012, 0.002), 0xd8d6ce, at(s * 0.03, 0.34, 0.082));
      b.add('wood', cbox(0.11, 0.15, 0.014, 0.004), 0x8a5a30, at(0.08, 0.3, 0.135, 0.15, -0.25, 0));
      b.print(printMat('clip-paper', () => paintPix(12, 16, (pc) => { pc.fill(0xf0ecdc); for (let y = 3; y < 15; y += 2) pc.hline(1, 6 + ((y * 7) % 5), y, 0x5a6070); pc.rect(4, 0, 4, 2, 0xa0a4a8); })), 0.09, 0.12, 0.004, at(0.08, 0.3, 0.143, 0.15, -0.25, 0));
      b.print(patch('rid', 'STAFF', 0xe8ecf0, '#1a3a6a'), 0.05, 0.03, 0.004, at(-0.07, 0.34, 0.083));
    },
    head(h) {
      hairCap(h, 0x8a3a1c, { front: 0.02 });
      // the bun, a loose lock by the cheek, glasses, lashes, a hint of lip colour
      h.add('vinyl', ball(0.09, 7), 0x8a3a1c, at(0, HEAD.h * 0.72, -HEAD.d / 2 - 0.04));
      h.add('vinyl', cbox(0.04, 0.2, 0.05, 0.015), 0x8a3a1c, at(-0.23, 0.18, 0.1, 0, 0, 0.08));
      for (const s of [-1, 1]) {
        h.add('rubber', extrude(ngon(0.066, 6, 0.5, 1.15, 0.92), 0.012, 0, [ngon(0.054, 6, 0.5, 1.15, 0.92).reverse()]), 0x1a1418, at(s * 0.095, 0.17, FACE_Z + 0.03));
        h.add('rubber', cbox(0.03, 0.01, 0.012, 0.003), 0x0c0b0e, at(s * 0.13, 0.205, FACE_Z + 0.02, 0, 0, s * -0.4));
      }
      h.add('rubber', cbox(0.05, 0.01, 0.01, 0.003), 0x1a1418, at(0, 0.18, FACE_Z + 0.03));
      h.add('vinyl', cbox(0.03, 0.01, 0.01, 0.003), 0xc06a6a, at(0, 0.075, FACE_Z + 0.002));
    },
  },
  cowerling: {
    label: 'Cowerling', skin: 0xc8a8a0, top: 0xc0a098, bottom: 0xbc9c94, shoes: 0xb08a82, brow: null,
    headBox: { w: 0.44, h: 0.36, d: 0.38, c: 0.13 },
    eyes: [[-0.1, 0.17, 0.05], [0.1, 0.17, 0.05], [0, 0.26, 0.032], [-0.15, 0.27, 0.024], [0.15, 0.27, 0.024], [0, 0.1, 0.022]],
    handL: [-0.07, 0.29, 0.12], handR: [0.07, 0.29, 0.12],
    body(b) {
      // the bundle it hugs: knotted cloth
      b.add('cloth', ball(0.09, 7), 0x8a7a5a, at(0, 0.3, 0.12, 0, 0.4, 0, [1.1, 0.85, 0.8]));
      b.add('cloth', cbox(0.06, 0.05, 0.04, 0.015), 0x7a6a4a, at(0.02, 0.37, 0.15, 0, 0, 0.5));
    },
    head(h) {
      // the huge membrane ears folded down over the sides
      for (const s of [-1, 1]) {
        h.add('vinyl', leafGeo(0.36, 0.2, 0.02, 6), 0xd88a86, at(s * 0.22, 0.3, -0.02, 0.1, s * 0.3, s * 2.55));
        h.add('vinyl', leafGeo(0.28, 0.12, 0.022, 6), 0xb06460, at(s * 0.215, 0.29, 0.0, 0.1, s * 0.3, s * 2.55));
      }
    },
  },
  hush: {
    label: 'Hush', skin: 0xd8d0c4, top: 0xd0c8bc, bottom: 0xc8c0b4, shoes: 0xbab0a4, brow: null, headless: true, eyes: [],
    handR: [0.06, 0.47, 0.13],
    body(b) {
      // the long finger raised to where a mouth would be
      limb(b, 'vinyl', [0.06, 0.47, 0.13], [0.04, 0.6, 0.16], 0.014, 0.01, 0xd8d0c4);
      b.add('cloth', cbox(0.27, 0.08, 0.17, 0.02), 0x6a6460, at(0, 0.235, 0));
    },
    head(h) {
      // the gramophone horn: brass outside, wet pink folds inside
      const prof: [number, number][] = [[0.05, 0], [0.055, 0.08], [0.07, 0.16], [0.1, 0.24], [0.15, 0.3], [0.23, 0.35], [0.25, 0.36]];
      const inner: [number, number][] = [[0.22, 0.352], [0.19, 0.33], [0.14, 0.3], [0.1, 0.26], [0.07, 0.2], [0.045, 0.12], [0.035, 0.03]];
      const m = at(0, 0.06, 0.02, -1.1, 0, 0);
      h.add('brass', lathe(prof, 10, 0.5), 0xc49a3a, m);
      h.add('vinyl', lathe(inner, 10, 0.5), 0xc06a70, m);
      h.add('brass', prism(0.06, 0.08, 8), 0x9a7a2a, at(0, 0.02, 0));
      h.add('gloss', lathe([[0.25, 0.36], [0.262, 0.364], [0.25, 0.37]], 10, 0.5), 0xe0c060, m);
    },
  },
  tallyman: {
    label: 'Tallyman', skin: 0xb8b0a4, top: 0x4a4a56, bottom: 0x42424e, shoes: 0x121214, hands: 0xd0c8bc, brow: null, headless: true, eyes: [],
    body(b) {
      // the abacus where the ribs should be: three wires, thirteen beads
      for (let w = 0; w < 3; w++) {
        const y = 0.27 + w * 0.045;
        limb(b, 'metal', [-0.1, y, 0.085], [0.1, y, 0.085], 0.004, 0.004, 0xb0b4b8, 4);
        const n = [5, 4, 4][w];
        for (let i = 0; i < n; i++) b.add('gloss', lathe([[0, -0.012], [0.018, -0.006], [0.018, 0.006], [0, 0.012]], 6, 0.5), i % 2 ? 0xe0d8c0 : 0x9a2a20, at(-0.075 + i * 0.035 + (w % 2) * 0.015, y, 0.085, 0, 0, Math.PI / 2));
      }
      b.add('cloth', cbox(0.03, 0.2, 0.01, 0.004), 0x8a1a18, at(0.0, 0.3, 0.079));
    },
    head(h) {
      // a ledger stood on end: leather boards, the page block, the spine, one slit of an eye
      h.add('vinyl', cbox(0.32, 0.46, 0.14, 0.02), 0x7a4228, at(0, 0.24, 0));
      h.add('card', cbox(0.3, 0.43, 0.11, 0.01), 0xe8dcb8, at(0.015, 0.24, 0), { rep: 0.02, grain: 'x' });
      h.add('vinyl', cbox(0.05, 0.47, 0.15, 0.02), 0x5a2e1a, at(-0.16, 0.24, 0));
      for (const y of [0.1, 0.38]) h.add('brass', cbox(0.052, 0.02, 0.152, 0.005), 0xc0a050, at(-0.16, y, 0));
      h.add('glow', cbox(0.15, 0.016, 0.012, 0.004), 0xff4020, at(0.02, 0.3, 0.078));
      h.add('vinyl', cbox(0.19, 0.04, 0.02, 0.01), 0x2a160e, at(0.02, 0.3, 0.072));
    },
  },
  mirrorling: {
    label: 'Mirrorling', skin: 0xc6ccd2, top: 0xb8c0c8, bottom: 0xb0b8c0, shoes: 0x9aa2aa, brow: null, headless: true, eyes: [],
    handL: [-0.16, 0.25, 0.06], handR: [0.18, 0.3, 0.07],
    head(h) {
      // an oval hand-mirror: brass frame, the glass (it shows something standing behind you), the handle as a neck
      const ring = ngon(0.22, 14, 0.5, 0.82, 1), hole = ngon(0.18, 14, 0.5, 0.8, 1).reverse();
      h.add('brass', extrude(ring, 0.05, 0.012, [hole]), 0xc8a040, at(0, 0.27, 0));
      h.add('brass', prism(0.035, 0.1, 8, { rTop: 0.028 }), 0xb8902e, at(0, 0.03, 0));
      h.add('brass', ball(0.04, 8), 0xd8b050, at(0, 0.07, 0));
      h.add('metal', extrude(ngon(0.185, 14, 0.5, 0.8, 1), 0.02, 0), 0x8a96a0, at(0, 0.27, -0.006));
      const glass = printMat('mirror', () => paintPix(24, 30, (pc) => {
        for (let y = 0; y < 30; y++) for (let x = 0; x < 24; x++) pc.set(x, y, [0x3a4a58, 0x4a5c6a, 0x5a6e7c, 0x6e8494][Math.min(3, Math.floor((x + y) / 14 + ((x * 3 + y) % 4 === 0 ? 0.6 : 0)))]);
        for (let i = 0; i < 9; i++) { pc.set(4 + i, 3 + i, 0xe8f4f8); pc.set(5 + i, 3 + i, 0xb0c8d4); }
        for (let i = 0; i < 4; i++) pc.set(15 + i, 20 + i, 0xd0e4ec);
        // the dim figure behind you
        pc.ellipse(12, 13, 2.5, 3, 0x2a3440); pc.rect(9, 16, 7, 10, 0x2a3440); pc.set(11, 13, 0x9aa8b0); pc.set(13, 13, 0x9aa8b0);
      }, 'mir'), { rough: 0.15 });
      h.add('glass', extrude(ngon(0.18, 14, 0.5, 0.8, 1), 0.004, 0), 0xffffff, at(0, 0.27, 0.02));
      h.print(glass, 0.27, 0.34, 0.002, at(0, 0.27, 0.012));
    },
  },
  plushkin: {
    label: 'Plushkin', skin: 0x7a5638, top: 0x7a5638, bottom: 0x74522f, shoes: 0x6a4a2c, hands: 0x8a6440, brow: null,
    headBox: { w: 0.44, h: 0.38, d: 0.38, c: 0.13 },
    eyes: [[-0.095, 0.19, 0.04]],
    body(b) {
      // a faded ribbon bow, the seam down the tummy, a patch
      b.add('cloth', extrude([[0, 0], [-0.07, 0.035], [-0.075, -0.035]], 0.03, 0.005), 0xd89aa0, at(-0.005, 0.395, 0.08));
      b.add('cloth', extrude([[0, 0], [0.07, 0.035], [0.075, -0.035]], 0.03, 0.005), 0xd89aa0, at(0.005, 0.395, 0.08));
      b.add('cloth', cbox(0.03, 0.03, 0.03, 0.01), 0xc07a84, at(0, 0.395, 0.09));
      for (let y = 0.23; y < 0.37; y += 0.02) b.add('cloth', cbox(0.02, 0.006, 0.008, 0.002), 0x3a2414, at(0, y, 0.081));
      b.add('cloth', cbox(0.06, 0.05, 0.01, 0.004), 0x8a7a5a, at(0.07, 0.27, 0.08, 0, 0, 0.2));
    },
    head(h) {
      // round ears, the light muzzle, one eye is a blue shirt button sewn on, the stitched seam
      for (const s of [-1, 1]) {
        h.add('cloth', ball(0.075, 7), 0x7a5638, at(s * 0.18, 0.36, -0.02, 0, 0, 0, [1, 1, 0.6]));
        h.add('cloth', ball(0.045, 7), 0xc8a07a, at(s * 0.18, 0.36, 0.02, 0, 0, 0, [1, 1, 0.4]));
      }
      h.add('cloth', cbox(0.16, 0.11, 0.08, 0.035), 0xc8a07a, at(0, 0.1, 0.18));
      h.add('gloss', cbox(0.04, 0.03, 0.02, 0.01), 0x1a1210, at(0, 0.13, 0.225));
      h.add('gloss', prism(0.036, 0.016, 8, { c: 0.004 }), 0x3a6a9a, at(0.095, 0.19, 0.195, Math.PI / 2, 0, 0));
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) h.add('rubber', cbox(0.008, 0.008, 0.01, 0.002), 0x12202a, at(0.095 + dx * 0.012, 0.19 + dy * 0.012, 0.205));
      for (let y = 0.24; y < 0.36; y += 0.025) h.add('cloth', cbox(0.016, 0.006, 0.01, 0.002), 0x3a2414, at(0, y, 0.19 - (y - 0.24) * 0.3));
    },
  },
};
