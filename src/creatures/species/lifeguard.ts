import * as THREE from 'three';
import { def, newRig, Rig } from '../species';
import { Page, Reg, OB, V3, bpart, registerPage, clamp01, lerp, gauss, ramp, fillLv, applyLook, galleryDriver } from '../kit/beasts';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, ph } from '../../gfx/pixel';
import { G } from '../../game/G';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import type { Zone } from '../../world/zone';
import { net, netOf, snd, playersIn, dist, hold, face, hashId, fakeCreature, rng, fx, fxPoll, playAt, live, seenByAny, localIn, thinkOnce, partB, matB } from '../behaviors_b';
import { part } from '../species';
import '../../audio/sounds_creatures_b';

// The Lifeguard: lives in the deep end of the Poolrooms and never leaves the
// water. From above it is only a shadow under the surface and a faded red
// rescue float drifting where no current should take it. The moment anyone
// swims into deep water it blows a whistle. Then it comes, faster than anyone
// can swim, takes hold and pulls them under. It lets go when struck, or when
// its victim reaches shallow water or the edge.

addTextureModule(() => {
  const A = atlas();
  // a person-shaped shadow seen from above, arms spread, soft dithered edge
  A.add('c_lifeguard_shadow', 32, 32, (pc) => {
    pc.wrap = false;
    pc.clear();
    const inBody = (x: number, y: number) => {
      const head = Math.hypot((x - 15.5) / 3.2, (y - 5) / 3.6) < 1;
      const torso = Math.abs(x - 15.5) < 4.2 - Math.max(0, y - 16) * 0.12 && y > 7 && y < 21;
      const arms = Math.abs(y - 10 - Math.abs(x - 15.5) * 0.18) < 1.6 && Math.abs(x - 15.5) < 14.5;
      const legs = y >= 20 && y < 31 && (Math.abs(x - 13 + (y - 20) * 0.15) < 1.8 || Math.abs(x - 18 - (y - 20) * 0.15) < 1.8);
      return head || torso || arms || legs;
    };
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      if (!inBody(x, y)) continue;
      const edge = !inBody(x + 1, y) || !inBody(x - 1, y) || !inBody(x, y + 1) || !inBody(x, y - 1);
      if (edge && ((x + y) & 1)) continue; // dithered rim
      pc.set(x, y, edge ? 0x0e2a3a : 0x061620);
    }
  });
  A.add('c_lifeguard_float', 16, 8, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0xc8402e, 5, { hueShift: 0.02 });
    pc.fillRamp(R, (x, y) => 0.6 - Math.abs(y - 3.5) * 0.08 + (ph(x, y, 2) - 0.5) * 0.12, 0.5);
    // faded white lettering, mostly gone
    for (const x of [3, 4, 6, 8, 9, 11, 12]) pc.set(x, 3, 0xe8d8d0);
    pc.set(3, 4, 0xe8d8d0); pc.set(6, 4, 0xe8d8d0); pc.set(11, 4, 0xe8d8d0);
    pc.hline(0, 15, 0, R[1]); pc.hline(0, 15, 7, R[0]);
  });
  A.add('c_lifeguard_ripple', 16, 16, (pc) => {
    pc.wrap = false;
    pc.clear();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d > 6.2 && d < 7.6 && ((x * 3 + y) % 4)) pc.set(x, y, 0xcfeef6);
    }
  });
});

const S0 = 0.6; // water surface above the root (the manager sinks swimmers 0.6 m)

// Model: a drowned lifeguard. A waterlogged upper body (ribs and collarbones
// under bloated, pruned, blue-white skin marbled with livor), a faded red
// guard's vest gone to holes, a whistle on a lanyard, a red swim cap over a
// face with empty black sockets ringed by old goggle marks and a mouth that
// stays open. Arms far too long, ending in long white fingers. Wet hair
// strands trail from under the cap.
const PG = registerPage(new Page('c_lifepg', 128, 128, [
  ['TORSO', 64, 40], ['HEAD', 48, 30], ['ARM_U', 20, 36], ['ARM_L', 18, 36], ['HAND', 18, 12], ['HAIR', 12, 20], ['CUT', 14, 14], ['WHISTLE', 6, 6],
], 2));
const AU = 0.6, AF = 0.56; // upper arm / forearm (too long)

