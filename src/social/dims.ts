// The dimensions' rules and their look (zones in src/world/gen: z_chess,
// z_meadow, z_moon):
//   the Board   a turn clock; each tick a black piece picks a move, its
//               target square glows red, then it lifts and slams down and
//               flattens whatever stands there. Push a white piece (E, or
//               lean into it with Shift) and it moves the way its kind may;
//               into a black piece, it takes it. Take the king: checkmate.
//               The host runs the board; clients mirror it ('vx' messages).
//   the Meadow  bubbles drifting up out of the grass, a major-chord hum.
//   the Moon    low gravity (every step a bound, running is leaping), the
//               Earth hanging under the ground where the cracks show it, a
//               field of stars below, a low drone.
// Also the grades and atmospheres for the three, and a few quests.
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import type { GameSystem } from '../game/game';
import { GRADES } from '../game/game';
import { ZONEFX } from '../gfx/fxconfig';
import { ModelBuilder } from '../gfx/modelBuilder';
import { MAT, worldMaterial } from '../gfx/materials';
import { moveCircle } from '../world/collision';
import { shake, punch, hitstop } from '../gfx/juice';
import { grantResearch } from '../game/research';
import { defQuest } from '../game/quests';
import type { Zone } from '../world/zone';
import type { ChessPiece } from '../world/gen/z_chess';

// ---------------------------------------------------------------- looks
GRADES.chess = { lift: [0.03, 0.0, 0.06], gain: [1.06, 1.0, 1.12], gamma: 0.95, sat: 0.7, tint: [1.0, 0.96, 1.08], vignette: 0.6 };
GRADES.meadow = { lift: [0.035, 0.03, 0.05], gain: [0.95, 1.04, 0.98], gamma: 1.0, sat: 1.4, tint: [1.0, 1.04, 1.0], vignette: 0.2 };
GRADES.moon = { lift: [0.0, 0.0, 0.01], gain: [1.1, 1.1, 1.14], gamma: 1.05, sat: 0.12, tint: [1.0, 1.0, 1.04], vignette: 0.62 };
ZONEFX.chess = { haze: [0.95, 0.85, 1.15], hazeDens: 0.004, volTop: 8, sunShafts: 0.5, mistDens: 0, bloom: 0.85, bloomTh: 0.7, ao: 1.05, sick: 0, motes: 0.2, dirt: 0.3, rim: 1.1, rimTint: [0.08, 0.04, 0.14], reflect: 0.8, sheen: 0.9 };
ZONEFX.meadow = { haze: [1.1, 1.0, 1.12], hazeDens: 0.006, hazeFall: 0.12, volTop: 6, gridMul: 0.4, sunShafts: 0.6, mist: [0.9, 0.8, 0.92], mistDens: 0.03, mistFall: 0.9, mistMax: 0.16, bloom: 0.7, bloomTh: 0.9, ao: 0.55, sick: 0, motes: 1.5, dirt: 0.15, rim: 0.5, blob: 0.35 };
ZONEFX.moon = { hazeDens: 0.0, mistDens: 0.0, sunShafts: 0, bloom: 0.45, bloomTh: 0.9, ao: 1.15, sick: 0, motes: 0, dirt: 0.9, rim: 0.25, blob: 0.85, reflect: 0.1, sheen: 0.1 };

// ---------------------------------------------------------------- quests
defQuest({ key: 'vx_fall', title: 'Further Down', giver: 'MERIDIAN R&D', category: 'floors',
  desc: 'There are holes in the floor. Our instruments say there are floors under them. Jump in one and tell us what is there.',
  objectives: [{ id: 'fell', text: 'Jump into a hole', check: (m) => !!m?.flags?.has?.('vx:fell') }], reward: { rp: 10 } });
defQuest({ key: 'vx_board', title: 'Checkmate', giver: 'MERIDIAN R&D', category: 'floors', requires: ['vx_fall'],
  desc: 'A board the size of a town, a clock that will not stop, pieces that crush. Take the king.',
  objectives: [{ id: 'visit', text: 'Reach the Board', check: (m) => !!m?.flags?.has?.('visit:chess') }, { id: 'mate', text: 'Push a white piece into the black king', check: (m) => !!m?.flags?.has?.('vx:checkmate') }],
  reward: { rp: 40 } });
defQuest({ key: 'vx_meadow', title: 'Too Green', giver: 'MERIDIAN R&D', category: 'floors', requires: ['vx_fall'],
  desc: 'A field from a future that went well. Something there is edible. Find the meadow and see what pops.',
  objectives: [{ id: 'visit', text: 'Stand in the Meadow', check: (m) => !!m?.flags?.has?.('visit:meadow') }], reward: { rp: 15 } });
