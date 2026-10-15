import * as THREE from 'three';
import { def, newRig, part, Rig } from '../species';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, ph } from '../../gfx/pixel';
import { tileFbm } from '../../core/rng';
import { G } from '../../game/G';
import type { Creature } from '../creature';
import type { Zone } from '../../world/zone';
import { net, netOf, snd, playersIn, dist, hold, hashId, fakeCreature, rng, fxPoll, playAt, live, seenByAny, localIn, thinkOnce, partB, matB, lineOfSightB } from '../behaviors_b';
import '../../audio/sounds_creatures_b';

// The Occupant: something that fills corridors. A wall of carpet grown into
// flesh, studded with dim eyes, dragging itself along long straight halls at
// walking pace. It is heard minutes before it is seen (a rumble felt through
// the floor). It cannot be hurt and touching it is close to fatal. It never
// enters side rooms and cannot open doors: get off the corridor, close a door,
// stay quiet, and let it pass. It comes, and then it goes, like weather.

addTextureModule(() => {
  const A = atlas();
  // carpet that has become skin: dingy loop-pile with pink-grey folds pushing through
  A.add('c_occupant_flesh', 32, 32, (pc) => {
    const C = makeRamp(0x8e7f4c, 6, { hueShift: 0.04 });
    const F = makeRamp(0x76524e, 6, { hueShift: 0.05 });
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const f = tileFbm(x, y, 32, 32, 3, 3, 41);
      if (f > 0.6) {
        const v = (f - 0.6) / 0.4;
        const fold = Math.sin(y * 1.1 + Math.sin(x * 0.4) * 2) > 0.6;
        pc.set(x, y, F[Math.min(5, Math.max(0, Math.round(1.5 + v * 2.5 + (fold ? -1 : 0) + (ph(x, y, 3) - 0.5) * 0.8)))]);
      } else {
        const loop = ((x >> 1) + (y >> 1)) % 2 === 0 ? 1 : 0;
        const matted = f > 0.5 ? -1 : 0; // pile matted down near the flesh
        pc.set(x, y, C[Math.min(5, Math.max(0, Math.round(2 + loop * 0.6 + matted + (ph(x, y, 5) - 0.5) * 1.2)))]);
      }
    }
    // dark wet seams where carpet meets meat
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const f = tileFbm(x, y, 32, 32, 3, 3, 41);
      if (f > 0.58 && f < 0.61) pc.set(x, y, 0x2e1c18);
    }
    for (let i = 0; i < 5; i++) { const x = (i * 11 + 3) % 32, y = (i * 7 + 9) % 32; if (tileFbm(x, y, 32, 32, 3, 3, 41) > 0.66) pc.set(x, y, 0xb88a80); } // wet highlights
  });
  A.add('c_occupant_eye', 8, 6, (pc) => {
    pc.wrap = false;
    pc.fill(0x3a1e18); // wet socket
    pc.hline(2, 5, 1, 0xd8cfa4); pc.hline(1, 6, 2, 0xe6ddb4); pc.hline(1, 6, 3, 0xd8cfa4); pc.hline(2, 5, 4, 0xbcae84);
    pc.set(3, 2, 0x120a06); pc.set(4, 2, 0x120a06); pc.set(3, 3, 0x120a06); pc.set(4, 3, 0x2a1a0c); // pupil
    pc.set(2, 2, 0xfffbe8); // glint
    pc.set(0, 0, 0x5a2e26); pc.set(7, 5, 0x5a2e26);
  });
  A.add('c_occupant_tube', 4, 16, (pc) => { pc.wrap = false; pc.fill(0xf0f4d8); pc.vline(0, 0, 15, 0xc8ccb0); pc.set(2, 0, 0x8a8a7a); pc.set(2, 15, 0x8a8a7a); });
});

const SEG = 4;
const EYES = 18;
const FRONT_Z = 2.2;

