// The giant chessboard's living pieces. They move by chess rules, on the
// board's squares (zone.meta.board, see kit/oddkit boardOf), on a clock:
// every tick the board knocks, the target square lights red under the piece's
// chosen landing for most of a second, then the piece moves. Whatever is
// standing on that square when it lands is taken.
//
// ROOK: a marble tower two metres tall with a slit of an eye. Its crown of
// battlements is a jaw. It slides only in straight lines along ranks and
// files, and never through anything. Stand on its diagonal and it cannot
// touch you.
//
// KNIGHT: a horse's head on a plinth, mane like a row of blades. It jumps in
// an L, over anything, and lands hard. It can never land on the squares
// touching it: right beside it is the safest place on the board.
import { def, newRig, Rig } from '../species';
import { G } from '../../game/G';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { Page, OB, V3, bpart, registerPage, applyLook, galleryDriver, lerp, damp, ramp } from '../kit/beasts';
import { rot, lathe, obox, marble, flat, eye, marker, placeMarker, boardOf, sqOf, sqCenter, sqFree, hitPlayer, playersNear, type Board } from '../kit/oddkit';
import { net, netOf, snd, playersIn, dist, hold, face, hashId, rng, fx, fxPoll, playAt, live } from '../behaviors_b';
import { pulse } from '../behaviors_a';
import { ruleShown } from '../rules';
import { defDread } from '../dread';
import { shake } from '../../gfx/juice';
import '../../audio/sounds_creatures_d';

const PG = registerPage(new Page('c_chesspg', 128, 96, [
  ['STONE', 64, 48], ['TRIM', 32, 16], ['EYE', 8, 8], ['MOUTH', 16, 16], ['TOOTH', 8, 8], ['MANE', 16, 24], ['CUT', 12, 12],
], 2));
const IVORY = 0xe6dcc6, EBONY = 0x2c2629;
PG.paint((P, v) => {
  const base = v ? EBONY : IVORY;
  marble(P, P.R('STONE'), base, v ? 0x7a6a72 : 0xa89878, { salt: v + 2, gloss: 0.35 });
  marble(P, P.R('TRIM'), v ? 0x3a3236 : 0xd4c8ac, v ? 0x908088 : 0x988868, { salt: 9 });
  eye(P, P.R('EYE'), v ? 0xffb040 : 0xff5a20, { pupil: 0xfff0c0, sclera: v ? 0x301804 : 0x300804, slit: true });
  { const r = P.R('MOUTH'); for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const d = Math.hypot(x + 0.5 - r.w / 2, y + 0.5 - r.h / 2) / (r.w / 2); P.set(r, x, y, d < 0.5 ? 0x1a0204 : d < 0.8 ? 0x5a0a10 : 0x8a2028); } }
  flat(P, P.R('TOOTH'), v ? 0xc8c0b0 : 0xf4f0e4, 0.1);
  {
    // the mane blades: chiselled, a bright bevel down one edge, tool marks across
    const r = P.R('MANE');
    P.fill(r, ramp(base, 6, 0x101010, 0.3), (u, vv, x, y) => 1 + vv * 3 + (u > 0.5 ? 0.6 : -0.2) + (y % 5 === 0 ? -0.8 : 0) + (P.n(r, x, y, 2, 1, 4) - 0.5));
    for (let y = 0; y < r.h; y++) P.blend(r, Math.floor(r.w / 2), y, 0xffffff, 0.35);
  }
  P.cut(P.R('CUT'), base, { meat: v ? 0x403840 : 0xc8bca8, bone: v ? 0x605860 : 0xf0e8d8, marrow: 0x8a1c1c, fat: v ? 0x504850 : 0xd8ccb8 });
});