defQuest({ key: 'vx_moon', title: 'Wrong Way Up', giver: 'MERIDIAN R&D', category: 'floors', requires: ['vx_fall'],
  desc: 'The lander never reported back. Find it, and look down through the cracks.',
  objectives: [{ id: 'visit', text: 'Walk on the Moon', check: (m) => !!m?.flags?.has?.('visit:moon') }], reward: { rp: 15 } });

// ---------------------------------------------------------------- the Board
const TICK = 4.4, WARN = 1.7, MOVE = 0.75;
const HEIGHT: Record<ChessPiece['t'], number> = { P: 3.0, R: 3.8, N: 4.2, B: 4.6, Q: 5.2, K: 5.8 };

interface BoardState { pieces: ChessPiece[]; phase: 'idle' | 'warn' | 'move' | 'mate'; mover: number; from: [number, number]; to: [number, number]; t: number; clock: number; mateT: number }

function pieceGeo(t: ChessPiece['t'], c: 'w' | 'b'): THREE.BufferGeometry {
  const key = 'vxpiece|' + t + c;
  const cached = geoCache.get(key); if (cached) return cached;
  const mb = new ModelBuilder();
  const tex = c === 'w' ? 'vx_chess_w' : 'vx_chess_b';
  const col = c === 'w' ? 0xf4ecda : 0x3a3444;
  const H = HEIGHT[t];
  mb.cylinder(0, 0, 0, 1.55, 0.3, 16, tex, { color: col });
  mb.cylinder(0, 0.3, 0, 1.3, 0.25, 16, tex, { color: col, rTop: 1.15 });
  const bodyTop = H * 0.62;
  mb.cylinder(0, 0.55, 0, 1.05, bodyTop - 0.55, 14, tex, { color: col, rTop: t === 'R' ? 0.9 : 0.5 });
  mb.cylinder(0, bodyTop, 0, t === 'R' ? 1.0 : 0.85, 0.22, 14, tex, { color: col });
  const hy = bodyTop + 0.22;
  switch (t) {
    case 'P': mb.sphere(0, hy + 0.6, 0, 0.7, 12, 8, tex, { color: col }); break;
    case 'R':
      mb.cylinder(0, hy, 0, 1.0, H - hy - 0.35, 14, tex, { color: col });
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; mb.box(Math.cos(a) * 0.78, H - 0.35, Math.sin(a) * 0.78, 0.42, 0.45, 0.42, tex, { color: col }); }
      break;
    case 'N':
      mb.push(); mb.translate(0, hy, 0.1); mb.rotateX(-0.35);
      mb.box(0, 0, 0, 0.95, 1.9, 1.1, tex, { color: col });
      mb.box(0, 1.25, 0.55, 0.85, 0.75, 1.4, tex, { color: col });
      mb.box(-0.3, 1.9, -0.1, 0.18, 0.4, 0.2, tex, { color: col }); mb.box(0.3, 1.9, -0.1, 0.18, 0.4, 0.2, tex, { color: col });
      mb.box(0, 1.1, -0.55, 0.3, 1.4, 0.3, tex, { color: c === 'w' ? 0xd8ccb0 : 0x18141e });
      mb.pop();
      break;
    case 'B':
      mb.sphere(0, hy + 0.95, 0, 0.75, 12, 10, tex, { color: col, sy: 1.45 });
      mb.sphere(0, hy + 2.15, 0, 0.18, 6, 4, tex, { color: col });
      mb.box(0.3, hy + 1.2, 0, 0.12, 0.7, 1.4, 'white', { color: c === 'w' ? 0x8a8070 : 0x0a080c });
      break;
    case 'Q':
      mb.cylinder(0, hy, 0, 0.6, 0.9, 14, tex, { color: col, rTop: 0.95 });
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; mb.sphere(Math.cos(a) * 0.85, hy + 1.05, Math.sin(a) * 0.85, 0.17, 6, 4, tex, { color: col }); }
      mb.sphere(0, hy + 1.2, 0, 0.42, 10, 6, tex, { color: col });
      break;
    case 'K':
      mb.cylinder(0, hy, 0, 0.62, 1.0, 14, tex, { color: col, rTop: 0.9 });
      mb.box(0, hy + 1.0, 0, 0.32, 1.0, 0.32, tex, { color: col });
      mb.box(0, hy + 1.45, 0, 0.95, 0.3, 0.32, tex, { color: col });
      break;
  }
  // black pieces look at you
  if (c === 'b') {
    const ey = t === 'N' ? hy + 1.5 : t === 'R' ? H - 0.9 : t === 'P' ? hy + 0.7 : hy + 0.5;
    const ez = t === 'N' ? 1.15 : t === 'R' ? 1.0 : t === 'P' ? 0.66 : 0.66;
    for (const ex of [-0.22, 0.22]) mb.box(ex, ey, ez, 0.16, 0.08, 0.06, 'white', { color: 0xff3030, emissive: 1 });
  }
  const g = mb.build();
  geoCache.set(key, g);
  return g;
}
const geoCache = new Map<string, THREE.BufferGeometry>();

