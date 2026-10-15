import { def, newRig, part, Rig } from '../species';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, ph } from '../../gfx/pixel';
import { tileFbm } from '../../core/rng';
import { lineOfSight } from '../../world/collision';
import { G } from '../../game/G';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import {
  CS, zoneOf, nm, netSet, pulse, attack, playersIn, stop, dist, faceTo, isAlone, instFlags, sfx, wallSpotsNear, WallSpot,
  hideRig, galleryPose, ease, lerp, suppressSighting,
} from '../behaviors_a';

// =====================================================================================
// THE DRYWALL MAN — a thin grey man who lives inside the walls. You see a face
// pressing out through the wallpaper, two handprints, a bulge that follows you
// along the corridor. If you are alone, he steps out.
// =====================================================================================

addTextureModule(() => {
  const A = atlas();
  // gypsum board skin: paper face, joint tape, screw dimples, pencil marks
  A.add('c_drywall_skin', 32, 32, (pc) => {
    const R = makeRamp(0x94928c, 7, { hueShift: 0.02 });
    pc.fillRamp(R, (x, y) => 0.55 + (tileFbm(x, y, 32, 32, 4, 3, 41) - 0.5) * 0.18, 0.4);
    for (let y = 0; y < 32; y++) { pc.blend(10, y, R[5], 0.35); pc.blend(11, y, R[5], 0.5); pc.blend(12, y, R[5], 0.35); }
    for (const [sx, sy] of [[4, 6], [20, 6], [4, 22], [20, 22], [27, 14]]) { pc.set(sx, sy, R[1]); pc.set(sx + 1, sy, R[2]); pc.set(sx, sy - 1, R[5]); }
    // hairline cracks
    let x = 16, y = 2;
    for (let i = 0; i < 12; i++) { pc.set(x, y, R[1]); x += ph(i, 3, 2) < 0.5 ? 1 : 0; y += 1; }
    pc.line(25, 25, 30, 29, R[2]);
    for (let i = 0; i < 6; i++) pc.set(2 + i, 29, 0x7a7a88); // pencil mark
  });
  A.add('c_drywall_face', 16, 24, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0x94928c, 7, { hueShift: 0.02 });
    pc.fillRamp(R, (x, y) => 0.58 - Math.abs(x - 7.5) * 0.02 + (tileFbm(x, y, 16, 24, 3, 2, 8) - 0.5) * 0.12, 0.4);
    // brow shadow and two deep slit eyes
    pc.hline(3, 12, 7, R[5]);
    for (const ex of [5, 10]) { for (let y = 8; y < 12; y++) pc.set(ex, y, 0x18161a); pc.set(ex + 1, 9, 0x2a282c); pc.set(ex - 1, 10, R[2]); }
    // long nose ridge
    for (let y = 9; y < 16; y++) { pc.set(8, y, R[6]); pc.set(7, y, R[3]); }
    // the mouth is a crack in the plaster
    const my = 18;
    for (let x = 3; x < 13; x++) pc.set(x, my + ((x * 7) % 3 === 0 ? 1 : 0), 0x141216);
    pc.set(2, my - 1, R[1]); pc.set(13, my + 2, R[1]); pc.set(12, my + 3, R[1]);
    // cracks radiating from it
    pc.line(4, 19, 2, 23, R[2]); pc.line(11, 20, 14, 23, R[2]); pc.line(9, 7, 11, 2, R[2]);
  });
});

const SKIN = 'c_drywall_skin';