// =====================================================================================
// shared board brain
// =====================================================================================
const PERIOD = 2.8;
type Move = { i: number; j: number; cap: boolean };
function target(c: Creature): Player | null {
  let best: Player | null = null, bd = 26;
  for (const p of playersIn(c.zoneKey)) { const d = dist(p, c); if (d < bd) { bd = d; best = p; } }
  return best;
}
function rookMove(z: any, b: Board, i: number, j: number, p: Player | null): Move | null {
  const clear = (di: number, dj: number, steps: number) => { for (let k = 1; k <= steps; k++) if (!sqFree(z, b, i + di * k, j + dj * k)) return false; return true; };
  const lines: Move[] = [];
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let k = 1; k <= 7; k++) { if (!sqFree(z, b, i + di * k, j + dj * k)) break; lines.push({ i: i + di * k, j: j + dj * k, cap: false }); }
  if (!lines.length) return null;
  if (!p) return rng.chance(0.35) ? rng.pick(lines.filter((m) => Math.abs(m.i - i) + Math.abs(m.j - j) <= 2)) ?? null : null;
  const [pi, pj] = sqOf(b, p.x, p.z);
  if ((pi === i || pj === j) && !(pi === i && pj === j)) {
    const di = Math.sign(pi - i), dj = Math.sign(pj - j), steps = Math.abs(pi - i) + Math.abs(pj - j);
    if (steps <= 7 && clear(di, dj, steps)) return { i: pi, j: pj, cap: true };
  }
  // line up with them: the move that leaves it on their rank or file, closest to them
  let best: Move | null = null, bd = Infinity;
  for (const m of lines) {
    const aligned = m.i === pi || m.j === pj;
    const d = Math.hypot(m.i - pi, m.j - pj) + (aligned ? 0 : 6) + rng.float(0, 0.3);
    if (d < bd && !(m.i === pi && m.j === pj)) { bd = d; best = m; }
  }
  return best;
}
const KN = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
function knightMove(z: any, b: Board, i: number, j: number, p: Player | null): Move | null {
  const opts = KN.map(([a, c]) => ({ i: i + a, j: j + c, cap: false })).filter((m) => sqFree(z, b, m.i, m.j));
  if (!opts.length) return null;
  if (!p) return rng.chance(0.3) ? rng.pick(opts) : null;
  const [pi, pj] = sqOf(b, p.x, p.z);
  const take = opts.find((m) => m.i === pi && m.j === pj);
  if (take) return { ...take, cap: true };
  let best: Move | null = null, bd = Infinity;
  for (const m of opts) { const d = Math.hypot(m.i - pi, m.j - pj) + rng.float(0, 0.4); if (d < bd) { bd = d; best = m; } }
  return best;
}

function thinkPiece(c: Creature, dt: number, knight: boolean): boolean {
  const z = G.getZone(c.zoneKey), m = c.mem, n = net(c);
  const b = boardOf(z);
  pulse(c);
  hold(c);
  if (!m.init) {
    // settle onto the middle of a free square
    m.init = 1;
    const [i0, j0] = sqOf(b, c.x, c.z);
    let found = false;
    // nearest free square (it may have been put down off the board)
    for (let r = 0; r <= 10 && !found; r++) for (let di = -r; di <= r && !found; di++) for (let dj = -r; dj <= r && !found; dj++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      if (sqFree(z, b, i0 + di, j0 + dj)) { [c.x, c.z] = sqCenter(b, i0 + di, j0 + dj); found = true; }
    }
    m.ph = 'wait'; m.tick = Math.floor((G.time + (knight ? PERIOD / 2 : 0)) / PERIOD);
  }
  const p = target(c);
  const [i, j] = sqOf(b, c.x, c.z);
  switch (m.ph) {
    case 'wait': {
      c.setState(p ? 'watch' : 'idle');
      if (p) face(c, p.x, p.z);
      const tick = Math.floor((G.time + (knight ? PERIOD / 2 : 0)) / PERIOD);
      if (tick === m.tick) break;
      m.tick = tick;
      const mv = knight ? knightMove(z, b, i, j, p) : rookMove(z, b, i, j, p);
      if (!mv) break;
      const [tx, tz] = sqCenter(b, mv.i, mv.j);
      m.to = [tx, tz]; m.cap = mv.cap; m.ph = 'tele'; m.tT = 0;
      n.mk = [+tx.toFixed(2), +tz.toFixed(2)]; n.cell = b.cell;
      fx(c, 'tick');
      break;
    }
    case 'tele':
      c.setState('warn');
      face(c, m.to[0], m.to[1]);
      m.tT += dt;
      if (m.tT > 0.85) { m.ph = 'move'; m.from = [c.x, c.z]; m.mT = 0; m.dur = knight ? 0.75 : Math.max(0.3, Math.hypot(m.to[0] - c.x, m.to[1] - c.z) / 10); n.mv = 1; fx(c, knight ? 'jump' : 'slide'); }
      break;
    case 'move': {
      c.setState('travel');
      m.mT += dt;
      const u = Math.min(1, m.mT / m.dur);
      const e = knight ? u : u * u * (3 - 2 * u);
      c.x = lerp(m.from[0], m.to[0], e); c.z = lerp(m.from[1], m.to[1], e);
      if (knight) n.air = +u.toFixed(2);
      if (u >= 1) {
        n.mv = 0; n.air = 0; n.mk = null;
        const victims = playersNear(c, c.x, c.z, b.cell * 0.62);
        for (const v of victims) hitPlayer(c, v, knight ? rng.float(18, 30) : rng.float(24, 36), ['fracture', 'bruise', 'deep'], 1.5, knight ? undefined : ['torso_u', 'torso_l', 'thigh_l', 'thigh_r', 'head']);
        fx(c, victims.length ? 'take' : 'land');
        // they were the target and are not under it: that is how you live on this board
        if (m.cap && !victims.length && p && dist(p, c) < b.cell * 2.6) ruleShown(c);
        m.ph = 'recover'; m.rT = 0;
      }
      break;
    }
    default:
      c.setState('idle');
      m.rT = (m.rT ?? 0) + dt;
      if (m.rT > 0.45) m.ph = 'wait';
  }
  return true;
}