class Board {
  st: BoardState | null = null;
  meshes: THREE.Mesh[] = [];
  warn: THREE.Mesh | null = null;
  root = new THREE.Group();
  shown = false;
  private pushT = 0;
  private pushCd = 0;
  private resetT = 0;
  private secT = 0;
  private sec = 0;
  private hinted = false;

  meta(): any { return G.zones.get('chess')?.meta.chess; }

  ensureState() {
    if (this.st) return;
    const m = this.meta(); if (!m) return;
    this.st = { pieces: m.pieces.map((p: ChessPiece) => ({ ...p })), phase: 'idle', mover: -1, from: [0, 0], to: [0, 0], t: 0, clock: 2, mateT: 0 };
  }

  update(dt: number) {
    const local = G.local;
    const here = !!local && local.zoneKey === 'chess';
    const authority = G.role !== 'client';
    const anyone = [...G.players.values()].some((p) => p.zoneKey === 'chess' && !p.body.dead);
    if (here || (authority && anyone)) { if (!this.st) G.getZone('chess'); this.ensureState(); }
    if (!this.st) return;
    if (authority && anyone) this.runClock(dt);
    else if (!authority) this.st.t += dt;
    if (here) { this.show(true); this.render(dt); this.playerRules(dt); }
    else this.show(false);
  }

  // ---- host: the clock and black's moves
  private runClock(dt: number) {
    const s = this.st!;
    s.t += dt;
    if (s.phase === 'mate') {
      this.resetT += dt;
      if (this.resetT > 120) { const m = this.meta(); s.pieces = m.pieces.map((p: ChessPiece) => ({ ...p })); s.phase = 'idle'; s.clock = 3; this.resetT = 0; this.broadcast(); }
      return;
    }
    if (s.phase === 'idle') {
      s.clock -= dt;
      if (s.clock <= 0) {
        const mv = this.chooseMove();
        if (mv) { s.phase = 'warn'; s.mover = mv[0]; s.from = [s.pieces[mv[0]].x, s.pieces[mv[0]].y]; s.to = [mv[1], mv[2]]; s.t = 0; this.broadcast(); }
        else s.clock = TICK;
      }
    } else if (s.phase === 'warn' && s.t >= WARN) { s.phase = 'move'; s.t = 0; this.broadcast(); }
    else if (s.phase === 'move' && s.t >= MOVE) { this.land(); }
  }

  private land() {
    const s = this.st!;
    const pc = s.pieces[s.mover];
    if (!pc) { s.phase = 'idle'; s.clock = TICK; return; }
    const [x, y] = s.to;
    const victim = s.pieces.findIndex((q, i) => i !== s.mover && q.alive && q.x === x && q.y === y);
    if (victim >= 0) s.pieces[victim].alive = false;
    pc.x = x; pc.y = y;
    s.phase = 'idle'; s.clock = TICK * (0.85 + Math.random() * 0.3); s.t = 0;
    this.slam(x, y, victim >= 0);
    this.broadcast({ slam: [x, y], cap: victim >= 0 ? 1 : 0 });
  }

  /** the squares the players stand on */
  private playerSquares(): [number, number][] {
    const m = this.meta(); const out: [number, number][] = [];
    for (const p of G.players.values()) {
      if (p.zoneKey !== 'chess' || p.body.dead) continue;
      out.push([Math.floor((p.x - m.ox) / m.S), Math.floor((p.z - m.oy) / m.S)]);
    }
    return out;
  }

  private at(x: number, y: number) { return this.st!.pieces.findIndex((q) => q.alive && q.x === x && q.y === y); }

