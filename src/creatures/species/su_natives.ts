// Westgate Station's other natives (round 16, src/world/gen/z_subway.ts):
//
// TOKEN WHELK — a sea snail the size of an armchair that has grown into the token
//   booth and will not come out. Turreted shell banded cream and brown and ringed
//   with brass where it has been eating tokens for thirty years; a great soft foot
//   pressed flat to the inside of the glass; eyes on stalks that follow you along
//   the counter; a long proboscis it slides through the brass trough. Give it a coin
//   and it gives you a token. Hit it and it shuts its door, and lashes you through
//   the trough if you stay at the window. Rank GREED.
//
// STILE MANTIS — a mantis that has grown to look like a token turnstile: a boxy
//   brushed-steel thorax, the token slot its mouth, three raptorial arms held
//   out from a hub exactly like the turnstile's bars, four thin legs folded out
//   of sight. It stands in the turnstile line at the end of the row. Pay the
//   fare (a token in the slot) and it turns, click-clack, and lets you through.
//   Walk through without paying and the three arms close on you. Rank ENVY.
//
// RINGER — a stilt-legged thing the height of a child, a body like a black
//   bakelite telephone with a ring of pale eyes on its chest like a dial, a coiled
//   cord of a neck, and a head shaped like a handset: eyes in the earpiece cup, a
//   perforated beak in the mouthpiece. It is curious and harmless and wants to be
//   answered. It follows a unit about and rings, louder and louder, and the ringing
//   carries down the tunnels to the Worm Train. Answer it and it goes quiet and
//   tells you something. Rank LUST.
import * as THREE from 'three';
import { def, newRig, Rig } from '../species';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import type { Zone } from '../../world/zone';
import { createItem } from '../../items/factory';
import { queueAt } from '../../actions/basic';
import { UseObjectAction } from '../../actions/world';
import { Page, OB, V3, bpart, registerPage, applyLook, ramp, clamp01, lerp, damp, galleryPoseParam } from '../kit/beasts';
import { tpart, surfaceMat, eye, flat, skin } from '../kit/oddkit';
import { newFrame, updateLegs, legNeighbours, newLegState, placeOnFrame, toRoot, type LegDef, type LegState, type Frame } from '../kit/crawler';
import { net, netOf, playersIn, dist, hashId, rng, fx, fxPoll, playAt, localIn, thinkOnce, fakeCreature } from '../behaviors_b';
import { CS, pulse, attack, creatureMenu, poke, poked, onPlayerHit } from '../behaviors_a';
import { ruleShown } from '../rules';
import { mixHex } from '../../gfx/pixel';

const live = () => !!G && !!(G as any).players;
const subwayOf = (z: Zone | null | undefined) => (z?.meta?.subway ?? null) as null | { booth: { x: number; z: number }; mantis: [number, number]; turnstiles: [number, number][] };
const angTo = (c: { x: number; z: number }, x: number, z: number) => Math.atan2(z - c.z, x - c.x);
const wrapA = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
/** yaw (rig-local) toward a world point */
function localYaw(c: { x: number; z: number; facing: number }, x: number, z: number) { return wrapA(angTo(c, x, z) - c.facing); }
function nearestP(c: Creature, r: number): { p: Player; d: number } | null {
  let best: { p: Player; d: number } | null = null;
  for (const p of playersIn(c.zoneKey)) { if (p.body.dead) continue; const d = dist(p, c); if (d < r && (!best || d < best.d)) best = { p, d }; }
  return best;
}
/** the local unit, for look-at on any peer */
function lookTarget(c: Creature): { x: number; z: number } | null {
  if (!live()) return null;
  const id = c.targetId; const p = id ? G.players.get(id) : null;
  if (p && p.zoneKey === c.zoneKey) return p;
  const l = G.local; if (l && l.zoneKey === c.zoneKey && dist(l, c) < 9) return l;
  return null;
}

// =====================================================================================
// textures
// =====================================================================================
const PG = registerPage(new Page('c_sunat', 192, 128, [
  ['WSHELL', 48, 48], ['WFOOT', 32, 24], ['WEYE', 8, 8], ['WOPER', 16, 16], ['WPROB', 16, 16], ['BRASS', 8, 8],
  ['MBODY', 32, 32], ['MARM', 16, 24], ['MEYE', 16, 16], ['MLEG', 8, 16], ['MSPINE', 8, 8], ['MLED', 8, 8],
  ['RBODY', 32, 32], ['RDIAL', 16, 16], ['REYE', 8, 8], ['RCORD', 8, 16], ['RCUP', 16, 16], ['RLEG', 8, 24], ['RBEAK', 16, 16],
], 2));
PG.paint((P, v) => {
  // whelk shell: cream with chocolate spiral bands and brass growth rings
  {
    const r = P.R('WSHELL');
    const R = ramp(v ? 0xe0cca8 : 0xd8c49c, 7, 0x5a3a22, 0.4);
    P.fill(r, R, (u, vv, x, y) => {
      let l = 3.6 + (P.n(r, x, y, 3, 2, 11) - 0.5) * 1.6;
      if (Math.sin(vv * 40 + Math.sin(u * 6.28) * 0.8) > 0.55) l -= 2.4;           // spiral bands
      if (y % 6 === 0) l += 1.2;                                                 // growth lines
      return l;
    }, 0.5);
    for (let y = 3; y < r.h; y += 9) for (let x = 0; x < r.w; x++) if (P.n(r, x, y, 4, 1, 12) > 0.4) P.set(r, x, y, mixHex(0xd0a040, 0xfff0b0, P.n(r, x, y, 2, 1, 13)));
  }
  {
    const r = P.R('WFOOT');
    const R = ramp(0xe8d8c0, 6, 0x8a6a5a, 0.4);
    P.fill(r, R, (u, vv, x, y) => 3 + Math.sin(x * 0.9 + y * 0.3) * 0.6 + (P.n(r, x, y, 3, 2, 14) - 0.5) * 1.4, 0.5);
    for (let i = 0; i < 6; i++) P.glint(r, P.rng.int(0, r.w - 4), P.rng.int(0, r.h - 1), 3, 0xffffff, 0.6);
  }
  eye(P, P.R('WEYE'), 0x1a1a10, { pupil: 0x000000, sclera: 0x2a2a20 });
  {
    const r = P.R('WOPER');
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const a = Math.atan2(y - 7.5, x - 7.5), d = Math.hypot(x - 7.5, y - 7.5); P.set(r, x, y, Math.sin(d * 1.6 + a) > 0.2 ? 0x5a3418 : 0x8a5a2a); }
  }
  { const r = P.R('WPROB'); P.fill(r, ramp(0xe0b8a8, 6, 0x6a3a3a, 0.4), (u, vv, x, y) => 2.5 + Math.sin(y * 1.4) * 0.8 + Math.cos(u * 6.28) * 0.6, 0.5); }
  flat(P, P.R('BRASS'), 0xc89a40, 0.05);
  // mantis: brushed-steel chitin (it copies the cabinet), green LED eyes, chrome-pale arms
  {
    const r = P.R('MBODY');
    const R = ramp(0xb8c0b8, 7, 0x4a524a, 0.35);
    P.fill(r, R, (u, vv, x, y) => 3.4 + ((x + (y >> 2)) % 3 === 0 ? -0.8 : 0.3) + (P.n(r, x, y, 4, 1, 21) - 0.5) * 0.8 + (y % 10 === 0 ? -1.5 : 0), 0.3);
    for (let y = 0; y < r.h; y++) if (P.n(r, 0, y, 1, 3, 22) > 0.6) for (let x = 0; x < r.w; x++) P.blend(r, x, y, 0x6a8a5a, 0.18);
  }
  {
    const r = P.R('MARM');
    P.fill(r, ramp(0xd8e0d8, 6, 0x5a6a5a, 0.5), (u, vv, x, y) => 3 + Math.cos(u * 6.28) * 1.4 + (y % 6 === 0 ? -1 : 0), 0.3);
    P.glint(r, 2, 4, 3, 0xffffff, 0.8);
  }
  eye(P, P.R('MEYE'), 0x40e070, { pupil: 0x0a2a10, sclera: 0x1a3a1a });
  { const r = P.R('MLEG'); P.fill(r, ramp(0x8a9a80, 5, 0x2a3a2a, 0.3), (u, vv) => 1.5 + vv * 2, 0.3); }
  { const r = P.R('MSPINE'); P.fill(r, ramp(0x3a3020, 5, 0x0a0806, 0.3), (u, vv) => 1 + vv * 2.5, 0.3); }
  { const r = P.R('MLED'); for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) P.set(r, x, y, (x + y) % 3 ? 0x50f080 : 0xb0ffc8); }
  // ringer: black lacquer with a warm sheen, a cream dial with pale eye-pits, a coiled cord
  {
    const r = P.R('RBODY');
    const R = ramp(0x2a2624, 6, 0x050404, 0.3);
    P.fill(r, R, (u, vv, x, y) => 1.8 + vv * 1.4 + (P.n(r, x, y, 3, 2, 31) - 0.5) * 0.6, 0.3);
    for (let y = 4; y < r.h; y += 11) P.glint(r, (y * 3) % r.w, y, 6, 0xfff0e0, 0.4);
  }
  {
    const r = P.R('RDIAL');
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8), a = Math.atan2(y + 0.5 - 8, x + 0.5 - 8);
      let c = d < 3 ? 0xe8dcc0 : d < 7.6 ? 0xd8ccb0 : 0x2a2624;
      const hole = Math.abs(((a / (Math.PI * 2)) * 10 + 10.5) % 1 - 0.5) < 0.26 && d > 4 && d < 6.6;
      if (hole) c = d > 5.6 ? 0x6a5a4a : 0xf0e8d8;
      P.set(r, x, y, c);
    }
  }
  eye(P, P.R('REYE'), 0x8a6a20, { pupil: 0x0a0806, sclera: 0xe8e0c8 });
  { const r = P.R('RCORD'); for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) P.set(r, x, y, (y % 3 === 0) ? 0x3a3634 : 0x141210); }
  { const r = P.R('RCUP'); P.fill(r, ramp(0x2a2624, 6, 0x050404, 0.3), (u, vv, x, y) => 2 + vv * 2 + (Math.hypot(x - 8, y - 8) < 4 ? -1.5 : 0), 0.3); }
  { const r = P.R('RLEG'); P.fill(r, ramp(0x6a5a50, 5, 0x1a1410, 0.3), (u, vv, x, y) => 1.5 + vv * 1.6 + (y % 6 === 0 ? 1 : 0), 0.3); }
  {
    const r = P.R('RBEAK');
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8); P.set(r, x, y, d < 7 && ((x % 3 === 1 && y % 3 === 1) && d < 5.5) ? 0x0a0806 : d < 7 ? 0xcabca0 : 0x2a2624); }
  }
  void skin;
});

