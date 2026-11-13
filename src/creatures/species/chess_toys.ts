// The Board's other natives (round 16): not marble statues like the Rook, the
// Knight and the Bishop but the things that came in the same cupboard as the
// set. Old toy-box chess: turned boxwood worn smooth by hands, walnut veneer,
// green baize glued under every piece, lead in the feet, a tournament clock
// with two cream dials and little red flags. Each one moves by a rule of the
// game and the board's clock, like the pieces, and each one can be learned.
//
// FLAGFALL: a twin-dial tournament clock the size of a sideboard, walking on four
// turned spindle legs with felt pads. It moves like a KING (one square, any way,
// on its tick) and keeps YOUR time: stand on any square touching it and it
// presses its button, your dial starts and the hand climbs to the little red
// flag. Two squares away the hand stops. When the flag falls it slams down on
// everything round it. Strike its button (hit it) and the whole Board waits a move.
//
// BOXWOOD PAWNS: a rank of worn wooden pawns with peeling green felt and a lead
// slug in the foot, faces cut into the knobs with a penknife. They step one
// square FORWARD (toward the Gallery) when they move, never back, and can only
// take on the two squares diagonally in front of them: straight in front of one
// you are safe, and it cannot get past you. One that reaches the last rank is
// crowned, and moves like a queen from then on.
//
// FOLDING BOARD: the box the set lives in, a hinged walnut board lined with baize
// and piece-shaped hollows, closed like a clam. It moves exactly TWO squares in a
// straight line (like a king castling), by opening onto the next square and
// hauling itself over: both squares light, and it bites down on each in turn.
// A hard enough blow turns it on its back for a while.
import * as THREE from 'three';
import { horrify } from '../kit/horror';
import { def, newRig, Rig } from '../species';
import { G } from '../../game/G';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import type { Zone } from '../../world/zone';
import { Page, V3, bpart, registerPage, applyLook, galleryDriver, lerp, damp, ramp } from '../kit/beasts';
import { rot, lathe, obox, eye, flat, marker, placeMarker, boardOf, sqOf, sqCenter, sqFree, hitPlayer, playersNear, surface, type Board } from '../kit/oddkit';
import { net, netOf, snd, playersIn, dist, hold, face, hashId, rng, fx, fxPoll, playAt, live, localIn, thinkOnce } from '../behaviors_b';
import { pulse } from '../behaviors_a';
import { ruleShown } from '../rules';
import { defDread } from '../dread';
import { shake } from '../../gfx/juice';
import { mixHex } from '../../gfx/pixel';
import { PERIOD, boardHeld } from './chess';
import { bus } from '../../core/events';
import '../../audio/sounds_creatures_d';

// =====================================================================================
// the toy box page: boxwood (v0) or ebonised (v1), walnut veneer, cream dials, baize
// =====================================================================================
const PG = registerPage(new Page('c_chesstoy', 128, 128, [
  ['WOOD', 48, 40], ['WALNUT', 48, 32], ['DIAL', 32, 32], ['SQUARES', 32, 32], ['FELT', 32, 16], ['GEAR', 32, 12],
  ['CHROME', 16, 16], ['BRASS', 16, 16], ['MOUTH', 16, 16], ['LEAD', 12, 12], ['CUT', 12, 12], ['EYE', 8, 8], ['TOOTH', 8, 8], ['FLAG', 8, 8], ['HAND', 8, 8],
], 2));
PG.paint((P, v) => {
  {
    // turned boxwood, worn honey-smooth (or ebonised black with the pale wood showing at the knocks)
    const r = P.R('WOOD');
    const base = v ? 0x2e2422 : 0xd6a464;
    P.fill(r, ramp(base, 7, mixHex(base, 0x000000, 0.5), 0.3), (u, vv, x, y) => 2.2 + vv * 1.4 + Math.sin(y * 1.9 + P.n(r, x, y, 2, 1, 5) * 4) * 0.55 + (P.n(r, x, y, 4, 2, 7) - 0.5) * 1.1, 0.5);
    // the lathe's rings, the hand-polish on the high spots, the nicks and a child's tooth marks
    for (let y = 2; y < r.h; y += 5 + (y % 3)) for (let x = 0; x < r.w; x++) P.blend(r, x, y, v ? 0x5a4436 : 0x9a6a38, 0.35);
    for (let i = 0; i < 14; i++) P.walk(r, P.rng.int(0, r.w - 1), P.rng.int(0, r.h - 1), P.rng.int(2, 5), P.rng.float(-1, 1), P.rng.float(-0.4, 0.4), v ? 0xb48858 : 0x6a4020, 0.6, 0.3);
    for (let y = 0; y < r.h; y += 4) P.glint(r, (y * 11) % r.w, y, 4, 0xfff4e0, v ? 0.35 : 0.45);
  }
  {
    // walnut veneer: figured grain, varnish gone amber, a ring where a cup stood
    const r = P.R('WALNUT');
    const base = v ? 0x4a2418 : 0x6e4428;
    P.fill(r, ramp(base, 7, mixHex(base, 0x000000, 0.55), 0.35), (u, vv, x, y) => 2.4 + Math.sin(x * 0.42 + P.n(r, x, y, 3, 2, 9) * 6) * 0.9 + (P.n(r, x, y, 5, 2, 3) - 0.5) * 0.8, 0.5);
    for (let i = 0; i < 6; i++) P.walk(r, P.rng.int(0, r.w - 1), 0, r.h, P.rng.float(-0.3, 0.3), 1, mixHex(base, 0x000000, 0.45), 0.5, 0.5);
    for (let y = 1; y < r.h; y += 6) P.glint(r, (y * 7) % r.w, y, 6, 0xffe8c0, 0.35);
    P.spot(r, r.w * 0.7, r.h * 0.4, 5, 4, mixHex(base, 0xe8d0a0, 0.3), 0.25);
  }
  {
    // a clock dial: aged cream face, the minute track, fat hour batons, a red zone before twelve
    const r = P.R('DIAL');
    const cx = r.w / 2, cy = r.h / 2, R0 = r.w / 2 - 0.5;
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy) / R0;
      let c = d > 1 ? (v ? 0x4a2418 : 0x6e4428) : mixHex(0xf2e6c4, 0xd8c08a, Math.min(1, d * 0.5 + P.n(r, x, y, 3, 2, 11) * 0.35));
      const a = (Math.atan2(dx, -dy) / (Math.PI * 2) + 1) % 1;
      if (d < 0.97 && d > 0.83 && Math.abs((a * 60) % 1 - 0.5) > 0.38) c = 0x2a2420;
      if (d < 0.97 && d > 0.66 && Math.abs((a * 12) % 1 - 0.5) > 0.46) c = 0x1a1414;
      if (d < 0.8 && d > 0.6 && a > 0.88) c = mixHex(c, 0xb82018, 0.55);
      if (d < 0.08) c = 0x1a1414;
      P.set(r, x, y, c);
    }
    P.glint(r, Math.round(r.w * 0.28), Math.round(r.h * 0.22), 5, 0xffffff, 0.5);
  }
  {
    // the board on the outside of the case: inlaid squares in a walnut border
    const r = P.R('SQUARES');
    const lt = v ? 0xc8a878 : 0xe0c08a, dk = v ? 0x3a2418 : 0x5a3420;
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const bx = x < 2 || y < 2 || x >= r.w - 2 || y >= r.h - 2;
      const q = Math.floor((x - 2) / 7) + Math.floor((y - 2) / 7);
      const c = bx ? (v ? 0x4a2418 : 0x6e4428) : q % 2 ? dk : lt;
      P.set(r, x, y, mixHex(c, 0x000000, P.n(r, x, y, 4, 2, 13) * 0.18));
    }
  }
  {
    // green baize: fuzz, glue stains, bald patches
    const r = P.R('FELT');
    P.fill(r, ramp(0x2e6a3a, 6, 0x123018, 0.25), (u, vv, x, y) => 2.3 + (P.n(r, x, y, 6, 2, 17) - 0.5) * 2 + (((x * 7 + y * 13) % 5) === 0 ? 0.7 : 0), 0.7);
    P.spot(r, r.w * 0.3, r.h * 0.5, 4, 3, 0xb89a5a, 0.35);
  }
  {
    // brass clockwork teeth
    const r = P.R('GEAR');
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const tooth = (x % 4) < 2 || y > r.h * 0.45; P.set(r, x, y, tooth ? mixHex(0xc8a048, 0x6a4a18, y / r.h * 0.6) : 0x1a1008); }
  }
  flat(P, P.R('CHROME'), 0xc8ccd0, 0.04);
  { const r = P.R('CHROME'); for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if ((x + y) % 7 < 2) P.blend(r, x, y, 0xffffff, 0.45); }
  flat(P, P.R('BRASS'), 0xc8a048, 0.08);
  flat(P, P.R('LEAD'), 0x6a6e74, 0.12);
  flat(P, P.R('TOOTH'), 0xf0e6d0, 0.1);
  flat(P, P.R('FLAG'), 0xc02018, 0.05);
  flat(P, P.R('HAND'), 0x141010, 0.02);
  { const r = P.R('MOUTH'); for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const d = Math.hypot(x + 0.5 - r.w / 2, y + 0.5 - r.h / 2) / (r.w / 2); P.set(r, x, y, d < 0.5 ? 0x1a0408 : d < 0.8 ? 0x4a0c10 : 0x7a1c20); } }
  eye(P, P.R('EYE'), v ? 0xffc040 : 0xf0e8d0, { pupil: 0x080404, sclera: v ? 0x301804 : 0x2a1a10 });
  P.cut(P.R('CUT'), v ? 0x2e2422 : 0xd6a464, { meat: v ? 0x5a4436 : 0xe8c48a, bone: v ? 0x7a6050 : 0xf4dcae, marrow: 0x6a4020, fat: v ? 0x4a3a30 : 0xd8b07a });
});