// =====================================================================================
// rigs
// =====================================================================================
function base(rig: Rig, key: string) {
  return bpart(rig, 'base', rig.body, [0, 0, 0], PG, key + 'base', (ob) => {
    lathe(ob, [[0, 0.46], [0.07, 0.47], [0.1, 0.42], [0.15, 0.37], [0.2, 0.39], [0.26, 0.31]], 18, PG.reg('TRIM'), { start: 'flat', end: 'flat' });
  });
}
function buildRook(): Rig {
  const rig = newRig(1.9);
  const bs = base(rig, 'r');
  const S = PG.reg('STONE');
  const tower = bpart(rig, 'tower', bs, [0, 0.26, 0], PG, 'rtower', (ob) => {
    lathe(ob, [[0, 0.3], [0.15, 0.27], [0.6, 0.245], [0.95, 0.25], [1.08, 0.31], [1.16, 0.35]], 16, S, { start: null, end: null });
    // the eye: a slit in the stone, lit from inside
    obox(ob, [0, 0.72, 0.245], [0.05, 0.2, 0.03], PG.reg('EYE'), { emis: 0.95 });
  });
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    bpart(rig, 'arm' + s, tower, [k * 0.26, 0.62, 0.02], PG, 'rarm', (ob) => {
      ob.tube([[0, 0, 0], [0.04, -0.2, 0.03], [0.05, -0.42, 0.06]], [0.07, 0.06, 0.05], 7, S, { start: 'pole' });
      obox(ob, [0.05, -0.5, 0.07], [0.12, 0.13, 0.12], S);
    });
  }
  const crown = bpart(rig, 'crown', tower, [0, 1.16, -0.3], PG, 'rcrown', (ob) => {
    // hinged at the back: a ring of battlements around a red throat
    lathe(ob, [[0, 0.35], [0.1, 0.36], [0.12, 0.33]], 16, S, { start: null, end: null, cz: 0.3 });
    for (let a = 0; a < 6; a++) {
      const ang = (a / 6) * Math.PI * 2 + Math.PI / 6;
      obox(ob, [Math.cos(ang) * 0.29, 0.2, 0.3 + Math.sin(ang) * 0.29], [0.15, 0.17, 0.15], S);
    }
    for (let a = 0; a < 10; a++) {
      const ang = (a / 10) * Math.PI * 2;
      ob.cone([Math.cos(ang) * 0.24, 0.0, 0.3 + Math.sin(ang) * 0.24], [0, -1, 0], 0.03, 0.12, 4, PG.reg('TOOTH'));
    }
  });
  void crown;
  bpart(rig, 'throat', tower, [0, 1.12, 0], PG, 'rthroat', (ob) => ob.quad([[-0.26, 0, 0.26], [0.26, 0, 0.26], [0.26, 0, -0.26], [-0.26, 0, -0.26]], PG.reg('MOUTH'), undefined, { emis: 0.5 }));
  return rig;
}
function buildKnight(): Rig {
  const rig = newRig(1.7);
  const bs = base(rig, 'k');
  const S = PG.reg('STONE');
  const neck = bpart(rig, 'neck', bs, [0, 0.26, -0.08], PG, 'kneck', (ob) => {
    const path: V3[] = [[0, 0, 0], [0, 0.3, 0.07], [0, 0.56, 0.13], [0, 0.8, 0.1]];
    ob.tube(path, [[0.29, 0.27], [0.21, 0.17], [0.16, 0.13], [0.14, 0.12]], 12, S, { start: 'flat' });
    // the mane: a row of stone blades down the back of the neck
    for (let k = 0; k < 7; k++) ob.cone([0, 0.22 + k * 0.1, -0.13 + k * 0.025], [0, 0.5, -1], 0.06, 0.15 + (k % 2) * 0.06, 4, PG.reg('MANE'), { flat: 0.25 });
  });
  const head = bpart(rig, 'head', neck, [0, 0.86, 0.1], PG, 'khead', (ob) => {
    // a long horse's skull, pitched down, with a heavy muzzle
    ob.tube([[0, 0.06, -0.14], [0, 0.07, 0.06], [0, 0.0, 0.3], [0, -0.06, 0.5]], [[0.17, 0.15], [0.16, 0.14], [0.12, 0.11], [0.1, 0.09]], 12, S, { start: 'pole', end: 'flat', startBulge: 0.05 });
    ob.blob([0, -0.06, 0.47], [0.1, 0.08, 0.08], 8, 5, S);
    for (const s of [-1, 1]) ob.blob([s * 0.13, 0.1, 0.08], [0.025, 0.035, 0.035], 6, 4, PG.reg('EYE'), { emis: 0.95 });
    for (const s of [-1, 1]) ob.blob([s * 0.045, -0.04, 0.55], [0.022, 0.018, 0.015], 5, 3, PG.reg('MOUTH'), { emis: 0.4 });
  });
  bpart(rig, 'jaw', head, [0, -0.1, 0.06], PG, 'kjaw', (ob) => {
    ob.tube([[0, 0, 0], [0, -0.05, 0.2], [0, -0.07, 0.4]], [[0.1, 0.06], [0.085, 0.05], [0.07, 0.045]], 8, S, { start: 'pole', end: 'flat' });
    for (let k = 0; k < 5; k++) for (const s of [-1, 1]) ob.cone([s * 0.04, -0.01, 0.1 + k * 0.06], [0, 1, 0], 0.012, 0.04, 3, PG.reg('TOOTH'));
  });
  for (const [s, k] of [['L', 1], ['R', -1]] as const) bpart(rig, 'ear' + s, head, [k * 0.08, 0.17, -0.06], PG, 'kear', (ob) => ob.cone([0, 0, 0], [k * 0.2, 1, -0.25], 0.055, 0.2, 5, S));
  return rig;
}