function bodyGeo(ob: OB) {
  // torso: waist to shoulders along +y; N faces front (u 0.5 = chest)
  const path: V3[] = [[0, -0.62, 0.0], [0, -0.5, 0.0], [0, -0.36, 0.005], [0, -0.22, 0.012], [0, -0.1, 0.01], [0, -0.01, 0.0], [0, 0.05, -0.01]];
  const rad: [number, number][] = [[0.1, 0.14], [0.1, 0.145], [0.105, 0.15], [0.12, 0.165], [0.12, 0.175], [0.1, 0.18], [0.06, 0.09]];
  ob.tube(path, rad, 14, PG.reg('TORSO'), {
    up: [0, 0, 1], th0: Math.PI, start: 'pole', end: 'pole', endBulge: 0.03, vflip: true,
    bump: (i, th) => {
      const front = Math.max(0, Math.cos(th)), side = Math.abs(Math.sin(th));
      let b = 0;
      if (i === 3 || i === 4) b += front * side * 0.1 * (i === 3 ? 1 : 0.6);   // ribs flaring under the skin
      if (i === 5) b += Math.max(0, Math.cos(th)) ** 2 * 0.06 - front * (1 - side) * 0.05; // collarbones, sternal notch
      if (i === 2) b += front * 0.08;                                           // bloated belly
      return b;
    },
    col: (i, th) => 0.82 + 0.18 * Math.cos(th) - (i < 2 ? 0.1 : 0),
  });
  // lanyard and whistle
  const W = PG.reg('WHISTLE');
  ob.blob([0.03, -0.2, 0.135], [0.012, 0.022, 0.01], 5, 3, W);
}

function headGeo(ob: OB) {
  // neck with a cut face at its root (shows when the head comes off)
  ob.tube([[0, -0.1, -0.01], [0, -0.04, 0.0], [0, 0.03, 0.005]], [[0.05, 0.055], [0.05, 0.055], [0.052, 0.058]], 9, PG.reg('TORSO'), { up: [0, 0, 1], start: 'cut', cut: PG.reg('CUT'), vs: [0.99, 0.97, 0.96] });
  const path: V3[] = [[0, 0.0, 0.012], [0, 0.04, 0.02], [0, 0.09, 0.022], [0, 0.14, 0.018], [0, 0.19, 0.01], [0, 0.23, 0.0], [0, 0.255, -0.01]];
  const rad: [number, number][] = [[0.055, 0.05], [0.07, 0.065], [0.085, 0.078], [0.092, 0.084], [0.095, 0.088], [0.085, 0.08], [0.05, 0.05]];
  ob.tube(path, rad, 14, PG.reg('HEAD'), {
    up: [0, 0, 1], th0: Math.PI, start: 'pole', end: 'pole', endBulge: 0.025, vflip: true,
    bump: (i, th) => {
      const front = Math.max(0, Math.cos(th));
      let b = 0;
      if (i === 3) b -= gauss(Math.abs(Math.sin(th)), 0.45, 0.18) * front * 0.22;  // hollow eye sockets
      if (i === 2) b += gauss(Math.abs(Math.sin(th)), 0.0, 0.2) * front * 0.12;    // nose ridge
      if (i === 1) b -= gauss(Math.abs(Math.sin(th)), 0.0, 0.3) * front * 0.08;    // the open mouth
      if (i === 5) b += 0.04;                                                      // the cap's rolled rim
      return b;
    },
  });
  // wet hair trailing from under the cap
  const H = PG.reg('HAIR');
  for (const [x, ry, l] of [[-0.06, -0.4, 0.2], [0.0, 0.0, 0.24], [0.06, 0.4, 0.18], [-0.03, -0.15, 0.16]] as [number, number, number][]) {
    ob.push().translate(x, 0.19, -0.075).rotY(ry);
    ob.quad([[-0.025, 0, 0], [0.025, 0, 0], [0.02, -l, -0.03], [-0.02, -l, -0.03]], H, [[0, 1], [1, 1], [1, 0], [0, 0]], { double: true });
    ob.pop();
  }
}

/** arm segment pointing up (+y) from its joint, knuckled at the far end */
function armSeg(ob: OB, len: number, r0: number, r1: number, reg: string, cut: boolean) {
  ob.tube([[0, -0.03, 0], [0, len * 0.15, 0.004], [0, len * 0.5, 0.006], [0, len * 0.85, 0.003], [0, len + 0.015, 0]],
    [[r0 * 0.8, r0 * 0.8], [r0, r0 * 0.95], [lerp(r0, r1, 0.5), lerp(r0, r1, 0.5) * 0.92], [r1, r1 * 0.9], [r1 * 1.1, r1 * 1.05]], 8, PG.reg(reg), {
      up: [0, 0, 1], start: cut ? 'cut' : 'pole', cut: PG.reg('CUT'), end: 'pole', endBulge: 0.01, vs: [0.02, 0.15, 0.5, 0.85, 0.98],
    });
}
function handGeo(ob: OB) {
  const H = PG.reg('HAND');
  ob.blob([0, AF + 0.04, 0.005], [0.045, 0.05, 0.02], 7, 4, H);
  // four long white fingers, slightly curled like hooks, and a thumb
  for (let f = 0; f < 4; f++) {
    const x = (f - 1.5) * 0.022, L = 0.16 + (f === 1 || f === 2 ? 0.02 : 0);
    const y0 = AF + 0.08;
    ob.tube([[x, y0, 0.0], [x * 1.1, y0 + L * 0.5, 0.012], [x * 1.15, y0 + L * 0.85, 0.035], [x * 1.15, y0 + L, 0.06]], [0.0095, 0.008, 0.007, 0.005], 5, H, { end: 'pole', endBulge: 0.005 });
  }
  ob.tube([[0.045, AF + 0.03, 0.01], [0.07, AF + 0.08, 0.03], [0.075, AF + 0.11, 0.05]], [0.011, 0.009, 0.006], 5, H, { end: 'pole', endBulge: 0.005 });
}