function buildDrywall(): Rig {
  const rig = newRig(2.0);
  // ---- the whole man
  const hips = part(rig, 'hips', rig.body, [0, 1.0, 0], (mb) => { mb.box(0, -0.08, 0, 0.24, 0.13, 0.12, SKIN); });
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const th = part(rig, 'thigh' + n, hips, [s * 0.07, -0.06, 0], (mb) => { mb.box(0, -0.5, 0, 0.07, 0.5, 0.08, SKIN); });
    const sh = part(rig, 'shin' + n, th, [0, -0.5, 0], (mb) => {
      mb.box(0, -0.42, 0, 0.06, 0.42, 0.07, SKIN);
      mb.box(0, -0.44, 0.06, 0.07, 0.025, 0.22, SKIN); // long bare feet
    });
    void sh;
  }
  const spine = part(rig, 'spine', hips, [0, 0.04, 0], (mb) => {
    mb.box(0, 0, 0, 0.2, 0.3, 0.11, SKIN);
    mb.box(0, 0.28, -0.01, 0.27, 0.3, 0.13, SKIN); // chest, narrow and flat like a board
  });
  const neck = part(rig, 'neck', spine, [0, 0.58, -0.02], (mb) => { mb.box(0, 0, 0, 0.05, 0.15, 0.05, SKIN); });
  part(rig, 'head', neck, [0, 0.14, 0.02], (mb) => {
    mb.box(0, 0, 0, 0.15, 0.3, 0.15, { south: 'c_drywall_face', all: SKIN }, { fit: { south: true } });
    mb.box(0, 0.28, -0.01, 0.12, 0.04, 0.12, SKIN);
  });
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const ua = part(rig, 'uarm' + n, spine, [s * 0.165, 0.54, -0.01], (mb) => { mb.box(0, -0.46, 0, 0.055, 0.46, 0.06, SKIN); });
    const fa = part(rig, 'farm' + n, ua, [0, -0.46, 0], (mb) => { mb.box(0, -0.44, 0, 0.05, 0.44, 0.055, SKIN); });
    part(rig, 'hand' + n, fa, [0, -0.44, 0], (mb) => {
      mb.box(0, -0.1, 0, 0.075, 0.1, 0.03, SKIN);
      for (let k = -1; k <= 1; k++) mb.box(k * 0.024, -0.3, 0, 0.016, 0.2, 0.018, SKIN);
    });
  }
  // ---- what you see while he is still inside the wall: a face and two hands pressing through
  part(rig, 'relief', rig.body, [0, 0, 0], (mb) => {
    mb.box(0, 1.46, 0.0, 0.42, 0.6, 0.075, SKIN, { color: 0xd8d4c8 }); // the wall bulging
    mb.box(0, 1.52, 0.03, 0.2, 0.38, 0.075, { south: 'c_drywall_face', all: SKIN }, { fit: { south: true } });
    mb.box(0, 1.9, 0.02, 0.16, 0.05, 0.06, SKIN); // crown of the skull
    for (const s of [-1, 1]) {
      // flat palms pressed against the paper, fingers splayed
      const hx = s * 0.38, hy = 1.22 + (s > 0 ? 0.14 : 0);
      mb.box(hx, hy, 0.0, 0.11, 0.12, 0.068, SKIN);
      for (let k = -1; k <= 1; k++) { mb.push().translate(hx + k * 0.032, hy + 0.11, 0).rotateZ(-k * 0.28 - s * 0.1); mb.box(0, 0, 0, 0.02, 0.21, 0.064, SKIN); mb.pop(); }
      mb.push().translate(hx - s * 0.06, hy + 0.04, 0).rotateZ(s * 1.0); mb.box(0, 0, 0, 0.02, 0.12, 0.062, SKIN); mb.pop();
    }
  });
  return rig;
}

function walkPose(rig: Rig, moving: boolean, phase: number, t: number, atk: number) {
  const P = rig.parts;
  const sw = moving ? Math.sin(phase * 0.8) : 0;
  P.thighL.rotation.x = sw * 0.45; P.thighR.rotation.x = -sw * 0.45;
  P.shinL.rotation.x = Math.max(0, -sw) * 0.6; P.shinR.rotation.x = Math.max(0, sw) * 0.6;
  P.spine.rotation.x = 0.22 + atk * 0.3;
  P.neck.rotation.x = 0.25; P.head.rotation.x = -0.15 + Math.sin(t * 0.7) * 0.05;
  P.head.rotation.z = Math.sin(Math.floor(t * 0.8) * 7.1) * 0.25; // a slow, wrong tilt that snaps between angles
  P.uarmL.rotation.x = -sw * 0.25 - atk * 1.6; P.uarmR.rotation.x = sw * 0.25 - atk * 1.9;
  P.uarmL.rotation.z = 0.08; P.uarmR.rotation.z = -0.08;
  P.farmL.rotation.x = -0.15 - atk * 0.3; P.farmR.rotation.x = -0.1 - atk * 0.2;
  rig.body.position.y = moving ? Math.abs(Math.cos(phase * 0.8)) * 0.03 : 0;
}