// =====================================================================================
// shared board helpers
// =====================================================================================
function target(c: Creature): Player | null {
  let best: Player | null = null, bd = 30;
  for (const p of playersIn(c.zoneKey)) { const d = dist(p, c); if (d < bd) { bd = d; best = p; } }
  return best;
}
/** squares between two squares, in king steps */
const cheb = (a: [number, number], b: [number, number]) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
/** is any unit standing on square (i, j) */
function playerOn(c: Creature, b: Board, i: number, j: number): Player | null {
  for (const p of playersIn(c.zoneKey)) { const [pi, pj] = sqOf(b, p.x, p.z); if (pi === i && pj === j) return p; }
  return null;
}
/** the nearest free square to where it was set down */
function settle(c: Creature, z: Zone, b: Board, rows?: [number, number]) {
  const [i0, j0] = sqOf(b, c.x, c.z);
  if (rows) {
    // pawns start on their own ranks
    for (let k = 0; k < 30; k++) { const i = rng.int(0, Math.min(7, b.n - 1)), j = rng.int(rows[0], rows[1]); if (sqFree(z, b, i, j) && !playerOn(c, b, i, j)) { [c.x, c.z] = sqCenter(b, i, j); return; } }
  }
  for (let r = 0; r <= 10; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
    if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
    if (sqFree(z, b, i0 + di, j0 + dj)) { [c.x, c.z] = sqCenter(b, i0 + di, j0 + dj); return; }
  }
}
/** the board's knock for this piece (each kind on its own beat, after the marble pieces) */
const tickOf = (off: number) => Math.floor((G.time + PERIOD * off) / PERIOD);
const ease = (u: number) => u * u * (3 - 2 * u);
/** board-scale and the red landing squares (one or two) */
function boardLook(rig: Rig, c: Creature, t: number, dt: number) {
  const n = netOf(c), ud = rig.root.userData as Record<string, any>;
  const cell = n.cell ?? 2;
  if (ud.bs !== cell) { ud.bs = cell; rig.body.scale.setScalar((ud.size ?? 1) * Math.max(1, Math.min(1.8, cell / 2.4))); }
  for (const [slot, key] of [['to', 'mk'], ['to2', 'mk2']] as const) {
    const mk = marker(rig, slot, 0xc8501e);
    const on = !!n[key] && !c.dead;
    ud[slot + 'A'] = lerp(ud[slot + 'A'] ?? 0, on ? 0.42 + (Math.sin(t * 9) > 0.6 ? 0.12 : 0) + Math.sin(t * 2.3) * 0.05 : 0, damp(on ? 12 : 4, dt));
    if (n[key]) ud[slot + 'At'] = n[key];
    if (ud[slot + 'At']) placeMarker(mk, rig, c, ud[slot + 'At'][0], ud[slot + 'At'][1], cell * 0.94, ud[slot + 'A']);
  }
  return n;
}
function crushedNear(c: Creature, x: number, z: number, r: number, dmg: [number, number], knock: number, parts?: string[]) {
  const v = playersNear(c, x, z, r);
  for (const p of v) hitPlayer(c, p, rng.float(dmg[0], dmg[1]), ['fracture', 'bruise', 'deep'], knock, parts);
  return v;
}
function shakeNear(c: Creature, k: number) {
  const p = live() ? G.local : null;
  if (p && p.zoneKey === c.zoneKey) { const d = dist(p, c); if (d < 10) shake((1 - d / 10) * k, 0.35); }
}

// =====================================================================================
// FLAGFALL — the tournament clock
// =====================================================================================
const FLAG_T = 6.5;
function thinkClock(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey), m = c.mem, n = net(c), b = boardOf(z), ev = pulse(c);
  hold(c);
  if (!m.init) { m.init = 1; settle(c, z, b); m.ph = 'wait'; m.tick = tickOf(0.75); n.cell = b.cell; n.clk = 0; }
  const p = target(c);
  const me = sqOf(b, c.x, c.z);
  const ps = p ? sqOf(b, p.x, p.z) : null;
  const near = !!ps && cheb(me, ps) <= 1;
  // its button struck: the board waits a move, and your hand drops back
  if (ev.hurt > 0 && (m.pressT ?? 0) < G.time) {
    m.pressT = G.time + 2.5;
    (z.meta as any).boardHold = G.time + PERIOD * 1.6;
    n.clk = Math.max(0, (n.clk ?? 0) - 0.5);
    fx(c, 'press');
    for (const q of playersIn(c.zoneKey)) if (dist(q, c) < b.cell * 3) { ruleShown(c); break; }
  }
  // your time: it runs while you stand next to it, stops when you step away, and slowly unwinds
  if (near && m.ph !== 'slam') { n.clk = Math.min(1, (n.clk ?? 0) + dt / FLAG_T); n.run = 1; }
  else { n.run = 0; if (!ps || cheb(me, ps) >= 3) n.clk = Math.max(0, (n.clk ?? 0) - dt / 25); }
  n.clk = +n.clk.toFixed(3);
  if (p) face(c, p.x, p.z);
  switch (m.ph) {
    case 'wait': {
      c.setState(near ? 'warn' : p ? 'watch' : 'idle');
      if (n.clk >= 1) { m.ph = 'slam'; m.sT = 0; fx(c, 'flag'); break; }
      const tk = tickOf(0.75);
      if (tk === m.tick) break;
      m.tick = tk;
      if (boardHeld(z)) break;
      // a king's step toward you (it wants to stand next to you, where your clock runs)
      if (!ps || near) break;
      let best: [number, number] | null = null, bd = cheb(me, ps) + 0.4;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const i = me[0] + di, j = me[1] + dj;
        if (!sqFree(z, b, i, j) || playerOn(c, b, i, j)) continue;
        const d = cheb([i, j], ps) + Math.hypot(i - ps[0], j - ps[1]) * 0.05 + rng.float(0, 0.1);
        if (d < bd) { bd = d; best = [i, j]; }
      }
      if (!best) break;
      const [tx, tz] = sqCenter(b, best[0], best[1]);
      m.to = [tx, tz]; m.ph = 'tele'; m.tT = 0;
      n.mk = [+tx.toFixed(2), +tz.toFixed(2)]; n.cell = b.cell;
      fx(c, 'tick');
      break;
    }
    case 'tele':
      c.setState('warn');
      m.tT += dt;
      if (m.tT > 0.7) { m.ph = 'move'; m.from = [c.x, c.z]; m.mT = 0; n.mv = 1; fx(c, 'step'); }
      break;
    case 'move': {
      c.setState('travel');
      m.mT += dt;
      const u = Math.min(1, m.mT / 0.95);
      c.x = lerp(m.from[0], m.to[0], ease(u)); c.z = lerp(m.from[1], m.to[1], ease(u));
      if (u >= 1) {
        n.mv = 0; n.mk = null;
        const v = crushedNear(c, c.x, c.z, b.cell * 0.55, [10, 18], 0.9);
        fx(c, v.length ? 'take' : 'land');
        m.ph = 'recover'; m.rT = 0;
      }
      break;
    }
    case 'slam': {
      // the flag falls: it rears on its legs and comes down on every square round it
      c.setState('attack');
      m.sT += dt;
      if (!m.hit && m.sT > 0.55) {
        m.hit = 1;
        const v = crushedNear(c, c.x, c.z, b.cell * 1.55, [22, 34], 1.5, ['torso_u', 'torso_l', 'head', 'uarm_l', 'uarm_r']);
        fx(c, 'slam');
        if (!v.length && p && dist(p, c) < b.cell * 2.6) ruleShown(c);
      }
      if (m.sT > 1.3) { m.hit = 0; n.clk = 0; m.ph = 'recover'; m.rT = 0; }
      break;
    }
    default:
      c.setState('idle');
      m.rT = (m.rT ?? 0) + dt;
      if (m.rT > 0.5) m.ph = 'wait';
  }
  return true;
}

