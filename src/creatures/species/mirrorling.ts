// MIRRORLING: a thin quicksilver figure with an oval hand-mirror for a head.
// The first time it sees you, a line is drawn between you, and from then on
// it is your reflection in that line: step toward it and it steps toward you,
// back away and it backs away, walk left and it walks left. The line creeps
// slowly toward you. Meet it at the line and it has you. But a reflection
// has to go where yours would: walk so that its copy of you walks into a wall
// and it cracks. Three cracks and it shatters.
import { horrify } from '../kit/horror';
import { def, newRig, Rig } from '../species';
import { G } from '../../game/G';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { Page, V3, bpart, registerPage, applyLook, galleryDriver, lerp, damp, ramp } from '../kit/beasts';
import { rot, vis, skin, flat, buildHumanoid, humWalk, surface } from '../kit/oddkit';
import { net, netOf, snd, playersIn, dist, hold, hashId, rng, fx, fxPoll, playAt, walkable } from '../behaviors_b';
import { pulse, attack } from '../behaviors_a';
import { ruleShown } from '../rules';
import { defDread } from '../dread';
import { lineOfSight } from '../../world/collision';
import { mixHex } from '../../gfx/pixel';
import '../../audio/sounds_creatures_d';

const PG = registerPage(new Page('c_mirpg', 96, 96, [
  ['SILVER', 48, 40], ['LIMB', 16, 48], ['GLASS', 32, 40], ['FRAME', 16, 16], ['CRACK', 16, 16], ['CUT', 12, 12],
], 1));
PG.paint((P) => {
  // quicksilver: bright streaks running down a dark chrome
  const SR = ramp(0x9aa4b0, 7, 0x2a2e38, 0.6);
  for (const n of ['SILVER', 'LIMB']) {
    const r = P.R(n);
    P.fill(r, SR, (u, v, x, y) => 2.4 + Math.sin(u * Math.PI * 6 + P.n(r, x, y, 2, 2, 3) * 5) * 1.8 + v * 0.8, 0.3);
    for (let i = 0; i < r.w / 3; i++) P.walk(r, P.rng.int(0, r.w - 1), 0, r.h, 0, 1, 0xffffff, 0.35, 0.15);
  }
  {
    // the mirror: pale cold sheen with the dim shape of a person in it (you)
    const r = P.R('GLASS');
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const u = (x + 0.5) / r.w, v = (y + 0.5) / r.h;
      let c = mixHex(0xdce8f0, 0x8aa0b8, v * 0.8 + Math.abs(u - 0.5) * 0.4);
      if ((x + y * 2) % 23 < 2) c = mixHex(c, 0xffffff, 0.5);
      const hx = Math.hypot((u - 0.5) / 0.13, (v - 0.36) / 0.11), body = Math.abs(u - 0.5) < 0.2 + (v - 0.5) * 0.3 && v > 0.5;
      if (hx < 1 || body) c = mixHex(c, 0x3a3a48, 0.6);
      if (body && Math.abs(u - 0.5) < 0.06 && v > 0.55) c = mixHex(c, 0xd8b830, 0.35); // a yellow jumpsuit, faintly
      P.set(r, x, y, c);
    }
  }
  flat(P, P.R('FRAME'), 0x3a2a24, 0.15);
  {
    // star cracks on a clear ground (alpha-tested): bright edges with a dark seam
    const r = P.R('CRACK');
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + P.rng.float(-0.2, 0.2);
      let x = r.w / 2, y = r.h / 2;
      for (let k = 0; k < 9; k++) {
        P.set(r, x, y, k % 3 === 0 ? 0x2a3440 : 0xffffff);
        if (k > 2 && P.rng.chance(0.3)) P.set(r, x + 1, y, 0xc8e0f0);
        x += Math.cos(a + P.rng.float(-0.4, 0.4)); y += Math.sin(a + P.rng.float(-0.4, 0.4));
      }
    }
  }
  P.cut(P.R('CUT'), 0x9aa4b0, { meat: 0xb8c8d8, bone: 0xffffff, marrow: 0xe8f0f8, fat: 0x8a96a8 });
});