// =====================================================================================
// TOKEN WHELK
// =====================================================================================
function buildWhelk(): Rig {
  const rig = newRig(1.4);
  const lac = surfaceMat('lacquer', { alphaTest: 0.5 });
  // the shell: a turreted cone spiralling up behind the body, mouth to the front
  tpart(rig, 'shell', rig.body, [0, 0.08, -0.3], PG, 'wshell', lac, (ob) => {
    const S = PG.reg('WSHELL');
    const path: V3[] = [], rad: [number, number][] = [];
    const N = 30;
    for (let i = 0; i <= N; i++) {
      const t = i / N, a = t * Math.PI * 5.6, R = 0.34 * (1 - t) + 0.02;
      path.push([Math.cos(a) * R * 0.85, 0.08 + t * 1.45, Math.sin(a) * R * 0.85 - t * 0.3]);
      const r = 0.5 * Math.pow(1 - t, 1.1) + 0.025;
      rad.push([r, r * 0.92]);
    }
    ob.tube(path, rad, 14, S, { up: [0, 1, 0], start: 'flat', end: 'pole', endBulge: 0.05, bump: (i, th) => 0.07 * Math.max(0, Math.sin(th * 3 + i * 0.7)) + (i % 5 === 0 ? 0.04 : 0) });
    // the flared lip round the aperture, and its siphon canal
    ob.blob([0.1, 0.32, 0.3], [0.42, 0.34, 0.14], 12, 7, S, {});
    ob.cone([0.32, 0.12, 0.34], [0.3, -0.5, 0.6], 0.07, 0.3, 6, S);
  });
  // the foot: a mass on the floor, and a great soft pad pressed up flat against the inside of the glass
  bpart(rig, 'foot', rig.body, [0, 0, 0.12], PG, 'wfoot', (ob) => {
    const F = PG.reg('WFOOT');
    ob.blob([0, 0.18, 0], [0.62, 0.18, 0.46], 12, 6, F, {});
    ob.blob([0, 0.58, 0.3], [0.6, 0.36, 0.09], 12, 7, F, {});
    for (let i = 0; i < 6; i++) ob.blob([-0.5 + i * 0.2, 0.3 + Math.sin(i * 1.7) * 0.18, 0.36], [0.12, 0.1, 0.05], 7, 4, F, {});
  });
  // the head on top of the foot, between the shell and the glass, and its stalks
  const head = bpart(rig, 'head', rig.body, [0, 0.98, 0.22], PG, 'whead', (ob) => {
    const F = PG.reg('WFOOT');
    ob.blob([0, 0, 0], [0.22, 0.13, 0.17], 10, 6, F, {});
    for (const sx of [-1, 1]) ob.tube([[sx * 0.12, 0.02, 0.06], [sx * 0.28, -0.04, 0.16], [sx * 0.36, -0.1, 0.22]], [0.035, 0.022, 0.01], 5, F, { start: 'pole', end: 'pole' });
  });
  for (const s of [-1, 1]) {
    bpart(rig, s > 0 ? 'stalkR' : 'stalkL', head, [s * 0.09, 0.08, 0.04], PG, 'wstalk', (ob) => {
      ob.tube([[0, 0, 0], [0, 0.18, 0.03], [0, 0.36, 0.05]], [0.035, 0.03, 0.026], 6, PG.reg('WFOOT'), { start: 'pole' });
      ob.blob([0, 0.38, 0.06], [0.055, 0.055, 0.055], 8, 6, PG.reg('WEYE'), { emis: 0.15 });
    });
  }
  // the proboscis, coiled under the head; it reaches out through the trough with a token in it
  const pr = bpart(rig, 'prob', head, [0, -0.06, 0.12], PG, 'wprob', (ob) => {
    const path: V3[] = []; for (let i = 0; i <= 8; i++) path.push([Math.sin(i * 0.7) * 0.03, -Math.sin((i / 8) * Math.PI) * 0.05, (i / 8) * 0.9]);
    ob.tube(path, path.map((_, i) => 0.05 - i * 0.004), 7, PG.reg('WPROB'), { start: 'pole', end: 'pole' });
  });
  bpart(rig, 'token', pr, [0, 0, 0.9], PG, 'wtoken', (ob) => { ob.blob([0, 0, 0], [0.03, 0.03, 0.006], 8, 3, PG.reg('BRASS'), { emis: 0.2 }); });
  // the operculum: the horn door it shuts itself in with (carried on the back of the foot)
  bpart(rig, 'oper', rig.body, [0.08, 0.42, -0.02], PG, 'woper', (ob) => { ob.blob([0, 0, 0], [0.36, 0.3, 0.04], 12, 4, PG.reg('WOPER'), {}); });
  rig.eyes = [];
  return rig;
}