const LEGS4 = [['FL', 1, 1], ['FR', -1, 1], ['BL', 1, -1], ['BR', -1, -1]] as const;
function buildClock(): Rig {
  const rig = newRig(1.9);
  const W = PG.reg('WALNUT'), WD = PG.reg('WOOD'), CH = PG.reg('CHROME'), BR = PG.reg('BRASS');
  const kase = bpart(rig, 'case', rig.body, [0, 0.98, 0], PG, 'ccase', (ob) => {
    obox(ob, [0, 0, 0], [1.24, 0.56, 0.46], W);
    obox(ob, [0, 0.3, 0], [1.12, 0.05, 0.4], W);
    obox(ob, [0, -0.285, 0], [1.2, 0.014, 0.44], PG.reg('FELT'));
    // the two dials behind their chrome bezels
    for (const s of [-1, 1]) {
      ob.quad([[s * 0.3 - 0.21, -0.19, 0.236], [s * 0.3 + 0.21, -0.19, 0.236], [s * 0.3 + 0.21, 0.23, 0.236], [s * 0.3 - 0.21, 0.23, 0.236]], PG.reg('DIAL'));
      ob.push().translate(s * 0.3, 0.02, 0.232).rotX(Math.PI / 2);
      lathe(ob, [[0, 0.214], [0.022, 0.222], [0.034, 0.205]], 18, CH, { start: null, end: null });
      ob.pop();
    }
    // the maker's plate, the winding keys on the back, the throat behind the jaw
    obox(ob, [0, -0.205, 0.238], [0.2, 0.05, 0.01], BR);
    for (const s of [-1, 1]) { ob.push().translate(s * 0.3, 0.02, -0.24).rotX(-Math.PI / 2); lathe(ob, [[0, 0.03], [0.05, 0.025], [0.06, 0.06], [0.08, 0.06]], 6, BR, { start: 'flat', end: 'flat' }); ob.pop(); }
    ob.quad([[-0.42, -0.27, 0.2], [0.42, -0.27, 0.2], [0.42, -0.14, 0.2], [-0.42, -0.14, 0.2]], PG.reg('MOUTH'), undefined, { emis: 0.25 });
    // clockwork in the throat: brass wheels with teeth
    for (const [x, r] of [[-0.24, 0.07], [0.02, 0.09], [0.26, 0.06]] as const) {
      ob.push().translate(x, -0.2, 0.16).rotX(Math.PI / 2);
      lathe(ob, [[0, r], [0.02, r]], 12, PG.reg('GEAR'), { start: 'flat', end: 'flat' });
      ob.pop();
      for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; ob.cone([x + Math.cos(a) * r, -0.2 + Math.sin(a) * r, 0.17], [Math.cos(a), Math.sin(a), 0], 0.012, 0.03, 3, PG.reg('TOOTH')); }
    }
    // the carrying handle
    const arc: V3[] = []; for (let k = 0; k <= 8; k++) { const a = Math.PI * (k / 8); arc.push([-Math.cos(a) * 0.24, 0.33 + Math.sin(a) * 0.17, -0.1]); }
    ob.tube(arc, arc.map(() => 0.018), 6, BR, { start: 'pole', end: 'pole' });
  });
  // the jaw: the lower front panel, hinged at the bottom, its top edge a row of teeth
  bpart(rig, 'jaw', kase, [0, -0.28, 0.23], PG, 'cjaw', (ob) => {
    obox(ob, [0, 0.075, 0.014], [0.92, 0.15, 0.026], W);
    for (let k = 0; k < 11; k++) ob.cone([-0.4 + k * 0.08, 0.15, 0.01], [0, 1, 0.1], 0.016, 0.05, 3, PG.reg('TOOTH'));
  });
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    // hands (the left one is yours) and the red flags at twelve
    bpart(rig, 'hand' + s, kase, [k * 0.3, 0.02, 0.246], PG, 'chand', (ob) => {
      obox(ob, [0, 0.085, 0.004], [0.02, 0.17, 0.006], PG.reg('HAND'));
      obox(ob, [0, -0.02, 0.004], [0.014, 0.04, 0.006], PG.reg('HAND'));
      ob.blob([0, 0, 0.008], [0.018, 0.018, 0.01], 6, 3, BR);
    });
    bpart(rig, 'hour' + s, kase, [k * 0.3, 0.02, 0.243], PG, 'chour', (ob) => obox(ob, [0, 0.05, 0.003], [0.026, 0.1, 0.005], PG.reg('HAND')));
    bpart(rig, 'flag' + s, kase, [k * 0.3 + 0.012, 0.21, 0.25], PG, 'cflag', (ob) => {
      obox(ob, [0.04, -0.016, 0.006], [0.08, 0.05, 0.006], PG.reg('FLAG'), { emis: 0.25 });
      obox(ob, [0.004, -0.012, 0.004], [0.006, 0.05, 0.006], PG.reg('HAND'));
    });
    // the plunger buttons on top
    bpart(rig, 'btn' + s, kase, [k * 0.36, 0.32, 0.02], PG, 'cbtn', (ob) => {
      lathe(ob, [[0, 0.045], [0.12, 0.04], [0.125, 0.075], [0.16, 0.078], [0.175, 0.06]], 12, CH, { start: 'flat', end: 'flat' });
    });
  }
  // four turned spindle legs, felt pads under the feet
  for (const [s, sx, sz] of LEGS4) {
    const th = bpart(rig, 'thigh' + s, kase, [sx * 0.5, -0.27, sz * 0.16], PG, 'cthigh', (ob) => {
      lathe(ob, [[-0.36, 0.042], [-0.31, 0.06], [-0.24, 0.036], [-0.15, 0.052], [-0.07, 0.034], [-0.02, 0.058], [0, 0.05]], 10, WD, { start: 'flat', end: 'flat' });
      ob.blob([0, -0.36, 0], [0.055, 0.055, 0.055], 8, 5, WD);
    });
    bpart(rig, 'shin' + s, th, [0, -0.36, 0], PG, 'cshin', (ob) => {
      lathe(ob, [[-0.35, 0.075], [-0.33, 0.08], [-0.3, 0.052], [-0.22, 0.034], [-0.12, 0.046], [-0.04, 0.03], [0, 0.04]], 10, WD, { start: 'flat', end: 'flat' });
      lathe(ob, [[-0.366, 0.07], [-0.352, 0.074]], 10, PG.reg('FELT'), { start: 'flat', end: null });
    });
  }
  surface(rig, 'lacquer');
  return rig;
}