function buildMirror(): Rig {
  const rig = newRig(1.95);
  buildHumanoid(rig, {
    page: PG, key: 'm', hipY: 0.98, hipW: 0.18, shoulderW: 0.34, torsoLen: 0.6, torsoR: [0.13, 0.08], waistR: [0.08, 0.06],
    neckLen: 0.16, neckR: 0.03, upper: 0.34, fore: 0.34, armR: 0.032, thigh: 0.48, shin: 0.48, legR: 0.045,
    body: PG.reg('SILVER'), limb: PG.reg('LIMB'), fingers: 4, fingerLen: 0.07,
    head: (ob) => {
      // an oval hand-mirror: glass face, dark frame round it, a handle that is the neck
      ob.blob([0, 0.24, 0], [0.16, 0.21, 0.022], 16, 8, PG.reg('GLASS'), { emis: 0.45 });
      const ring: V3[] = [];
      for (let k = 0; k <= 20; k++) { const a = (k / 20) * Math.PI * 2; ring.push([Math.sin(a) * 0.165, 0.24 + Math.cos(a) * 0.215, 0]); }
      ob.tube(ring, ring.map(() => 0.018), 5, PG.reg('FRAME'), { up: [0, 0, 1] });
    },
  });
  const head = rig.parts.head;
  for (let i = 0; i < 3; i++) {
    bpart(rig, 'crack' + i, head, [(i - 1) * 0.06, 0.2 + (i % 2) * 0.09, 0.024], PG, 'crack', (ob) => {
      ob.quad([[-0.07, -0.07, 0], [0.07, -0.07, 0], [0.07, 0.07, 0], [-0.07, 0.07, 0]], PG.reg('CRACK'), undefined, { emis: 0.8 });
    });
  }
  surface(rig, 'lacquer');
  return rig;
}
function animateMirror(rig: Rig, c: Creature, t: number, dt: number) {
  applyLook(rig, c, PG, 0.03);
  const ud = rig.root.userData as Record<string, any>;
  const n = netOf(c);
  const seed = hashId(c.id);
  const ev = fxPoll(rig, c);
  if (ev?.key === 'crack') { playAt('mirror_crack', c, 1, 22); ud.jolt = 1; }
  else if (ev?.key === 'bond') playAt('mirror_hum', c, 0.8, 16);
  ud.jolt = Math.max(0, (ud.jolt ?? 0) - dt * 4);
  const cr = n.cr | 0;
  for (let i = 0; i < 3; i++) vis(rig, 'crack' + i, i < cr);
  humWalk(rig, c, t, { stride: 0.55, arms: 0.45, bob: 0.03, seed });
  const bonded = !!n.b;
  ud.b = lerp(ud.b ?? 0, bonded ? 1 : 0, damp(4, dt));
  // unbonded it stands like a mirror leaned on a wall: dead still, head bowed; bonded it holds itself exactly like you
  rot(rig, 'neck', 0.35 * (1 - ud.b) + Math.sin(t * 30) * 0.05 * ud.jolt, 0, Math.sin(t * 25) * 0.08 * ud.jolt);
  rot(rig, 'head', 0.15 * (1 - ud.b), 0, Math.sin(t * 0.3 + seed * 4) * 0.04 * ud.b);
  if (c.attackPhase > 0) { rot(rig, 'armL', -1.4, 0, 0.3); rot(rig, 'armR', -1.4, 0, -0.3); rot(rig, 'foreL', -0.4); rot(rig, 'foreR', -0.4); }
  if (c.dead) for (let i = 0; i < 3; i++) vis(rig, 'crack' + i, true);
}