function buildLifeguard(): Rig {
  const rig = newRig(S0 + 0.4);
  // everything hangs off `main` on the root, so the engine's dead-pose tilt of
  // rig.body does not stand the surface shadow on its edge
  const main = new THREE.Group();
  main.name = 'main';
  rig.root.add(main);
  rig.parts.main = main;
  partB(rig, 'shadow', main, [0, S0 + 0.012, 0], (mb) => { mb.flat(0, 0, 0, 1.6, 1.6, 'c_lifeguard_shadow'); }, matB('shadow'));
  part(rig, 'float', main, [0.25, S0, 0.7], (mb) => {
    mb.cylinderX(0, 0.04, 0, 0.065, 0.62, 6, 'c_lifeguard_float', { fit: true });
    mb.box(-0.36, 0.035, 0, 0.12, 0.012, 0.012, 'c_lifeguard_float', { color: 0xd8d0c0 }); // frayed strap
  });
  for (let i = 0; i < 3; i++) partB(rig, 'ripple' + i, main, [0, S0 + 0.02, 0], (mb) => { mb.flat(0, 0, 0, 1, 1, 'c_lifeguard_ripple'); }, matB('dust'));
  // the body: below the surface (hidden by the water floor) until it reaches up
  const body = bpart(rig, 'bodyG', main, [0, S0 - 1.2, 0], PG, 'body', bodyGeo);
  bpart(rig, 'head', body, [0, 0.06, 0.0], PG, 'head', headGeo);
  for (const [s, side] of [[1, 'L'], [-1, 'R']] as const) {
    const ua = bpart(rig, 'arm' + side, body, [0.2 * s, -0.02, -0.01], PG, 'armU', (ob) => armSeg(ob, AU, 0.05, 0.036, 'ARM_U', true));
    bpart(rig, 'fore' + side, ua, [0, AU, 0], PG, 'armF', (ob) => { armSeg(ob, AF, 0.036, 0.03, 'ARM_L', false); handGeo(ob); });
  }
  return rig;
}

