import * as THREE from 'three';
import { def, Rig } from '../species';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, ph, mixHex, PixelCanvas } from '../../gfx/pixel';
import { tileFbm } from '../../core/rng';
import { G } from '../../game/G';
import { objDef } from '../../world/objects';
import { rollLoot } from '../../items/loot';
import { defLore } from '../../content/loreRegistry';
import { ModelBuilder } from '../../gfx/modelBuilder';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import type { Zone } from '../../world/zone';
import { net, netOf, snd, playersIn, dist, hold, hashId, fakeCreature, rng, fx, fxPoll, playAt, walkable, dropGift, localIn, thinkOnce, angleDiff, lineOfSightB, lightAt, reachTiles } from '../behaviors_b';
import '../../audio/sounds_creatures_b';
import { SkinKit, KRig, tube, blob, damp, wrapPi, toLocal, V3 } from '../kit/anomalies';
import { creatureMaterial } from '../species';
import '../kit/anomalyTextures';

// Plushkin: stuffed toys that only move when nobody is looking: a tiny,
// friendly weeping angel. A plushkin picks a survivor and follows at a
// distance, turning up in odd places (on a table, facing a corner, right
// behind you) in odd poses. Now and then it leaves a gift. Sweets make it
// yours: then it stays close and "finds" useful things. Hit it and it bursts
// into a pile of stuffing.
//
// Two of them: a worn brown bear with a faded ribbon and a pink bunny with a
// patched ear. Stitched panels, pilled fur, one shiny button eye and one eye
// sewn shut with a cross — something wet looks out between the stitches —
// and a stitched smile with a few small teeth where the thread has pulled.
// Every time you look away its head has turned a little further toward you.

// ---------------------------------------------------------------- pages (fur at ~128 px/m: the toy is tiny)
const FUR_M = 0.25;
function fur(pc: PixelCanvas, base: number, seed: number) {
  const R = makeRamp(base, 7, { hueShift: 0.04, spread: 0.45 });
  pc.fillRamp(R, (x, y) => 0.5 + (tileFbm(x, y, pc.w, pc.h, 4, 2, seed) - 0.5) * 0.35 + (ph(x >> 1, y, seed + 1) - 0.5) * 0.12, 0.45);
  // short strokes of pile, all brushed one way
  for (let i = 0; i < pc.w * pc.h / 10; i++) {
    const x = Math.floor(ph(i, 1, seed) * pc.w), y = Math.floor(ph(i, 2, seed) * pc.h);
    const c = ph(i, 3, seed) < 0.5 ? R[5] : R[2];
    pc.blend(x, y, c, 0.55); pc.blend(x, y + 1, c, 0.35);
  }
  // pilling: little balls of fluff, and worn bald patches showing the backing weave
  for (let i = 0; i < 9; i++) { const x = ph(i, 4, seed) * pc.w, y = ph(i, 5, seed) * pc.h; pc.set(x, y, R[6]); pc.set(x + 1, y, R[4]); }
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) { const v = tileFbm(x, y, pc.w, pc.h, 3, 2, seed + 9); if (v > 0.72) pc.set(x, y, (x % 3 === 0 || y % 3 === 0) ? mixHex(R[3], 0xd8ccb0, 0.25) : mixHex(R[3], R[4], 0.5)); }
  return R;
}
/** a stitched seam: dashed thread over a slight crease */
function seam(pc: PixelCanvas, pts: [number, number][], crease: number, thread: number) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)));
    for (let k = 0; k <= n; k++) {
      const x = Math.round(x0 + (x1 - x0) * k / n), y = Math.round(y0 + (y1 - y0) * k / n);
      pc.set(x, y, crease);
      if ((x + y) % 3 === 0) pc.set(x + (Math.abs(x1 - x0) > Math.abs(y1 - y0) ? 0 : 1), y + (Math.abs(x1 - x0) > Math.abs(y1 - y0) ? 1 : 0), thread);
    }
  }
}
const KIND_COL = { bear: 0x8a6646, bunny: 0xc8a0a2 } as const;
const KIND_LIGHT = { bear: 0xd8c0a0, bunny: 0xf2e2de } as const;

