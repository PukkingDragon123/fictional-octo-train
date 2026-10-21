// The moon's things. Low gravity: everything here drifts, hangs, and comes
// down slowly.
//
// MOON WISP: an eye inside a ball of cold light, cupped by a sliver of moon,
// trailing ribbons, with two small pale hands underneath. It goes for the
// brightest light near it and drinks it: touch, and your torch is dead and
// you are burnt. Switch your light off and it loses you.
//
// MOON STRIDER: a grey cratered body on two enormous folded jumping legs, a
// long neck, an eyeless head with a mouth that opens sideways. It feels
// footsteps through the dust and leaps at them in huge slow arcs; it cannot
// steer in the air. When it crouches, step aside. Sneak and it cannot find
// you.
import { def, newRig, Rig } from '../species';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { Page, V3, bpart, registerPage, applyLook, galleryDriver, lerp, damp, ramp } from '../kit/beasts';
import { filmMat, tpart, rot, scl, skin, eye, flat, hitPlayer, playersNear } from '../kit/oddkit';
import { net, netOf, snd, playersIn, dist, hold, face, hashId, rng, fx, fxPoll, playAt, walkable, live } from '../behaviors_b';
import { pulse, attack, onPlayerHit } from '../behaviors_a';
import { ruleShown } from '../rules';
import { defDread } from '../dread';
import { shake } from '../../gfx/juice';
import { lineOfSight } from '../../world/collision';
import { mixHex } from '../../gfx/pixel';
import '../../audio/sounds_creatures_d';

const PG = registerPage(new Page('c_moonpg', 128, 96, [
  ['ORB', 24, 24], ['CRES', 40, 20], ['TAIL', 8, 40], ['EYE', 8, 8], ['HAND', 12, 12],
  ['HIDE', 64, 48], ['LEG', 16, 48], ['MOUTH', 16, 12], ['CUT', 12, 12],
], 2));
PG.paint((P, v) => {
  // the wisp: cold light
  { const r = P.R('ORB'); for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const d = Math.abs(y + 0.5 - r.h / 2) / (r.h / 2); P.set(r, x, y, mixHex(v ? 0xd8ffe8 : 0xe8f4ff, v ? 0x60c8a0 : 0x6a90ff, d * d)); } }
  skin(P, P.R('CRES'), ramp(0xc8c8c0, 6, 0x4a4a58, 0.4), { mott: 2.4, spots: [0.18, 1.6], salt: 3 });
  { const r = P.R('TAIL'); for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) P.set(r, x, y, mixHex(v ? 0xc8ffe0 : 0xd8e8ff, v ? 0x205848 : 0x1a2860, y / r.h)); }
  eye(P, P.R('EYE'), 0x101828, { pupil: 0x000000, sclera: v ? 0xd8fff0 : 0xe0ecff, slit: true });
  skin(P, P.R('HAND'), ramp(0xe8e0e8, 5, 0x8a8098, 0.4), { mott: 1 });
  // the strider: moon rock and dust
  {
    const r = P.R('HIDE');
    skin(P, r, ramp(v ? 0x9a968c : 0x8c8e96, 7, 0x2a2a34, 0.35), { mott: 2.2, salt: 11 });
    for (let k = 0; k < 14; k++) {
      const cx = P.rng.int(0, r.w - 1), cy = P.rng.int(4, r.h - 4), rr = P.rng.float(1.5, 4.5);
      for (let y = Math.floor(cy - rr - 1); y <= cy + rr + 1; y++) for (let x = Math.floor(cx - rr - 1); x <= cx + rr + 1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / rr;
        if (d < 0.75) P.blend(r, x, y, 0x24242c, 0.35 * (1 - d));
        else if (d < 1.05) P.blend(r, x, y, y < cy ? 0x2a2a30 : 0xe8e8e0, 0.35);
      }
    }
  }
  skin(P, P.R('LEG'), ramp(0x84868c, 6, 0x24242c, 0.35), { mott: 1.6, stripes: 4, salt: 5 });
  { const r = P.R('MOUTH'); for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) P.set(r, x, y, Math.abs(x + 0.5 - r.w / 2) < 1.5 ? 0x0a0408 : y % 3 === 0 ? 0xd8d0c0 : 0x5a2a38); }
  P.cut(P.R('CUT'), 0x8c8e96, { meat: 0x6a7088, marrow: 0x9ab0d8, bone: 0xe8e8f0 });
});