PG.paint((Pt, v) => {
  const rng = Pt.rng;
  const SK = ramp(v ? 0x9eb0b2 : 0xaab8b6, 14, 0x161c26, 0.55);
  const RD = ramp(v ? 0x9a3a2a : 0xa83a30, 10, 0x200808, 0.4);
  const M = 7;
  const LIV = 0x6a5a8a, VEIN = 0x4a5a8a;
  const prune = (r: Reg, dens: number) => { for (let y = 1; y < r.h; y += 2) for (let x = 0; x < r.w; x++) if (Math.sin(x * 0.9 + y * 1.7 + Math.sin(y * 0.5) * 2) > 1 - dens) Pt.blend(r, x, y, SK[4], 0.35); };
  const livor = (r: Reg, amt: number) => { for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const f = Pt.n(r, x, y, 3, 2, 31); if (f > 0.62 - amt * 0.1) Pt.blend(r, x, y, LIV, clamp01((f - 0.6) * 4) * 0.45); } };
  const veins = (r: Reg, n: number) => { for (let i = 0; i < n; i++) Pt.walk(r, rng.int(0, r.w - 1), rng.int(0, r.h - 1), rng.int(8, 16), rng.float(-1, 1), rng.float(-1, 1), VEIN, 0.45, 0.8, 0.25); };
  const peel = (r: Reg, n: number) => { for (let i = 0; i < n; i++) { const x = rng.int(0, r.w - 1), y = rng.int(2, r.h - 3), w = rng.int(2, 4); Pt.spot(r, x, y, w, w * 0.6, SK[12], 0.9, true); for (let k = -w; k <= w; k++) Pt.set(r, x + k, y + Math.round(w * 0.6), SK[3]); } };
  // ---------------- torso: skin, then the rotted guard's vest over the chest and back
  {
    const r = Pt.R('TORSO');
    const fr = (x: number) => -Math.cos(((x + 0.5) / r.w) * Math.PI * 2); // +1 chest, -1 back
    fillLv(Pt, r, SK, (u, vv, x, y) => M + fr(x) * 0.6 + (Pt.n(r, x, y, 3, 2, 1) - 0.5) * 1.0 + (vv > 0.62 && vv < 0.8 ? Math.sin(vv * 70) * 0.9 * Math.max(0, fr(x)) : 0));
    livor(r, 1); veins(r, 10); prune(r, 0.15);
    // the vest: a tank top from just under the collarbones to the waist, holes eaten through it
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const vv = 1 - (y + 0.5) / r.h, u = (x + 0.5) / r.w;
      const strap = Math.abs(Math.abs(u - 0.5) - 0.25) < 0.07;
      if (vv > 0.86 && !strap) continue;
      if (vv > 0.74 && !strap && Math.abs(u - 0.5) < 0.17) continue; // neckline
      if (vv < 0.04) continue;
      if (Pt.n(r, x, y, 4, 2, 41) > 0.7) continue; // holes
      Pt.put(r, x, y, RD, 5 + fr(x) * 0.6 + (Pt.n(r, x, y, 3, 2, 43) - 0.5) * 1.6 - (vv < 0.2 ? 1 : 0), 0.25);
    }
    // faded lettering across the chest (most of it gone)
    const ly = Math.round(r.h * 0.42);
    for (let k = 0; k < 9; k++) { if (rng.chance(0.4)) continue; const x = Math.round(r.w * 0.5 - 9 + k * 2); Pt.blend(r, x, ly, 0xe8e0d8, 0.7); Pt.blend(r, x, ly + 1, 0xe8e0d8, rng.chance(0.5) ? 0.6 : 0); }
    // lanyard
    for (let y = Math.round(r.h * 0.14); y < r.h * 0.55; y++) { const k = (y - r.h * 0.14) / (r.h * 0.41); Pt.set(r, r.w * 0.5 - 7 + k * 8, y, 0xe0e0d8); Pt.set(r, r.w * 0.5 + 7 - k * 6, y, 0xe0e0d8); }
  }
  // ---------------- head: red cap on top, the face below: empty sockets, open mouth
  {
    const r = Pt.R('HEAD');
    const fr = (x: number) => -Math.cos(((x + 0.5) / r.w) * Math.PI * 2);
    const side = (x: number) => Math.sin(((x + 0.5) / r.w) * Math.PI * 2);
    fillLv(Pt, r, SK, (u, vv, x, y) => M + 0.4 + fr(x) * 0.5 + (Pt.n(r, x, y, 3, 2, 5) - 0.5) * 0.9);
    livor(r, 0.6); veins(r, 4);
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const vv = 1 - (y + 0.5) / r.h;
      if (vv > 0.66) Pt.put(r, x, y, RD, 5.4 + fr(x) * 0.5 + (vv > 0.9 ? 1.2 : 0) + (Math.abs(vv - 0.7) < 0.03 ? -1.5 : 0), 0.2);
    }
    // goggle marks and the sockets: black hollows ringed in bruise
    const ey = Math.round((1 - 0.5) * r.h);
    for (const sd of [1, -1]) {
      const cx = r.w * 0.5 + sd * r.w * 0.075;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -5; dx <= 5; dx++) {
        const e = (dx * dx) / 18 + (dy * dy) / 9;
        if (e <= 1) Pt.set(r, cx + dx, ey + dy, e < 0.42 ? 0x040406 : e < 0.7 ? 0x241c2c : 0x5a4a62);
      }
      for (let k = 0; k < 7; k++) Pt.set(r, cx + sd * (4 + k), ey - 1 + Math.round(k * 0.2), 0x6a5a6e); // strap groove
    }
    // nose shadow, the open mouth (black, a glint of teeth), a dribble of water
    Pt.set(r, r.w * 0.5, ey + 3, SK[4]); Pt.set(r, r.w * 0.5, ey + 4, SK[3]);
    const my = Math.round((1 - 0.24) * r.h);
    for (let dy = -2; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if ((dx * dx) / 10 + (dy * dy) / 7 <= 1) Pt.set(r, r.w * 0.5 + dx, my + dy, dy < 0 && Math.abs(dx) < 3 ? 0x1a0a0c : 0x060404);
    Pt.set(r, r.w * 0.5 - 2, my - 2, 0xd8d0b8); Pt.set(r, r.w * 0.5 + 1, my - 2, 0xc8c0a8);
    void side;
  }
  // ---------------- arms: bloated pale skin, pruned, veined, peeling; fingers bone-white
  const arm = (name: string) => {
    const r = Pt.R(name);
    fillLv(Pt, r, SK, (u, vv, x, y) => M + Math.cos(u * Math.PI * 2) * -0.6 + (Pt.n(r, x, y, 3, 2, 11) - 0.5) * 1.0);
    livor(r, 0.8); veins(r, 3); prune(r, 0.2); peel(r, 2);
  };
  arm('ARM_U'); arm('ARM_L');
  {
    const r = Pt.R('HAND');
    fillLv(Pt, r, SK, (u, vv, x, y) => M + 2 + (Pt.n(r, x, y, 2, 2, 13) - 0.5) + vv);
    prune(r, 0.4);
    for (let x = 0; x < r.w; x += 3) Pt.set(r, x, 0, 0x8a8a8a);
  }
  {
    const r = Pt.R('HAIR');
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const vv = 1 - (y + 0.5) / r.h;
      if (ph(x, 1, v) > vv * 1.4 + 0.25 && vv < 0.7) continue; // ragged strand ends
      if (x % 3 === 2 && vv < 0.85) continue;
      Pt.set(r, x, y, (x + y) % 4 === 0 ? 0x2a2420 : 0x18140f);
    }
  }
  fillLv(Pt, Pt.R('WHISTLE'), ramp(0xd8d0b8, 6, 0x302c24, 0.5), (u, vv) => 3 + vv);
  Pt.cut(Pt.R('CUT'), SK[8], { meat: 0xb06a6a, fat: 0xe8dcd0, bone: 0xe0dccc });
});