addTextureModule(() => {
  const A = atlas();
  for (const k of ['bear', 'bunny'] as const) {
    const base = KIND_COL[k], light = KIND_LIGHT[k];
    A.add('c_pk_fur_' + k, 32, 32, (pc) => { fur(pc, base, k === 'bear' ? 601 : 611); }, FUR_M, FUR_M);
    A.add('c_pk_light_' + k, 16, 16, (pc) => { fur(pc, light, k === 'bear' ? 621 : 631); }, FUR_M / 2, FUR_M / 2);
    // body, wrapped once around (u: 0 back, 0.5 front; v: top → bottom): seams, belly patch, a split with stuffing
    A.add('c_pk_body_' + k, 64, 32, (pc) => {
      pc.wrap = false;
      const R = fur(pc, base, k === 'bear' ? 641 : 651);
      const L = makeRamp(light, 5, { spread: 0.3 });
      for (let y = 0; y < 32; y++) for (let x = 20; x < 44; x++) {
        const e = Math.hypot((x - 31.5) / 10.5, (y - 19) / 10);
        if (e < 1) pc.set(x, y, L[Math.min(4, Math.max(0, Math.round(2.5 - e * 1.5 + (ph(x, y, 7) - 0.5) * 1.2)))]);
        else if (e < 1.12 && (x + y) % 2 === 0) pc.set(x, y, 0x3a2a20); // stitched border of the patch
      }
      seam(pc, [[31, 0], [31, 8]], R[1], 0xd8d0c0);
      seam(pc, [[0, 0], [0, 31]], R[1], 0xd8d0c0); seam(pc, [[63, 0], [63, 31]], R[1], 0xd8d0c0);
      seam(pc, [[16, 0], [14, 31]], R[1], R[0]); seam(pc, [[48, 0], [50, 31]], R[1], R[0]);
      // a split seam on the right flank with stuffing pushing out, and an old stain
      for (let y = 14; y < 22; y++) { pc.set(52, y, 0x1a120c); pc.set(53, y, y % 2 ? 0xf0ece0 : 0xd8d4c8); pc.set(54, y, 0x2a1a10); }
      pc.stain(38, 26, 4, mixHex(base, 0x3a2a1a, 0.5), mixHex(base, 0x2a1a10, 0.6), 3);
    });
    // head, wrapped (front at u 0.5): a seam over the crown, fur
    A.add('c_pk_head_' + k, 64, 32, (pc) => {
      pc.wrap = false;
      const R = fur(pc, base, k === 'bear' ? 661 : 671);
      seam(pc, [[31, 0], [31, 9]], R[1], 0xd8d0c0); seam(pc, [[0, 0], [0, 20]], R[1], 0xd8d0c0);
      seam(pc, [[18, 2], [20, 30]], R[1], R[0]); seam(pc, [[45, 2], [43, 30]], R[1], R[0]);
    });
    // muzzle front (fit): felt, a stitched nose line and a stitched smile pulled into gaps with tiny teeth
    A.add('c_pk_muzzle_' + k, 32, 24, (pc) => {
      pc.wrap = false;
      const L = makeRamp(light, 5, { spread: 0.3 });
      pc.fillRamp(L, (x, y) => 0.6 + (ph(x >> 1, y >> 1, 8) - 0.5) * 0.2 - Math.hypot(x - 15.5, y - 11.5) * 0.012, 0.6);
      const th = 0x2a1a16;
      pc.vline(15, 8, 13, th); pc.vline(16, 8, 13, th);
      const mouth: [number, number][] = [[7, 12], [9, 15], [12, 17], [15, 17], [17, 17], [20, 17], [23, 15], [25, 12]];
      for (let i = 0; i + 1 < mouth.length; i++) pc.line(mouth[i][0], mouth[i][1], mouth[i + 1][0], mouth[i + 1][1], th);
      // the thread has pulled: little gaps with small, real teeth in them
      for (const x of [11, 19]) { pc.rect(x, 17, 3, 3, 0x3a0a0e); pc.set(x, 17, 0xf0e8d4); pc.set(x + 1, 17, 0xe8dcc4); pc.set(x + 2, 17, 0xf0e8d4); pc.set(x + 1, 19, 0x5a1a1a); }
      for (let x = 8; x < 25; x += 3) pc.set(x, 18 + (x % 2), 0x8a7a6a); // stitch holes
    });
    // inner ear / paw pads: felt
    A.add('c_pk_pad_' + k, 16, 16, (pc) => {
      const P = makeRamp(k === 'bear' ? 0xd8b48c : 0xf0a8b4, 5, { spread: 0.3 });
      pc.fillRamp(P, (x, y) => 0.55 + (ph(x >> 1, y >> 1, 9) - 0.5) * 0.25, 0.6);
      for (let i = 0; i < 16; i += 2) { pc.set(i, 0, 0x5a4a3a); pc.set(0, i, 0x5a4a3a); } // stitched edge
    }, 0.08, 0.08);
  }
  A.add('c_pk_button', 16, 16, (pc) => {
    pc.wrap = false;
    pc.fill(0x0c0c10);
    pc.circle(7.5, 7.5, 7.5, 0x1a1a22); pc.circle(7.5, 7.5, 5.5, 0x101016);
    for (const [x, y] of [[5, 5], [10, 5], [5, 10], [10, 10]]) { pc.rect(x - 1, y - 1, 2, 2, 0x000000); }
    pc.line(5, 5, 10, 10, 0xd8d0c0); pc.line(10, 5, 5, 10, 0xd8d0c0); // thread through the holes
    pc.rect(3, 2, 3, 2, 0xf0f4ff); pc.set(4, 4, 0xa8b8d8); // the wet-looking shine
  });
  // the eye sewn shut: a cross of thread over a slit, something glistening between the stitches
  A.add('c_pk_xeye', 16, 16, (pc) => {
    pc.wrap = false;
    pc.fill(0x5a4030);
    pc.ellipse(7.5, 7.5, 5, 2, 0x1a0c0a); pc.ellipse(7.5, 7.5, 3.5, 1.2, 0xd8d0c0); pc.circle(8, 7.5, 1.1, 0x0a0806); pc.set(7, 7, 0xffffff);
    pc.line(2, 2, 13, 13, 0x1a1210); pc.line(13, 2, 2, 13, 0x1a1210); pc.line(3, 2, 13, 12, 0x2a2018); pc.line(12, 2, 2, 12, 0x2a2018);
  });
  A.add('c_pk_nose', 8, 8, (pc) => { pc.fill(0x2a1c18); pc.hline(1, 6, 0, 0x5a4038); pc.set(2, 1, 0x8a6a60); });
  A.add('c_pk_nose_pink', 8, 8, (pc) => { pc.fill(0xd87888); pc.hline(1, 6, 0, 0xf0a8b8); pc.set(5, 5, 0xa85060); });
  A.add('c_pk_ribbon', 16, 8, (pc) => {
    const R = makeRamp(0xa8343a, 5, { spread: 0.4 });
    pc.fillRamp(R, (x, y) => 0.5 + (y < 2 ? 0.3 : y > 5 ? -0.2 : 0) + (ph(x, y, 5) - 0.5) * 0.15 - (x % 7 === 0 ? 0.2 : 0), 0.4);
  }, 0.08, 0.04);
  A.add('c_pk_patch', 16, 16, (pc) => { // a square of gingham sewn over the bunny's torn ear
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) pc.set(x, y, ((x >> 2) + (y >> 2)) % 2 ? 0x8aa0c8 : ((x >> 2) % 2 ? 0xc8d4ea : 0x5a70a0));
    for (let i = 0; i < 16; i += 2) { pc.set(i, 0, 0x2a2018); pc.set(0, i, 0x2a2018); pc.set(i, 15, 0x2a2018); pc.set(15, i, 0x2a2018); }
  }, 0.06, 0.06);
});