  private movesFor(i: number): [number, number][] {
    const s = this.st!, pc = s.pieces[i], out: [number, number][] = [];
    const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < 8 && y < 8;
    const add = (x: number, y: number, capOnly = false, quietOnly = false) => {
      if (!inb(x, y)) return false;
      const k = this.at(x, y);
      if (k >= 0) { if (!quietOnly && s.pieces[k].c !== pc.c) out.push([x, y]); return false; }
      if (!capOnly) out.push([x, y]);
      return true;
    };
    const fwd = pc.c === 'b' ? 1 : -1;
    const slide = (dirs: number[][], max = 7) => { for (const [dx, dy] of dirs) for (let k = 1; k <= max; k++) if (!add(pc.x + dx * k, pc.y + dy * k)) break; };
    const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]], DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    switch (pc.t) {
      case 'P': add(pc.x, pc.y + fwd, false, true); add(pc.x - 1, pc.y + fwd, true); add(pc.x + 1, pc.y + fwd, true); break;
      case 'N': for (const [dx, dy] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) add(pc.x + dx, pc.y + dy); break;
      case 'B': slide(DIAG); break;
      case 'R': slide(ORTH); break;
      case 'Q': slide([...ORTH, ...DIAG]); break;
      case 'K': slide([...ORTH, ...DIAG], 1); break;
    }
    return out;
  }

  private chooseMove(): [number, number, number] | null {
    const s = this.st!, targets = this.playerSquares();
    let best: [number, number, number] | null = null, bestS = -1e9;
    s.pieces.forEach((pc, i) => {
      if (!pc.alive || pc.c !== 'b') return;
      for (const [x, y] of this.movesFor(i)) {
        let sc = Math.random() * 3;
        const k = this.at(x, y);
        if (k >= 0) sc += s.pieces[k].t === 'K' ? 60 : 22;
        let dmin = 99;
        for (const [px, py] of targets) {
          if (px === x && py === y) sc += 100;
          dmin = Math.min(dmin, Math.max(Math.abs(px - x), Math.abs(py - y)) + Math.min(Math.abs(px - x), Math.abs(py - y)) * 0.5);
        }
        if (targets.length) sc -= dmin * 2.2;
        if (pc.t === 'K') sc -= 8;
        if (sc > bestS) { bestS = sc; best = [i, x, y]; }
      }
    });
    return best;
  }

  /** a white piece shoved one step in (dx, dy); host only */
  push(i: number, dx: number, dy: number, by: string) {
    const s = this.st; if (!s || s.phase === 'mate') return;
    const pc = s.pieces[i]; if (!pc || !pc.alive || pc.c !== 'w') return;
    if (s.phase !== 'idle' && s.mover === i) return;
    const cands: [number, number][] = [];
    const diag = dx !== 0 && dy !== 0;
    switch (pc.t) {
      case 'R': if (!diag) cands.push([pc.x + dx, pc.y + dy]); break;
      case 'B': if (diag) cands.push([pc.x + dx, pc.y + dy]); break;
      case 'Q': case 'K': cands.push([pc.x + dx, pc.y + dy]); break;
      case 'P': if (dy === -1) cands.push([pc.x + dx, pc.y - 1]); break;
      case 'N':
        if (!diag && dx) cands.push([pc.x + 2 * dx, pc.y - 1], [pc.x + 2 * dx, pc.y + 1]);
        else if (!diag && dy) cands.push([pc.x - 1, pc.y + 2 * dy], [pc.x + 1, pc.y + 2 * dy]);
        else cands.push([pc.x + 2 * dx, pc.y + dy], [pc.x + dx, pc.y + 2 * dy]);
        break;
    }
    const ok = cands.filter(([x, y]) => {
      if (x < 0 || y < 0 || x > 7 || y > 7) return false;
      const k = this.at(x, y);
      if (k >= 0 && s.pieces[k].c === 'w') return false;
      if (pc.t === 'P') return dx === 0 ? k < 0 : k >= 0;
      return true;
    });
    if (!ok.length) { this.broadcast({ nope: i }); this.nope(i); return; }
    ok.sort((a, b) => (this.at(b[0], b[1]) >= 0 ? 1 : 0) - (this.at(a[0], a[1]) >= 0 ? 1 : 0));
    const [x, y] = ok[0];
    const victim = this.at(x, y);
    const king = victim >= 0 && s.pieces[victim].t === 'K';
    if (victim >= 0) s.pieces[victim].alive = false;
    pc.x = x; pc.y = y;
    if (king) { s.phase = 'mate'; s.mateT = 0; for (const q of s.pieces) if (q.c === 'b') q.alive = false; this.resetT = 0; }
    this.broadcast({ pushed: [i, x, y], cap: victim >= 0 ? 1 : 0, mate: king ? 1 : 0, by });
    this.afterPush(i, victim >= 0, king);
  }

  private broadcast(ev: any = {}) {
    if (G.role !== 'host') return;
    G.net?.floorsMsg?.({ t: 'chess', s: this.st, ev }, 'all');
  }
  onNet(from: string, d: any) {
    if (d.t === 'chessPush' && G.role === 'host') { this.ensureState(); this.push(d.i | 0, Math.sign(d.dx), Math.sign(d.dy), from); return; }
    if (d.t !== 'chess' || G.role !== 'client' || !d.s) return;
    const prev = this.st;
    this.st = d.s; this.st!.t = 0;
    const ev = d.ev || {};
    if (ev.slam && G.local?.zoneKey === 'chess') this.slam(ev.slam[0], ev.slam[1], !!ev.cap);
    if (ev.pushed && G.local?.zoneKey === 'chess') this.afterPush(ev.pushed[0], !!ev.cap, !!ev.mate);
    if (ev.nope !== undefined) this.nope(ev.nope);
    void prev;
  }

  // ---- effects (every peer)
  private slam(x: number, y: number, cap: boolean) {
    const m = this.meta(); const p = G.local;
    const cx = m.ox + x * m.S + m.S / 2, cz = m.oy + y * m.S + m.S / 2;
    if (p && p.zoneKey === 'chess') {
      const d = Math.hypot(p.x - cx, p.z - cz);
      G.audio?.at?.('vx_slam', cx, cz, 1);
      shake(Math.max(0.15, 0.8 - d * 0.03), 0.4);
      if (cap) G.audio?.at?.('vx_shatter', cx, cz, 0.9);
      // standing on the square it landed on
      if (!p.body.dead && Math.abs(p.x - cx) < m.S / 2 && Math.abs(p.z - cz) < m.S / 2) this.crush(p);
    }
    // creatures there are flattened too (whoever runs them)
    if (G.role !== 'client') for (const c of (G.creatures?.creatures?.values?.() || []) as Iterable<any>) {
      if (c.zoneKey !== 'chess' || c.dead) continue;
      if (Math.abs(c.x - cx) < m.S / 2 && Math.abs(c.z - cz) < m.S / 2) G.creatures.damage('chess', c.id, 9999, cx, cz, 1, 'crush', true);
    }
  }
  private crush(p: any) {
    hitstop(120); punch(0.12, 0.3);
    p.body.health = 0; p.body.blood = 0;
    p.body.dead = true; p.body.downed = false;
    bus.emit('death', p);
    try { if ((G.sandbox?.gore ?? 1) >= 2) G.gore?.gibPlayer?.(p); else G.gore?.pool?.(G.zone, p.x, p.z, 1.6, undefined, 0xffffff, 2); } catch { /* gore optional */ }
    G.ui?.toast?.('FLATTENED', 'you were standing on the square it wanted', 4);
  }
  private afterPush(i: number, cap: boolean, mate: boolean) {
    const m = this.meta(); const pc = this.st?.pieces[i]; if (!pc) return;
    const cx = m.ox + pc.x * m.S + m.S / 2, cz = m.oy + pc.y * m.S + m.S / 2;
    G.audio?.at?.('vx_lift', cx, cz, 0.7);
    if (cap) { G.audio?.at?.('vx_shatter', cx, cz, 1); shake(0.4, 0.3); }
    if (mate && G.local?.zoneKey === 'chess') {
      G.audio?.at?.('vx_slam', cx, cz, 1);
      shake(0.9, 0.8);
      G.ui?.toast?.('CHECKMATE', 'the board goes still', 5);
      G.missions?.set?.('vx:checkmate');
      try { grantResearch(30, 'Checkmate on the Board'); } catch { /* research optional */ }
      bus.emit('subtitle', { who: 'SSGT. VOSS', text: 'Checkmate. Huh. Nobody told me you could play.', style: 'voss' });
    }
  }
  private nope(i: number) { const mesh = this.meshes[i]; if (mesh) mesh.userData.nope = 0.4; G.audio?.ui?.('error', 0.2); }

  // ---- the local player against the board
  private playerRules(dt: number) {
    const p = G.local, s = this.st!, m = this.meta();
    if (!p || p.body.dead) return;
    if (!this.hinted) { this.hinted = true; bus.emit('subtitle', { who: 'SSGT. VOSS', text: 'Red square means move, debtor. Our pieces are white. Lean on one.', style: 'voss' }); }
    // pieces are solid
    let near = -1, nearD = 9;
    s.pieces.forEach((pc, i) => {
      if (!pc.alive || (i === s.mover && s.phase === 'move')) return;
      const cx = m.ox + pc.x * m.S + m.S / 2, cz = m.oy + pc.y * m.S + m.S / 2;
      const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
      if (d < 1.55 && d > 0.001) { p.x = cx + (dx / d) * 1.55; p.z = cz + (dz / d) * 1.55; }
      if (pc.c === 'w' && d < 2.3 && d < nearD) { near = i; nearD = d; }
    });
    // shoving a white piece: E, or leaning into it with Shift held
    this.pushCd -= dt;
    if (near < 0) { this.pushT = 0; return; }
    const pc = s.pieces[near];
    const cx = m.ox + pc.x * m.S + m.S / 2, cz = m.oy + pc.y * m.S + m.S / 2;
    const into = Math.hypot(p.vx, p.vz) > 0.5 && ((cx - p.x) * p.vx + (cz - p.z) * p.vz) > 0;
    const leaning = into && (G.input.down('power') || G.input.down('run'));
    this.pushT = leaning ? this.pushT + dt : 0;
    if ((G.input.hit('interact') || this.pushT > 0.45) && this.pushCd <= 0) {
      this.pushCd = 0.9; this.pushT = 0;
      const a = Math.atan2(cz - p.z, cx - p.x);
      const dx = Math.round(Math.cos(a)), dy = Math.round(Math.sin(a));
      p.playAnim?.('push', 0.6);
      if (G.role === 'client') G.net?.floorsMsg?.({ t: 'chessPush', i: near, dx, dy }, 'host');
      else this.push(near, dx, dy, p.id);
    }
  }

  // ---- drawing
  show(on: boolean) {
    if (on === this.shown) return;
    this.shown = on;
    if (on) {
      G.pr.scene.add(this.root);
      if (!this.warn) {
        const m = this.meta();
        const mb = new ModelBuilder();
        // a red frame round the square and a dimmer fill: additive, so it stays red on ivory
        const e = m.S / 2 - 0.1, t = 0.32;
        mb.flat(0, 0.01, -e + t / 2, m.S - 0.2, t, 'white', { color: 0xc01008, emissive: 1 });
        mb.flat(0, 0.01, e - t / 2, m.S - 0.2, t, 'white', { color: 0xc01008, emissive: 1 });
        mb.flat(-e + t / 2, 0.01, 0, t, m.S - 0.2 - 2 * t, 'white', { color: 0xc01008, emissive: 1 });
        mb.flat(e - t / 2, 0.01, 0, t, m.S - 0.2 - 2 * t, 'white', { color: 0xc01008, emissive: 1 });
        mb.flat(0, 0, 0, m.S - 0.2, m.S - 0.2, 'white', { color: 0x500404, emissive: 1 });
        this.warn = new THREE.Mesh(mb.build(), worldMaterial({ additive: true, outline: 0, noFog: true, unlit: true, depthWrite: false, opacity: 0.553 }));
        this.root.add(this.warn);
      }
    } else G.pr.scene.remove(this.root);
  }
  private render(dt: number) {
    const s = this.st!, m = this.meta();
    while (this.meshes.length < s.pieces.length) {
      const pc = s.pieces[this.meshes.length];
      const mesh = new THREE.Mesh(pieceGeo(pc.t, pc.c), MAT.prop);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.rotation.y = pc.c === 'b' ? 0 : Math.PI;
      this.root.add(mesh); this.meshes.push(mesh);
    }
    s.pieces.forEach((pc, i) => {
      const mesh = this.meshes[i];
      let x = m.ox + pc.x * m.S + m.S / 2, z = m.oy + pc.y * m.S + m.S / 2, y = 0;
      const ud = mesh.userData;
      if (!pc.alive) {
        // toppled: fall over and sink through the board
        ud.dead = Math.min(1, (ud.dead ?? 0) + dt * 0.8);
        mesh.rotation.z = ud.dead * 1.4; y = -ud.dead * ud.dead * 6;
        mesh.visible = ud.dead < 1;
      } else { ud.dead = 0; mesh.rotation.z = 0; mesh.visible = true; }
      if (i === s.mover && s.phase === 'warn') { x += (Math.random() - 0.5) * 0.08 * (s.t / WARN); z += (Math.random() - 0.5) * 0.08 * (s.t / WARN); }
      if (i === s.mover && s.phase === 'move') {
        const k = Math.min(1, s.t / MOVE), e = k * k * (3 - 2 * k);
        const fx = m.ox + s.from[0] * m.S + m.S / 2, fz = m.oy + s.from[1] * m.S + m.S / 2;
        const tx = m.ox + s.to[0] * m.S + m.S / 2, tz = m.oy + s.to[1] * m.S + m.S / 2;
        x = fx + (tx - fx) * e; z = fz + (tz - fz) * e; y = Math.sin(k * Math.PI) * (pc.t === 'N' ? 5 : 3);
      }
      if (ud.nope > 0) { ud.nope -= dt; x += Math.sin(G.time * 60) * 0.1; }
      // a slide when pushed or landed: ease to the new square
      if (ud.x === undefined) { ud.x = x; ud.z = z; }
      if (s.phase === 'move' && i === s.mover) { ud.x = x; ud.z = z; }
      else { ud.x += (x - ud.x) * Math.min(1, dt * 9); ud.z += (z - ud.z) * Math.min(1, dt * 9); }
      mesh.position.set(ud.x, y, ud.z);
    });
    // the red square, pulsing faster as the move comes
    const w = this.warn!;
    if (s.phase === 'warn' || s.phase === 'move') {
      const k = s.phase === 'warn' ? s.t / WARN : 1;
      w.position.set(m.ox + s.to[0] * m.S + m.S / 2, 0.03, m.oy + s.to[1] * m.S + m.S / 2);
      (w.material as THREE.Material).opacity = 0.3 + 0.5 * Math.abs(Math.sin(G.time * (6 + k * 18)));
      w.visible = true;
    } else w.visible = false;
    // the clock: tick, tock, faster while a move is coming
    this.secT -= dt;
    if (this.secT <= 0 && s.phase !== 'mate') {
      this.secT = s.phase === 'warn' ? 0.25 : 1;
      this.sec++;
      G.audio?.ui?.(this.sec % 2 ? 'vx_tick' : 'vx_tock', s.phase === 'warn' ? 0.35 : 0.22);
    }
  }
}