function animateLifeguard(rig: Rig, c: Creature, t: number, dt: number) {
  const P = rig.parts;
  const n = netOf(c);
  const ud = rig.root.userData as { rise?: number; fade?: number };
  const seed = hashId(c.id);
  const grabbing = !!n.g && !c.dead;
  const reaching = c.attackPhase > 0 || grabbing;
  applyLook(rig, c, PG, 0);
  const riseT = c.dead ? 1.12 : reaching ? 1 : c.state === 'watch' ? 0.35 : 0;
  ud.rise = (ud.rise ?? 0) + (riseT - (ud.rise ?? 0)) * Math.min(1, dt * (reaching ? 6 : c.dead ? 0.8 : 2));
  const rise = ud.rise;
  const am = rig.root.userData as Record<string, number>;
  // body: comes up through the surface; head breaks it, arms reach up and in. Dead, it floats face down.
  const yank = grabbing ? Math.max(0, Math.sin(t * 5.5)) : 0;   // pulling its victim under, in heaves
  const sway = Math.sin(t * 0.8 + seed * 5);
  P.bodyG.position.y = S0 - 1.2 + rise * 1.05 - yank * 0.12;
  am.tilt = (am.tilt ?? 0) + ((c.dead ? 1.5 : reaching ? -0.3 - yank * 0.25 : sway * 0.08) - (am.tilt ?? 0)) * Math.min(1, dt * (c.dead ? 1.2 : 4));
  P.bodyG.rotation.set(am.tilt, c.dead ? 0 : sway * 0.15, c.dead ? 0.1 : Math.sin(t * 1.3 + seed) * (reaching ? 0.12 : 0.05));
  for (const [i, side] of [[0, 'L'], [1, 'R']] as const) {
    const sd = i ? 1 : -1;
    const claw = Math.sin(t * 9 + i * 2) * 0.25;
    const scull = Math.sin(t * 0.9 + i * Math.PI + seed * 3) * 0.25;   // slow sculling, arms spread under the water
    if (c.dead) { P['arm' + side].rotation.set(0.2, 0, sd * 1.3); P['fore' + side].rotation.x = 0.25; continue; }
    // reaching: up and forward, clawing; grabbing: hauling down hand over hand
    const rx = reaching ? (grabbing ? 0.9 + Math.sin(t * 5.5 + i * Math.PI) * 0.5 : 0.55 + claw) : 0.15 + scull * 0.4;
    P['arm' + side].rotation.set(rx, 0, sd * (reaching ? 0.3 - (grabbing ? 0.1 : 0) : 1.35 + scull * 0.3));
    P['fore' + side].rotation.x = reaching ? (grabbing ? 1.3 + Math.sin(t * 5.5 + i * Math.PI) * 0.4 : 0.85 + claw) : 0.15 + scull * 0.3;
  }
  // the head: lolling under water, tipped back with the mouth up when it surfaces, twitching while it holds on
  const look = c.state === 'watch' ? Math.sin(t * 0.4 + seed * 6) * 0.6 : Math.sin(t * 0.4 + seed * 6) * 0.2;
  const twitch = grabbing && Math.floor(t * 6) % 5 === 0 ? 0.3 : 0;
  P.head.rotation.set(c.dead ? 0.3 : reaching ? -0.45 - yank * 0.2 : Math.sin(t * 0.7) * 0.12, look + twitch, Math.sin(t * 0.5 + seed) * 0.15);
  // shadow: stretched when it is swimming fast, faded when dead
  const fast = c.speed > 1.6;
  ud.fade = (ud.fade ?? 1) + ((c.dead ? 0 : 1) - (ud.fade ?? 1)) * Math.min(1, dt * 0.5);
  P.shadow.scale.set((fast ? 0.85 : 1) * ud.fade + 0.001, 1, (fast ? 1.35 : 1) * ud.fade + 0.001);
  P.shadow.rotation.y = Math.sin(t * 0.5 + seed * 3) * 0.08;
  P.shadow.position.y = S0 + 0.012 + Math.sin(t * 1.1) * 0.003;
  // the float: bobbing, turning slowly, dragged along when it moves
  P.float.position.set(0.25 + Math.sin(t * 0.37 + seed * 5) * 0.15, S0 + Math.sin(t * 1.9 + seed) * 0.018, (fast ? 1.0 : 0.7) + Math.cos(t * 0.31) * 0.12);
  P.float.rotation.y = t * 0.12 + seed * 6;
  P.float.rotation.z = Math.sin(t * 1.7) * 0.06;
  // ripples: rings spreading while it moves fast or thrashes
  for (let i = 0; i < 3; i++) {
    const r = P['ripple' + i];
    const active = (fast || reaching) && !c.dead;
    const life = (t * (reaching ? 1.4 : 0.9) + i / 3) % 1;
    r.visible = active;
    r.scale.setScalar(0.4 + life * (reaching ? 2.2 : 1.5));
    r.position.set(0, S0 + 0.02, fast && !reaching ? -0.6 - life * 0.6 : 0);
  }
  const e = fxPoll(rig, c);
  if (e) playAt(e.key, c, e.a.v ?? 1, e.a.r);
  // held under: the local survivor is dragged and drowns while it holds on
  const p = localIn(c);
  if (p && grabbing && n.g === p.id && live()) {
    const k = Math.min(1, dt * 2.5);
    p.x += (c.x - p.x) * k; p.z += (c.z - p.z) * k;
    p.vx *= 0.6; p.vz *= 0.6;
    const b = p.body as any;
    b.health = Math.max(0, b.health - dt * 3.2);
    b.panic = Math.min(100, b.panic + dt * 28);
    if (typeof b.endurance === 'number') b.endurance = Math.max(0, b.endurance - dt * 0.09);
    if (typeof b.wetness === 'number') b.wetness = 100;
    G.pr.fx.hurt = Math.max(G.pr.fx.hurt, 0.3 + Math.sin(t * 6) * 0.1);
    G.pr.fx.blink = Math.max(G.pr.fx.blink, 0.25 + Math.max(0, Math.sin(t * 2.3)) * 0.35);
    thinkOnce(p, 'lifeguard_grab', ['It has my legs. It is pulling me under.', 'Get to the edge! Hit it!', 'Water. In my mouth. Can\'t—'][Math.floor(t * 3) % 3], 20);
  }
}