// crayon notes a plushkin sometimes leaves
const NOTES = ['plush_note_1', 'plush_note_2', 'plush_note_3', 'plush_note_4'];
defLore({ id: 'plush_note_1', title: 'Crayon note', text: 'YOU LOOK SAD\n\nhere is a canDy\n\ndont tell', codex: ['plushkin'] });
defLore({ id: 'plush_note_2', title: 'Crayon note', text: 'I SAW YOU sleep. you are safe when\nwe are watching.\n\n(we only move when you dont)', codex: ['plushkin'] });
defLore({ id: 'plush_note_3', title: 'Crayon note', text: 'mia left us here a long long time.\nare YOU mia?\n\nno.\n\nbut you can be ours', codex: ['plushkin'] });
defLore({ id: 'plush_note_4', title: 'Crayon note', text: 'DONT GO IN THE BIG HALLS WHEN THE FLOOR HUMS\n\nthe lamp knows. follow the lamp.', codex: ['plushkin', 'occupant', 'lamplighter'] });

const KINDS = ['bear', 'bunny'] as const;
type Kind = typeof KINDS[number];

function buildKind(K: SkinKit, k: Kind) {
  const bear = k === 'bear';
  const F = 'c_pk_fur_' + k, LT = 'c_pk_light_' + k, PAD = 'c_pk_pad_' + k;
  K.bone(k, null, [0, 0, 0]);
  K.bone(k + 'torso', k, [0, 0.06, 0]);
  K.bone(k + 'head', k + 'torso', [0, 0.2, 0]);
  K.bone(k + 'earL', k + 'head', bear ? [0.075, 0.165, -0.005] : [0.04, 0.17, -0.01]);
  K.bone(k + 'earR', k + 'head', bear ? [-0.075, 0.165, -0.005] : [-0.04, 0.17, -0.01]);
  for (const [s, side] of [[1, 'L'], [-1, 'R']] as const) {
    K.bone(k + 'arm' + side, k + 'torso', [0.085 * s, 0.155, 0.005]);
    K.bone(k + 'leg' + side, k + 'torso', [0.055 * s, -0.005, 0.03]);
  }
  const m = k;
  // ---- body: a pear of stuffed fabric, wrapped once with the body page
  K.local(k + 'torso', (mb) => {
    blob(mb, [0, 0.085, 0], [0.098, 0.115, 0.085], 10, 6, 'c_pk_body_' + k, { fit: true, seam: Math.PI, disp: (d) => 1 + (d[1] < -0.2 ? 0.08 : 0) - (d[1] > 0.7 ? 0.1 : 0) });
    // tail
    blob(mb, [0, 0.03, -0.085], bear ? [0.025, 0.022, 0.02] : [0.04, 0.038, 0.034], 6, 3, bear ? F : 'c_an_stuffing', {});
    // stuffing pushing out of the split flank seam
    blob(mb, [-0.075, 0.09, -0.04], [0.018, 0.026, 0.016], 5, 3, 'c_an_stuffing', { disp: (d) => 1 + Math.sin(d[1] * 9) * 0.15 });
    if (bear) {
      // a faded ribbon bow
      tube(mb, Array.from({ length: 13 }, (_, q) => { const a = (q / 12) * Math.PI * 2; return [Math.sin(a) * 0.072, 0.185, Math.cos(a) * 0.062] as V3; }), 0.009, 4, 'c_pk_ribbon', { squash: [1.6, 0.6] });
      blob(mb, [0.025, 0.185, 0.065], [0.026, 0.018, 0.01], 5, 3, 'c_pk_ribbon', {});
      blob(mb, [-0.025, 0.185, 0.065], [0.026, 0.018, 0.01], 5, 3, 'c_pk_ribbon', {});
      tube(mb, [[0.01, 0.18, 0.066], [0.02, 0.15, 0.07], [0.028, 0.125, 0.066]], 0.006, 3, 'c_pk_ribbon', { squash: [1.8, 0.5] });
    }
  }, m);
  // ---- head
  K.local(k + 'head', (mb) => {
    const hr: V3 = bear ? [0.1, 0.088, 0.088] : [0.088, 0.092, 0.084];
    blob(mb, [0, 0.085, 0], hr, 10, 6, 'c_pk_head_' + k, { fit: true, seam: Math.PI, disp: (d) => 1 + (d[1] < -0.5 ? -0.06 : 0) + (bear && Math.abs(d[0]) > 0.6 && d[1] < 0 ? 0.05 : 0) });
    // muzzle, nose, eyes
    blob(mb, [0, 0.06, 0.07], bear ? [0.048, 0.036, 0.034] : [0.036, 0.03, 0.03], 7, 4, LT, {});
    mb.push().translate(0, 0.06, 0.104);
    mb.box(0, -0.022, 0, bear ? 0.06 : 0.048, 0.045, 0.004, 'c_pk_muzzle_' + k, { fit: true, skip: ['north', 'bottom', 'top', 'east', 'west'] });
    mb.pop();
    blob(mb, [0, 0.075, 0.1], bear ? [0.018, 0.012, 0.01] : [0.011, 0.009, 0.008], 6, 3, bear ? 'c_pk_nose' : 'c_pk_nose_pink', {});
    // the button eye (left) and the eye sewn shut (right)
    mb.push().translate(0.04, 0.105, 0.081).rotateY(0.42).rotateX(-0.1);
    mb.cylinder(0, 0, 0, 0.014, 0.006, 8, { top: 'c_pk_button', sides: 'c_pk_nose', bottom: 'c_pk_nose' }, { fit: true });
    mb.pop();
    mb.push().translate(-0.04, 0.105, 0.081).rotateY(-0.42).rotateX(Math.PI / 2 - 0.1);
    mb.box(0, -0.0015, 0, 0.026, 0.003, 0.026, { top: 'c_pk_xeye', all: 'c_pk_nose' }, { fit: { top: true } });
    mb.pop();
    // cheeks: a little worn felt blush (bunny)
    if (!bear) for (const s of [-1, 1]) blob(mb, [s * 0.055, 0.06, 0.06], [0.014, 0.01, 0.006], 5, 2, PAD, {});
  }, m);
  // ---- ears
  for (const [s, side] of [[1, 'L'], [-1, 'R']] as const) {
    K.local(k + 'ear' + side, (mb) => {
      if (bear) {
        blob(mb, [0, 0.025, 0], [0.034, 0.03, 0.014], 7, 4, F, {});
        blob(mb, [0, 0.025, 0.009], [0.021, 0.019, 0.007], 6, 3, PAD, {});
      } else {
        tube(mb, [[0, -0.005, 0], [s * 0.004, 0.06, 0], [s * 0.008, 0.13, -0.004], [s * 0.006, 0.175, -0.006]], (t) => 0.022 * (1 - t * 0.35) * (t > 0.9 ? 0.6 : 1), 6, F, { squash: [1, 0.42], capEnd: true });
        tube(mb, [[0, 0.02, 0.008], [s * 0.004, 0.07, 0.009], [s * 0.007, 0.14, 0.005]], (t) => 0.013 * (1 - t * 0.4), 5, PAD, { squash: [1, 0.25], capEnd: true });
        if (side === 'R') { mb.push().translate(s * 0.006, 0.1, 0.011); mb.box(0, 0, 0, 0.03, 0.03, 0.003, 'c_pk_patch', { fit: true }); mb.pop(); }
      }
    }, m);
  }
  // ---- stubby arms and sitting legs with felt pads
  for (const [s, side] of [[1, 'L'], [-1, 'R']] as const) {
    K.local(k + 'arm' + side, (mb) => {
      tube(mb, [[0, 0.01, 0], [s * 0.018, -0.05, 0.008], [s * 0.022, -0.11, 0.014]], (t) => 0.03 - t * 0.006, 7, F, { capStart: true, capEnd: true });
      blob(mb, [s * 0.022, -0.115, 0.03], [0.018, 0.014, 0.006], 5, 3, PAD, {});
    }, m);
    K.local(k + 'leg' + side, (mb) => {
      tube(mb, [[0, 0.01, -0.02], [s * 0.006, 0.0, 0.04], [s * 0.01, 0.005, 0.1]], (t) => 0.038 - t * 0.004, 7, F, { capStart: true });
      blob(mb, [s * 0.01, 0.012, 0.11], [0.036, 0.038, 0.022], 7, 4, F, {});
      mb.push().translate(s * 0.01, 0.012, 0.131);
      blob(mb, [0, 0, 0], [0.026, 0.028, 0.004], 7, 3, PAD, {});
      mb.pop();
    }, m);
  }
}