// ---------------------------------------------------------------- the dimension system
export class DimensionSystem implements GameSystem {
  name = 'dims';
  board = new Board();
  private zoneKey = '';
  private moon = { base: 0, ph: 0, down: true, earth: null as THREE.Mesh | null };
  private stars: THREE.InstancedMesh | null = null;
  private bubbles: THREE.InstancedMesh | null = null;
  private bub: Float32Array | null = null;
  private pad: { nodes: AudioNode[]; gain: GainNode } | null = null;
  private tmpM = new THREE.Matrix4();
  private tmpV = new THREE.Vector3();

  update(dt: number) {
    const p = G.local;
    this.board.update(dt);
    if (!p || !G.view) return;
    const z = G.zone;
    if (z.key !== this.zoneKey) this.enter(z);
    const dim = z.meta.dimension as string | undefined;
    if (dim === 'moon') this.moonStep(dt, z);
    if (dim === 'meadow') this.meadowStep(dt);
    if (this.stars) this.stars.position.set(Math.round(p.x / 40) * 40, 0, Math.round(p.z / 40) * 40);
  }

  onNet(from: string, d: any) { this.board.onNet(from, d); }

  private enter(z: Zone) {
    this.zoneKey = z.key;
    const dim = z.meta.dimension as string | undefined;
    // stars below the void for the board and the moon
    if (dim === 'moon' || dim === 'chess') {
      if (!this.stars) this.buildStars();
      this.stars!.visible = true;
    } else if (this.stars) this.stars.visible = false;
    if (dim === 'moon') { if (!this.moon.earth) this.buildEarth(); this.moon.earth!.visible = true; this.moon.base = G.local.y; }
    else if (this.moon.earth) this.moon.earth.visible = false;
    if (this.bubbles) this.bubbles.visible = dim === 'meadow';
    this.setPad(dim || '');
  }

