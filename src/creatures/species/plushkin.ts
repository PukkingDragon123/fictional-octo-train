import * as THREE from 'three';
import { def, newRig, part, Rig } from '../species';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, ph } from '../../gfx/pixel';
import { G } from '../../game/G';
import { objDef } from '../../world/objects';
import { rollLoot } from '../../items/loot';
import { defLore } from '../../content/loreRegistry';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import type { Zone } from '../../world/zone';
import { net, netOf, snd, playersIn, dist, hold, hashId, fakeCreature, rng, fx, fxPoll, playAt, walkable, dropGift, localIn, thinkOnce, angleDiff, lineOfSightB, lightAt, reachTiles } from '../behaviors_b';
import '../../audio/sounds_creatures_b';

// Plushkin: stuffed toys that only move when nobody is looking: a tiny,
// friendly weeping angel. A plushkin picks a survivor and follows at a
// distance, turning up in odd places (on a table, facing a corner, right
// behind you) in odd poses. Now and then it leaves a gift. Sweets make it
// yours: then it stays close and "finds" useful things. Hit it and it bursts
// into a pile of stuffing.

addTextureModule(() => {
  const A = atlas();
  const fur = (name: string, base: number, seed: number) => A.add(name, 16, 16, (pc) => {
    const R = makeRamp(base, 6, { hueShift: 0.04 });
    pc.fillRamp(R, (x, y) => 0.58 + (ph(x >> 2, y >> 2, seed) - 0.5) * 0.1 + (ph(x, y, seed + 1) - 0.5) * 0.06, 0.35); // worn plush pile
  });
  fur('c_plushkin_bear', 0x8c6a4c, 3);
  fur('c_plushkin_bunny', 0xc89aa4, 7);
  const face = (name: string, base: number, muzzle: number) => A.add(name, 16, 16, (pc) => {
    pc.wrap = false;
    const R = makeRamp(base, 6, { hueShift: 0.04 });
    pc.fillRamp(R, (x, y) => 0.6 + (ph(x >> 1, y >> 1, 5) - 0.5) * 0.15, 0.6);
    pc.ellipse(7.5, 10.5, 4, 3, muzzle);
    pc.rect(6, 8, 4, 2, 0x2a1a14); // nose
    pc.hline(5, 6, 12, 0x2a1a14); pc.hline(9, 10, 12, 0x2a1a14); pc.set(7, 13, 0x2a1a14); pc.set(8, 13, 0x2a1a14); // stitched smile
    // one shiny button eye, one eye stitched as an X where the button was lost
    pc.circle(4, 5, 1.6, 0x101010); pc.set(3, 4, 0xe8e8e8);
    pc.set(10, 4, 0x3a2a24); pc.set(12, 4, 0x3a2a24); pc.set(11, 5, 0x3a2a24); pc.set(10, 6, 0x3a2a24); pc.set(12, 6, 0x3a2a24);
  });
  face('c_plushkin_bear_face', 0x8c6a4c, 0xd8c0a0);
  face('c_plushkin_bunny_face', 0xc89aa4, 0xf0e0e0);
  A.add('c_plushkin_stuffing', 8, 8, (pc) => {
    const R = makeRamp(0xe8e4dc, 4);
    pc.fillRamp(R, (x, y) => 0.7 + (ph(x, y, 9) - 0.5) * 0.4, 0.8);
  });
  A.add('c_plushkin_pad', 8, 8, (pc) => { pc.fill(0xe8d8c4); pc.circle(3.5, 3.5, 2, 0xd0b898); });
});

// crayon notes a plushkin sometimes leaves
const NOTES = ['plush_note_1', 'plush_note_2', 'plush_note_3', 'plush_note_4'];
defLore({ id: 'plush_note_1', title: 'Crayon note', text: 'YOU LOOK SAD\n\nhere is a canDy\n\ndont tell', codex: ['plushkin'] });
defLore({ id: 'plush_note_2', title: 'Crayon note', text: 'I SAW YOU sleep. you are safe when\nwe are watching.\n\n(we only move when you dont)', codex: ['plushkin'] });
defLore({ id: 'plush_note_3', title: 'Crayon note', text: 'mia left us here a long long time.\nare YOU mia?\n\nno.\n\nbut you can be ours', codex: ['plushkin'] });
defLore({ id: 'plush_note_4', title: 'Crayon note', text: 'DONT GO IN THE BIG HALLS WHEN THE FLOOR HUMS\n\nthe lamp knows. follow the lamp.', codex: ['plushkin', 'occupant', 'lamplighter'] });