function buildPlush(): Rig {
  const K = new SkinKit(0.4, { bear: creatureMaterial(false), bunny: creatureMaterial(false) });
  for (const k of KINDS) buildKind(K, k);
  const rig = K.finish({ sphere: [0, 0.2, 0, 0.6] });
  // what is left after it is torn open (static: the corpse never moves)
  const pile = new THREE.Group();
  pile.name = 'pile';
  rig.root.add(pile);
  rig.parts.pile = pile;
  const mk = (name: string, fn: (mb: ModelBuilder) => void) => {
    const g = new THREE.Group(); g.name = name;
    const mb = new ModelBuilder(); fn(mb);
    const mesh = new THREE.Mesh(mb.build(), creatureMaterial(false)); mesh.castShadow = true;
    g.add(mesh); pile.add(g); rig.parts[name] = g;
  };
  mk('pileStuff', (mb) => {
    for (let i = 0; i < 8; i++) {
      const a = i * 2.4, r = 0.04 + (i % 4) * 0.045;
      blob(mb, [Math.cos(a) * r, 0.018, Math.sin(a) * r], [0.04 + (i % 3) * 0.014, 0.028 + (i % 2) * 0.016, 0.038], 7, 4, 'c_an_stuffing', { disp: (d) => 1 + Math.sin(d[0] * 9 + i) * 0.22 + Math.sin(d[2] * 11 - i * 2) * 0.16 });
    }
    mb.push().translate(0.13, 0.004, 0.09); mb.cylinder(0, 0, 0, 0.014, 0.006, 8, { top: 'c_pk_button', sides: 'c_pk_nose', bottom: 'c_pk_nose' }, { fit: true }); mb.pop();
  });
  for (const k of KINDS) mk(k === 'bear' ? 'pileBear' : 'pileBunny', (mb) => {
    // the empty skin, flat and split, the head still smiling
    blob(mb, [-0.09, 0.012, -0.03], [0.11, 0.014, 0.09], 8, 3, 'c_pk_body_' + k, { fit: true });
    blob(mb, [0.05, 0.03, -0.12], [0.08, 0.03, 0.07], 8, 3, 'c_pk_head_' + k, { fit: true, seam: Math.PI });
    mb.push().translate(0.05, 0.05, -0.06).rotateX(-1.2); mb.box(0, -0.02, 0, 0.05, 0.04, 0.003, 'c_pk_muzzle_' + k, { fit: true }); mb.pop();
    if (k === 'bunny') tube(mb, [[0.1, 0.01, -0.15], [0.2, 0.012, -0.12], [0.26, 0.01, -0.05]], 0.018, 5, 'c_pk_fur_bunny', { squash: [0.4, 1] });
    else blob(mb, [0.12, 0.012, -0.17], [0.03, 0.01, 0.028], 5, 2, 'c_pk_fur_bear', {});
  });
  return rig;
}