// =====================================================================================
// animation
// =====================================================================================
function boardFx(rig: Rig, c: Creature, t: number, dt: number) {
  const n = netOf(c);
  const ud = rig.root.userData as Record<string, any>;
  const ev = fxPoll(rig, c);
  if (ev) {
    const k = ev.key;
    if (k === 'tick') { playAt('chess_tick', c, 0.7, 26); playAt('chess_grind', c, 0.5, 16); }
    else if (k === 'slide') playAt('chess_slide', c, 0.9, 22);
    else if (k === 'jump') playAt('strider_charge', c, 0.5, 18, 1.6);
    else if (k === 'land' || k === 'take') {
      playAt(k === 'take' ? 'chess_take' : 'chess_land', c, 1, 26);
      const p = live() ? G.local : null;
      if (p && p.zoneKey === c.zoneKey) { const d = dist(p, c); if (d < 9) shake((1 - d / 9) * (k === 'take' ? 0.7 : 0.35), 0.35); }
      ud.slam = 1;
    }
  }
  ud.slam = Math.max(0, (ud.slam ?? 0) - dt * 3);
  // the landing square, glowing under where it will come down
  const mk = marker(rig, 'to', 0xc8501e);
  ud.mkA = lerp(ud.mkA ?? 0, n.mk && !c.dead ? 0.42 + (Math.sin(t * 9) > 0.6 ? 0.12 : 0) + Math.sin(t * 2.3) * 0.05 : 0, damp(n.mk ? 12 : 4, dt));
  if (n.mk) ud.mkAt = n.mk;
  if (ud.mkAt) placeMarker(mk, rig, c, ud.mkAt[0], ud.mkAt[1], (n.cell ?? 2) * 0.94, ud.mkA);
  return n;
}
function animateRook(rig: Rig, c: Creature, t: number, dt: number) {
  applyLook(rig, c, PG, 0.03);
  const ud = rig.root.userData as Record<string, any>;
  const n = boardFx(rig, c, t, dt);
  const seed = hashId(c.id);
  const tele = c.state === 'warn' ? 1 : 0;
  const mv = n.mv ? 1 : 0;
  ud.mvK = lerp(ud.mvK ?? 0, mv, damp(8, dt));
  // it leans into the slide and grinds; the crown lifts as it picks its square and slams on the take
  rot(rig, 'tower', -ud.mvK * 0.12 + Math.sin(t * 40) * 0.01 * tele, 0, Math.sin(t * 31 + seed) * 0.012 * tele);
  const open = Math.max(tele * (0.25 + Math.sin(t * 9) * 0.05), ud.slam * 0.9, c.attackPhase > 0 ? 0.8 : 0, c.dead ? 0.6 : 0);
  rot(rig, 'crown', -open, 0, 0);
  const breathe = Math.sin(t * 0.8 + seed * 6) * 0.04;
  for (const [s, k] of [['L', 1], ['R', -1]] as const) rot(rig, 'arm' + s, breathe - ud.mvK * 0.6 - ud.slam * 1.4, 0, k * (0.12 + tele * 0.2 + ud.slam * 0.4));
}
function animateKnight(rig: Rig, c: Creature, t: number, dt: number) {
  applyLook(rig, c, PG, 0.03);
  const ud = rig.root.userData as Record<string, any>;
  const n = boardFx(rig, c, t, dt);
  const seed = hashId(c.id);
  // the jump: an arc, extrapolated between snapshots
  if (n.mv) { const a = n.air ?? 0; if (a < (ud.air ?? 0) - 0.3) ud.air = a; ud.air = Math.min(1, Math.max(ud.air ?? 0, a) + dt / 0.75); } else ud.air = 0;
  const u = ud.air as number;
  rig.body.position.y = 4 * 1.5 * u * (1 - u);
  rig.body.rotation.x = n.mv ? -0.35 + u * 0.7 : 0;
  const tele = c.state === 'warn' ? 1 : 0;
  rot(rig, 'neck', -0.05 - tele * 0.12 + Math.sin(t * 1.1 + seed * 5) * 0.03, 0, 0);
  rot(rig, 'head', 0.45 + (n.mv ? -0.4 : 0) + tele * Math.sin(t * 14) * 0.08 - ud.slam * 0.3, 0, 0);
  const jawOpen = Math.max(n.mv ? 0.5 : 0, ud.slam * 0.7, c.attackPhase > 0 ? 0.6 : 0, tele * 0.15, c.dead ? 0.4 : 0);
  rot(rig, 'jaw', jawOpen, 0, 0);
  for (const [s, k] of [['L', 1], ['R', -1]] as const) rot(rig, 'ear' + s, n.mv || tele ? -0.6 : Math.sin(t * 0.7 + k) * 0.1, 0, k * 0.15);
}