function thinkWhelk(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey) as Zone, m = c.mem, n = net(c), now = G.time;
  const ev = pulse(c);
  const sw = subwayOf(z);
  if (sw && Math.hypot(c.x - sw.booth.x, c.z - sw.booth.z) > 0.3) { c.x = sw.booth.x; c.z = sw.booth.z; }
  c.speed = 0; c.vx = c.vz = 0;
  c.facing = c.targetFacing = Math.PI / 2;
  // hurt: shut the door (the horn takes most of what follows); lash out through the trough
  if (ev.hurt > 0) {
    if (n.shut) c.hp = Math.min(c.sp.hp, c.hp + ev.hurt * 0.75);
    n.shut = 1; m.shutT = now + 12; fx(c, 'shut');
    if (c.targetId && G.players.has(c.targetId)) m.grudge = { id: c.targetId, t: now + 40 };
  }
  if (n.shut && now > m.shutT) n.shut = 0;
  const near = nearestP(c, 9);
  c.targetId = near?.p.id ?? null;
  c.setState(near ? 'watch' : 'idle');
  // a coin in the trough: a token back
  const buyer = poked(c, 'buy');
  if (buyer && !m.buyCool) { m.buyCool = 1; fx(c, 'slide'); n.sl = now; setTimeout(() => { m.buyCool = 0; }, 900); }
  const g = m.grudge as { id: string; t: number } | undefined;
  if (g && now < g.t) {
    const p = G.players.get(g.id);
    if (p && !p.body.dead && p.zoneKey === c.zoneKey && dist(p, c) < c.sp.attack!.range + 0.4 && c.attackT <= 0 && !n.shut) { attack(c, p); ruleShown(c); }
    if (p && dist(p, c) < 3.5 && n.shut && now > (m.peekT ?? 0)) { n.shut = 0; m.peekT = now + 6; }
  }
  return true;
}

function animateWhelk(rig: Rig, c: Creature, t: number, dt: number) {
  applyLook(rig, c, PG, 0.05);
  const n = netOf(c), ud = rig.root.userData as Record<string, any>, P = rig.parts;
  const f = fxPoll(rig, c);
  if (f?.key === 'slide') { ud.sl = t; playAt('kiosk_accept', c, 0.6, 10, 0.8); setTimeout(() => playAt('tithe_jingle', c, 0.5, 10, 1.1), 500); }
  else if (f?.key === 'shut') playAt('bh_squelch', c, 0.9, 12, 0.6);
  const shut = c.dead ? 1 : n.shut ? 1 : 0;
  ud.shut = (ud.shut ?? 0) + (shut - (ud.shut ?? 0)) * damp(6, dt);
  const sh = ud.shut;
  // the slide: the proboscis runs out through the trough and back
  const st = ud.sl !== undefined ? t - ud.sl : 9;
  const out = st < 0.5 ? st / 0.5 : st < 1.3 ? 1 : st < 2 ? 1 - (st - 1.3) / 0.7 : 0;
  const atk = c.attackPhase > 0 ? 1 : 0;
  ud.lash = (ud.lash ?? 0) + (atk - (ud.lash ?? 0)) * damp(atk ? 22 : 4, dt);
  // breathing, the foot rippling on the glass
  const br = Math.sin(t * 1.1 + hashId(c.id) * 6);
  P.foot.scale.set(1 + br * 0.02 - sh * 0.45, 1 + br * 0.03 - sh * 0.6, 1 - sh * 0.4);
  P.foot.position.set(0, 0, 0.12 - sh * 0.3);
  P.head.position.set(0, 0.98 - sh * 0.6, 0.22 - sh * 0.4);
  P.head.scale.setScalar(1 - sh * 0.75);
  P.shell.rotation.set(Math.sin(t * 0.6) * 0.02 - sh * 0.08, Math.sin(t * 0.4) * 0.03, 0);
  P.oper.position.set(0.08, 0.42 - sh * 0.05, -0.02 + sh * 0.3);
  P.oper.rotation.set(-sh * 0.15, 0, 0);
  // eyes on stalks follow you along the counter
  const tg = lookTarget(c);
  const yaw = tg ? Math.max(-1, Math.min(1, -localYaw(c, tg.x, tg.z) + Math.PI / 2 - Math.PI / 2)) : Math.sin(t * 0.3) * 0.4;
  ud.yaw = (ud.yaw ?? 0) + (yaw - (ud.yaw ?? 0)) * damp(3, dt);
  for (const s of ['L', 'R']) { const k = s === 'L' ? -1 : 1; P['stalk' + s].rotation.set(0.3 + Math.sin(t * 1.7 + k) * 0.12, ud.yaw * 0.8, k * 0.25 + ud.yaw * -0.3); }
  P.head.rotation.set(0, ud.yaw * 0.4, 0);
  // the proboscis: curled when idle, out through the trough with a token, or whipping out at you
  const reach = Math.max(out, ud.lash);
  P.prob.rotation.set(0.9 - reach * 0.95 + Math.sin(t * 2) * 0.05, ud.lash * Math.sin(t * 18) * 0.2, 0);
  P.prob.scale.set(1, 1, 0.35 + reach * 0.85);
  P.token.visible = out > 0.05 && ud.lash < 0.3;
  if (c.dead) return;
  const p = localIn(c);
  if (p && c.visibleToLocal && dist(p, c) < 5) thinkOnce(p, 'su_whelk', ['There is a snail in the token booth. The size of an armchair. It is watching me over the counter.', 'Its eyes are on stalks. They follow me along the glass.', 'It wants a coin. It is looking at my pocket.'][Math.floor(t * 0.2) % 3], 90);
}

const WHELK = def({
  key: 'token_whelk', name: 'Token Whelk', code: 'TW-04 // FAUNA, GASTROPOD (SESSILE, TRADER)', temperament: 'neutral', threat: 1,
  rule: { name: 'ONE COIN, ONE TOKEN', text: 'It trades: a coin through the trough buys a token. It never leaves the booth. Strike it and it shuts its horn door (most of the next blows go nowhere) and remembers you for a while: stand at the window and it lashes you through the trough.', tell: 'A snail the size of an armchair in the token booth, eyes on stalks.' },
  hp: 160, walk: 0, run: 0, turn: 0, radius: 0.6, height: 1.3, sight: 9, fov: 2, hearing: 1,
  attack: { dmg: [6, 12], range: 2.4, cooldown: 1.6, kinds: ['bruise', 'laceration'], corrupt: 0, knock: 0.6, parts: ['hand_l', 'hand_r', 'farm_l', 'farm_r'] },
  zones: ['subway'], weight: 0, maxPerZone: 1, diet: 'none',
  meat: [['whelk_meat', 3]],
  flags: { attached: true },
  sounds: { idle: 'arv_squelch', hurt: 'bh_squelch', death: 'gore_squelch', attack: 'arv_spit' },
  scan: { cls: 'Fauna / gastropod (sessile, trader)', notes: ['A whelk the size of an armchair, grown into the token booth.', 'A coin through the trough buys a token.', 'Struck, it shuts its horn door, and holds a grudge.'] },
  gore: { blood: 'pale', tint: 0xe0d0b0, flesh: 0xe8d8c0, gib: false },
  disposition: { mood: 'docile', self: true },
  build: buildWhelk, animate: animateWhelk, think: thinkWhelk,
});
creatureMenu('token_whelk', (p, c, opts) => {
  const coin = p.findItem((it) => it.key === 'coins');
  opts.push({
    label: 'Pay a coin for a token', disabled: !coin ? 'needs coins' : false,
    action: () => queueAt(p, c.x, c.z + 1.3, new UseObjectAction(p, 'Pay', 1.2, 'pickup', () => {
      const it = p.findItem((i) => i.key === 'coins');
      if (!it || c.dead) return;
      p.removeItem(it);
      p.inv.add(createItem('brass_token'));
      poke(p, c, 'buy');
      bus.emit('inventoryChanged', p);
      bus.emit('think', p, ['It took the coin with something wet and slid a token back. It is still warm.', 'A token. It pushed it through the trough with its mouth.', 'It looked at the coin for a long time first.'][Math.floor(Math.random() * 3)]);
    }), 2.4, false),
  });
});
onPlayerHit('token_whelk', (p) => bus.emit('think', p, 'It came out through the trough. It was all mouth.'));