function buildOccupant(): Rig {
  const rig = newRig(2.3);
  const T = 'c_occupant_flesh';
  // the face of it: a lumpy convex wall filling the corridor
  part(rig, 'front', rig.body, [0, 0, FRONT_Z], (mb) => {
    mb.box(0, 0, -0.3, 2.3, 2.3, 0.5, T);
    mb.box(-0.15, 0.15, 0.0, 1.9, 1.95, 0.22, T); // bulge
    mb.box(-0.55, 1.15, 0.15, 0.75, 0.9, 0.2, T);
    mb.box(0.62, 0.45, 0.12, 0.65, 0.75, 0.2, T);
    mb.box(0.2, 1.75, 0.08, 0.9, 0.5, 0.18, T);
    mb.box(-0.8, 0.2, 0.1, 0.5, 0.6, 0.15, T);
    mb.box(0.1, 2.2, -0.35, 1.9, 0.3, 0.45, T); // ceiling-scraping ridge
    mb.box(-1.05, 1.6, -0.25, 0.3, 0.9, 0.35, T); // shoulders pressing the walls
    mb.box(1.05, 1.3, -0.25, 0.3, 1.1, 0.35, T);
    // a fringe of small human fingers along the floor
    for (let i = 0; i < 12; i++) mb.box(-1.0 + i * 0.18, 0, 0.12 + (i % 3) * 0.04, 0.035, 0.05, 0.16, T, { color: 0xd8b0a0 });
  });
  for (let i = 0; i < SEG; i++) {
    const zc = FRONT_Z - 0.85 - i * 1.15;
    const w = 2.2 - i * 0.14, h = 2.25 - i * 0.2;
    const off = (i % 2 ? 1 : -1) * 0.08;
    part(rig, 'seg' + i, rig.body, [off, 0, zc], (mb) => {
      mb.box(0, 0, 0, w, h * 0.92, 1.3, T);
      mb.box((i % 2 ? -1 : 1) * w * 0.2, h * 0.85, 0.1, w * 0.6, h * 0.18, 0.95, T); // hump
      mb.box(0, h * 0.4, 0.55, w + 0.12, h * 0.45, 0.25, T); // fold ring between segments
      // carpet flaps hanging off the sides
      mb.box(w / 2 + 0.03, 0.1, -0.2 + (i % 3) * 0.15, 0.04, h * 0.6, 0.45, T);
      mb.box(-w / 2 - 0.03, 0.05, 0.1 - (i % 2) * 0.2, 0.04, h * 0.5, 0.4, T);
      // a fluorescent tube grown into its back, still faintly lit
      if (i % 2 === 0) mb.box(0.3 - i * 0.1, h * 1.02, 0, 0.08, 0.06, 0.9, 'c_occupant_tube', { fit: true, emissive: 0.7 });
    });
  }
  // eyes on the root so they show through darkness (a constellation coming down the hall)
  const eyes = new THREE.Group();
  eyes.name = 'eyes';
  rig.root.add(eyes);
  rig.parts.eyes = eyes;
  for (let i = 0; i < EYES; i++) {
    const a = hashId('eye' + i), b = hashId('eye' + i, 7);
    const x = (a - 0.5) * 1.9, y = 0.3 + b * 1.95;
    const s = 1 + hashId('eye' + i, 3) * 1.3 + (i < 3 ? 1.2 : 0);
    partB(rig, 'eye' + i, eyes, [x, y, FRONT_Z + 0.25], (mb) => {
      mb.box(0, -0.035 * s, 0, 0.1 * s, 0.075 * s, 0.03, 'c_occupant_eye', { fit: true, emissive: 0.45 });
    }, matB('glow'));
  }
  rig.eyes = [eyes];
  return rig;
}