function animateClock(rig: Rig, c: Creature, t: number, dt: number) {
  applyLook(rig, c, PG, 0.03);
  const ud = rig.root.userData as Record<string, any>;
  const n = boardLook(rig, c, t, dt);
  const seed = hashId(c.id);
  const ev = fxPoll(rig, c);
  if (ev) {
    const k = ev.key;
    if (k === 'tick') { playAt('chess_tick', c, 0.6, 24); playAt('tc_tick', c, 0.5, 18, 0.8); }
    else if (k === 'step') { playAt('dmg_hit_wood', c, 0.4, 16, 1.2); ud.scut = 1; }
    else if (k === 'land' || k === 'take') { playAt(k === 'take' ? 'chess_take' : 'wood_hit', c, 0.8, 22); shakeNear(c, k === 'take' ? 0.5 : 0.2); }
    else if (k === 'flag') { playAt('school_bell', c, 0.5, 30, 1.6); playAt('tc_ratchet', c, 0.8, 20); ud.flagT = t; }
    else if (k === 'slam') { playAt('vx_slam', c, 1, 30); playAt('chess_take', c, 0.9, 24); shakeNear(c, 0.8); ud.slamT = t; }
    else if (k === 'press') { playAt('tc_clack', c, 1, 20); playAt('chess_grind', c, 0.6, 18); ud.pressT = t; const p = localIn(c); if (p && dist(p, c) < 14) bus.emit('think', p, 'I hit its button. The whole board stopped. It is the board\'s move now, and it is waiting.'); }
  }
  // the scuttle: diagonal pairs of spindle legs, a fast wooden patter
  const mv = n.mv ? 1 : 0;
  ud.mvK = lerp(ud.mvK ?? 0, mv, damp(10, dt));
  ud.ph = (ud.ph ?? 0) + dt * (4 + 14 * ud.mvK);
  const run = n.run ? 1 : 0;
  ud.run = lerp(ud.run ?? 0, run, damp(5, dt));
  // each second while your clock runs it jerks, like the escapement
  const secJerk = ud.run * Math.max(0, 1 - ((t * 2) % 1) * 8) * 0.03;
  // the flag-fall slam: up on its toes, then down hard
  const st = t - (ud.slamT ?? -9), ft = t - (ud.flagT ?? -9);
  const rear = ft >= 0 && ft < 0.6 ? Math.sin((ft / 0.6) * Math.PI * 0.5) : 0;
  const slam = st >= 0 && st < 0.5 ? Math.max(0, 1 - st / 0.5) : 0;
  const bob = Math.abs(Math.sin(ud.ph)) * 0.05 * ud.mvK;
  rot(rig, 'case', -0.05 * ud.run - 0.35 * rear + 0.12 * slam + Math.sin(t * 40) * secJerk, Math.sin(t * 0.6 + seed) * 0.03, Math.sin(ud.ph) * 0.05 * ud.mvK);
  const kase = rig.parts.case;
  if (kase) kase.position.y = 0.98 + bob + 0.28 * rear - 0.12 * slam - (c.dead ? 0.55 : 0);
  for (const [s, sx, sz] of LEGS4) {
    const diag = (sx * sz > 0 ? 0 : Math.PI);
    const sw = Math.sin(ud.ph + diag);
    const lift = Math.max(0, sw) * ud.mvK;
    // splayed like a table's legs; a stamp on the slam; buckled when dead
    const splay = sx * (0.2 + 0.25 * slam + (c.dead ? 0.7 : 0));
    rot(rig, 'thigh' + s, -sz * (0.12 + 0.35 * rear) + sw * 0.45 * ud.mvK, 0, splay);
    rot(rig, 'shin' + s, sz * (0.08 + 0.4 * rear) + lift * 0.7 - (c.dead ? 0.8 : 0), 0, -splay * 0.8);
  }
  // your hand climbs to twelve; the board's hand creeps; flags lift as the hands reach them, and drop
  const clk = c.dead ? (ud.clkV ?? 0) + dt * 2 : Math.max(0, Math.min(1, n.clk ?? 0));
  ud.clkV = c.dead ? clk : lerp(ud.clkV ?? clk, clk, damp(6, dt));
  rot(rig, 'handL', 0, 0, -ud.clkV * Math.PI * 2);
  rot(rig, 'hourL', 0, 0, -ud.clkV * Math.PI * 2 / 12 - 2.1);
  ud.board = (ud.board ?? seed * 6) + dt * 0.02;
  rot(rig, 'handR', 0, 0, -ud.board);
  rot(rig, 'hourR', 0, 0, -ud.board / 12 - 1.2);
  const fallen = ft >= 0 && ft < 2.5;
  const lift = fallen ? Math.max(0, 1 - ft * 4) * 0.9 - Math.min(1, ft * 4) * 1.4 : Math.max(0, (ud.clkV - 0.88) / 0.12) * 0.9;
  rot(rig, 'flagL', 0, 0, lift + (fallen ? Math.sin(ft * 14) * 0.2 * Math.max(0, 1 - ft) : 0));
  rot(rig, 'flagR', 0, 0, -0.1);
  // buttons: yours held down while it keeps your time; both hammered on the slam; struck when you hit it
  const pt = t - (ud.pressT ?? -9), pr = pt >= 0 && pt < 0.4 ? 1 - pt / 0.4 : 0;
  const bl = rig.parts.btnL, br = rig.parts.btnR;
  if (bl) bl.position.y = 0.32 - 0.07 * Math.max(ud.run, slam, pr);
  if (br) br.position.y = 0.32 - 0.07 * Math.max(slam, pr * 0.5) + 0.02 * secJerk / 0.03;
  // the jaw falls open on the gears as the flag nears, and wide on the slam
  rot(rig, 'jaw', Math.max(ud.clkV > 0.6 ? (ud.clkV - 0.6) * 1.6 : 0, rear * 1.1, slam * 1.2, c.attackPhase > 0 ? 0.9 : 0, c.dead ? 1.3 : 0) + Math.sin(t * 30) * 0.03 * ud.run, 0, 0);
  // the tick of it, near enough to hear
  if (!c.dead && ud.run > 0.5 && live() && (ud.tkT ?? 0) < t) { ud.tkT = t + 0.5; playAt(Math.floor(t * 2) % 2 ? 'vx_tick' : 'vx_tock', c, 0.35, 12, 1.4); }
  const p = localIn(c);
  if (p && !c.dead) {
    const d = dist(p, c);
    if (n.run && d < 10) thinkOnce(p, 'clock_run', 'It pressed its button the moment I stepped next to it. My dial is running. The hand is climbing to the red flag.', 40);
    else if (d < 18) thinkOnce(p, 'clock', ['A chess clock. On legs. Walking like an old dog.', 'Two dials and two little red flags. One of them is mine.'][Math.floor(t * 0.1) % 2], 90);
  }
}