/** pose table: [torsoX, headX, headY, headZ, armX, legX, bodyRoll] */
const POSES: number[][] = [
  [0, 0, 0, 0, 0, 0, 0],            // 0 sitting upright
  [0.55, 0.5, 0, 0, 0.3, 0, 0],     // 1 slumped forward
  [0, 0, 0.2, 1.1, 0, 0, 0],        // 2 head tipped right over
  [0, -0.35, 0, 0, -2.9, 0, 0],     // 3 arms up: pick me up
  [1.45, 0.2, 0, 0, -2.6, -0.3, 0], // 4 lying face down
  [0, 0, Math.PI, 0, 0, 0, 0],      // 5 head turned all the way round
  [0.1, 0.2, 0, 0, -1.35, 0, 0],    // 6 presenting something
  [-0.1, 0, 0.5, 0.2, -1.0, 0.8, 0.15], // 7 caught mid-step
];

function posePlush(rig: Rig, k: Kind, pose: number, phase: number, headTurn: number, t: number, tick: number) {
  const P = rig.parts;
  const torso = P[k + 'torso'], head = P[k + 'head'];
  if (pose === -1) {
    // the waddle nobody ever sees
    const w = phase * 2;
    torso.rotation.set(0.15, 0, Math.sin(w) * 0.25);
    torso.position.y = 0.06 + 0.1 + Math.abs(Math.sin(w)) * 0.03;
    head.rotation.set(0, Math.sin(w * 0.5) * 0.3, 0);
    P[k + 'armL'].rotation.set(Math.sin(w) * 0.6, 0, 0); P[k + 'armR'].rotation.set(-Math.sin(w) * 0.6, 0, 0);
    // standing: legs swing under the body
    P[k + 'legL'].rotation.set(1.45 + Math.sin(w) * 0.6, 0, 0); P[k + 'legR'].rotation.set(1.45 - Math.sin(w) * 0.6, 0, 0);
  } else {
    const q = POSES[Math.max(0, Math.min(POSES.length - 1, pose))];
    torso.rotation.set(q[0], 0, q[6]);
    torso.position.y = pose === 4 ? 0.0 : 0.06;
    head.rotation.set(q[1] + tick * 0.08, q[2] + headTurn, q[3] + tick * 0.05);
    P[k + 'armL'].rotation.set(q[4], 0, pose === 3 ? -0.3 : 0.06);
    P[k + 'armR'].rotation.set(pose === 7 ? 0.4 : q[4], 0, pose === 3 ? 0.3 : -0.06);
    P[k + 'legL'].rotation.set(q[5], 0, 0.12); P[k + 'legR'].rotation.set(pose === 7 ? -0.2 : q[5], 0, -0.12);
  }
  if (k === 'bunny') { P.bunnyearL.rotation.set(0.15, 0, 0.12); P.bunnyearR.rotation.set(1.2, 0, -0.5); } // one ear always flopped
  else { P.bearearL.rotation.set(0, 0, -0.1); P.bearearR.rotation.set(0, 0, 0.1); }
  void t;
}