  // ---- the moon
  private moonStep(dt: number, z: Zone) {
    const p = G.local;
    const fall = G.floors?.fall;
    if (this.moon.earth) {
      // far behind the ground along the view: it fills the picture wherever the ground is missing
      const e = this.moon.earth, F = G.pr.forward(this.tmpV);
      e.position.set(G.pr.target.x + F.x * 80 + Math.cos(G.pr.yaw) * 9, G.pr.target.y + F.y * 80, G.pr.target.z + F.z * 80 - Math.sin(G.pr.yaw) * 9);
      e.rotation.y += dt * 0.02;
    }
    if (fall || p.body.dead || p.inVehicle || G.transitioning) { this.moon.base = p.y; return; }
    const ground = z.heightAt(Math.floor(p.x), Math.floor(p.z));
    this.moon.base += (ground - this.moon.base) * Math.min(1, dt * 6);
    const moving = p.speed > 0.3;
    const prev = this.moon.ph;
    if (moving || Math.sin(this.moon.ph) > 0.02) this.moon.ph += dt * (p.running ? 4.2 : 3.4);
    if (!moving && Math.floor(this.moon.ph / Math.PI) !== Math.floor(prev / Math.PI)) this.moon.ph = Math.floor(this.moon.ph / Math.PI) * Math.PI;
    const hop = Math.abs(Math.sin(this.moon.ph)) * (p.running ? 1.35 : 0.5);
    p.y = this.moon.base + hop;
    // a bound carries you further than a step
    if (moving && hop > 0.08) moveCircle(z, p, p.vx * dt * (p.running ? 0.45 : 0.25), p.vz * dt * (p.running ? 0.45 : 0.25), { ignoreLow: true });
    // touching down: a soft thud of dust
    if (Math.floor(this.moon.ph / Math.PI) !== Math.floor(prev / Math.PI) && moving) G.audio?.at?.('step_dirt', p.x, p.z, p.running ? 0.6 : 0.3);
  }