// =====================================================================================
// STILE MANTIS
// =====================================================================================
const M_LEGS: LegDef[] = [];
for (const [along, side] of [[0.14, 1], [0.14, -1], [-0.2, 1], [-0.2, -1]] as const) {
  const n = `m${along > 0 ? 'f' : 'b'}${side > 0 ? 'R' : 'L'}`;
  M_LEGS.push({ seg: 0, side, along, out: 0.38, up: -0.25, reach: 0.62, fwd: along * 0.6, L1: 0.55, L2: 0.68, femur: n + 'u', tibia: n + 'd' });
}
function buildMantis(): Rig {
  const rig = newRig(1.0);
  const lac = surfaceMat('lacquer', { alphaTest: 0.5 });
  const frame = new THREE.Group(); frame.name = 'frame'; rig.root.add(frame); rig.parts.frame = frame;
  // the cabinet: a brushed-steel box of a thorax, the token slot its mouth
  const body = tpart(rig, 'cab', frame, [0, 0, 0], PG, 'mcab', lac, (ob) => {
    const B = PG.reg('MBODY'), L = PG.reg('MLED');
    const rings = [-0.42, -0.3, 0, 0.3, 0.42].map((y, i) => ({ pts: [[-0.4, y, -0.13], [0.4, y, -0.13], [0.43, y, 0], [0.4, y, 0.13], [-0.4, y, 0.13], [-0.43, y, 0], [-0.4, y, -0.13]].map((p) => [p[0] * (i === 0 || i === 4 ? 0.95 : 1), p[1], p[2]] as V3), v: i / 4 }));
    ob.loft(rings, B, { start: 'flat', end: 'flat' });
    ob.quad([[-0.3, 0.32, 0.135], [-0.18, 0.32, 0.135], [-0.18, 0.36, 0.135], [-0.3, 0.36, 0.135]], L, [[0, 0], [1, 0], [1, 1], [0, 1]], { emis: 1 });
    // abdomen tucked behind, segmented
    for (let i = 0; i < 4; i++) ob.blob([0, -0.1 - i * 0.02, -0.2 - i * 0.1], [0.3 - i * 0.04, 0.22 - i * 0.03, 0.08], 10, 5, B, {});
  });
  void body;
  // the head: hidden in the top of the cabinet, it rises when it strikes
  const head = bpart(rig, 'mhead', frame, [0.2, 0.3, 0.02], PG, 'mhead', (ob) => {
    const B = PG.reg('MBODY'), E = PG.reg('MEYE'), S = PG.reg('MSPINE');
    ob.blob([0, 0.03, 0], [0.12, 0.06, 0.08], 8, 5, B, {});
    for (const sx of [-1, 1]) ob.blob([sx * 0.1, 0.06, 0.03], [0.055, 0.06, 0.05], 8, 6, E, { emis: 0.5 });
    for (const sx of [-1, 1]) ob.cone([sx * 0.03, 0, 0.07], [sx * 0.3, -0.4, 1], 0.015, 0.08, 4, S);
    for (const sx of [-1, 1]) ob.tube([[sx * 0.04, 0.08, 0.04], [sx * 0.12, 0.25, 0.1], [sx * 0.22, 0.32, 0.05]], [0.008, 0.006, 0.003], 4, S, {});
  });
  void head;
  // the hub on its chest, and the three raptorial arms
  const hub = bpart(rig, 'hub', frame, [0, 0.12, 0.16], PG, 'mhub', (ob) => { ob.blob([0, 0, 0], [0.08, 0.08, 0.06], 8, 5, PG.reg('MARM'), {}); });
  for (let k = 0; k < 3; k++) {
    const pivot = new THREE.Group(); pivot.name = 'apiv' + k; hub.add(pivot); rig.parts['apiv' + k] = pivot;
    const up = bpart(rig, 'armU' + k, pivot, [0, 0, 0], PG, 'marmu', (ob) => {
      const A = PG.reg('MARM'), S = PG.reg('MSPINE');
      ob.tube([[0, 0, 0], [0, 0.01, 0.24], [0, 0, 0.48]], [0.028, 0.024, 0.02], 6, A, { start: 'pole', end: 'pole' });
      for (let i = 1; i < 6; i++) ob.cone([0, -0.02, i * 0.08], [0, -1, 0.3], 0.008, 0.05, 3, S);
    });
    bpart(rig, 'armD' + k, up, [0, 0, 0.48], PG, 'marmd', (ob) => {
      const A = PG.reg('MARM'), S = PG.reg('MSPINE');
      ob.tube([[0, 0, 0], [0, -0.01, 0.2], [0, -0.06, 0.36]], [0.02, 0.016, 0.006], 6, A, { start: 'pole', end: 'pole' });
      for (let i = 1; i < 5; i++) ob.cone([0, -0.015, i * 0.07], [0, -1, -0.2], 0.006, 0.04, 3, S);
    });
  }
  for (const d of M_LEGS) {
    bpart(rig, d.femur, rig.root, [0, 0, 0], PG, 'mlegu', (ob) => { ob.tube([[0, 0, 0], [0, 0.02, d.L1 * 0.5], [0, 0, d.L1]], [0.025, 0.02, 0.018], 5, PG.reg('MLEG'), { start: 'pole', end: 'pole' }); });
    bpart(rig, d.tibia, rig.root, [0, 0, 0], PG, 'mlegd', (ob) => { ob.tube([[0, 0, 0], [0, -0.01, d.L2 * 0.6], [0, 0, d.L2]], [0.018, 0.012, 0.005], 5, PG.reg('MLEG'), { start: 'pole', end: 'pole' }); });
  }
  rig.eyes = [];
  return rig;
}
const _mf: Frame[] = [newFrame()];
function animateMantis(rig: Rig, c: Creature, t: number, dt: number) {
  applyLook(rig, c, PG, 0.03);
  const n = netOf(c), ud = rig.root.userData as Record<string, any>, P = rig.parts;
  const f = fxPoll(rig, c);
  if (f?.key === 'turn') { ud.turnT = t; playAt('tc_ratchet', c, 0.8, 10, 1); setTimeout(() => playAt('tc_clack', c, 0.7, 10, 1), 350); }
  else if (f?.key === 'unfold') { playAt('stammer_unfold', c, 0.9, 14, 1.1); playAt('tc_clack_up', c, 0.8, 12, 0.8); }
  const disguised = c.state === 'disguised' && !c.dead;
  ud.open = (ud.open ?? (disguised ? 0 : 1)) + ((disguised ? 0 : 1) - (ud.open ?? 0)) * damp(disguised ? 2 : 9, dt);
  const o = ud.open;
  // stood up on its legs when it is out; squatting flat to the floor in disguise
  const rise = 0.42 + o * 0.38;
  const frame = P.frame;
  frame.position.set(0, rise + Math.sin(t * 8) * 0.01 * o, -0.34 * (1 - o));
  frame.rotation.set(-o * 0.25 + (c.speed > 0.2 ? Math.sin(t * 9) * 0.03 : 0), 0, 0);
  // legs: folded flat in disguise, walking when it is out
  const F = _mf[0];
  F.p.set(c.x, c.y + rise, c.z).addScaledVector(F.f.set(Math.cos(c.facing), 0, Math.sin(c.facing)), -0.34 * (1 - o));
  F.u.set(0, 1, 0); F.r.crossVectors(F.u, F.f).normalize(); F.ride = rise;
  if (!ud.st) { ud.st = M_LEGS.map(newLegState); ud.nb = legNeighbours(M_LEGS); }
  updateLegs(rig.root, P, M_LEGS, ud.st, ud.nb, _mf, dt, { vx: Math.cos(c.facing) * c.speed, vy: 0, vz: Math.sin(c.facing) * c.speed, speed: c.speed, stepDist: 0.3, lift: 0.12, splay: 1.2, curl: (1 - o) * 0.3 + (c.dead ? 0.2 : 0) });
  for (const d of M_LEGS) { P[d.femur].visible = o > 0.15 || c.dead; P[d.tibia].visible = o > 0.15 || c.dead; }
  // the head comes up out of the cabinet top
  P.mhead.position.set(0.2 * (1 - o), 0.3 + o * 0.28, 0.02 + o * 0.12);
  P.mhead.rotation.set(-o * 0.3 + Math.sin(t * 1.3) * 0.08 * o, Math.sin(t * 0.9) * 0.4 * o, 0);
  // the arms: three turnstile bars in disguise (they click round when you pay); raptorial when it strikes
  const tt = ud.turnT !== undefined ? t - ud.turnT : 9;
  const turn = tt < 0.9 ? (tt / 0.9) * (Math.PI * 2 / 3) : 0;
  const atk = c.attackPhase > 0 ? 1 : 0;
  ud.atk = (ud.atk ?? 0) + (atk - (ud.atk ?? 0)) * damp(atk ? 26 : 5, dt);
  P.hub.rotation.set(0, 0, turn * (1 - o) + Math.sin(t * 2) * 0.05 * o);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.3;
    const piv = P['apiv' + k];
    // disguised: the bars stand out at the turnstile's angles; out: folded up to the chest, flicking out to strike
    piv.rotation.set(0, 0, lerp(a, (k - 1) * 0.6, o));
    P['armU' + k].rotation.set(lerp(-0.75, -1.1 + ud.atk * 1.2 + Math.sin(t * 3 + k) * 0.06, o), 0, 0);
    P['armD' + k].rotation.set(lerp(0, 2.4 - ud.atk * 2.0, o), 0, 0);
  }
  if (c.dead || !live()) return;
  const p = localIn(c);
  if (p && !disguised && dist(p, c) < 6) thinkOnce(p, 'su_mantis', ['The turnstile is ALIVE. The bars are arms.', 'It unfolded out of the turnstile line. It was standing there the whole time.'][Math.floor(t * 0.3) % 2], 60);
}
function thinkMantis(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey) as Zone, m = c.mem, n = net(c), now = G.time, cs = CS();
  const ev = pulse(c);
  const sw = subwayOf(z);
  const post = sw ? { x: sw.mantis[0], z: sw.mantis[1] } : (m.post ||= { x: c.x, z: c.z });
  m.paid ||= {};
  const payer = poked(c, 'pay');
  if (payer && !m.payCool) { m.paid[payer] = now + 25; m.payCool = 1; fx(c, 'turn'); setTimeout(() => { m.payCool = 0; }, 800); }
  if (ev.hurt > 0 && c.state === 'disguised') { c.setState('chase'); fx(c, 'unfold'); m.huntT = now + 10; }
  if (ev.hurt > 0) m.huntT = Math.max(m.huntT ?? 0, now + 8);
  if (c.state === 'disguised') {
    c.x = post.x; c.z = post.z; c.speed = 0; c.vx = c.vz = 0; c.facing = c.targetFacing = Math.PI / 2;
    // through the turnstile without paying
    for (const p of playersIn(c.zoneKey)) {
      if (p.body.dead || dist(p, c) > 0.95) continue;
      if ((m.paid[p.id] ?? 0) > now) continue;
      c.setState('chase'); fx(c, 'unfold'); m.huntT = now + 7; c.targetId = p.id; ruleShown(c);
      c.attackT = 0; attack(c, p);
      break;
    }
    return true;
  }
  // out: strike whoever is near (not a paid fare), then go back and stand in the line
  let tgt: Player | null = null, td = 6;
  for (const p of playersIn(c.zoneKey)) { if (p.body.dead) continue; const d = dist(p, c); if (d < td && dist(p, post) < 7 && (m.paid[p.id] ?? 0) < now) { td = d; tgt = p; } }
  if (tgt && now < (m.huntT ?? 0)) {
    c.targetId = tgt.id; c.setState('chase');
    cs.moveTo(c, z, tgt.x, tgt.z, c.sp.run, dt, 0.6);
    if (td < c.sp.attack!.range + 0.3 && c.attackT <= 0) { c.targetFacing = angTo(c, tgt.x, tgt.z); attack(c, tgt); }
    return true;
  }
  c.targetId = null;
  if (Math.hypot(c.x - post.x, c.z - post.z) > 0.15) { c.setState('travel'); cs.moveTo(c, z, post.x, post.z, c.sp.walk, dt, 0.1); m.stillT = 0; return true; }
  c.speed = 0; c.facing = c.targetFacing = Math.PI / 2;
  m.stillT = (m.stillT ?? 0) + dt;
  if (m.stillT > 2.5) { c.setState('disguised'); c.x = post.x; c.z = post.z; }
  void n;
  return true;
}
const MANTIS = def({
  key: 'stile_mantis', name: 'Stile Mantis', code: 'SM-05 // FAUNA, MANTID (FIXTURE MIMIC)', temperament: 'ambush', threat: 3,
  rule: { name: 'PAY THE FARE', text: 'It stands in the turnstile line as the last turnstile. Put a token in its slot (or a whelk\'s door, which it likes better) and it turns and lets you through. Walk through without paying and the three bars close on you. Out of the line it guards a few metres and then goes back to standing still.', tell: 'A turnstile at the end of the row. The bars are warm.' },
  hp: 70, walk: 1.2, run: 4.2, turn: 7, radius: 0.36, height: 1.2, sight: 7, fov: 2.6, hearing: 1.2,
  attack: { dmg: [9, 16], range: 1.1, cooldown: 1.2, kinds: ['laceration', 'deep'], corrupt: 0.01, knock: 0.4, grab: true },
  zones: ['subway'], weight: 0, maxPerZone: 1, diet: 'meat',
  meat: [['mantis_blade', 1]],
  flags: { furniture: 'su_turnstile', mimic: true },
  sounds: { idle: 'tc_tick', alert: 'tc_clack_up', attack: 'swivel_bite', hurt: 'ventling_squeal', death: 'ventling_die' },
  scan: { cls: 'Fauna / mantid (fixture mimic)', notes: ['A mantis grown into the shape of a token turnstile.', 'Pay the fare at its slot and it lets you through.', 'Walk through without paying and its three arms close.'] },
  gore: { blood: 'pale', tint: 0xc8e0b0, flesh: 0xa8c098, gib: false },
  disposition: { mood: 'territorial', self: true },
  build: buildMantis, animate: animateMantis, think: thinkMantis,
});
creatureMenu('stile_mantis', (p, c, opts) => {
  if (c.state !== 'disguised') return;
  const tok = p.findItem((it) => it.key === 'brass_token' || it.key === 'whelk_operculum');
  opts.push({
    label: 'Deposit a token', disabled: !tok ? 'needs a subway token' : false,
    action: () => queueAt(p, c.x - 1, c.z, new UseObjectAction(p, 'Deposit token', 0.8, 'pickup', () => {
      const it = p.findItem((i) => i.key === 'brass_token' || i.key === 'whelk_operculum');
      if (!it) return;
      p.removeItem(it);
      poke(p, c, 'pay');
      bus.emit('inventoryChanged', p);
      bus.emit('think', p, it.key === 'whelk_operculum' ? 'It took the shell door. Something in the slot... chewed it. The bars clicked round.' : 'Click. Clack. The bars went round. The light is green.');
    }), 1.4, false),
  });
});
onPlayerHit('stile_mantis', (p) => bus.emit('think', p, ['The turnstile grabbed me. THE TURNSTILE.', 'I did not pay. I did not pay the fare.'][Math.floor(Math.random() * 2)]));