function animateOccupant(rig: Rig, c: Creature, t: number, dt: number) {
  const P = rig.parts;
  const n = netOf(c);
  const ud = rig.root.userData as { w?: number };
  // fill the corridor: scale the whole mass to its width
  const wTarget = Math.min(1.35, Math.max(0.6, ((n.w ?? 2.4) - 0.15) / 2.3));
  ud.w = (ud.w ?? wTarget) + (wTarget - (ud.w ?? wTarget)) * Math.min(1, dt * 1.5);
  rig.body.scale.x = ud.w;
  P.eyes.scale.x = ud.w;
  // peristalsis: a slow wave runs back along the segments
  const moving = c.speed > 0.05;
  const k = moving ? 1 : 0.35;
  for (let i = 0; i < SEG; i++) {
    const s = P['seg' + i];
    const ph0 = t * 1.3 - i * 1.1;
    s.position.y = Math.max(0, Math.sin(ph0)) * 0.08 * k;
    s.scale.set(1 + Math.sin(ph0) * 0.035 * k, 1 + Math.sin(ph0 + 1) * 0.03 * k, 1);
  }
  const lunge = c.attackPhase > 0 ? Math.sin((0.38 - c.attackPhase) / 0.38 * Math.PI) * 0.45 : 0;
  P.front.position.z = FRONT_Z + Math.sin(t * 1.3 + 1.1) * 0.05 * k + lunge;
  P.front.scale.set(1 + Math.sin(t * 0.9) * 0.02, 1, 1);
  P.eyes.position.z = P.front.position.z - FRONT_Z;
  // eyes blink out of sync; some keep looking at you
  for (let i = 0; i < EYES; i++) {
    const e = P['eye' + i];
    const r = hashId('eye' + i, 11);
    const blink = ((t * (0.15 + r * 0.25) + r * 7) % 1) < 0.06;
    e.scale.y = blink ? 0.1 : 1;
  }
  const e = fxPoll(rig, c);
  if (e) playAt(e.key, c, e.a.v ?? 1, e.a.r ?? 60);
  // dread: the floor shakes, the survivor knows
  const p = localIn(c);
  if (p && !c.dead && live()) {
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    if (d < 22) G.pr.shake = Math.max(G.pr.shake, (1 - d / 22) * 0.55 * (moving ? 1 : 0.5));
    if (d < 34) thinkOnce(p, 'occupant_near', ['The floor is humming. Something huge is in the halls.', 'Get off the corridor. Find a room with a door.', 'Don\'t breathe. Let it pass.'][Math.floor(t) % 3], 150);
    if (c.visibleToLocal && d < 14) p.body.panic = Math.min(100, p.body.panic + dt * (14 - d) * 0.9);
  }
}

// ---------------------------------------------------------------- brain (host)
interface Route { x: number; y: number; dx: number; dy: number; len: number; s: number }
const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const passable = (z: Zone, x: number, y: number, dx: number, dy: number) => z.canStep(x, y, dx, dy, true) && z.floorAt(x + dx, y + dy)?.water !== 'deep';