// =====================================================================================
// BOXWOOD PAWNS
// =====================================================================================
type Mv = { i: number; j: number; cap: boolean; two?: boolean };
function lines(z: Zone, b: Board, i: number, j: number, dirs: number[][]): Mv[] {
  const out: Mv[] = [];
  for (const [di, dj] of dirs) for (let k = 1; k <= 7; k++) { if (!sqFree(z, b, i + di * k, j + dj * k)) break; out.push({ i: i + di * k, j: j + dj * k, cap: false }); }
  return out;
}
const QUEEN = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
function pawnMove(c: Creature, z: Zone, b: Board, i: number, j: number, p: Player | null): Mv | null {
  const m = c.mem, n = net(c);
  const ps = p ? sqOf(b, p.x, p.z) : null;
  if (n.crown) {
    // crowned: a queen's lines; it takes you if you are on one, else it lines itself up with you
    const all = lines(z, b, i, j, QUEEN);
    if (!all.length) return null;
    if (!ps) return rng.chance(0.3) ? rng.pick(all.filter((q) => Math.max(Math.abs(q.i - i), Math.abs(q.j - j)) <= 2)) ?? null : null;
    const take = all.find((q) => q.i === ps[0] && q.j === ps[1]);
    if (take) return { ...take, cap: true };
    let best: Mv | null = null, bd = Infinity;
    for (const q of all) {
      const on = q.i === ps[0] || q.j === ps[1] || Math.abs(q.i - ps[0]) === Math.abs(q.j - ps[1]);
      const d = Math.hypot(q.i - ps[0], q.j - ps[1]) + (on ? 0 : 5) + rng.float(0, 0.3);
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }
  const f = 1; // forward: toward the Gallery
  // it takes on the slant, never straight ahead
  if (ps && ps[1] === j + f && Math.abs(ps[0] - i) === 1 && sqFree(z, b, ps[0], ps[1])) return { i: ps[0], j: ps[1], cap: true };
  // blocked by a unit (or anything) straight in front: it waits
  if (!sqFree(z, b, i, j + f) || playerOn(c, b, i, j + f)) { n.blk = playerOn(c, b, i, j + f) ? 1 : 0; return null; }
  n.blk = 0;
  // pawns are slow: not every tick (but always when a unit is close ahead)
  const keen = !!ps && ps[1] > j && Math.abs(ps[0] - i) <= 2 && ps[1] - j <= 3;
  if (!keen && !rng.chance(0.45)) return null;
  // its first move may be two squares
  if (m.j0 === j && sqFree(z, b, i, j + 2 * f) && !playerOn(c, b, i, j + 2 * f) && rng.chance(0.6)) return { i, j: j + 2 * f, cap: false, two: true };
  return { i, j: j + f, cap: false };
}
function thinkPawn(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey), m = c.mem, n = net(c), b = boardOf(z);
  pulse(c); hold(c);
  if (!m.init) {
    m.init = 1;
    if (!n.crown) settle(c, z, b, [1, 2]); else settle(c, z, b);
    m.j0 = sqOf(b, c.x, c.z)[1]; m.ph = 'wait'; m.tick = tickOf(0.6); n.cell = b.cell;
  }
  const p = target(c);
  const [i, j] = sqOf(b, c.x, c.z);
  // pawns always face forward; the crowned one turns to you
  if (!n.crown) c.targetFacing = Math.PI / 2; else if (p) face(c, p.x, p.z);
  switch (m.ph) {
    case 'wait': {
      c.setState(p ? 'watch' : 'idle');
      const tk = tickOf(0.6);
      if (tk === m.tick) break;
      m.tick = tk;
      if (boardHeld(z)) break;
      const mv = pawnMove(c, z, b, i, j, p);
      if (!mv) break;
      const [tx, tz] = sqCenter(b, mv.i, mv.j);
      m.to = [tx, tz]; m.cap = mv.cap; m.two = !!mv.two; m.ph = 'tele'; m.tT = 0;
      n.mk = [+tx.toFixed(2), +tz.toFixed(2)]; n.cell = b.cell;
      fx(c, 'tick');
      break;
    }
    case 'tele':
      c.setState('warn');
      m.tT += dt;
      if (m.tT > 0.8) { m.ph = 'move'; m.from = [c.x, c.z]; m.mT = 0; m.dur = n.crown ? Math.max(0.35, Math.hypot(m.to[0] - c.x, m.to[1] - c.z) / 9) : m.two ? 0.75 : 0.55; n.mv = 1; n.two = m.two ? 1 : 0; fx(c, n.crown ? 'slide' : 'hop'); }
      break;
    case 'move': {
      c.setState('travel');
      m.mT += dt;
      const u = Math.min(1, m.mT / m.dur);
      const e = n.crown ? ease(u) : u;
      c.x = lerp(m.from[0], m.to[0], e); c.z = lerp(m.from[1], m.to[1], e);
      n.air = +u.toFixed(2);
      if (u >= 1) {
        n.mv = 0; n.air = 0; n.mk = null;
        const v = crushedNear(c, c.x, c.z, b.cell * 0.6, n.crown ? [24, 36] : [14, 24], n.crown ? 1.4 : 1.0, n.crown ? undefined : ['shin_l', 'shin_r', 'thigh_l', 'thigh_r', 'foot_l', 'foot_r', 'torso_l']);
        fx(c, v.length ? 'take' : 'land');
        if (m.cap && !v.length && p && dist(p, c) < b.cell * 2.6) ruleShown(c);
        // the last rank: it is crowned
        if (!n.crown && sqOf(b, c.x, c.z)[1] >= Math.min(b.n, 8) - 1) {
          n.crown = 1; c.hp = Math.min(c.sp.hp * 2, c.hp + 80); fx(c, 'crown');
        }
        m.ph = 'recover'; m.rT = 0;
      }
      break;
    }
    default:
      c.setState('idle');
      m.rT = (m.rT ?? 0) + dt;
      if (m.rT > 0.4) m.ph = 'wait';
  }
  return true;
}
function buildPawn(): Rig {
  const rig = newRig(1.15);
  const WD = PG.reg('WOOD');
  const base = bpart(rig, 'base', rig.body, [0, 0, 0], PG, 'pbase', (ob) => {
    lathe(ob, [[0.004, 0.27], [0.03, 0.3], [0.07, 0.29], [0.1, 0.235], [0.13, 0.25], [0.16, 0.2]], 18, WD, { start: 'flat', end: 'flat' });
    // the felt pad glued under it (peeling at one side)
    lathe(ob, [[-0.004, 0.262], [0.006, 0.268]], 18, PG.reg('FELT'), { start: 'flat', end: null });
  });
  bpart(rig, 'flap', base, [0.17, 0.004, 0.17], PG, 'pflap', (ob) => {
    ob.quad([[-0.06, 0, -0.03], [0.05, 0, 0.06], [0.11, -0.004, 0.01], [0.02, -0.004, -0.08]], PG.reg('FELT'), undefined, { double: true });
  });
  const stem = bpart(rig, 'stem', base, [0, 0.16, 0], PG, 'pstem', (ob) => {
    lathe(ob, [[0, 0.2], [0.08, 0.155], [0.22, 0.112], [0.36, 0.1], [0.41, 0.125], [0.44, 0.2], [0.48, 0.21], [0.52, 0.15], [0.54, 0.12]], 16, WD, { start: null, end: 'flat' });
  });
  // the knob, split round the middle into a mouth: the lower half on the stem, the upper half hinged at the back
  bpart(rig, 'jaw', stem, [0, 0.53, 0], PG, 'pjaw', (ob) => {
    lathe(ob, [[0, 0.11], [0.05, 0.165], [0.11, 0.19]], 16, WD, { start: 'flat', end: null });
    ob.quad([[-0.17, 0.105, 0.08], [0.17, 0.105, 0.08], [0.17, 0.105, -0.08], [-0.17, 0.105, -0.08]], PG.reg('MOUTH'), undefined, { emis: 0.3 });
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; ob.cone([Math.cos(a) * 0.165, 0.105, Math.sin(a) * 0.165], [0, 1, 0], 0.016, 0.045, 3, PG.reg('TOOTH')); }
  });
  const head = bpart(rig, 'head', stem, [0, 0.64, -0.17], PG, 'phead', (ob) => {
    lathe(ob, [[0, 0.19], [0.07, 0.17], [0.13, 0.12], [0.175, 0.05], [0.185, 0]], 16, WD, { start: null, end: 'pole', cz: 0.17 });
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2 + 0.26; ob.cone([Math.cos(a) * 0.17, 0.0, 0.17 + Math.sin(a) * 0.17], [0, -1, 0], 0.016, 0.04, 3, PG.reg('TOOTH')); }
    // a face cut in with a penknife: two drilled eyes, a scored brow
    for (const s of [-1, 1]) {
      ob.blob([s * 0.065, 0.075, 0.17 + 0.155], [0.028, 0.026, 0.012], 6, 3, PG.reg('MOUTH'));
      ob.blob([s * 0.065, 0.075, 0.17 + 0.163], [0.012, 0.012, 0.006], 5, 3, PG.reg('EYE'), { emis: 0.85 });
    }
    obox(ob, [0, 0.12, 0.17 + 0.15], [0.12, 0.008, 0.01], PG.reg('MOUTH'));
  });
  // the crown it grows on the last rank
  bpart(rig, 'crown', head, [0, 0.165, 0.17], PG, 'pcrown', (ob) => {
    lathe(ob, [[-0.02, 0.15], [0.05, 0.16], [0.08, 0.15]], 14, PG.reg('BRASS'), { start: null, end: null });
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; ob.cone([Math.cos(a) * 0.15, 0.07, Math.sin(a) * 0.15], [Math.cos(a) * 0.15, 1, Math.sin(a) * 0.15], 0.045, 0.17, 4, PG.reg('BRASS')); ob.blob([Math.cos(a) * 0.175, 0.25, Math.sin(a) * 0.175], [0.022, 0.022, 0.022], 5, 3, PG.reg('TOOTH')); }
  });
  void head;
  surface(rig, 'lacquer');
  return rig;
}
function animatePawn(rig: Rig, c: Creature, t: number, dt: number) {
  applyLook(rig, c, PG, 0.05);
  const ud = rig.root.userData as Record<string, any>;
  const n = boardLook(rig, c, t, dt);
  const seed = hashId(c.id);
  const ev = fxPoll(rig, c);
  if (ev) {
    const k = ev.key;
    if (k === 'tick') playAt('chess_tick', c, 0.45, 22, 1.3);
    else if (k === 'hop') { playAt('dmg_hit_wood', c, 0.35, 14, 1.4); ud.squat = t; }
    else if (k === 'slide') playAt('chess_slide', c, 0.8, 22);
    else if (k === 'land' || k === 'take') { playAt(k === 'take' ? 'chess_take' : 'wood_hit', c, k === 'take' ? 1 : 0.6, 22, 1.2); ud.wob = 1; ud.wobS = Math.random() < 0.5 ? -1 : 1; if (k === 'take') { ud.bite = t; shakeNear(c, 0.5); } }
    else if (k === 'crown') { playAt('school_bell', c, 0.6, 30, 1.2); playAt('tc_ratchet', c, 0.7, 20, 0.8); ud.crownT = t; const p = localIn(c); if (p && dist(p, c) < 30) bus.emit('think', p, 'The pawn reached the end of the board. It is growing a crown. It is not a pawn any more.'); }
  }
  // the hop: a squat, a hop forward and up, a thunk and a wooden wobble that dies away
  if (n.mv && !n.crown) { const a = n.air ?? 0; if (a < (ud.air ?? 0) - 0.3) ud.air = a; ud.air = Math.min(1, Math.max(ud.air ?? 0, a) + dt / (n.two ? 0.75 : 0.55)); } else ud.air = 0;
  const u = ud.air as number;
  const h = n.two ? 0.75 : 0.45;
  const sq = t - (ud.squat ?? -9);
  const squat = sq >= 0 && sq < 0.12 ? Math.sin((sq / 0.12) * Math.PI) : 0;
  ud.wob = Math.max(0, (ud.wob ?? 0) - dt * 1.6);
  const wob = ud.wob * ud.wob;
  rig.body.position.y = n.mv && !n.crown ? h * 4 * u * (1 - u) : 0;
  const stretch = n.mv && !n.crown ? 0.12 * Math.sin(u * Math.PI) : 0;
  const base = rig.parts.base;
  if (base) base.scale.set(1 + 0.08 * squat + 0.1 * wob * Math.max(0, Math.sin(t * 22)), 1 - 0.14 * squat + stretch - 0.06 * wob * Math.max(0, Math.sin(t * 22)), 1 + 0.08 * squat);
  const blk = n.blk ? 1 : 0;
  ud.blk = lerp(ud.blk ?? 0, blk, damp(4, dt));
  // blocked by you, it rocks on its foot at you, impatient; crowned, it stands tall and turns slowly
  rot(rig, 'base', (n.mv && !n.crown ? -0.2 * Math.sin(u * Math.PI) : 0) + Math.sin(t * 15) * 0.1 * wob * (ud.wobS ?? 1) + ud.blk * Math.sin(t * 5 + seed) * 0.12, 0, Math.cos(t * 17) * 0.08 * wob * (ud.wobS ?? 1) + Math.sin(t * 0.7 + seed * 6) * 0.015);
  const crT = t - (ud.crownT ?? -9);
  ud.cr = lerp(ud.cr ?? 0, n.crown ? 1 : 0, damp(n.crown ? (crT < 2 ? 2.2 : 8) : 8, dt));
  const crown = rig.parts.crown;
  if (crown) { const s = Math.max(0.001, ud.cr * (1 + Math.max(0, 1 - crT) * Math.sin(crT * 18) * 0.15)); crown.scale.set(s, s, s); crown.visible = ud.cr > 0.02; crown.rotation.y = t * 0.4; }
  // the mouth: a little open while it watches you; wide on the take; wide and slow when crowned
  const bt = t - (ud.bite ?? -9);
  const bite = bt >= 0 && bt < 0.6 ? Math.sin((bt / 0.6) * Math.PI) : 0;
  const open = Math.max(c.state === 'warn' ? 0.25 + Math.sin(t * 9) * 0.05 : 0.04 + Math.max(0, Math.sin(t * 0.9 + seed * 5)) * 0.06, bite * 0.9, ud.blk * (0.2 + Math.max(0, Math.sin(t * 6)) * 0.25), ud.cr * 0.2, c.attackPhase > 0 ? 0.7 : 0, c.dead ? 0.6 : 0);
  rot(rig, 'head', -open, 0, 0);
  // the peeling felt flaps when it lands
  rot(rig, 'flap', Math.sin(t * 20) * 0.4 * wob + (n.mv ? 0.3 : 0), 0, 0);
  const p = localIn(c);
  if (p && !c.dead) {
    const d = dist(p, c);
    if (n.blk && d < 8) thinkOnce(p, 'pawn_blk', 'It cannot get past me while I am straight in front of it. It is rocking on its foot. Furious.', 50);
    else if (d < 16) thinkOnce(p, 'pawn', ['Wooden pawns. Someone carved faces in them with a penknife.', 'They only ever hop forward. One square at a time.'][Math.floor(t * 0.1) % 2], 90);
  }
}