  // ---- the meadow: bubbles drifting up out of the grass
  private meadowStep(dt: number) {
    if (!this.bubbles) this.buildBubbles();
    const b = this.bubbles!, B = this.bub!, p = G.local;
    const N = b.count;
    for (let i = 0; i < N; i++) {
      let x = B[i * 4], y = B[i * 4 + 1], zz = B[i * 4 + 2];
      const sp = B[i * 4 + 3];
      y += dt * sp; x += Math.sin(G.time * 0.7 + i) * dt * 0.2;
      if (y > 7 || Math.abs(x - p.x) > 16 || Math.abs(zz - p.z) > 16) { x = p.x + (Math.random() - 0.5) * 28; zz = p.z + (Math.random() - 0.5) * 28; y = G.zone.heightAt(Math.floor(x), Math.floor(zz)) + Math.random() * 0.5; }
      B[i * 4] = x; B[i * 4 + 1] = y; B[i * 4 + 2] = zz;
      const s = 0.12 + (i % 5) * 0.06;
      this.tmpM.makeScale(s, s, s).setPosition(x, y, zz);
      b.setMatrixAt(i, this.tmpM);
    }
    b.instanceMatrix.needsUpdate = true;
  }
  private buildBubbles() {
    const N = 36;
    const mb = new ModelBuilder();
    mb.sphere(0, 0, 0, 1, 10, 7, 'white', { color: 0xf0e8ff, emissive: 0.6 });
    mb.sphere(-0.35, 0.4, 0.55, 0.22, 5, 3, 'white', { color: 0xffffff, emissive: 1 });
    const b = new THREE.InstancedMesh(mb.build(), worldMaterial({ transparent: true, opacity: 0.42, outline: 0, depthWrite: false, noVis: true }), N);
    b.frustumCulled = false;
    this.bub = new Float32Array(N * 4);
    const p = G.local;
    for (let i = 0; i < N; i++) { this.bub[i * 4] = p.x + (Math.random() - 0.5) * 28; this.bub[i * 4 + 1] = Math.random() * 6; this.bub[i * 4 + 2] = p.z + (Math.random() - 0.5) * 28; this.bub[i * 4 + 3] = 0.25 + Math.random() * 0.5; }
    G.pr.scene.add(b);
    this.bubbles = b;
  }