function runLen(z: Zone, x: number, y: number, dx: number, dy: number, max = 70): number {
  let n = 0;
  while (n < max && passable(z, x, y, dx, dy)) { x += dx; y += dy; n++; }
  return n;
}
/** free width across the run direction at a tile (1 = a one-tile corridor) */
function widthAt(z: Zone, x: number, y: number, dx: number, dy: number): number {
  const px = -dy, py = dx;
  let w = 1;
  for (const s of [1, -1]) { let cx = x, cy = y; for (let k = 0; k < 3; k++) { if (!passable(z, cx, cy, px * s, py * s)) break; cx += px * s; cy += py * s; w++; } }
  return w;
}
/** pick the best onward run from a tile (never straight back unless trapped); `toward` biases it to a heard noise */
function bestRoute(z: Zone, x: number, y: number, from?: [number, number], toward?: { x: number; z: number } | null): Route | null {
  let best: Route | null = null, bs = 0;
  const nd = toward ? Math.hypot(toward.x - x, toward.z - y) || 1 : 1;
  for (const [dx, dy] of DIRS) {
    if (from && dx === -from[0] && dy === -from[1]) continue;
    const len = runLen(z, x, y, dx, dy);
    if (len < 5) continue;
    const w = widthAt(z, x + dx * Math.min(3, len), y + dy * Math.min(3, len), dx, dy);
    const lure = toward ? 1 + 1.5 * Math.max(0, (dx * (toward.x - x) + dy * (toward.z - y)) / nd) : 1;
    const score = len * (w <= 4 ? 1 : 0.45) * (from && dx === from[0] && dy === from[1] ? 1.3 : 1) * lure * rng.float(0.8, 1.2);
    if (score > bs) { bs = score; best = { x, y, dx, dy, len, s: 0 }; }
  }
  if (!best && from) { const len = runLen(z, x, y, -from[0], -from[1]); if (len > 0) best = { x, y, dx: -from[0], dy: -from[1], len, s: 0 }; }
  return best;
}
/** find the end of a long corridor somewhere out of sight and start there */
function findCorridor(z: Zone, c: Creature): Route | null {
  const ps = playersIn(c.zoneKey);
  for (let t = 0; t < 40; t++) {
    const ref = ps.length ? rng.pick(ps) : { x: c.x, z: c.z };
    const a = rng.float(0, Math.PI * 2), r = rng.float(24, 50);
    const x = Math.floor(ref.x + Math.cos(a) * r), y = Math.floor(ref.z + Math.sin(a) * r);
    if (!z.inb(x, y) || !z.floor[z.idx(x, y)] || z.solid[z.idx(x, y)]) continue;
    for (const [dx, dy] of DIRS) {
      const back = runLen(z, x, y, -dx, -dy);
      const sx = x - dx * back, sy = y - dy * back;
      const len = runLen(z, sx, sy, dx, dy);
      if (len < 14 || widthAt(z, sx + dx * 2, sy + dy * 2, dx, dy) > 4) continue;
      if (seenByAny(z, sx + 0.5, sy + 0.5, 40) || ps.some((p) => Math.hypot(p.x - sx, p.z - sy) < 18)) continue;
      return { x: sx, y: sy, dx, dy, len, s: 0 };
    }
  }
  return null;
}

function thinkOccupant(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey);
  const n = net(c);
  const m = c.mem;
  const cs = G.creatures;
  hold(c);
  m.life = m.life ?? rng.float(150, 260);
  m.age = (m.age ?? 0) + dt;
  // leaving: once its time is up it simply is not there the next time anyone looks
  if (m.age > m.life && !seenByAny(z, c.x, c.z, 40) && playersIn(c.zoneKey).every((p) => dist(p, c) > 16)) { cs.remove(c); return true; }
  let r: Route | null = m.route;
  if (!r) {
    const tx = Math.floor(c.x), ty = Math.floor(c.z);
    r = bestRoute(z, tx, ty);
    // it belongs in corridors: look for a proper one before settling for an open room
    if (!r || r.len < 10 || widthAt(z, tx + r.dx, ty + r.dy, r.dx, r.dy) > 4) r = findCorridor(z, c) || (r && r.len >= 10 ? r : null);
    if (!r) { m.fails = (m.fails ?? 0) + 1; if (m.fails > 12) cs.remove(c); return true; }
    m.route = r;
    c.facing = c.targetFacing = Math.atan2(r.dy, r.dx);
  }
  // ambience: rumble felt through the floor, distant thuds
  m.rumbleT = (m.rumbleT ?? rng.float(1, 4)) - dt;
  if (m.rumbleT <= 0) { m.rumbleT = rng.float(7, 12); cs.call(c, 'idle'); }
  m.thudT = (m.thudT ?? rng.float(5, 12)) - dt;
  if (m.thudT <= 0) { m.thudT = rng.float(12, 26); cs.call(c, 'call'); }
  // noise draws it: it turns toward what it heard at the next junction and hurries a little
  if (c.lastHeard && G.time - c.lastHeard.t < 0.6 && c.lastHeard.r > 2) m.noise = { x: c.lastHeard.x, z: c.lastHeard.z, t: G.time };
  const lure = m.noise && G.time - m.noise.t < 20 ? m.noise : null;
  const pace = lure && G.time - lure.t < 6 ? c.sp.run : c.sp.walk;
  // blocked by a closed door: press, thud, then go back the way it came
  const i = Math.floor(r.s + 0.5);
  const tx = r.x + r.dx * i, ty = r.y + r.dy * i;
  const nextS = r.s + pace * dt;
  const crossing = Math.floor(nextS + 0.5) > i;
  if (crossing && !passable(z, tx, ty, r.dx, r.dy)) {
    c.setState('warn');
    m.pressT = (m.pressT ?? 0) + dt;
    if (m.pressT > 3.5) {
      m.pressT = 0;
      cs.call(c, 'alert');
      const back = bestRoute(z, tx, ty, [r.dx, r.dy]) || bestRoute(z, tx, ty);
      if (back) { m.route = back; c.targetFacing = Math.atan2(back.dy, back.dx); }
    }
  } else if (r.s >= r.len) {
    // junction or dead end: choose the longest way on
    const nr = bestRoute(z, tx, ty, [r.dx, r.dy], lure);
    if (nr) { m.route = nr; c.targetFacing = Math.atan2(nr.dy, nr.dx); }
    else m.route = null;
  } else {
    c.setState('travel');
    m.pressT = 0;
    r.s = Math.min(r.len, nextS);
  }
  const rr: Route = m.route || r;
  c.x = rr.x + 0.5 + rr.dx * rr.s; c.z = rr.y + 0.5 + rr.dy * rr.s;
  c.speed = c.state === 'travel' ? pace : 0;
  c.phase += c.speed * dt * 1.5;
  n.w = widthAt(z, Math.floor(c.x), Math.floor(c.z), rr.dx, rr.dy);
  // contact: anything inside the mass is crushed
  if (c.attackT <= 0) {
    const fx0 = Math.cos(c.facing), fz0 = Math.sin(c.facing);
    const halfW = Math.min(1.6, n.w * 0.5) + 0.1;
    for (const p of playersIn(c.zoneKey)) {
      const dx = p.x - c.x, dz = p.z - c.z;
      const lon = dx * fx0 + dz * fz0, lat = -dx * fz0 + dz * fx0;
      if (lon > FRONT_Z + 0.35 + p.radius || lon < -2.6 || Math.abs(lat) > halfW + p.radius) continue;
      if (!lineOfSightB(z, c.x, c.z, p.x, p.z)) continue;
      cs.startAttack(c, p);
      break;
    }
  }
  return true;
}