// =====================================================================================
// THE FOLDING BOARD
// =====================================================================================
const FLIP = 0.8;
function thinkCase(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey), m = c.mem, n = net(c), b = boardOf(z), ev = pulse(c);
  hold(c);
  if (!m.init) { m.init = 1; settle(c, z, b); m.ph = 'wait'; m.tick = tickOf(0.35); n.cell = b.cell; }
  const p = target(c);
  const me = sqOf(b, c.x, c.z);
  // a heavy enough blow turns it over onto its back: a few seconds it cannot move, open to the air
  if (ev.hurt >= 14 && m.ph !== 'move' && m.ph !== 'up') { m.ph = 'up'; m.uT = 0; n.up = 1; n.mk = n.mk2 = null; fx(c, 'upend'); for (const q of playersIn(c.zoneKey)) if (dist(q, c) < b.cell * 3) { ruleShown(c); break; } }
  switch (m.ph) {
    case 'up':
      c.setState('frozen');
      m.uT += dt;
      if (m.uT > 4.2) { m.ph = 'recover'; m.rT = 0; n.up = 0; fx(c, 'right'); }
      break;
    case 'wait': {
      c.setState(p ? 'watch' : 'idle');
      // it keeps its hinge away from you: the lid lifts on your side and the eyes in the hollows look out at you
      if (p) c.targetFacing = Math.atan2(c.z - p.z, c.x - p.x);
      const tk = tickOf(0.35);
      if (tk === m.tick) break;
      m.tick = tk;
      if (boardHeld(z)) break;
      // exactly two squares in a straight line, both of them free
      const ps = p ? sqOf(b, p.x, p.z) : null;
      let best: { d: [number, number]; s: number } | null = null;
      for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
        const a: [number, number] = [me[0] + d[0], me[1] + d[1]], e: [number, number] = [me[0] + 2 * d[0], me[1] + 2 * d[1]];
        if (!sqFree(z, b, a[0], a[1]) || !sqFree(z, b, e[0], e[1])) continue;
        let s = rng.float(0, 0.5);
        if (ps) {
          if ((ps[0] === a[0] && ps[1] === a[1]) || (ps[0] === e[0] && ps[1] === e[1])) s += 50;
          s -= Math.hypot(e[0] - ps[0], e[1] - ps[1]) * 1.5;
          // it likes to end on your rank or file (from there it can come straight at you)
          if (e[0] === ps[0] || e[1] === ps[1]) s += 2;
        } else if (!rng.chance(0.3)) s -= 100;
        if (!best || s > best.s) best = { d, s };
      }
      if (!best || best.s < -50) break;
      const a = sqCenter(b, me[0] + best.d[0], me[1] + best.d[1]), e = sqCenter(b, me[0] + 2 * best.d[0], me[1] + 2 * best.d[1]);
      m.sq = [[c.x, c.z], a, e]; m.ph = 'tele'; m.tT = 0;
      n.mk = [+e[0].toFixed(2), +e[1].toFixed(2)]; n.mk2 = [+a[0].toFixed(2), +a[1].toFixed(2)]; n.cell = b.cell;
      c.targetFacing = Math.atan2(best.d[1], best.d[0]);
      fx(c, 'tick');
      break;
    }
    case 'tele':
      c.setState('warn');
      m.tT += dt;
      if (m.tT > 0.95) { m.ph = 'move'; m.mT = 0; n.mv = 1; n.fl = 0; m.bit = 0; }
      break;
    case 'move': {
      c.setState('travel');
      m.mT += dt;
      const k = Math.min(1, Math.floor(m.mT / FLIP)), u = Math.min(1, (m.mT - k * FLIP) / FLIP);
      n.fl = k; n.fu = +u.toFixed(2);
      const A = m.sq[k], B = m.sq[k + 1];
      // the lid opens onto the next square and bites down on it, then the case hauls itself over
      if (u > 0.4 && !(m.bit & (1 << k))) {
        m.bit |= 1 << k;
        const v = crushedNear(c, B[0], B[1], b.cell * 0.6, [18, 30], 1.2);
        fx(c, v.length ? 'take' : 'shut');
        if (k === 0) n.mk2 = null;
      }
      const w = u < 0.45 ? 0 : ease(Math.min(1, (u - 0.45) / 0.45));
      c.x = lerp(A[0], B[0], w); c.z = lerp(A[1], B[1], w);
      if (m.mT >= FLIP * 2) { c.x = m.sq[2][0]; c.z = m.sq[2][1]; n.mv = 0; n.mk = n.mk2 = null; m.ph = 'recover'; m.rT = 0; }
      break;
    }
    default:
      c.setState('idle');
      m.rT = (m.rT ?? 0) + dt;
      if (m.rT > 0.5) m.ph = 'wait';
  }
  return true;
}
function buildCase(): Rig {
  const rig = newRig(0.8);
  const W = PG.reg('WALNUT'), SQ = PG.reg('SQUARES'), F = PG.reg('FELT'), BR = PG.reg('BRASS');
  const L = 1.5, Hh = 0.17;
  const inside = (ob: any, y: number, dn: number) => {
    // baize, piece-shaped hollows, a throat; teeth all round the rim; two eyes in the king's and queen's places
    ob.quad([[-L / 2 + 0.04, y, -L / 2 + 0.04], [L / 2 - 0.04, y, -L / 2 + 0.04], [L / 2 - 0.04, y, L / 2 - 0.04], [-L / 2 + 0.04, y, L / 2 - 0.04]].map((q: V3) => (dn < 0 ? [q[0], q[1], -q[2]] : q)) as any, F);
    for (let k = 0; k < 6; k++) ob.blob([-0.5 + k * 0.2, y + dn * 0.004, -0.42], [0.07, 0.006, 0.07], 8, 2, PG.reg('MOUTH'));
    for (let k = 0; k < 6; k++) ob.blob([-0.5 + k * 0.2, y + dn * 0.004, 0.42], [0.06, 0.006, 0.06], 8, 2, PG.reg('MOUTH'));
    ob.blob([0, y + dn * 0.004, 0], [0.4, 0.008, 0.14], 10, 2, PG.reg('MOUTH'), { emis: 0.2 });
    for (let k = 0; k < 16; k++) { const x = -L / 2 + 0.08 + k * (L - 0.16) / 15; for (const zz of [-L / 2 + 0.06, L / 2 - 0.06]) ob.cone([x, y, zz], [0, dn, 0], 0.03, 0.09, 3, PG.reg('TOOTH')); }
    for (let k = 1; k < 7; k++) { const zz = -L / 2 + k * L / 7; for (const x of [-L / 2 + 0.06, L / 2 - 0.06]) ob.cone([x, y, zz], [0, dn, 0], 0.028, 0.08, 3, PG.reg('TOOTH')); }
  };
  bpart(rig, 'base', rig.body, [0, 0, 0], PG, 'kbase', (ob) => {
    obox(ob, [0, Hh / 2, 0], [L, Hh, L], W);
    ob.quad([[-L / 2, 0.002, L / 2], [L / 2, 0.002, L / 2], [L / 2, 0.002, -L / 2], [-L / 2, 0.002, -L / 2]], SQ);
    inside(ob, Hh + 0.002, 1);
    // two loose pieces rattling in the hollows, and the eyes in the king's and queen's places
    for (const [x, zz] of [[-0.3, 0.42], [0.5, -0.42]] as const) { ob.push().translate(x, Hh + 0.04, zz).rotZ(Math.PI / 2); lathe(ob, [[-0.1, 0.04], [-0.04, 0.025], [0.04, 0.02], [0.1, 0.035]], 8, PG.reg('WOOD'), { start: 'flat', end: 'flat' }); ob.pop(); }
    for (const x of [-0.1, 0.1]) ob.blob([x, Hh + 0.01, -0.42], [0.045, 0.03, 0.045], 8, 4, PG.reg('EYE'), { emis: 0.95 });
    // brass corners and the clasp
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) obox(ob, [sx * (L / 2 - 0.03), Hh / 2, sz * (L / 2 - 0.03)], [0.08, Hh + 0.01, 0.08], BR);
    obox(ob, [0, Hh * 0.6, -L / 2 - 0.01], [0.16, 0.08, 0.02], BR);
    for (const sx of [-0.45, 0.45]) { ob.push().translate(sx, Hh, L / 2).rotZ(Math.PI / 2); lathe(ob, [[-0.12, 0.022], [0.12, 0.022]], 8, BR, { start: 'flat', end: 'flat' }); ob.pop(); }
  });
  // the lid: hinged along the front edge (it opens forward, onto the square ahead)
  bpart(rig, 'lid', rig.body, [0, Hh, L / 2], PG, 'klid', (ob) => {
    obox(ob, [0, Hh / 2 + 0.002, -L / 2], [L, Hh, L], W);
    ob.quad([[-L / 2, Hh + 0.004, 0], [L / 2, Hh + 0.004, 0], [L / 2, Hh + 0.004, -L], [-L / 2, Hh + 0.004, -L]], SQ);
    ob.push().translate(0, 0, -L / 2);
    inside(ob, 0.0, -1);
    ob.pop();
    for (const sx of [-1, 1]) for (const sz of [0, -1]) obox(ob, [sx * (L / 2 - 0.03), Hh / 2, sz * (L - 0.06) - (sz ? 0 : 0.03)], [0.08, Hh + 0.01, 0.08], BR);
  });
  surface(rig, 'lacquer');
  return rig;
}
function animateCase(rig: Rig, c: Creature, t: number, dt: number) {
  applyLook(rig, c, PG, 0.03);
  const ud = rig.root.userData as Record<string, any>;
  const n = boardLook(rig, c, t, dt);
  const seed = hashId(c.id);
  const ev = fxPoll(rig, c);
  if (ev) {
    const k = ev.key;
    if (k === 'tick') { playAt('chess_tick', c, 0.5, 22, 0.8); playAt('wood_creak', c, 0.5, 16, 0.8); }
    else if (k === 'shut' || k === 'take') { playAt('vx_slam', c, k === 'take' ? 1 : 0.7, 26, 1.1); playAt('drawer_wood', c, 0.6, 16); if (k === 'take') playAt('bone_crunch', c, 0.7, 14); shakeNear(c, k === 'take' ? 0.7 : 0.35); }
    else if (k === 'upend') { playAt('dmg_break_wood', c, 0.8, 22); playAt('chess_grind', c, 0.6, 18); }
    else if (k === 'right') playAt('wood_hit', c, 0.8, 20, 0.7);
  }
  // the flip: open forward onto the next square (0..0.4), the slam (0.4), hauling itself over and shut (0.45..1)
  if (n.mv) {
    if (ud.fl !== n.fl) { ud.fl = n.fl; ud.fu = n.fu ?? 0; }
    ud.fu = Math.max(ud.fu ?? 0, n.fu ?? 0);
    ud.fu = Math.min(1, ud.fu + dt / FLIP);
  } else ud.fu = 0;
  const u = ud.fu as number;
  let lid = 0, tip = 0, lift = 0;
  if (n.mv) {
    if (u < 0.4) lid = Math.PI * ease(u / 0.4);
    else if (u < 0.45) lid = Math.PI + Math.sin(((u - 0.4) / 0.05) * Math.PI) * 0.06;
    else { const w = (u - 0.45) / 0.55; lid = Math.PI * (1 - ease(w)); tip = Math.sin(w * Math.PI) * 0.55; lift = Math.sin(w * Math.PI) * 0.15; }
  }
  // closed, it breathes: the lid lifts a crack and the eyes in the hollows look out (wider when you are close)
  const p = localIn(c);
  const near = p ? Math.max(0, 1 - dist(p, c) / ((n.cell ?? 2) * 2.2)) : 0;
  ud.near = lerp(ud.near ?? 0, near, damp(3, dt));
  const crack = 0.04 + Math.max(0, Math.sin(t * 0.8 + seed * 6)) * 0.08 + ud.near * (0.25 + Math.max(0, Math.sin(t * 3.1)) * 0.12) + (c.state === 'warn' ? 0.35 : 0);
  ud.up = lerp(ud.up ?? 0, n.up ? 1 : 0, damp(7, dt));
  const lidA = n.mv ? lid : Math.max(crack, c.attackPhase > 0 ? 1 : 0, c.dead ? 2.4 : 0, ud.up * 2.6);
  ud.lidV = n.mv ? lidA : lerp(ud.lidV ?? lidA, lidA, damp(10, dt));
  rot(rig, 'lid', ud.lidV, 0, 0);
  // hauling over: the back end tips up toward the lid; upended: rolled onto its back, rocking
  const body = rig.body;
  body.rotation.order = 'YXZ';
  body.rotation.x = -tip + ud.up * (-Math.PI * 0.92) + Math.sin(t * 6) * 0.03 * ud.up;
  body.rotation.z = Math.sin(t * 9 + seed) * 0.02 * (c.state === 'warn' ? 1 : 0);
  body.position.y = lift + ud.up * 0.34 * (body.scale.y || 1);
  if (p && !c.dead) {
    const d = dist(p, c);
    if (n.up && d < 14) thinkOnce(p, 'case_up', 'It went over onto its back. It is rocking, trying to right itself. Now—', 40);
    else if (d < 16) thinkOnce(p, 'case', ['The box the set came in. Lined with green felt. Something is looking out of where the king goes.', 'It opens onto the square and bites it shut. Two squares. Always two.'][Math.floor(t * 0.1) % 2], 90);
  }
}