function animatePlush(rig: Rig, c: Creature, t: number, dt: number) {
  const R = rig as KRig;
  const P = rig.parts;
  const n = netOf(c);
  const seed = hashId(c.id);
  const kind: Kind = seed < 0.5 ? 'bear' : 'bunny';
  P.bear.visible = kind === 'bear' && !c.dead;
  P.bunny.visible = kind === 'bunny' && !c.dead;
  R.skins.bear.visible = P.bear.visible; R.skins.bunny.visible = P.bunny.visible;
  P.pile.visible = c.dead && rig.body.visible;
  P.pileBear.visible = kind === 'bear'; P.pileBunny.visible = kind === 'bunny';
  if (c.dead) { P.pile.rotation.y = seed * 6; rig.body.rotation.set(0, 0, 0); rig.body.position.y = 0; return; }
  const ud = rig.root.userData as { y?: number; hy?: number; tick?: number; tickT?: number };
  ud.y = n.y ?? 0; // perches are instant: nobody saw it climb up there
  rig.body.position.y = ud.y;
  const pose = n.p ?? 0;
  // every time you look away, its head has turned a little more toward you
  const p = localIn(c);
  let watched = false;
  if (p) {
    const ang = Math.atan2(c.z - p.z, c.x - p.x);
    watched = c.visibleToLocal && Math.abs(angleDiff(p.facing, ang)) < 1.0 && Math.hypot(p.x - c.x, p.z - c.z) < 14;
    if (!watched) {
      const [lx, lz] = toLocal(c.x, c.z, Math.PI / 2 - c.facing, p.x, p.z);
      const want = Math.max(-0.75, Math.min(0.75, wrapPi(Math.atan2(lx, lz))));
      ud.hy = damp(ud.hy ?? 0, want, 1.5, dt);
    }
  }
  // ...and once in a while, while you stare, the smallest twitch
  ud.tickT = (ud.tickT ?? 8 + seed * 20) - dt;
  if (watched && ud.tickT <= 0) { ud.tick = 1; ud.tickT = 14 + Math.random() * 25; }
  ud.tick = Math.max(0, (ud.tick ?? 0) - dt * 12);
  posePlush(rig, kind, pose, c.phase, pose === -1 ? 0 : (ud.hy ?? 0), t, ud.tick > 0.5 ? 1 : 0);
  const e = fxPoll(rig, c);
  if (e) playAt(e.key, c, e.a.v ?? 0.8, e.a.r);
  // the survivor notices
  if (p && c.visibleToLocal && Math.hypot(p.x - c.x, p.z - c.z) < 7) {
    thinkOnce(p, 'plush_seen_' + (c.tamedBy ? 'pet' : 'wild'), c.tamedBy
      ? ['There you are.', 'It always gets ahead of me somehow.', 'Good... toy?'][Math.floor(t) % 3]
      : ['Was that teddy bear there before?', 'I didn\'t put that there.', 'It moved. I KNOW it moved.', 'It\'s just a toy. It\'s just a toy.', 'Its head was facing the other way.'][Math.floor(t) % 5], 90);
  }
}