// ---------------------------------------------------------------- pools (deep-water bodies) per zone
const POOLS = new Map<string, { id: Int32Array; tiles: [number, number][][] }>();
function pools(z: Zone) {
  let P = POOLS.get(z.key);
  if (P && P.id.length === z.W * z.H) return P;
  const id = new Int32Array(z.W * z.H).fill(-1);
  const tiles: [number, number][][] = [];
  for (let y = 0; y < z.H; y++) for (let x = 0; x < z.W; x++) {
    const i = z.idx(x, y);
    if (id[i] >= 0 || z.floorAt(x, y)?.water !== 'deep') continue;
    const k = tiles.length, list: [number, number][] = [];
    const st: [number, number][] = [[x, y]]; id[i] = k;
    while (st.length) {
      const [cx, cy] = st.pop()!;
      list.push([cx, cy]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (!z.inb(nx, ny)) continue;
        const j = z.idx(nx, ny);
        if (id[j] >= 0 || z.floorAt(nx, ny)?.water !== 'deep') continue;
        id[j] = k; st.push([nx, ny]);
      }
    }
    tiles.push(list);
  }
  P = { id, tiles };
  POOLS.set(z.key, P);
  return P;
}
const poolAt = (z: Zone, x: number, y: number) => (z.inb(Math.floor(x), Math.floor(y)) ? pools(z).id[z.idx(Math.floor(x), Math.floor(y))] : -1);