// =====================================================================================
// RINGER
// =====================================================================================
const R_LEGS: LegDef[] = [
  { seg: 0, side: 1, along: -0.02, out: 0.12, up: -0.18, reach: 0.16, L1: 0.52, L2: 0.6, femur: 'rlRu', tibia: 'rlRd' },
  { seg: 0, side: -1, along: -0.02, out: 0.12, up: -0.18, reach: 0.16, L1: 0.52, L2: 0.6, femur: 'rlLu', tibia: 'rlLd' },
];
const R_RIDE = 0.98;
function buildRinger(): Rig {
  const rig = newRig(1.45);
  const lac = surfaceMat('lacquer', { alphaTest: 0.5 });
  const frame = new THREE.Group(); frame.name = 'rframe'; rig.root.add(frame); rig.parts.rframe = frame;
  // the body: a bakelite telephone of a body, the dial on its chest
  tpart(rig, 'rbody', frame, [0, 0, 0], PG, 'rbody', lac, (ob) => {
    const B = PG.reg('RBODY');
    const rows = [[-0.2, 0.16, 0.06, 0.02], [-0.16, 0.2, 0.14, 0.1], [0, 0.22, 0.2, 0.14], [0.14, 0.18, 0.17, 0.12], [0.22, 0.1, 0.08, 0.06]];
    const rings = rows.map(([zz, rx, up, dn], i) => {
      const pts: V3[] = [];
      for (let j = 0; j <= 14; j++) { const a = (j / 14) * Math.PI * 2; const s = Math.sin(a), co = -Math.cos(a); pts.push([s * rx, co >= 0 ? co * up + 0.02 : co * dn, zz]); }
      return { pts, v: 1 - i / (rows.length - 1) };
    });
    ob.loft(rings, B, { start: 'pole', end: 'pole', startBulge: 0.03, endBulge: 0.03 });
    // the cradle hooks on top where the handset would rest
    for (const sx of [-1, 1]) ob.cone([sx * 0.12, 0.2, 0.02], [sx * 0.3, 1, 0], 0.035, 0.1, 5, B);
  });
  bpart(rig, 'dial', frame, [0, 0.04, 0.215], PG, 'rdial', (ob) => {
    ob.blob([0, 0, 0], [0.12, 0.12, 0.025], 14, 4, PG.reg('RDIAL'), { emis: 0.25 });
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 1.7 + 0.7; ob.blob([Math.cos(a) * 0.085, Math.sin(a) * 0.085, 0.022], [0.018, 0.018, 0.012], 6, 4, PG.reg('REYE'), { emis: 0.2 }); }
  });
  // the coiled cord of a neck (stretches), and the handset head on the end of it
  const neck = bpart(rig, 'neck', frame, [0, 0.18, 0.08], PG, 'rneck', (ob) => {
    const path: V3[] = [];
    for (let i = 0; i <= 64; i++) { const t = i / 64, a = t * Math.PI * 2 * 9; path.push([Math.cos(a) * 0.035, t * 0.5, Math.sin(a) * 0.035 + t * 0.06]); }
    ob.tube(path, path.map(() => 0.012), 4, PG.reg('RCORD'), { start: 'pole', end: 'pole' });
  });
  const headP = bpart(rig, 'rhead', neck, [0, 0.5, 0.06], PG, 'rhead', (ob) => {
    const C = PG.reg('RCUP'), B = PG.reg('RBODY'), E = PG.reg('REYE'), K = PG.reg('RBEAK');
    // the grip: a curved bar
    ob.tube([[0, 0.02, -0.17], [0, 0.06, 0], [0, 0.02, 0.17]], [[0.035, 0.03], [0.04, 0.034], [0.035, 0.03]], 8, B, { up: [0, 1, 0] });
    // earpiece cup at the back (the eyes in it), mouthpiece cup at the front (the beak)
    ob.blob([0, -0.02, -0.2], [0.075, 0.07, 0.06], 10, 6, C, {});
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; ob.blob([Math.cos(a) * 0.035, -0.06 + Math.sin(a) * 0.03, -0.2], [0.018, 0.018, 0.014], 6, 4, E, { emis: 0.35 }); }
    ob.blob([0, -0.03, 0.2], [0.08, 0.075, 0.06], 10, 6, C, {});
    ob.blob([0, -0.08, 0.215], [0.065, 0.02, 0.055], 10, 4, K, {});
  });
  void headP;
  for (const d of R_LEGS) {
    bpart(rig, d.femur, rig.root, [0, 0, 0], PG, 'rlegu', (ob) => { ob.tube([[0, 0, 0], [0, 0.01, d.L1 * 0.5], [0, 0, d.L1]], [0.024, 0.018, 0.016], 5, PG.reg('RLEG'), { start: 'pole', end: 'pole' }); ob.blob([0, 0, d.L1], [0.025, 0.025, 0.025], 5, 4, PG.reg('RLEG'), {}); });
    bpart(rig, d.tibia, rig.root, [0, 0, 0], PG, 'rlegd', (ob) => {
      ob.tube([[0, 0, 0], [0, 0, d.L2 - 0.02]], [0.015, 0.01], 5, PG.reg('RLEG'), { start: 'pole' });
      for (const a of [-0.6, 0, 0.6]) ob.cone([0, 0, d.L2 - 0.03], [Math.sin(a), -0.2, Math.cos(a) * 0.4 + 0.3], 0.008, 0.09, 3, PG.reg('RLEG'));
    });
  }
  rig.eyes = [];
  return rig;
}
const _rf: Frame[] = [newFrame()];
const RING_LINES = [
  '...hello? Hello, is this Westgate? The board says two minutes. It has said two minutes all night...',
  '...Mum, it\'s me. I\'m on the platform. No, it hasn\'t come. Something came but it wasn\'t the train...',
  '...this is a recorded message. The Inner Loop is running a normal service. Please stand behind the yellow line...',
  '...don\'t get on it. Whatever you do. If the doors open, they\'re not doors...',
  '...I paid. I PAID. It still... (the line goes quiet, then a clicking, like a turnstile)...',
  '...Meridian Institute of Liminality, fares and recoveries, how may I direct your call...',
];
function animateRinger(rig: Rig, c: Creature, t: number, dt: number) {
  applyLook(rig, c, PG, 0.08);
  const n = netOf(c), ud = rig.root.userData as Record<string, any>, P = rig.parts;
  const f = fxPoll(rig, c);
  if (f?.key === 'ring') { ud.ringT = t; playAt('phone_ring', c, f.a?.loud ? 1 : 0.75, f.a?.loud ? 46 : 32, f.a?.loud ? 1.08 : 1); }
  else if (f?.key === 'answer') {
    ud.ringT = -9; playAt('click', c, 0.6, 8, 0.8);
    const l = G.local, line = RING_LINES[(f.a?.k ?? 0) % RING_LINES.length];
    if (l && l.zoneKey === c.zoneKey && dist(l, c) < 8) G.ui?.say?.(l, line, 'radio', 5);
  } else if (f?.key === 'shriek') { ud.ringT = t; playAt('phone_ring', c, 1, 50, 1.25); playAt('hollow_shriek', c, 0.5, 20, 1.6); }
  const rt = ud.ringT !== undefined ? t - ud.ringT : 9;
  const ringing = rt >= 0 && rt < 2.4 ? 1 : 0;
  ud.rg = (ud.rg ?? 0) + (ringing - (ud.rg ?? 0)) * damp(14, dt);
  const rg = ud.rg;
  // legs: a stilt walk, two planted feet
  const F = _rf[0];
  const bob = Math.sin(c.phase * 2) * 0.03 * clamp01(c.speed);
  const ride = R_RIDE + bob - (c.dead ? 0.7 : 0);
  F.f.set(Math.cos(c.facing), 0, Math.sin(c.facing)); F.u.set(0, 1, 0); F.r.crossVectors(F.u, F.f).normalize();
  F.p.set(c.x, c.y + ride, c.z); F.ride = ride;
  if (!ud.st) { ud.st = R_LEGS.map(newLegState); ud.nb = legNeighbours(R_LEGS); }
  updateLegs(rig.root, P, R_LEGS, ud.st, ud.nb, _rf, dt, { vx: Math.cos(c.facing) * c.speed, vy: 0, vz: Math.sin(c.facing) * c.speed, speed: c.speed, stepDist: 0.24, lift: 0.14, splay: 0, poleU: 0.2, poleF: -1, curl: c.dead ? 0.15 : 0 });
  // the body frame rides the legs; it shudders when it rings
  const fr = P.rframe;
  const loc = new THREE.Vector3().copy(F.p); toRoot(rig.root, loc);
  fr.position.copy(loc);
  fr.rotation.set(Math.sin(t * 40) * 0.05 * rg + (c.dead ? 0 : 0.08 * clamp01(c.speed)), 0, Math.sin(t * 37) * 0.06 * rg + (c.dead ? 1.3 : 0));
  // the dial turns when it rings (all its eyes spin round)
  P.dial.rotation.z = (ud.dz = (ud.dz ?? 0) + dt * (rg * 9 + 0.15));
  // the neck coils and stretches; the head cocks toward you, or tips back to ring
  const tg = lookTarget(c);
  const yaw = tg && !c.dead ? Math.max(-1.2, Math.min(1.2, -localYaw(c, tg.x, tg.z))) : Math.sin(t * 0.5 + hashId(c.id) * 6) * 0.5;
  ud.yaw = (ud.yaw ?? 0) + (yaw - (ud.yaw ?? 0)) * damp(3, dt);
  const curious = tg ? 1 : 0;
  P.neck.scale.set(1, 1 + rg * 0.35 + curious * 0.15 + Math.sin(t * 2.2) * 0.04, 1);
  P.neck.rotation.set(0.25 - rg * 0.5 + Math.sin(t * 1.4) * 0.05, ud.yaw * 0.5, Math.sin(t * 0.8) * 0.08);
  P.rhead.rotation.set(-0.2 + curious * 0.2 + rg * Math.sin(t * 30) * 0.15, ud.yaw * 0.5, Math.sin(t * 1.9 + 1) * 0.25 * curious + rg * Math.sin(t * 33) * 0.2);
  if (c.dead || !live()) return;
  const p = localIn(c);
  if (p && c.visibleToLocal && dist(p, c) < 7) thinkOnce(p, 'su_ringer', ['It is following me. Its head is a telephone receiver. It keeps cocking it at me like it is listening.', 'It rings. It is ringing. Somebody wants me to answer.', 'If it rings out here the whole tunnel will hear it.'][Math.floor(t * 0.2) % 3], 80);
}
function thinkRinger(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey) as Zone, m = c.mem, n = net(c), now = G.time, cs = CS();
  const ev = pulse(c);
  m.mdT = (m.mdT ?? 0) + dt;
  if (!m.init) { m.init = 1; m.nextRing = now + rng.float(10, 20); }
  const ring = (loud: boolean) => { fx(c, 'ring', { loud: loud ? 1 : 0 }); z.meta.su_call = { x: c.x, z: c.z, t: now }; };
  // answered: it goes quiet and keeps you company for a while
  const ans = poked(c, 'answer');
  if (ans && now > (m.ansCool ?? 0)) { m.ansCool = now + 3; m.quietT = now + 70; m.friend = ans; fx(c, 'answer', { k: Math.floor(rng.next() * 6) }); m.nextRing = now + 70; }
  // hurt: it shrieks (rings and rings) and runs
  if (ev.hurt > 0) { fx(c, 'shriek'); z.meta.su_call = { x: c.x, z: c.z, t: now }; m.fleeT = now + 6; m.from = c.targetId ? G.players.get(c.targetId) : null; m.fleeTo = null; m.quietT = 0; }
  if ((m.fleeT ?? 0) > now) {
    c.setState('flee');
    if (!m.fleeTo) m.fleeTo = cs.fleeSpot(c, z, m.from?.x ?? c.x - Math.cos(c.facing), m.from?.z ?? c.z - Math.sin(c.facing));
    if (cs.moveTo(c, z, m.fleeTo.x, m.fleeTo.z, c.sp.run, dt, 0.6)) m.fleeTo = null;
    if (now > (m.shriekT ?? 0)) { m.shriekT = now + 2.2; ring(true); }
    return true;
  }
  const friend = m.friend && (m.quietT ?? 0) > now ? G.players.get(m.friend) : null;
  const near = friend && friend.zoneKey === c.zoneKey ? { p: friend, d: dist(friend, c) } : nearestP(c, 11);
  if (near) {
    c.targetId = near.p.id; c.setState('follow');
    // it keeps a polite, curious distance, head cocked
    if (near.d > 2.8) cs.moveTo(c, z, near.p.x, near.p.z, near.d > 6 ? c.sp.run * 0.7 : c.sp.walk, dt, 2.4);
    else if (near.d < 1.6) { const a = angTo(near.p, c.x, c.z); cs.moveTo(c, z, c.x + Math.cos(a), c.z + Math.sin(a), c.sp.walk, dt, 0.2); }
    else { c.speed = 0; c.targetFacing = angTo(c, near.p.x, near.p.z); }
    // and rings at you, more often the longer you ignore it
    if ((m.quietT ?? 0) < now && now > m.nextRing) {
      m.ignored = (m.ignored ?? 0) + 1;
      ring(m.ignored > 2);
      m.nextRing = now + Math.max(5, 16 - m.ignored * 2.5) + rng.float(0, 4);
      if (near.d < 6) ruleShown(c);
    }
    return true;
  }
  m.ignored = 0;
  c.targetId = null; c.setState('wander');
  if (!m.goal || m.mdT > (m.wT ?? 6)) { m.goal = cs.wanderSpot(c, z, 10); m.wT = rng.float(4, 9); m.mdT = 0; }
  if (cs.moveTo(c, z, m.goal.x, m.goal.z, c.sp.walk, dt, 0.5)) { m.goal = null; c.speed = 0; }
  if ((m.quietT ?? 0) < now && now > m.nextRing) { ring(false); m.nextRing = now + rng.float(25, 50); }
  void n;
  return true;
}
const RINGER = def({
  key: 'ringer', name: 'Ringer', code: 'RG-06 // FAUNA, WADER (VOCAL MIMIC)', temperament: 'curious', threat: 1,
  rule: { name: 'ANSWER IT', text: 'Harmless, and it wants to be answered. It follows a unit and rings, louder the longer it is ignored, and the ringing carries down the tunnels to the Worm Train. Answer it (step up and pick up) and it goes quiet and keeps you company. Hurt it and it shrieks and rings and runs, and everything that hunts by sound comes.', tell: 'A thing on stilts with a telephone receiver for a head. It is ringing.' },
  hp: 26, walk: 1.1, run: 4.3, turn: 6, radius: 0.28, height: 1.45, sight: 11, fov: 2.4, hearing: 1.4,
  zones: ['subway', 'depot'], weight: 1, group: [1, 1], maxPerZone: 3, diet: 'none',
  meat: [['ringer_cord', 1]],
  sounds: { idle: 'phone_ring', alert: 'phone_ring', hurt: 'hollow_shriek', death: 'cower_die', step: 'pad' },
  scan: { cls: 'Fauna / wader, vocal mimic', notes: ['A stilt-legged thing with a coiled neck and a handset for a head.', 'Curious. Harmless. It wants to be answered.', 'Its ringing carries down the tunnels. Something there listens for it.'] },
  gore: { blood: 'dark', tint: 0x8a7a70, flesh: 0x6a5a50, gib: false },
  disposition: { mood: 'docile', self: true },
  build: buildRinger, animate: animateRinger, think: thinkRinger,
});
creatureMenu('ringer', (p, c, opts) => {
  opts.push({
    label: 'Answer it', action: () => queueAt(p, c.x, c.z, new UseObjectAction(p, 'Answer', 1.6, 'pickup', () => {
      if (c.dead) return;
      poke(p, c, 'answer');
      bus.emit('think', p, 'I picked up its head like a receiver. It is warm. There is somebody on the line.');
    }), 1.6, false),
  });
});