function animateDrywall(rig: Rig, c: Creature, t: number, dt: number) {
  void dt;
  const n = nm(c);
  const ph = c.dead ? 2 : (n.ph ?? 2);
  if (ph !== c.mem._lph) { c.mem._lph = ph; c.mem._pht = t; }
  suppressSighting(c, ph === 0);
  if (ph === 0) { hideRig(c, rig); return; }
  const P = rig.parts;
  const inWall = ph === 1;
  P.relief.visible = inWall;
  P.hips.visible = !inWall;
  if (inWall) {
    // pressing slowly out of the wall; it breathes against the paper
    const k = ease((t - c.mem._pht) / 1.6);
    P.relief.position.z = -0.06 + k * 0.11 + Math.sin(t * 2.2) * 0.008; // the wall face is ~0.04 in front of the pivot
    P.relief.scale.set(1, 1, 0.6 + k * 0.4);
    rig.body.position.y = 0;
    return;
  }
  walkPose(rig, c.speed > 0.2, c.phase, t, c.attackPhase > 0 ? 1 : 0);
}

// ---------------------------------------------------------------- brain
function pin(c: Creature, s: WallSpot, out: number) {
  c.x = s.x + s.nx * out; c.z = s.z + s.nz * out;
  c.facing = c.targetFacing = Math.atan2(s.nz, s.nx);
  stop(c);
}
/** a wall face next to the player, facing them, ideally behind their back */
function spotNear(c: Creature, p: Player): WallSpot | null {
  const z = zoneOf(c);
  const list = wallSpotsNear(z, p.x, p.z, 3).filter((s) => {
    const d = dist(s.x, s.z, p.x, p.z);
    if (d < 1.1 || d > 3.2) return false;
    if ((p.x - s.x) * s.nx + (p.z - s.z) * s.nz < 0.5) return false;
    return lineOfSight(z, s.x + s.nx * 0.4, s.z + s.nz * 0.4, p.x, p.z);
  });
  if (!list.length) return null;
  const behind = (s: WallSpot) => { let a = Math.atan2(s.z - p.z, s.x - p.x) - p.facing; a = Math.atan2(Math.sin(a), Math.cos(a)); return Math.abs(a) + CS().rng.float(0, 0.8); };
  list.sort((a, b) => behind(b) - behind(a));
  return list[0];
}
function nearestWall(c: Creature): WallSpot | null {
  const z = zoneOf(c);
  let best: WallSpot | null = null, bd = Infinity;
  for (const s of wallSpotsNear(z, c.x, c.z, 4)) {
    if ((c.x - s.x) * s.nx + (c.z - s.z) * s.nz < 0) continue; // must be on our side
    const d = dist(s.x, s.z, c.x, c.z);
    if (d < bd && lineOfSight(z, c.x, c.z, s.x + s.nx * 0.3, s.z + s.nz * 0.3)) { bd = d; best = s; }
  }
  return best;
}
function lonePrey(c: Creature, r = 24): Player | null {
  let best: Player | null = null, bd = r;
  for (const p of playersIn(c)) {
    if (!isAlone(p, 8)) continue;
    const d = dist(p.x, p.z, c.x, c.z);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
function goTravel(c: Creature, s: WallSpot, then: 'hide' | 'watch') {
  c.mem.dest = s; c.mem.then = then;
  c.setState('travel'); netSet(c, 'ph', 0);
}

function thinkDrywall(c: Creature, dt: number): boolean {
  const cs = CS();
  const ev = pulse(c);
  const P = c.targetId ? G.players.get(c.targetId) ?? null : null;
  const inWall = c.state === 'hide' || c.state === 'travel' || c.state === 'watch';
  instFlags(c, { immortal: inWall, ghost: inWall || c.state === 'emerge' });
  c.radius = inWall ? 0.05 : 0.28;
  // first think: melt into the nearest wall
  if (!c.mem.spot && c.state !== 'travel') {
    const s = nearestWall(c) || wallSpotsNear(zoneOf(c), c.x, c.z, 8)[0];
    if (s) { c.mem.spot = s; pin(c, s, 0.02); c.setState('hide'); netSet(c, 'ph', 0); }
  }
  switch (c.state) {
    case 'hide': {
      if (c.mem.spot) pin(c, c.mem.spot, 0.02);
      netSet(c, 'ph', 0);
      if (G.time < (c.mem.cool ?? 0)) return true;
      const p = lonePrey(c);
      if (p) {
        const s = spotNear(c, p);
        if (s) { c.targetId = p.id; goTravel(c, s, 'watch'); }
      } else if (c.stateT > 20 && cs.rng.chance(dt * 0.05)) {
        // drift somewhere else inside the walls
        const s = wallSpotsNear(zoneOf(c), c.x + cs.rng.float(-12, 12), c.z + cs.rng.float(-12, 12), 4)[0];
        if (s) goTravel(c, s, 'hide');
      }
      return true;
    }
    case 'travel': {
      const s: WallSpot | undefined = c.mem.dest;
      if (!s) { c.setState('hide'); return true; }
      const tx = s.x + s.nx * 0.02, tz = s.z + s.nz * 0.02;
      const d = dist(tx, tz, c.x, c.z);
      const step = 3.4 * dt;
      if (d <= step) {
        c.mem.spot = s; pin(c, s, 0.02);
        const watch = c.mem.then === 'watch';
        c.setState(watch ? 'watch' : 'hide');
        if (watch) { netSet(c, 'ph', 1); sfx(c, 'scrape_wall', 0.9); c.mem.watchFor = 1.6 + cs.rng.float(0, 2.2); }
        return true;
      }
      c.x += ((tx - c.x) / d) * step; c.z += ((tz - c.z) / d) * step;
      c.facing = c.targetFacing = Math.atan2(tz - c.z, tx - c.x);
      c.speed = 0; c.vx = c.vz = 0;
      if ((c.mem.scrapeT ?? 0) < G.time) { c.mem.scrapeT = G.time + 2.2 + cs.rng.float(0, 1.5); sfx(c, 'scrape_wall', 0.6); }
      // the prey moved off: re-aim at a wall near where they are now
      if (c.mem.then === 'watch' && P && c.stateT > 1 && dist(P.x, P.z, s.x, s.z) > 3.6) {
        const s2 = spotNear(c, P); if (s2) c.mem.dest = s2; c.stateT = 0;
      }
      if (c.stateT > 15) c.setState('hide');
      return true;
    }
    case 'watch': {
      const s: WallSpot = c.mem.spot;
      pin(c, s, 0.02);
      netSet(c, 'ph', 1);
      if (!P || P.body.dead || P.zoneKey !== c.zoneKey) { c.setState('hide'); return true; }
      if (ev.staggered) { // a blow to the face in the wall: he pulls back
        c.mem.cool = G.time + 12; cs.call(c, 'hurt');
        const far = wallSpotsNear(zoneOf(c), c.x + cs.rng.float(-10, 10), c.z + cs.rng.float(-10, 10), 4)[0];
        if (far) goTravel(c, far, 'hide'); else c.setState('hide');
        return true;
      }
      const d = dist(P.x, P.z, c.x, c.z);
      if (!isAlone(P, 8) || d > 4.5) {
        // company, or they walked off: follow along the wall or give up
        if (isAlone(P, 8) && d < 14) { const s2 = spotNear(c, P); if (s2) { goTravel(c, s2, 'watch'); return true; } }
        c.setState('hide'); c.mem.cool = G.time + 4; return true;
      }
      if ((c.mem.scrapeT ?? 0) < G.time) { c.mem.scrapeT = G.time + 1.8; sfx(c, 'scrape_wall', 0.8); }
      if (c.stateT > (c.mem.watchFor ?? 2.5)) {
        c.setState('emerge'); netSet(c, 'ph', 2); cs.call(c, 'alert');
      }
      return true;
    }
    case 'emerge': {
      const s: WallSpot = c.mem.spot;
      const k = ease(c.stateT / 0.8);
      pin(c, s, lerp(0.02, 0.62, k));
      if (P) c.facing = c.targetFacing = Math.atan2(P.z - c.z, P.x - c.x) * k + Math.atan2(s.nz, s.nx) * (1 - k);
      if (c.stateT >= 0.8) { c.setState('chase'); c.mem.hits = 0; }
      return true;
    }
    case 'chase': {
      netSet(c, 'ph', 2);
      if (!P || P.body.dead || P.zoneKey !== c.zoneKey) { c.setState('flee'); return true; }
      const d = dist(P.x, P.z, c.x, c.z);
      if ((c.mem.hits ?? 0) >= 2 || c.stateT > 7 || !isAlone(P, 6) || c.hp < c.sp.hp * 0.55 || d > 9) { c.setState('flee'); return true; }
      const reach = (c.sp.attack?.range ?? 0.9) + P.radius;
      if (d <= reach) {
        faceTo(c, P.x, P.z); stop(c);
        if (c.attackT <= 0) { attack(c, P); c.mem.hits = (c.mem.hits ?? 0) + 1; }
        return true;
      }
      cs.moveTo(c, zoneOf(c), P.x, P.z, c.sp.run, dt, reach * 0.8);
      return true;
    }
    case 'flee': {
      netSet(c, 'ph', 2);
      // back to the nearest wall, then sink into it
      if (!c.mem.back) c.mem.back = nearestWall(c);
      const s: WallSpot | null = c.mem.back;
      if (!s) { if (cs.moveTo(c, zoneOf(c), c.home.x, c.home.z, c.sp.run, dt, 1) || c.stateT > 8) { c.mem.back = null; c.mem.spot = null; } return true; }
      const ex = s.x + s.nx * 0.6, ez = s.z + s.nz * 0.6;
      if (c.mem.sinkT === undefined) {
        if (cs.moveTo(c, zoneOf(c), ex, ez, c.sp.run, dt, 0.25) || c.stateT > 6) { c.mem.sinkT = 0; c.x = ex; c.z = ez; }
        return true;
      }
      instFlags(c, { ghost: true });
      c.mem.sinkT += dt;
      pin(c, s, lerp(0.6, 0.02, ease(c.mem.sinkT / 0.7)));
      if (c.mem.sinkT >= 0.7) {
        c.mem.sinkT = undefined; c.mem.back = null; c.mem.spot = s;
        c.mem.cool = G.time + 10 + cs.rng.float(0, 10);
        c.setState('hide'); netSet(c, 'ph', 0);
        sfx(c, 'scrape_wall', 0.7);
      }
      return true;
    }
    default:
      // 'idle' at spawn, or anything the manager set
      if (c.state === 'idle' || c.state === 'wander') { c.mem.spot = null; c.setState('hide'); }
      else { c.setState('flee'); }
      return true;
  }
}

const sp = def({
  key: 'drywall_man', name: 'Drywall Man', code: 'E-27 // PARIETAL', temperament: 'stalker', threat: 3,
  hp: 55, walk: 1.3, run: 3.9, turn: 9, radius: 0.28, height: 2.05, sight: 14, fov: 1.6, hearing: 1.6,
  attack: { dmg: [8, 15], range: 0.95, cooldown: 1.2, kinds: ['laceration', 'scratch', 'deep'], corrupt: 0.15, knock: -0.3 },
  zones: ['office', 'tunnels', 'corrupt', 'house', 'school'], weight: 1.5, maxPerZone: 2, diet: 'meat',
  flags: { wallHider: true, ghost: true },
  sounds: { idle: 'scrape_wall', alert: 'plaster_crack', attack: 'drywall_wheeze', hurt: 'drywall_wheeze', death: 'drywall_die', step: 'pad' },
  scan: {
    cls: 'Wall-dweller / stalker',
    notes: [
      'Lives inside the walls. Moves through them like they are not there. Scraping follows you down corridors.',
      'Only comes out for someone who is alone. Stay within a few metres of a friend and he stays in the wall.',
      'A face pressing through the wallpaper means he is about to step out. Hit the face and he pulls back.',
      'Cannot be hurt while inside the wall. Out in the open he is thin and breaks like board.',
      'The SEER-9 radar still pings him behind the plaster.',
    ],
  },
  gore: { blood: 'plaster', sever: ['uarmL', 'uarmR', 'farmL', 'farmR', 'handL', 'handR', 'thighL', 'thighR', 'shinL', 'shinR'], head: 'head' },
  build: buildDrywall,
  animate: animateDrywall,
  think: thinkDrywall,
});
(sp as any).animateGallery = (rig: Rig, t: number) => {
  const q = galleryPose('');
  const inWall = q === 'wall';
  rig.parts.relief.visible = inWall; rig.parts.hips.visible = !inWall;
  if (inWall) { rig.parts.relief.position.z = 0.05; return; }
  walkPose(rig, q === 'walk', t * 5, t, q === 'attack' ? 1 : 0);
};