  // ---- shared: stars, the Earth
  private buildStars() {
    const N = 420;
    const mb = new ModelBuilder();
    mb.box(0, 0, 0, 0.35, 0.35, 0.35, 'white', { color: 0xffffff, emissive: 1 });
    const st = new THREE.InstancedMesh(mb.build(), worldMaterial({ unlit: true, noVis: true, noFog: true, outline: 0 }), N);
    for (let i = 0; i < N; i++) {
      const s = 0.5 + Math.random() * 1.2;
      this.tmpM.makeScale(s, s, s).setPosition((Math.random() - 0.5) * 220, -25 - Math.random() * 70, (Math.random() - 0.5) * 220);
      st.setMatrixAt(i, this.tmpM);
    }
    st.frustumCulled = false;
    G.pr.scene.add(st);
    this.stars = st;
  }
  private buildEarth() {
    const mb = new ModelBuilder();
    mb.sphere(0, 0, 0, 24, 28, 18, 'vx_earth', { fit: true, emissive: 1 });
    const e = new THREE.Mesh(mb.build(), worldMaterial({ unlit: true, noVis: true, noFog: true, outline: 0 }));
    e.rotation.z = Math.PI * 0.82; // the wrong way up
    e.frustumCulled = false;
    G.pr.scene.add(e);
    this.moon.earth = e;
  }

  // ---- a quiet pad per dimension on the ambience bus
  private setPad(dim: string) {
    const a = G.audio as any, ctx: AudioContext | null = a?.ctx ?? null;
    if (this.pad && ctx) { const old = this.pad; old.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.6); setTimeout(() => { for (const n of old.nodes) { try { (n as any).stop?.(); n.disconnect(); } catch { /* gone */ } } }, 3000); this.pad = null; }
    if (!ctx || (dim !== 'meadow' && dim !== 'moon' && dim !== 'chess')) return;
    const gain = ctx.createGain(); gain.gain.value = 0;
    gain.connect(a.buses?.amb || ctx.destination);
    const nodes: AudioNode[] = [gain];
    const freqs = dim === 'meadow' ? [261.6, 329.6, 392, 523.3] : dim === 'moon' ? [55, 82.4, 110.3] : [73.4, 87.3, 110];
    const lfo = ctx.createOscillator(); lfo.frequency.value = dim === 'meadow' ? 0.18 : 0.07;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.25; lfo.connect(lfoG);
    const trem = ctx.createGain(); trem.gain.value = 0.75; lfoG.connect(trem.gain); trem.connect(gain);
    nodes.push(lfo, lfoG, trem);
    for (const f of freqs) {
      const o = ctx.createOscillator(); o.type = dim === 'meadow' ? 'triangle' : 'sine'; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 8;
      const og = ctx.createGain(); og.gain.value = 0.05 / freqs.length * (dim === 'meadow' ? 1.6 : 2.2);
      o.connect(og); og.connect(trem); o.start(); nodes.push(o, og);
    }
    lfo.start();
    gain.gain.setTargetAtTime(dim === 'chess' ? 0.45 : 0.7, ctx.currentTime, 1.5);
    this.pad = { nodes, gain };
  }
}