const KINDS = ['bear', 'bunny'] as const;

function buildPlush(): Rig {
  const rig = newRig(0.4);
  for (const kind of KINDS) {
    const T = 'c_plushkin_' + kind, F = T + '_face';
    const g = new THREE.Group();
    g.name = kind;
    rig.body.add(g);
    rig.parts[kind] = g;
    const torso = part(rig, kind + 'torso', g, [0, 0.02, 0], (mb) => {
      mb.box(0, 0, 0, 0.2, 0.2, 0.15, T);
      mb.box(0, 0.04, 0.072, 0.12, 0.12, 0.012, T, { color: 0xf0e0d0 }); // belly patch
      mb.box(0.08, 0.17, -0.07, 0.03, 0.03, 0.02, 'c_plushkin_stuffing'); // stuffing poking from a seam
    });
    const head = part(rig, kind + 'head', torso, [0, 0.2, 0], (mb) => {
      mb.box(0, 0, 0, 0.21, 0.18, 0.17, { south: F, all: T }, { fit: { south: true } });
    });
    if (kind === 'bear') {
      part(rig, kind + 'earL', head, [0.08, 0.17, 0], (mb) => { mb.box(0, 0, 0, 0.06, 0.055, 0.03, T); mb.box(0, 0.012, 0.016, 0.035, 0.03, 0.004, 'c_plushkin_pad'); });
      part(rig, kind + 'earR', head, [-0.08, 0.17, 0], (mb) => { mb.box(0, 0, 0, 0.06, 0.055, 0.03, T); mb.box(0, 0.012, 0.016, 0.035, 0.03, 0.004, 'c_plushkin_pad'); });
    } else {
      part(rig, kind + 'earL', head, [0.05, 0.17, 0], (mb) => { mb.box(0, 0, 0, 0.045, 0.22, 0.025, T); mb.box(0, 0.03, 0.013, 0.025, 0.16, 0.004, 'c_plushkin_pad', { color: 0xf8c8d0 }); });
      part(rig, kind + 'earR', head, [-0.05, 0.17, 0], (mb) => { mb.box(0, 0, 0, 0.045, 0.22, 0.025, T); mb.box(0, 0.03, 0.013, 0.025, 0.16, 0.004, 'c_plushkin_pad', { color: 0xf8c8d0 }); });
    }
    for (const [s, side] of [[1, 'L'], [-1, 'R']] as const) {
      part(rig, kind + 'arm' + side, torso, [0.11 * s, 0.16, 0], (mb) => { mb.box(0.02 * s, -0.13, 0, 0.055, 0.14, 0.06, T); });
      part(rig, kind + 'leg' + side, torso, [0.055 * s, 0.03, 0.02], (mb) => { mb.box(0, -0.035, 0.06, 0.07, 0.07, 0.14, { all: T, south: 'c_plushkin_pad' }, { fit: { south: true } }); });
    }
  }
  // what is left after it is torn open
  const pile = new THREE.Group();
  pile.name = 'pile';
  rig.root.add(pile);
  rig.parts.pile = pile;
  part(rig, 'pileStuff', pile, [0, 0, 0], (mb) => {
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, r = 0.05 + (i % 4) * 0.05;
      mb.box(Math.cos(a) * r, 0, Math.sin(a) * r, 0.08 + (i % 3) * 0.03, 0.04 + (i % 2) * 0.03, 0.07 + (i % 3) * 0.02, 'c_plushkin_stuffing');
    }
    mb.box(0.12, 0, 0.1, 0.03, 0.01, 0.03, 'c_plushkin_pad', { color: 0x202020 }); // the button eye
  });
  part(rig, 'pileBear', pile, [0, 0, 0], (mb) => { mb.box(-0.1, 0, -0.04, 0.16, 0.012, 0.12, 'c_plushkin_bear'); mb.box(0.05, 0.01, -0.12, 0.1, 0.012, 0.08, 'c_plushkin_bear_face', { fit: true }); });
  part(rig, 'pileBunny', pile, [0, 0, 0], (mb) => { mb.box(-0.1, 0, -0.04, 0.16, 0.012, 0.12, 'c_plushkin_bunny'); mb.box(0.05, 0.01, -0.12, 0.1, 0.012, 0.08, 'c_plushkin_bunny_face', { fit: true }); mb.box(0.15, 0, 0.02, 0.04, 0.012, 0.2, 'c_plushkin_bunny'); });
  return rig;
}