// =====================================================================================
// MOON WISP
// =====================================================================================
const WY = 1.45;
function buildWisp(): Rig {
  const rig = newRig(WY + 0.2);
  const fl = bpart(rig, 'float', rig.body, [0, WY, 0], PG, null, null);
  const head = bpart(rig, 'head', fl, [0, 0, 0], PG, 'worb', (ob) => {
    ob.blob([0, 0, 0], [0.15, 0.15, 0.15], 12, 8, PG.reg('ORB'), { emis: 1 });
    ob.blob([0, 0, 0.1], [0.045, 0.06, 0.05], 8, 5, PG.reg('EYE'), { emis: 0.8 });
    // the sliver of moon cupping it from behind
    const path: V3[] = [];
    for (let k = 0; k <= 10; k++) { const a = -1.75 + (3.5 * k) / 10; path.push([0, Math.sin(a) * 0.23, -Math.cos(a) * 0.2 - 0.03]); }
    ob.tube(path, path.map((_, k) => { const s = Math.sin((k / 10) * Math.PI); return [0.02 + s * 0.13, 0.02 + s * 0.07] as [number, number]; }), 8, PG.reg('CRES'), { start: 'pole', end: 'pole', up: [1, 0, 0] });
  });
  tpart(rig, 'halo', head, [0, 0, 0], PG, 'whalo', filmMat(0.22, true), (ob) => ob.blob([0, 0, 0], [0.3, 0.3, 0.3], 10, 7, PG.reg('ORB'), { emis: 1 }));
  for (let i = 0; i < 3; i++) {
    bpart(rig, 'tail' + i, fl, [(i - 1) * 0.07, -0.05, -0.12], PG, 'wtail', (ob) => {
      const a: V3[] = [], b: V3[] = [];
      for (let k = 0; k <= 7; k++) { const z = -k * 0.11, y = -k * 0.05, w = 0.04 * (1 - k / 9); a.push([-w, y, z]); b.push([w, y - 0.01, z]); }
      ob.strip(a, b, PG.reg('TAIL'), { double: true, emis: 0.9 });
    });
  }
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    bpart(rig, 'hand' + s, head, [k * 0.07, -0.13, 0.04], PG, 'whand', (ob) => {
      ob.tube([[0, 0, 0], [0, -0.08, 0.01], [0, -0.16, 0.03]], [0.012, 0.01, 0.009], 5, PG.reg('HAND'), { start: 'pole' });
      ob.blob([0, -0.18, 0.035], [0.025, 0.03, 0.015], 6, 4, PG.reg('HAND'));
      for (let f = 0; f < 4; f++) ob.cone([(f - 1.5) * 0.012, -0.2, 0.04], [0, -1, 0.2], 0.006, 0.05, 3, PG.reg('HAND'));
    });
  }
  rig.eyes = [];
  return rig;
}
function animateWisp(rig: Rig, c: Creature, t: number, dt: number) {
  applyLook(rig, c, PG, 0.1);
  const ud = rig.root.userData as Record<string, any>;
  const n = netOf(c);
  const seed = hashId(c.id);
  const ev = fxPoll(rig, c);
  if (ev?.key === 'chime') playAt('wisp_chime', c, 0.7, 20);
  const fl = rig.parts.float;
  const drink = c.attackPhase > 0 ? 1 : 0;
  ud.dk = lerp(ud.dk ?? 0, drink, damp(drink ? 10 : 2, dt));
  if (c.dead) { ud.fall = Math.min(1, (ud.fall ?? 0) + dt * 0.5); fl.position.y = lerp(WY, 0.15, ud.fall * ud.fall); scl(rig, 'halo', 0.01); return; }
  ud.fall = 0;
  fl.position.y = WY + Math.sin(t * 0.7 + seed * 7) * 0.18;
  fl.rotation.set(Math.min(0.4, c.speed * 0.12), 0, Math.sin(t * 0.5 + seed) * 0.12);
  const pulseK = 1 + Math.sin(t * 2.4 + seed * 3) * 0.05 + ud.dk * 0.25;
  scl(rig, 'head', pulseK);
  scl(rig, 'halo', (n.hunt ? 1.25 : 1) * (1 + Math.sin(t * 5.3) * 0.06) + ud.dk * 0.6);
  // the eye turns to the light it wants
  rot(rig, 'head', 0, Math.sin(t * 0.4 + seed * 2) * 0.5 * (n.hunt ? 0.2 : 1), 0);
  for (let i = 0; i < 3; i++) rot(rig, 'tail' + i, Math.sin(t * 1.6 - i * 0.7) * 0.25 + c.speed * 0.08, Math.sin(t * 1.1 + i * 2) * 0.4, 0);
  for (const [s, k] of [['L', 1], ['R', -1]] as const) rot(rig, 'hand' + s, -ud.dk * 1.3 + Math.sin(t * 1.2 + k) * 0.15, 0, k * (0.1 + ud.dk * 0.3));
}
function lit(p: Player) { return p.flashlightOn && !p.body.dead; }
function thinkWisp(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey), cs = G.creatures, m = c.mem, n = net(c);
  pulse(c);
  let best: Player | null = null, bd = 18;
  for (const p of playersIn(c.zoneKey)) { const d = dist(p, c); if (lit(p) && d < bd && (d < 6 || lineOfSight(z, c.x, c.z, p.x, p.z))) { bd = d; best = p; } }
  let gx: number, gz: number, sp: number;
  if (best) {
    if (!n.hunt) { n.hunt = 1; fx(c, 'chime'); }
    m.lastLit = best.id;
    c.targetId = best.id;
    gx = best.x; gz = best.z; sp = 2.3;
    if (bd < 0.95 && c.attackT <= 0) { attack(c, best); return true; }
    c.setState('chase');
  } else {
    // the light went out: it has lost them
    if (n.hunt) { n.hunt = 0; const lp = m.lastLit ? G.players.get(m.lastLit) : null; if (lp && dist(lp, c) < 9) ruleShown(c); }
    c.setState('wander');
    m.wT = (m.wT ?? 0) - dt;
    if (m.wT <= 0 || !m.w) { m.wT = rng.float(4, 9); m.w = cs.wanderSpot(c, z, 10); }
    gx = m.w.x; gz = m.w.z; sp = 0.5;
  }
  // low gravity: slow to start, slow to stop
  const dx = gx - c.x, dz = gz - c.z, d = Math.hypot(dx, dz) || 1;
  const k = damp(1.1, dt);
  const tv = d < 0.4 ? 0 : sp;
  c.vx += ((dx / d) * tv - c.vx) * k; c.vz += ((dz / d) * tv - c.vz) * k;
  c.speed = Math.max(0.02, Math.hypot(c.vx, c.vz));
  c.targetFacing = Math.atan2(c.vz, c.vx);
  return true;
}
onPlayerHit('moon_wisp', (p) => {
  if (p.flashlightOn) { p.flashlightOn = false; bus.emit('think', p, 'It drank my light. The torch is dead cold.'); }
  playAt('wisp_drink', p as any, 1, 12);
});