// ---------------------------------------------------------------- brain (host)
function tableAt(z: Zone, x: number, y: number): number {
  if (!z.inb(x, y) || z.solid[z.idx(x, y)] !== 3) return 0;
  for (const o of z.objectsAt(x, y)) { const d = objDef(o.key); if (d) return d.surface ?? Math.min(1.1, d.height); }
  return 0;
}
function wallsAround(z: Zone, x: number, y: number) {
  let n = 0, fx0 = 0, fz0 = 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (z.edgeBlocks(x, y, dx, dy, 'walk')) { n++; fx0 += dx; fz0 += dy; }
  return { n, fx: fx0, fz: fz0 };
}
interface Spot { x: number; z: number; y: number; face: 'player' | 'wall' | 'away'; fx?: number; fz?: number }
function chooseSpot(z: Zone, c: Creature, p: Player, tamed: boolean): Spot | null {
  // never closer than ~3 m: anything nearer is drawn on screen even behind you
  const rMin = tamed ? 3.0 : 4.5, rMax = tamed ? 4.4 : 8.5;
  const side = Math.atan2(c.z - p.z, c.x - p.x);
  const behind = Math.atan2(-Math.sin(p.facing), -Math.cos(p.facing));
  const want = rng.next();
  let best: Spot | null = null, bs = -Infinity;
  for (const [tx, ty, st] of reachTiles(z, c.x, c.z, 1200)) {
    if (st > 40) continue;
    const x = tx + 0.5, zz = ty + 0.5;
    const d = Math.hypot(x - p.x, zz - p.z);
    if (d < rMin || d > rMax) continue;
    const a = Math.atan2(zz - p.z, x - p.x);
    // stay on its own side of the survivor: it never cuts across in front of them
    if (Math.abs(angleDiff(side, a)) > 1.7 && st > 3) continue;
    let sc = rng.next() * 2 - st * 0.03;
    let spot: Spot = { x, z: zz, y: 0, face: rng.chance(0.85) ? 'player' : 'away' };
    // odd places: up on a table next to this tile, wedged in a corner, right behind you
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ty2 = tableAt(z, tx + dx, ty + dy);
      if (ty2 > 0 && want < 0.55) { spot = { x: tx + dx + 0.5, z: ty + dy + 0.5, y: ty2, face: rng.chance(0.8) ? 'player' : 'away' }; sc += 4; break; }
    }
    if (!spot.y) {
      const w = wallsAround(z, tx, ty);
      if (w.n >= 2 && want > 0.55 && want < 0.85) { spot = { x, z: zz, y: 0, face: 'wall', fx: w.fx, fz: w.fz }; sc += 3; }
      if (tamed && want >= 0.85) sc += 3 - Math.abs(angleDiff(behind, a)) * 2;
    }
    if (sc > bs) { bs = sc; best = spot; }
  }
  return best;
}
function nearestWalkable(z: Zone, x: number, zz: number): { x: number; z: number } | null {
  for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const tx = Math.floor(x) + dx, ty = Math.floor(zz) + dy;
    if (walkable(z, tx, ty)) return { x: tx + 0.5, z: ty + 0.5 };
  }
  return null;
}
/** like the manager's observed(), but the near ring only counts close enough to be drawn on screen */
function inView(z: Zone, c: Creature): boolean {
  for (const q of playersIn(c.zoneKey)) {
    const d = dist(q, c);
    if (d > 30 || q.sleeping || q.body.downed) continue;
    if (d < 2.6) return true;
    const cone = (q.isLocal && G.view ? G.view.vis.coneHalf : 1.4) + 0.05;
    if (Math.abs(angleDiff(q.facing, Math.atan2(c.z - q.z, c.x - q.x))) > cone) continue;
    if (!lineOfSightB(z, q.x, q.z, c.x, c.z)) continue;
    if (lightAt(z, c.x, c.z) + (q.flashlightOn ? 0.6 : 0) < 0.1 && d > 3) continue;
    return true;
  }
  return false;
}
function pickPose(): number { return rng.weighted([[0, 4], [1, 2], [2, 2], [3, 1.5], [4, 1], [5, 1]] as [number, number][]); }