function nearestSeen(c: Creature): { p: Player; d: number } | null {
  const z = G.getZone(c.zoneKey);
  let best: Player | null = null, bd = 14;
  for (const p of playersIn(c.zoneKey)) { const d = dist(p, c); if (d < bd && lineOfSight(z, c.x, c.z, p.x, p.z)) { bd = d; best = p; } }
  return best ? { p: best, d: bd } : null;
}
function crack(c: Creature) {
  const m = c.mem, n = net(c);
  if (G.time - (m.crackAt ?? -9) < 1.1) return;
  m.crackAt = G.time;
  n.cr = (n.cr | 0) + 1;
  fx(c, 'crack');
  ruleShown(c);
  c.hp -= c.sp.hp * 0.2;
  c.stagger = 0.5;
  if (n.cr >= 3 || c.hp <= 0) G.creatures.kill(c, G.getZone(c.zoneKey), m.bond?.pid, { dmg: 80, kind: 'blunt', fx: c.x, fz: c.z });
}
function thinkMirror(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey), m = c.mem, n = net(c);
  pulse(c);
  const b = m.bond as { mx: number; mz: number; nx: number; nz: number; pid: string } | undefined;
  if (!b) {
    hold(c); c.setState('idle');
    const s = nearestSeen(c);
    if (s && s.d > 2.5) {
      const dx = c.x - s.p.x, dz = c.z - s.p.z, d = Math.hypot(dx, dz) || 1;
      m.bond = { mx: (c.x + s.p.x) / 2, mz: (c.z + s.p.z) / 2, nx: dx / d, nz: dz / d, pid: s.p.id };
      m.lostT = 0; n.b = 1; fx(c, 'bond'); c.targetId = s.p.id;
    }
    return true;
  }
  const p = G.players.get(b.pid);
  const d = p ? dist(p, c) : 99;
  const sees = !!p && lineOfSight(z, c.x, c.z, p.x, p.z);
  m.lostT = sees ? 0 : (m.lostT ?? 0) + dt;
  if (!p || p.body.dead || p.zoneKey !== c.zoneKey || d > 26 || m.lostT > 4) { m.bond = undefined; n.b = 0; hold(c); return true; }
  // the line creeps toward them
  const side = (p.x - b.mx) * b.nx + (p.z - b.mz) * b.nz;   // negative: their side
  if (side < -0.6) { b.mx -= b.nx * 0.12 * dt; b.mz -= b.nz * 0.12 * dt; }
  // its target: their reflection in the line
  const tx = p.x - 2 * side * b.nx, tz = p.z - 2 * side * b.nz;
  const fx_ = Math.cos(p.facing), fz_ = Math.sin(p.facing), fd = fx_ * b.nx + fz_ * b.nz;
  c.targetFacing = Math.atan2(fz_ - 2 * fd * b.nz, fx_ - 2 * fd * b.nx);
  const ex = tx - c.x, ez = tz - c.z, e = Math.hypot(ex, ez);
  const reach = (c.sp.attack?.range ?? 1) + p.radius;
  if (d <= reach && c.attackT <= 0) { attack(c, p); return true; }
  c.setState(d < 4 ? 'chase' : 'mimic');
  // a reflection that cannot go where it must: pressed against the wall, it cracks
  const blocked = e > 0.45 && (!walkable(z, tx, tz) || !lineOfSight(z, c.x, c.z, tx, tz));
  m.stuckT = blocked && e > 0.7 ? (m.stuckT ?? 0) + dt : 0;
  if (m.stuckT > 0.4) { m.stuckT = 0; crack(c); }
  if (e < 0.05) { hold(c); return true; }
  const sp = Math.min(c.sp.run, e * 6);
  c.vx = ex / e * sp; c.vz = ez / e * sp; c.speed = sp;
  return true;
}

const S = def({
  key: 'mirrorling', name: 'Mirrorling', code: 'RB-08 // REFLECTION', temperament: 'stalker', threat: 3,
  hp: 60, walk: 2.2, run: 4.6, turn: 14, radius: 0.28, height: 1.95, sight: 14, fov: 3.1, hearing: 0.5,
  rule: { name: 'MIRRORS YOU', text: 'It copies your every move, reflected in a line between you. Back away and it backs away; walk at it and it walks at you. Walk its reflection into a wall and it cracks.', tell: 'It took a step when I did. The same step. Backwards.' },
  attack: { dmg: [14, 22], range: 1.0, cooldown: 1.3, kinds: ['laceration', 'deep'], corrupt: 0.06, knock: 0.8, parts: ['torso_u', 'neck', 'farm_l', 'farm_r', 'head'] },
  zones: ['house', 'hospital', 'mall', 'lobby', 'suburbs'], weight: 1, maxPerZone: 1, diet: 'none',
  sounds: snd({ alert: 'mirror_hum', attack: 'mirror_crack', hurt: 'mirror_crack', death: 'mirror_shatter' }),
  remains: 'decal_glass',
  scan: { cls: 'Reflection / rule-bound', notes: ['Quicksilver limbs and an oval hand-mirror for a head. You are in the mirror.', 'Once it has seen you it moves as your reflection would, in a line between you.', 'The line creeps closer. Meet it at the line and it has you.', 'Walk so its reflection hits a wall and the glass cracks. Three cracks and it shatters.'] },
  gore: { blood: 'glass', flesh: 0xc8d8e8, sever: ['armL', 'armR', 'foreL', 'foreR', 'thighL', 'thighR', 'shinL', 'shinR'], head: 'head' },
  build: buildMirror, animate: animateMirror, think: thinkMirror,
});
S.animateGallery = galleryDriver('mirrorling', ['still', 'bonded', 'walk', 'attack', 'cracked', 'dead'], animateMirror, (pose, fc, t) => {
  fc.speed = pose === 'walk' ? 2 : 0;
  fc.phase = (fc.phase ?? 0) + fc.speed / 60 * 5;
  fc.mem.netMem = { b: pose === 'still' ? 0 : 1, cr: pose === 'cracked' ? 2 : 0 };
  fc.attackPhase = pose === 'attack' && (t % 1.5) < 0.5 ? 0.2 : 0;
  fc.dead = pose === 'dead';
});
defDread('mirrorling', { stutter: 0.08, tilt: 'head', tiltMax: 0.4, sting: 'swell', cam: 0.5, moved: true });
void rng; void skin;

// the horror layer: faceted wet materials, twitches, ragged breathing, lunges, recoils, a weighted death
horrify(S, { twitch: 0.5, snap: 0.3 });