const WISP = def({
  key: 'moon_wisp', name: 'Moon Wisp', code: 'LN-03 // LIGHT FEEDER', temperament: 'hostile', threat: 2,
  hp: 22, walk: 0.5, run: 2.3, turn: 3, radius: 0.28, height: 1.8, sight: 18, fov: 3.1, hearing: 0.3, light: 'attracted',
  rule: { name: 'MOTH TO THE LAMP', text: 'It goes for the brightest light near it and drinks it: your torch dies and you burn. Switch your light off and it loses you.', tell: 'A light out there. Coming toward my light.' },
  attack: { dmg: [6, 11], range: 0.7, cooldown: 2.2, kinds: ['burn'], corrupt: 0.02, knock: 0.3, parts: ['hand_l', 'hand_r', 'farm_l', 'farm_r', 'head'] },
  zones: ['moon'], weight: 3, group: [1, 3], maxPerZone: 6, diet: 'light',
  flags: { flying: true, nocturnal: false },
  sounds: snd({ alert: 'wisp_chime', attack: 'wisp_drink', hurt: 'wisp_chime', death: 'wisp_drink', loop: 'wisp_hum' }),
  remains: 'decal_glow_paint',
  scan: { cls: 'Light feeder / drifting', notes: ['An eye in a ball of cold light, held in a sliver of moon. Two small hands.', 'It drifts toward the brightest light in reach. Lamps, torches, you.', 'Its touch drinks a torch dead and leaves a burn.', 'In the dark it wanders. It does not know you are there.'] },
  gore: { blood: 'glow', tint: 0xb8d0ff, flesh: 0xd8e8ff, sever: ['tail0', 'tail1', 'tail2', 'handL', 'handR'], head: 'head' },
  build: buildWisp, animate: animateWisp, think: thinkWisp,
});
WISP.animateGallery = galleryDriver('moon_wisp', ['drift', 'hunt', 'drink', 'dead'], animateWisp, (pose, fc, t) => {
  fc.speed = pose === 'hunt' ? 2 : pose === 'drift' ? 0.4 : 0;
  fc.mem.netMem = { hunt: pose === 'hunt' || pose === 'drink' ? 1 : 0 };
  fc.attackPhase = pose === 'drink' && (t % 1.6) < 0.5 ? 0.2 : 0;
  fc.dead = pose === 'dead';
});
defDread('moon_wisp', { stutter: 0.04, flick: 6 });