// =====================================================================================
// the set pieces: the whelk in its booth, the mantis in the turnstile line
// =====================================================================================
function ensureNatives(zk: string) {
  if (G.role === 'client' || !G.creatures) return;
  const z = G.zones.get(zk) as Zone | undefined;
  const sw = subwayOf(z);
  if (!z || !sw) return;
  const here = [...CS().creatures.values()].filter((o) => o.zoneKey === zk);
  if (!here.some((o) => o.sp.key === 'token_whelk') && !z.meta.su_whelkGone) {
    const c = CS().spawn('token_whelk', zk, sw.booth.x, sw.booth.z);
    if (c) { c.facing = c.targetFacing = Math.PI / 2; c.mem.persistent = true; c.mem.noCap = 1; }
  }
  if (!here.some((o) => o.sp.key === 'stile_mantis') && !z.meta.su_mantisGone) {
    const c = CS().spawn('stile_mantis', zk, sw.mantis[0], sw.mantis[1]);
    if (c) { c.facing = c.targetFacing = Math.PI / 2; c.mem.persistent = true; c.mem.noCap = 1; c.setState('disguised'); }
  }
}
bus.on('creatureKilled', (c: Creature) => {
  if (!c?.sp || G.role === 'client') return;
  const z = G.getZone(c.zoneKey);
  if (c.sp.key === 'token_whelk') z.meta.su_whelkGone = 1;
  if (c.sp.key === 'stile_mantis') z.meta.su_mantisGone = 1;
});
let sys = false;
bus.on('enterZone', (z: Zone) => {
  try { if (z?.key) ensureNatives(z.key); } catch (e) { console.error('subway natives', e); }
  const g: any = G;
  if (sys || !g?.addSystem) return;
  sys = true;
  let acc = 0;
  g.addSystem({ name: 'subwayNatives', update: (dt: number) => { acc += dt; if (acc < 4) return; acc = 0; const zs = new Set<string>(); for (const p of G.players.values()) zs.add(p.zoneKey); for (const zk of zs) ensureNatives(zk); } });
});