const S = def({
  key: 'occupant', name: 'The Occupant', code: 'E-00 // OCCUPANT', temperament: 'hazard', threat: 5,
  hp: 9999, walk: 0.85, run: 1.3, turn: 1.4, radius: 1.1, height: 2.5, sight: 8, fov: 1, hearing: 1.4,
  attack: { dmg: [55, 80], range: 2.7, cooldown: 1.4, kinds: ['fracture', 'deep', 'bruise'], corrupt: 0.25, knock: 2.8, parts: ['torso_u', 'torso_l', 'head', 'uarm_l', 'uarm_r', 'thigh_l', 'thigh_r'] },
  zones: ['lobby', 'tunnels', 'stairwell', 'parking', 'corrupt'], weight: 0.2, maxPerZone: 1,
  flags: { leviathan: true, immortal: true, noCorpse: true },
  sounds: snd({ idle: 'leviathan_rumble', alert: 'door_kick', call: 'thud_distant', attack: 'occupant_crush', hurt: 'occupant_groan', step: 'occupant_drag' }),
  scan: {
    cls: 'Leviathan / environmental hazard',
    notes: [
      'Fills the corridor wall to wall. Carpet, grown into something alive. Many eyes.',
      'Heard long before seen: a rumble through the floor. When the floor hums, get off the long hallways.',
      'Cannot be hurt. Contact crushes. It never turns into side rooms and cannot open doors: close one between you and it.',
      'Noise draws it: running, shouting and gunfire turn it your way at the next junction. Stay quiet and let it pass.',
    ],
  },
  gore: { blood: 'none' },
  build: buildOccupant,
  animate: animateOccupant,
  think: thinkOccupant,
});
(S as any).animateGallery = (rig: Rig, t: number) => {
  const c = fakeCreature(S, { id: 'g5', state: 'travel', speed: 0.85, mem: { netMem: { w: 2.4 } } });
  animateOccupant(rig, c, t, 1 / 60);
};