function thinkPlush(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey);
  const n = net(c);
  const m = c.mem;
  const cs = G.creatures;
  n.p = n.p ?? pickPose();
  const tamed = !!c.tamedBy;
  const owner = tamed ? G.players.get(c.tamedBy!) : null;
  // who it follows
  m.folT = (m.folT ?? 0) - dt;
  if (m.folT <= 0) {
    m.folT = 3;
    if (owner) m.fol = owner.zoneKey === c.zoneKey ? owner.id : null;
    else {
      let best: Player | null = null, bd = 25;
      for (const q of playersIn(c.zoneKey)) { const d = dist(q, c); if (d < bd || q.id === m.fol && d < 30) { bd = d; best = q; } }
      m.fol = best?.id ?? null;
    }
  }
  const p = m.fol ? G.players.get(m.fol) : null;
  // looked at (in someone's view cone, or rendered right next to them): it is just a toy
  if (inView(z, c)) {
    hold(c);
    if (c.state === 'follow') { n.p = 7; } // caught mid-step
    if (c.state !== 'frozen') c.setState('frozen');
    return true;
  }
  if (!p || p.zoneKey !== c.zoneKey || (tamed && m.stay)) { hold(c); if (c.state !== 'idle') c.setState('idle'); return true; }
  // pick (or refresh) an odd place near its survivor
  const ref = m.spotRef as { x: number; z: number } | undefined;
  m.settleT = (m.settleT ?? 0) - dt;
  if (!m.spot || !ref || Math.hypot(p.x - ref.x, p.z - ref.z) > (tamed ? 3 : 5) || m.settleT <= 0) {
    const s = chooseSpot(z, c, p, tamed);
    if (s) { m.spot = s; m.spotRef = { x: p.x, z: p.z }; m.settleT = rng.float(20, 45); m.arrived = false; }
  }
  const s = m.spot as Spot | null;
  if (!s) { hold(c); return true; }
  const d = Math.hypot(s.x - c.x, s.z - c.z);
  if (!m.arrived) {
    // off a perch first
    if ((n.y ?? 0) > 0) { const w = nearestWalkable(z, c.x, c.z); if (w) { c.x = w.x; c.z = w.z; } n.y = 0; }
    if (s.y > 0 && d < 1.3) { c.x = s.x; c.z = s.z; n.y = s.y; arrive(c, s, p, n); return true; } // hop up
    if (d < 0.35 || (s.y > 0 && d < 1.3)) { arrive(c, s, p, n); return true; }
    c.setState('follow');
    n.p = -1;
    const gx = s.y > 0 ? (nearestWalkable(z, s.x, s.z)?.x ?? s.x) : s.x, gz = s.y > 0 ? (nearestWalkable(z, s.x, s.z)?.z ?? s.z) : s.z;
    if (cs.moveTo(c, z, gx, gz, c.sp.run, dt, s.y > 0 ? 0.2 : 0.3) && s.y > 0) { c.x = s.x; c.z = s.z; n.y = s.y; arrive(c, s, p, n); }
    if (c.stateT > 12) { m.spot = null; } // stuck: choose another place
    return true;
  }
  hold(c);
  if (c.state !== 'idle') c.setState('idle');
  // gifts, while nobody watches
  m.giftT = (m.giftT ?? rng.float(50, 140)) - dt;
  const pd = dist(p, c);
  if (m.giftT <= 0 && pd > 2.8 && pd < 11 && (tamed || (m.gifts ?? 0) < 3)) {
    m.giftT = tamed ? rng.float(90, 200) : rng.float(140, 280);
    m.gifts = (m.gifts ?? 0) + 1;
    const key = rollLoot(tamed ? 'plushkin_find' : 'plushkin_gift', rng)[0] || 'candy_bar';
    if (key === 'note') dropGift(c, 'note', { data: { lore: rng.pick(NOTES) }, name: 'Crayon Note' });
    else dropGift(c, key);
    n.p = 6;
    fx(c, rng.chance(0.3) ? 'music_box_broken' : 'plush_squeak', { v: 0.6, r: 18 });
  }
  return true;
}
function arrive(c: Creature, s: Spot, p: Player, n: Record<string, any>) {
  c.mem.arrived = true;
  hold(c);
  c.setState('idle');
  n.p = s.y > 0 && rng.chance(0.5) ? 0 : pickPose();
  if (s.face === 'wall' && (s.fx || s.fz)) c.facing = c.targetFacing = Math.atan2(s.fz!, s.fx!);
  else if (s.face === 'away') c.facing = c.targetFacing = Math.atan2(c.z - p.z, c.x - p.x);
  else c.facing = c.targetFacing = Math.atan2(p.z - c.z, p.x - c.x);
  if (rng.chance(0.15)) fx(c, 'plush_squeak', { v: 0.45, r: 10 });
}

const S = def({
  key: 'plushkin', name: 'Plushkin', code: 'E-12 // PLUSH-STILL', temperament: 'curious', threat: 0,
  hp: 10, walk: 1.6, run: 3.2, turn: 20, radius: 0.16, height: 0.42, sight: 18, fov: 3.1, hearing: 1.0, nightVision: true,
  zones: ['house', 'school', 'fields', 'mall', 'lobby'], weight: 1, group: [1, 2], maxPerZone: 3, diet: 'items',
  tame: { food: ['candy_bar', 'candy_dream', 'cookies', 'donut', 'birthday_cake', 'popsicle', 'ice_cream', 'gum'], feeds: 3 },
  flags: { plush: true, companion: true },
  sounds: snd({ idle: 'plush_squeak', alert: 'plush_squeak', hurt: 'plush_squeak', death: 'plush_rip' }),
  scan: {
    cls: 'Animate toy / harmless / tameable',
    notes: [
      'A stuffed toy. It only moves when nobody is looking, and it likes to end up somewhere odd.',
      'It follows the survivor it has chosen and sometimes leaves a gift nearby: sweets, batteries, a crayon note.',
      'Three sweets and it is yours. A tamed one stays close and turns up with useful things.',
      'Harmless. Hit it and it tears open into a pile of stuffing.',
    ],
  },
  gore: { blood: 'stuffing', sever: ['bearhead', 'bunnyhead', 'beararmL', 'beararmR', 'bunnyarmL', 'bunnyarmR', 'bearlegL', 'bearlegR', 'bunnylegL', 'bunnylegR', 'bearearL', 'bunnyearR'] },
  build: buildPlush,
  animate: animatePlush,
  think: thinkPlush,
});
/** gallery: both toys side by side cycling their poses; pose=bear|bunny shows one, pose=walk the unseen waddle, pose=dead the pile */
(S as any).animateGallery = (rig: Rig, t: number) => {
  const q = new URLSearchParams(location.search).get('pose') || '';
  const R = rig as KRig, P = rig.parts;
  const dead = q === 'dead';
  P.pile.visible = dead; P.pileBunny.visible = false;
  for (const k of KINDS) {
    const show = !dead && (q === k || (q !== 'bear' && q !== 'bunny'));
    P[k].visible = show; R.skins[k].visible = show;
    P[k].position.x = q === 'bear' || q === 'bunny' ? 0 : k === 'bear' ? -0.22 : 0.22;
    const pose = q === 'walk' ? -1 : Math.floor(t / 2.5) % POSES.length;
    posePlush(rig, k, pose, t * 3, Math.sin(t * 0.4) * 0.5, t, 0);
  }
  void fakeCreature;
};