// ---------------------------------------------------------------- brain (host)
function thinkLifeguard(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey);
  const n = net(c);
  const m = c.mem;
  const cs = G.creatures;
  m.persistent = true;
  const myPool = poolAt(z, c.x, c.z);
  // stranded (pushed out of the water somehow): slip back into the nearest deep tile
  if (myPool < 0) {
    const P = pools(z);
    let best: [number, number] | null = null, bd = 1e9;
    for (const list of P.tiles) for (const [x, y] of list) { const d = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.z); if (d < bd) { bd = d; best = [x, y]; } }
    if (best) { c.x = best[0] + 0.5; c.z = best[1] + 0.5; } else cs.remove(c);
    return true;
  }
  // damage taken? let go and dive away
  if (m.hp !== undefined && c.hp < m.hp) { release(c, n); c.setState('flee'); c.goal = cs.wanderSpot(c, z, 8); }
  m.hp = c.hp;
  // whistle at anyone entering deep water nearby
  const swimmers: Player[] = [];
  m.wet = m.wet || {};
  for (const p of playersIn(c.zoneKey)) {
    const inDeep = poolAt(z, p.x, p.z) >= 0;
    const mine = poolAt(z, p.x, p.z) === myPool;
    if (inDeep && !m.wet[p.id] && dist(p, c) < 40 && (m.whistleT ?? 0) < G.time) { m.whistleT = G.time + 12; fx(c, 'lifeguard_whistle', { r: 60 }); }
    m.wet[p.id] = inDeep;
    if (mine) swimmers.push(p);
  }
  // pending grab resolves after the reach
  if (m.grabPending && c.attackPhase <= 0) {
    const p = G.players.get(m.grabPending);
    m.grabPending = null;
    if (p && dist(p, c) < 1.8 && poolAt(z, p.x, p.z) === myPool) { m.grab = p.id; m.grabEnd = G.time + rng.float(2.0, 2.8); n.g = p.id; fx(c, 'lifeguard_splash', { r: 30 }); }
  }
  if (m.grab) {
    const p = G.players.get(m.grab);
    if (!p || p.body.dead || G.time > m.grabEnd || poolAt(z, p.x, p.z) !== myPool) { release(c, n); c.setState('flee'); c.goal = cs.wanderSpot(c, z, 6); return true; }
    c.setState('attack');
    hold(c);
    c.x += (p.x - c.x) * Math.min(1, dt * 5); c.z += (p.z - c.z) * Math.min(1, dt * 5);
    face(c, p.x, p.z);
    return true;
  }
  if (c.state === 'flee') {
    if (!c.goal || moveInWater(c, z, c.goal.x, c.goal.z, c.sp.walk * 1.5, dt, myPool) || c.stateT > 4) c.setState('wander');
    return true;
  }
  // hunt the nearest swimmer in its pool
  let tgt: Player | null = null, td = 1e9;
  for (const p of swimmers) { const d = dist(p, c); if (d < td) { td = d; tgt = p; } }
  if (tgt) {
    c.setState('chase');
    c.targetId = tgt.id;
    const reach = c.sp.attack!.range + tgt.radius;
    if (td <= reach && c.attackT <= 0) { cs.startAttack(c, tgt); m.grabPending = tgt.id; return true; }
    moveInWater(c, z, tgt.x, tgt.z, td > 6 ? c.sp.run : c.sp.run * 0.8, dt, myPool, reach * 0.6);
    return true;
  }
  // someone at the edge, out of reach: it waits for them, just under the surface
  const near = playersIn(c.zoneKey).filter((p) => dist(p, c) < 9).sort((a, b) => dist(a, c) - dist(b, c))[0];
  if (near) {
    c.setState('watch');
    const P = pools(z).tiles[myPool];
    let best: [number, number] | null = null, bd = 1e9;
    for (const [x, y] of P) { const d = Math.hypot(x + 0.5 - near.x, y + 0.5 - near.z); if (d < bd) { bd = d; best = [x, y]; } }
    if (best && moveInWater(c, z, best[0] + 0.5, best[1] + 0.5, c.sp.walk, dt, myPool, 0.4)) face(c, near.x, near.z);
    return true;
  }
  // drifting along the bottom
  if (c.state !== 'wander' || !c.goal) { c.setState('wander'); c.goal = cs.wanderSpot(c, z, 8); }
  if (moveInWater(c, z, c.goal!.x, c.goal!.z, c.sp.walk * 0.6, dt, myPool, 0.6) || c.stateT > 18) c.goal = cs.wanderSpot(c, z, 8);
  m.bubT = (m.bubT ?? rng.float(4, 10)) - dt;
  if (m.bubT <= 0) { m.bubT = rng.float(8, 16); fx(c, 'lifeguard_bubbles', { v: 0.7, r: 16 }); }
  return true;
}
function release(c: Creature, n: Record<string, any>) { c.mem.grab = null; c.mem.grabPending = null; n.g = null; }
/** moveTo, but it never lets itself leave its pool */
function moveInWater(c: Creature, z: Zone, gx: number, gz: number, speed: number, dt: number, pool: number, stop = 0.5): boolean {
  const done = G.creatures.moveTo(c, z, gx, gz, speed, dt, stop);
  const nx = c.x + c.vx * Math.max(dt, 0.12), nz = c.z + c.vz * Math.max(dt, 0.12);
  if (poolAt(z, nx, nz) !== pool) {
    // slide along the edge instead of climbing out
    if (poolAt(z, nx, c.z) === pool) c.vz = 0;
    else if (poolAt(z, c.x, nz) === pool) c.vx = 0;
    else { c.vx = 0; c.vz = 0; c.speed = 0; return true; }
  }
  return done;
}