// =====================================================================================
// species
// =====================================================================================
const WOODGORE = { blood: 'plaster' as const, tint: 0xd8b07a, flesh: 0xc8985a };
const CLOCK = def({
  key: 'chess_clock', name: 'Flagfall', code: 'CB-04 // LIVING PIECE (TIMEKEEPER)', temperament: 'hostile', threat: 3,
  hp: 150, walk: 0, run: 0, turn: 3.5, radius: 0.55, height: 1.4, sight: 26, fov: 3.1, hearing: 0.6,
  rule: { name: 'IT KEEPS YOUR TIME', text: 'It moves like a king, one square any way on its tick, to stand next to you. While you stand on any square touching it, your dial runs and the hand climbs to the red flag; step two squares off and it stops. When the flag falls it slams down on every square round it. Strike its button (hit it) and the whole Board waits a move.', tell: 'A chess clock walked up to me on legs and pressed its button.' },
  attack: { dmg: [18, 28], range: 0.9, cooldown: 3, kinds: ['fracture', 'bruise'], corrupt: 0, knock: 1.4 },
  zones: ['chess'], weight: 1.2, group: [1, 1], maxPerZone: 1, diet: 'none',
  meat: [['spring', 2], ['gear', 2]],
  sounds: snd({ alert: 'chess_tick', attack: 'vx_slam', hurt: 'tc_clack', death: 'dmg_break_wood' }),
  scan: { cls: 'Living piece / board-bound timekeeper', notes: ['A twin-dial tournament clock, walnut case, cream faces, red flags at twelve. Walks on four turned legs.', 'Moves one square in any direction on the board\'s tick, toward the nearest unit.', 'Runs the unit\'s dial while the unit stands adjacent. The flag falls at twelve: a heavy strike on every adjacent square.', 'Striking its button halts the board for one move.'] },
  gore: { blood: 'oil', tint: 0x3a2a18, flesh: 0x6e4428, sever: ['jaw', 'btnL', 'btnR', 'thighFL', 'thighFR', 'thighBL', 'thighBR'] },
  build: buildClock, animate: animateClock, think: thinkClock,
});
CLOCK.animateGallery = galleryDriver('chess_clock', ['idle', 'run', 'walk', 'flag', 'dead'], animateClock, (pose, fc, t) => {
  fc.state = pose === 'run' ? 'warn' : 'idle';
  fc.mem.netMem = { cell: 2, run: pose === 'run' ? 1 : 0, clk: pose === 'run' ? (t * 0.15) % 1 : pose === 'flag' ? 0.97 : 0.2, mv: pose === 'walk' ? 1 : 0, mk: pose === 'walk' ? [2, 0] : null };
  if (pose === 'flag' && (t % 3) < 1 / 60) { const n = fc.mem.netMem; n.fx = ((fc.mem.fxs ?? 0) + 1) % 1000; fc.mem.fxs = n.fx; n.fk = Math.floor(t / 3) % 2 ? 'slam' : 'flag'; }
  fc.dead = pose === 'dead';
});
const PAWN = def({
  key: 'chess_pawn', name: 'Boxwood Pawn', code: 'CB-05 // LIVING PIECE (PAWN)', temperament: 'hostile', threat: 2,
  hp: 60, walk: 0, run: 0, turn: 4, radius: 0.32, height: 1.15, sight: 26, fov: 3.1, hearing: 0.5,
  rule: { name: 'PAWNS TAKE ON THE SLANT', text: 'They hop one square forward (toward the Gallery) when they move, never back, and can only take on the two squares diagonally in front of them. Straight in front of one you are safe, and it cannot get past you; beside or behind it, it cannot touch you. One that reaches the last rank is crowned, and moves like a queen.', tell: 'Wooden pawns, hopping toward me. One square at a time.' },
  attack: { dmg: [12, 20], range: 0.8, cooldown: 2.5, kinds: ['bite', 'bruise'], corrupt: 0, knock: 0.8 },
  zones: ['chess'], weight: 2.2, group: [2, 4], maxPerZone: 6, diet: 'none',
  meat: [['boxwood_chunk', 2], ['lead_weight', 1], ['baize_felt', 1]],
  sounds: snd({ alert: 'chess_tick', attack: 'chess_take', hurt: 'dmg_hit_wood', death: 'dmg_break_wood' }),
  scan: { cls: 'Living piece / board-bound pawn', notes: ['Turned boxwood, worn smooth by hands. Peeling green felt under the foot, a lead slug inside. A face cut into the knob.', 'Moves one square forward on the tick (two on its first move). Never backward.', 'Takes only on the two forward diagonals; blocked by anything directly in front.', 'On the last rank it grows a crown and moves as a queen.'] },
  gore: { ...WOODGORE, sever: ['head', 'crown'], head: 'head' },
  build: buildPawn, animate: animatePawn, think: thinkPawn,
});
PAWN.animateGallery = galleryDriver('chess_pawn', ['idle', 'pick', 'hop', 'blocked', 'crowned', 'dead'], animatePawn, (pose, fc, t) => {
  fc.state = pose === 'pick' ? 'warn' : 'idle';
  fc.mem.netMem = { cell: 2, mv: pose === 'hop' ? 1 : 0, air: pose === 'hop' ? (t % 1) : 0, mk: pose === 'pick' ? [0, 2] : null, blk: pose === 'blocked' ? 1 : 0, crown: pose === 'crowned' ? 1 : 0 };
  fc.dead = pose === 'dead';
});
const CASE = def({
  key: 'chess_case', name: 'Folding Board', code: 'CB-06 // LIVING BOARD (CASE)', temperament: 'hostile', threat: 3,
  hp: 140, walk: 0, run: 0, turn: 3, radius: 0.7, height: 0.6, sight: 26, fov: 3.1, hearing: 0.5,
  rule: { name: 'ALWAYS TWO', text: 'It moves exactly two squares in a straight line on its tick, never one, never diagonally: it opens onto the first square and bites it, then hauls itself onto the second and bites that. Both squares light first. The squares right next to it and every diagonal are safe. Hit it hard enough and it goes over on its back for a few seconds.', tell: 'The box the chess set came in. It opened, and it has teeth.' },
  attack: { dmg: [18, 30], range: 0.9, cooldown: 2.5, kinds: ['bite', 'fracture'], corrupt: 0, knock: 1.2 },
  zones: ['chess'], weight: 1.4, group: [1, 1], maxPerZone: 2, diet: 'none',
  meat: [['baize_felt', 2], ['plank', 1], ['boxwood_chunk', 1]],
  sounds: snd({ alert: 'wood_creak', attack: 'vx_slam', hurt: 'dmg_hit_wood', death: 'dmg_break_wood' }),
  scan: { cls: 'Living board / board-bound', notes: ['A hinged walnut folding board, closed like a box: squares outside, green baize and piece-shaped hollows inside, and teeth round the rim.', 'Moves exactly two squares along a rank or file on the tick, biting each square in turn.', 'Cannot move diagonally or a single square. Adjacent and diagonal squares are safe.', 'A heavy blow overturns it for several seconds.'] },
  gore: { ...WOODGORE, sever: ['lid'], head: 'lid' },
  build: buildCase, animate: animateCase, think: thinkCase,
});
CASE.animateGallery = galleryDriver('chess_case', ['idle', 'pick', 'flip', 'upended', 'dead'], animateCase, (pose, fc, t) => {
  fc.state = pose === 'pick' ? 'warn' : 'idle';
  fc.mem.netMem = { cell: 2, mv: pose === 'flip' ? 1 : 0, fl: Math.floor(t / FLIP) % 2, fu: pose === 'flip' ? (t / FLIP) % 1 : 0, mk: pose === 'pick' ? [0, 4] : null, mk2: pose === 'pick' ? [0, 2] : null, up: pose === 'upended' ? 1 : 0 };
  fc.dead = pose === 'dead';
});
defDread('chess_clock', { cam: 0.5 });
defDread('chess_pawn', { cam: 0.3 });
defDread('chess_case', { cam: 0.6 });
horrify(CLOCK, { twitch: 0.1, snap: 0.06, breathe: 0, lunge: 0 });
horrify(PAWN, { twitch: 0.2, snap: 0.1, breathe: 0, lunge: 0.05 });
horrify(CASE, { twitch: 0.1, snap: 0.06, breathe: 0, lunge: 0 });
void THREE;