// =====================================================================================
// MOON STRIDER
// =====================================================================================
const BY = 1.45, HOP_H = 2.4, HOP_T = 1.25;
function buildStrider(): Rig {
  const rig = newRig(2.3);
  const H = PG.reg('HIDE'), L = PG.reg('LEG');
  const body = bpart(rig, 'body', rig.body, [0, BY, 0], PG, 'sbody', (ob) => {
    ob.blob([0, 0, -0.05], [0.4, 0.34, 0.48], 14, 9, H);
    ob.blob([0, 0.18, -0.2], [0.26, 0.18, 0.26], 10, 6, H);
  });
  const neck = bpart(rig, 'neck', body, [0, 0.12, 0.38], PG, 'sneck', (ob) => {
    ob.tube([[0, 0, 0], [0, 0.22, 0.12], [0, 0.42, 0.2], [0, 0.55, 0.32]], [0.12, 0.09, 0.07, 0.065], 8, L, { start: 'flat' });
  });
  const head = bpart(rig, 'head', neck, [0, 0.58, 0.36], PG, 'shead', (ob) => {
    ob.blob([0, 0, 0.04], [0.11, 0.14, 0.17], 10, 7, H);
    ob.blob([0, 0.0, 0.2], [0.012, 0.11, 0.04], 6, 5, PG.reg('MOUTH'), { emis: 0.1 });
  });
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    bpart(rig, 'jaw' + s, head, [k * 0.04, 0, 0.12], PG, 'sjaw', (ob) => ob.blob([k * 0.03, 0, 0.06], [0.05, 0.12, 0.08], 6, 5, H));
    const th = bpart(rig, 'thigh' + s, body, [k * 0.3, -0.12, -0.14], PG, 'sthigh', (ob) => {
      ob.tube([[0, 0, 0], [0, -0.3, 0.28], [0, -0.55, 0.52]], [[0.16, 0.13], [0.12, 0.1], [0.08, 0.07]], 8, L, { start: 'pole' });
    });
    const sh = bpart(rig, 'shin' + s, th, [0, -0.55, 0.52], PG, 'sshin', (ob) => {
      ob.tube([[0, 0, 0], [0, -0.35, -0.3], [0, -0.7, -0.6]], [0.07, 0.055, 0.045], 7, L, { start: 'pole' });
    });
    bpart(rig, 'foot' + s, sh, [0, -0.7, -0.6], PG, 'sfoot', (ob) => {
      ob.tube([[0, 0, 0], [0, -0.06, 0.2], [0, -0.07, 0.45]], [[0.05, 0.04], [0.06, 0.03], [0.04, 0.02]], 6, L, { start: 'pole', end: 'pole' });
    });
    const arm = bpart(rig, 'arm' + s, body, [k * 0.2, -0.1, 0.36], PG, 'sarm', (ob) => {
      ob.tube([[0, 0, 0], [0, -0.18, 0.05], [0, -0.34, 0.04]], [0.04, 0.03, 0.026], 6, L, { start: 'pole' });
      for (let f = 0; f < 3; f++) ob.cone([(f - 1) * 0.02, -0.34, 0.04], [(f - 1) * 0.3, -1, 0.3], 0.01, 0.12, 3, L);
    });
    void arm;
  }
  void head;
  return rig;
}
function animateStrider(rig: Rig, c: Creature, t: number, dt: number) {
  applyLook(rig, c, PG, 0.08);
  const ud = rig.root.userData as Record<string, any>;
  const n = netOf(c);
  const seed = hashId(c.id);
  const ev = fxPoll(rig, c);
  if (ev) {
    if (ev.key === 'charge') playAt('strider_charge', c, 0.9, 22);
    else if (ev.key === 'land') {
      playAt('strider_land', c, 1, 30); ud.squash = 1;
      const p = live() ? G.local : null;
      if (p && p.zoneKey === c.zoneKey) { const d = dist(p, c); if (d < 12) shake((1 - d / 12) * 0.6, 0.4); }
    }
  }
  ud.squash = Math.max(0, (ud.squash ?? 0) - dt * 2.5);
  if (n.air) { const a = n.air; if (a < (ud.air ?? 0) - 0.3) ud.air = a; ud.air = Math.min(1, Math.max(ud.air ?? 0, a) + dt / HOP_T); } else ud.air = 0;
  const u = ud.air as number;
  const air = n.air ? 1 : 0;
  ud.ch = lerp(ud.ch ?? 0, n.ch ? 1 : 0, damp(n.ch ? 5 : 8, dt));
  const crouch = Math.max(ud.ch, ud.squash * 0.8);
  // body height: crouched low before a leap, high in the arc
  rig.body.position.y = air ? 4 * (n.h ?? HOP_H) * u * (1 - u) : -crouch * 0.55 + Math.sin(t * 0.9 + seed * 5) * 0.03;
  rig.body.rotation.x = air ? (-0.4 + u * 0.8) * 0.6 : crouch * 0.15;
  const tremble = n.ch ? Math.sin(t * 50) * 0.02 : 0;
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    if (air) {
      // legs flung out straight behind on the way up, reaching forward to land
      const reach = u > 0.6 ? (u - 0.6) / 0.4 : 0;
      rot(rig, 'thigh' + s, 0.9 - reach * 1.4, 0, k * 0.1);
      rot(rig, 'shin' + s, -0.9 + reach * 1.0, 0, 0);
      rot(rig, 'foot' + s, 0.6 - reach * 0.9, 0, 0);
    } else {
      rot(rig, 'thigh' + s, -0.1 - crouch * 0.55 + tremble, 0, k * 0.06);
      rot(rig, 'shin' + s, crouch * 0.95, 0, 0);
      rot(rig, 'foot' + s, -crouch * 0.4, 0, 0);
    }
    rot(rig, 'arm' + s, air ? -0.8 : -0.2 + Math.sin(t * 1.3 + k) * 0.1 - (c.attackPhase > 0 ? 1.2 : 0), 0, k * 0.2);
    rot(rig, 'jaw' + s, 0, k * (air || c.attackPhase > 0 || n.ch ? 0.5 : 0.05 + Math.max(0, Math.sin(t * 0.8 + seed * 4)) * 0.1), 0);
  }
  // the head sweeps low over the dust, feeling
  rot(rig, 'neck', (air ? -0.3 : 0.25 + crouch * 0.4) + Math.sin(t * 0.6 + seed) * 0.05, Math.sin(t * 0.35 + seed * 3) * 0.4 * (n.ch ? 0 : 1), 0);
  rot(rig, 'head', air ? -0.2 : 0.3, 0, Math.sin(t * 0.7) * 0.15);
  if (c.dead) { rig.body.position.y = 0; rot(rig, 'neck', 0.9); }
}
function sensed(c: Creature, p: Player, d: number) {
  if (d < 3.2) return true;
  if (d > 15) return false;
  if (p.stance === 'sneak' || p.speed < 0.4) return false;
  return true;
}
function thinkStrider(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey), m = c.mem, n = net(c);
  pulse(c);
  hold(c);
  m.ph = m.ph ?? 'wait';
  if (m.ph === 'wait') {
    c.setState('idle');
    m.wT = (m.wT ?? rng.float(1, 2)) - dt;
    let best: Player | null = null, bd = 99;
    for (const p of playersIn(c.zoneKey)) { const d = dist(p, c); if (sensed(c, p, d) && d < bd) { bd = d; best = p; } }
    const heard = c.lastHeard && G.time - c.lastHeard.t < 1.5 ? c.lastHeard : null;
    if (best) { face(c, best.x, best.z); c.targetId = best.id; }
    if (m.wT > 0) return true;
    if (best || heard || rng.chance(0.25)) {
      m.ph = 'crouch'; m.cT = 0; n.ch = 1; fx(c, 'charge');
      m.aim = best ? best.id : null;
      m.goal = best ? null : heard ? { x: heard.x, z: heard.z } : G.creatures.wanderSpot(c, z, 4);
    } else m.wT = rng.float(2, 5);
    return true;
  }
  if (m.ph === 'crouch') {
    c.setState('warn');
    m.cT += dt;
    const p = m.aim ? G.players.get(m.aim) : null;
    if (p) face(c, p.x, p.z);
    if (m.cT < 0.75) return true;
    // commit: where they are now is where it comes down
    let tx = p ? p.x : m.goal.x, tz = p ? p.z : m.goal.z;
    let dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
    if (d > 9) { tx = c.x + dx / d * 9; tz = c.z + dz / d * 9; d = 9; }
    for (let k = 0; k < 4 && d > 0.5; k++) {
      if (walkable(z, tx, tz) && lineOfSight(z, c.x, c.z, tx, tz)) break;
      tx = c.x + (tx - c.x) * 0.6; tz = c.z + (tz - c.z) * 0.6; d *= 0.6;
    }
    m.from = [c.x, c.z]; m.to = [tx, tz]; m.jT = 0; m.ph = 'air';
    n.ch = 0; n.air = 0.01; n.h = +(1.2 + Math.min(1, d / 9) * (HOP_H - 1.2)).toFixed(2);
    face(c, tx, tz);
    return true;
  }
  if (m.ph === 'air') {
    c.setState('travel');
    m.jT += dt;
    const u = Math.min(1, m.jT / HOP_T);
    c.x = lerp(m.from[0], m.to[0], u); c.z = lerp(m.from[1], m.to[1], u);
    n.air = +Math.max(0.01, u).toFixed(2);
    if (u >= 1) {
      n.air = 0; m.ph = 'land'; m.lT = 0; fx(c, 'land');
      const hits = playersNear(c, c.x, c.z, 1.45);
      for (const v of hits) hitPlayer(c, v, rng.float(18, 28), ['fracture', 'bruise'], 1.6, ['foot_l', 'foot_r', 'shin_l', 'shin_r', 'thigh_l', 'thigh_r', 'torso_l']);
      const aimed = m.aim ? G.players.get(m.aim) : null;
      if (aimed && !hits.includes(aimed) && dist(aimed, c) < 4.5) ruleShown(c);
      // a bite for whoever is still right there
      if (aimed && !hits.includes(aimed) && dist(aimed, c) < 1.9 && c.attackT <= 0) attack(c, aimed);
    }
    return true;
  }
  // landed: it has to gather itself
  c.setState('idle');
  m.lT += dt;
  if (m.lT > 0.9) { m.ph = 'wait'; m.wT = rng.float(0.4, 1.2); }
  return true;
}