const S = def({
  key: 'lifeguard', name: 'The Lifeguard', code: 'E-14 // NATATOR', temperament: 'ambush', threat: 4,
  rule: { name: 'DEEP WATER ONLY', text: 'It cannot leave deep water. When the whistle blows, get to the shallows or the edge.' },
  hp: 70, walk: 1.0, run: 3.0, turn: 6, radius: 0.45, height: 1.2, sight: 22, fov: 3.1, hearing: 2.0, nightVision: true,
  attack: { dmg: [5, 9], range: 0.9, cooldown: 3.2, kinds: ['bruise', 'scratch'], corrupt: 0.05, knock: 0, grab: true, parts: ['shin_l', 'shin_r', 'foot_l', 'foot_r', 'thigh_l', 'thigh_r'] },
  zones: ['pools'], weight: 2, maxPerZone: 3, diet: 'meat',
  flags: { swimmer: true },
  sounds: snd({ attack: 'lifeguard_splash', hurt: 'lifeguard_splash', death: 'lifeguard_sink' }),
  scan: {
    cls: 'Aquatic ambusher / deep water only',
    notes: [
      'A shadow under the deep end and a red float that drifts against the current. It cannot leave deep water.',
      'It blows a whistle when someone enters deep water. That is your warning: get out.',
      'Swims faster than you, grabs your legs and pulls you under. Strike it to make it let go; shallow water and the edge are safe.',
      'Throw something noisy in to draw it away, or cross where the water is shallow.',
    ],
  },
  gore: { blood: 'pale', sever: ['armL', 'armR', 'foreL', 'foreR'], head: 'head' },
  build: buildLifeguard,
  animate: animateLifeguard,
  think: thinkLifeguard,
});
// gallery: in play it is only a shadow until it reaches for someone; here it is lifted
// clear of the floor (no water to hide it) and cycles surfacing / holding on / drifting / dead
S.animateGallery = galleryDriver('lifeguard', ['attack', 'grab', 'idle', 'dead'], animateLifeguard, (pose, fc, t) => {
  fc.state = pose === 'idle' ? 'wander' : pose === 'dead' ? 'dead' : 'attack';
  fc.dead = pose === 'dead';
  fc.attackPhase = pose === 'attack' ? 0.2 : 0;
  fc.mem.netMem = { g: pose === 'grab' ? 'x' : null };
  void t;
});
const _galleryAnim = S.animateGallery;
S.animateGallery = (rig: Rig, t: number) => {
  _galleryAnim!(rig, t);
  rig.body.rotation.z = 0; rig.body.position.y = 0;
  rig.parts.bodyG.position.y += 0.95;
  for (const n of ['shadow', 'ripple0', 'ripple1', 'ripple2']) rig.parts[n].visible = false;
};

// ---------------------------------------------------------------- spawning
// The engine's spawn search (Zone.randomFloor) skips deep-water tiles, so
// swimmers can never be placed by the manager. Until that changes, keep each
// zone that lists 'lifeguard' in its spawn table stocked from here (host only).
const nextTry = new Map<string, number>();
function stockLifeguards() {
  if (!live() || !G.creatures || G.role === 'client' || G.paused) return;
  const zones = new Set<string>();
  for (const p of G.players.values()) zones.add(p.zoneKey);
  for (const zk of zones) {
    const z = G.zones.get(zk);
    if (!z) continue;
    const w = z.spawnTable.find(([k]) => k === 'lifeguard')?.[1] ?? 0;
    if (w <= 0 || (G.sandbox.creatures ?? 1) <= 0) continue;
    let have = 0;
    for (const o of G.creatures.creatures.values() as Iterable<Creature>) if (o.zoneKey === zk && o.sp.key === 'lifeguard' && !o.dead) have++;
    const want = Math.min(S.maxPerZone ?? 3, Math.max(1, Math.round(w * 0.75 * G.sandbox.creatures)));
    if (have >= want || (nextTry.get(zk) ?? 0) > G.time) continue;
    nextTry.set(zk, G.time + (have === 0 ? 4 : 90));
    const P = pools(z);
    const big = P.tiles.filter((l) => l.length >= 10);
    if (!big.length) continue;
    for (let t = 0; t < 30; t++) {
      const pool = rng.pick(big);
      const [x, y] = rng.pick(pool);
      const px = x + 0.5, pz = y + 0.5;
      if (playersIn(zk).some((p) => Math.hypot(p.x - px, p.z - pz) < 16)) continue;
      if (seenByAny(z, px, pz, 40)) continue;
      G.creatures.spawn('lifeguard', zk, px, pz);
      break;
    }
  }
}
if (typeof window !== 'undefined') setInterval(() => { try { stockLifeguards(); } catch (e) { console.warn('lifeguard stock', e); } }, 3000);