// =====================================================================================
// species
// =====================================================================================
const ROOK = def({
  key: 'chess_rook', name: 'Rook', code: 'CB-01 // LIVING PIECE', temperament: 'hostile', threat: 3,
  hp: 130, walk: 0, run: 0, turn: 4, radius: 0.46, height: 1.9, sight: 26, fov: 3.1, hearing: 0.5,
  rule: { name: 'RANK AND FILE', text: 'It slides only in straight lines along the board, one move per tick of the clock, never through anything. Stand on its diagonal and it cannot touch you. Get off the red square.', tell: 'That piece just moved by itself. In a straight line.' },
  attack: { dmg: [24, 36], range: 0.9, cooldown: 2.5, kinds: ['fracture', 'bruise'], corrupt: 0, knock: 1.5 },
  zones: ['chess'], weight: 2, group: [1, 2], maxPerZone: 4, diet: 'none',
  sounds: snd({ alert: 'chess_tick', attack: 'chess_take', hurt: 'chess_grind', death: 'chess_take' }),
  scan: { cls: 'Living piece / board-bound', notes: ['Marble, two metres tall, warm to the touch. The crown is a jaw.', 'It only moves on the clock: the board knocks, a square lights red, it slides there.', 'Straight lines only, ranks and files. It cannot pass through anything.', 'Whatever stands on the red square when it arrives is taken.'] },
  gore: { blood: 'plaster', tint: 0xf0e8dc, flesh: 0xe8e0d0, sever: ['armL', 'armR', 'crown'], head: 'crown' },
  build: buildRook, animate: animateRook, think: (c, dt) => thinkPiece(c, dt, false),
});
ROOK.animateGallery = galleryDriver('chess_rook', ['idle', 'pick', 'slide', 'take', 'dead'], animateRook, (pose, fc, t) => {
  fc.state = pose === 'pick' ? 'warn' : 'idle';
  fc.mem.netMem = { mv: pose === 'slide' ? 1 : 0, mk: pose === 'pick' ? [2, 0] : null, cell: 2 };
  fc.attackPhase = pose === 'take' && (t % 2) < 0.6 ? 0.2 : 0;
  fc.dead = pose === 'dead';
});
const KNIGHT = def({
  key: 'chess_knight', name: 'Knight', code: 'CB-02 // LIVING PIECE', temperament: 'hostile', threat: 3,
  hp: 90, walk: 0, run: 0, turn: 5, radius: 0.42, height: 1.75, sight: 26, fov: 3.1, hearing: 0.5,
  rule: { name: 'THE L', text: 'It only lands a knight\'s jump away (two squares, then one across) on the tick, over anything. It can never land on the squares touching it: right beside it is the safest place on the board.', tell: 'The horse piece. It jumped. Over the other pieces.' },
  attack: { dmg: [18, 30], range: 0.9, cooldown: 2.5, kinds: ['fracture', 'bite'], corrupt: 0, knock: 1.4 },
  zones: ['chess'], weight: 2, group: [1, 2], maxPerZone: 4, diet: 'none',
  sounds: snd({ alert: 'chess_tick', attack: 'chess_take', hurt: 'chess_grind', death: 'chess_take' }),
  scan: { cls: 'Living piece / board-bound', notes: ['A stone horse\'s head on a plinth. The mane is a row of blades; the mouth has teeth.', 'Moves on the clock, in an L: two squares one way, one across. It jumps over anything.', 'It lands hard. Whatever is on the lit square is taken.', 'It cannot land on any square touching its own.'] },
  gore: { blood: 'plaster', tint: 0xf0e8dc, flesh: 0xe8e0d0, sever: ['earL', 'earR', 'jaw', 'head'], head: 'head' },
  build: buildKnight, animate: animateKnight, think: (c, dt) => thinkPiece(c, dt, true),
});
KNIGHT.animateGallery = galleryDriver('chess_knight', ['idle', 'pick', 'jump', 'take', 'dead'], animateKnight, (pose, fc, t) => {
  fc.state = pose === 'pick' ? 'warn' : 'idle';
  fc.mem.netMem = { mv: pose === 'jump' ? 1 : 0, air: pose === 'jump' ? (t % 1) : 0, mk: pose === 'pick' ? [1, 2] : null, cell: 2 };
  if (pose !== 'jump') fc.mem.netMem.air = 0;
  fc.attackPhase = pose === 'take' && (t % 2) < 0.6 ? 0.2 : 0;
  fc.dead = pose === 'dead';
});
defDread('chess_rook', { cam: 0.5 });
defDread('chess_knight', { cam: 0.6 });
void OB;