// =====================================================================================
// gallery
// =====================================================================================
WHELK.animateGallery = (rig: Rig, t: number) => {
  const q = galleryPoseParam() || ['idle', 'slide', 'shut'][Math.floor(t / 4) % 3];
  const fc = (rig.root.userData.fake ||= fakeCreature(WHELK, { id: 'g-whelk', facing: Math.PI / 2, mem: { netMem: {} } })) as Creature;
  fc.mem.netMem.shut = q === 'shut' ? 1 : 0;
  if (q === 'slide' && (rig.root.userData.sl === undefined || t - rig.root.userData.sl > 2.5)) rig.root.userData.sl = t;
  animateWhelk(rig, fc, t, 1 / 60);
};
MANTIS.animateGallery = (rig: Rig, t: number) => {
  const q = galleryPoseParam() || ['disguised', 'out', 'strike', 'walk'][Math.floor(t / 4) % 4];
  const home = (rig.root.userData.home ||= rig.root.position.clone()) as THREE.Vector3;
  const fc = (rig.root.userData.fake ||= fakeCreature(MANTIS, { id: 'g-mantis', facing: Math.PI / 2, mem: { netMem: {} } })) as Creature;
  rig.root.userData.gal = 1;
  fc.state = q === 'disguised' ? 'disguised' : 'chase';
  fc.attackPhase = q === 'strike' && (t % 1.2) < 0.35 ? 0.3 : 0;
  fc.speed = q === 'walk' ? 1.2 : 0;
  fc.x = home.x + (q === 'walk' ? Math.sin(t * 0.6) * 1.5 : 0); fc.z = home.z;
  fc.facing = q === 'walk' ? (Math.cos(t * 0.6) > 0 ? 0 : Math.PI) : Math.PI / 2;
  rig.root.position.set(fc.x, 0, fc.z); rig.root.rotation.y = Math.PI / 2 - fc.facing;
  animateMantis(rig, fc, t, 1 / 60);
};
RINGER.animateGallery = (rig: Rig, t: number) => {
  const q = galleryPoseParam() || ['walk', 'ring', 'idle'][Math.floor(t / 4) % 3];
  const home = (rig.root.userData.home ||= rig.root.position.clone()) as THREE.Vector3;
  const fc = (rig.root.userData.fake ||= fakeCreature(RINGER, { id: 'g-ringer', facing: 0, mem: { netMem: {} } })) as Creature;
  const ud = rig.root.userData as Record<string, any>;
  fc.speed = q === 'walk' ? 1.1 : 0;
  ud.ga = (ud.ga ?? 0) + (fc.speed / 1.5) / 60;
  fc.x = home.x + Math.cos(ud.ga) * 1.5; fc.z = home.z + Math.sin(ud.ga) * 1.5; fc.facing = ud.ga + Math.PI / 2;
  fc.phase += fc.speed / 60 * 3;
  if (q === 'ring' && (ud.ringT === undefined || t - ud.ringT > 2.6)) ud.ringT = t;
  rig.root.position.set(fc.x, 0, fc.z); rig.root.rotation.y = Math.PI / 2 - fc.facing;
  animateRinger(rig, fc, t, 1 / 60);
};
void OB; void placeOnFrame;