const STRIDER = def({
  key: 'moon_strider', name: 'Moon Strider', code: 'LN-07 // SALTATORIAL', temperament: 'hostile', threat: 4,
  hp: 85, walk: 0, run: 0, turn: 3, radius: 0.5, height: 2.3, sight: 6, fov: 1.4, hearing: 1.4, vibration: true,
  rule: { name: 'COMMITTED LEAP', text: 'It feels footsteps through the dust and leaps at them, but it cannot steer in the air. When it crouches, step aside. Sneak and it cannot find you.', tell: 'Something huge just jumped. Slowly. Toward my footsteps.' },
  attack: { dmg: [12, 20], range: 1.3, cooldown: 1.8, kinds: ['bite', 'laceration'], corrupt: 0, knock: 0.9 },
  zones: ['moon'], weight: 2, group: [1, 1], maxPerZone: 3, diet: 'meat',
  meat: [['moon_meat', 3]],
  sounds: snd({ idle: 'strider_call', alert: 'strider_call', attack: 'strider_land', hurt: 'strider_call', death: 'strider_die' }),
  scan: { cls: 'Saltatorial predator / blind', notes: ['A cratered body on two enormous folded legs. No eyes; the mouth opens sideways.', 'It feels footsteps through the dust and leaps at them, ten metres at a time, slowly.', 'Once it has jumped it cannot change its mind. It lands hard.', 'Sneaking leaves nothing in the dust for it to feel.'] },
  gore: { blood: 'pale', tint: 0xc8d0ff, flesh: 0x9aa0b8, sever: ['thighL', 'thighR', 'shinL', 'shinR', 'armL', 'armR', 'jawL', 'jawR'], head: 'head' },
  build: buildStrider, animate: animateStrider, think: thinkStrider,
});
(STRIDER as any).handlesSevered = true;
STRIDER.animateGallery = galleryDriver('moon_strider', ['idle', 'crouch', 'leap', 'dead'], animateStrider, (pose, fc, t) => {
  fc.mem.netMem = { ch: pose === 'crouch' ? 1 : 0, air: pose === 'leap' ? Math.max(0.01, (t % HOP_T) / HOP_T) : 0, h: HOP_H };
  fc.dead = pose === 'dead';
});
defDread('moon_strider', { cam: 0.7, sting: 'hit' });
void flat; void scl;