/** pose table: [torsoX, headX, headY, headZ, armX, legX, bodyRoll] */
const POSES: number[][] = [
  [0, 0, 0, 0, 0, 0, 0],            // 0 sitting upright
  [0.55, 0.5, 0, 0, 0.3, 0, 0],     // 1 slumped forward
  [0, 0, 0.2, 1.35, 0, 0, 0],       // 2 head tipped right over
  [0, -0.35, 0, 0, -2.9, 0, 0],     // 3 arms up: pick me up
  [1.45, 0.2, 0, 0, -2.6, -0.3, 0], // 4 lying face down
  [0, 0, Math.PI, 0, 0, 0, 0],      // 5 head turned all the way round
  [0.1, 0.2, 0, 0, -1.35, 0, 0],    // 6 presenting something
  [-0.1, 0, 0.5, 0.2, -1.0, 0.8, 0.15], // 7 caught mid-step
];

function animatePlush(rig: Rig, c: Creature, t: number, dt: number) {
  const P = rig.parts;
  const n = netOf(c);
  const seed = hashId(c.id);
  const kind = seed < 0.5 ? 'bear' : 'bunny';
  P.bear.visible = kind === 'bear' && !c.dead;
  P.bunny.visible = kind === 'bunny' && !c.dead;
  P.pile.visible = c.dead && rig.body.visible;
  P.pileBear.visible = kind === 'bear'; P.pileBunny.visible = kind === 'bunny';
  if (c.dead) { P.pile.rotation.y = seed * 6; return; }
  const ud = rig.root.userData as { y?: number };
  ud.y = n.y ?? 0; // perches are instant: nobody saw it climb up there
  rig.body.position.y = ud.y;
  const pose = n.p ?? 0;
  const k = kind;
  const torso = P[k + 'torso'], head = P[k + 'head'];
  if (pose === -1) {
    // the waddle nobody ever sees
    const w = c.phase * 2;
    torso.rotation.set(0.15, 0, Math.sin(w) * 0.25);
    head.rotation.set(0, Math.sin(w * 0.5) * 0.3, 0);
    P[k + 'armL'].rotation.x = Math.sin(w) * 0.6; P[k + 'armR'].rotation.x = -Math.sin(w) * 0.6;
    P[k + 'legL'].rotation.x = Math.sin(w) * 0.7; P[k + 'legR'].rotation.x = -Math.sin(w) * 0.7;
    torso.position.y = 0.04 + Math.abs(Math.sin(w)) * 0.03;
  } else {
    const q = POSES[Math.max(0, Math.min(POSES.length - 1, pose))];
    torso.rotation.set(q[0], 0, q[6]);
    torso.position.y = pose === 4 ? -0.06 : 0.02;
    head.rotation.set(q[1], q[2], q[3]);
    P[k + 'armL'].rotation.set(q[4], 0, pose === 3 ? -0.3 : 0);
    P[k + 'armR'].rotation.set(pose === 7 ? 0.4 : q[4], 0, pose === 3 ? 0.3 : 0);
    P[k + 'legL'].rotation.x = q[5]; P[k + 'legR'].rotation.x = pose === 7 ? -0.2 : q[5];
  }
  if (k === 'bunny') { P.bunnyearL.rotation.x = 0.2; P.bunnyearR.rotation.set(1.1 + seed * 0.4, 0, -0.3); } // one ear always flopped
  const e = fxPoll(rig, c);
  if (e) playAt(e.key, c, e.a.v ?? 0.8, e.a.r);
  // the survivor notices
  const p = localIn(c);
  if (p && c.visibleToLocal && Math.hypot(p.x - c.x, p.z - c.z) < 7) {
    thinkOnce(p, 'plush_seen_' + (c.tamedBy ? 'pet' : 'wild'), c.tamedBy
      ? ['There you are.', 'It always gets ahead of me somehow.', 'Good... toy?'][Math.floor(t) % 3]
      : ['Was that teddy bear there before?', 'I didn\'t put that there.', 'It moved. I KNOW it moved.', 'It\'s just a toy. It\'s just a toy.'][Math.floor(t) % 4], 90);
  }
  void dt;
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
(S as any).animateGallery = (rig: Rig, t: number) => {
  const c = fakeCreature(S, { id: 'g8', mem: { netMem: { p: Math.floor(t / 2) % 8 } } });
  animatePlush(rig, c, t, 1 / 60);
};
