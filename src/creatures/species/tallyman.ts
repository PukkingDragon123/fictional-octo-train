// TALLYMAN: two and a half metres of charcoal pinstripe, a head like a ledger
// stood on end with one slit of an eye, and where the ribs should be an
// abacus: thirteen beads on three wires. It stands very still and counts.
// Every step you take where it can see you, a finger flicks and a bead
// slides across. At thirteen it comes for you, fast. Soft steps (sneaking)
// are not counted, and if you stand still the beads slide back one by one.
import { def, newRig, Rig } from '../species';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import * as THREE from 'three';
import { Page, OB, bpart, registerPage, applyLook, galleryDriver, lerp, damp, ramp, cachedGeo, meshOf } from '../kit/beasts';
import { rot, obox, skin, eye, flat, buildHumanoid, humWalk } from '../kit/oddkit';
import { net, netOf, snd, playersIn, dist, hold, face, hashId, rng, fx, fxPoll, playAt, live } from '../behaviors_b';
import { pulse, attack } from '../behaviors_a';
import { ruleShown } from '../rules';
import { defDread } from '../dread';
import { lineOfSight } from '../../world/collision';
import '../../audio/sounds_creatures_d';

const PG = registerPage(new Page('c_tallypg', 96, 96, [
  ['SUIT', 48, 40], ['LIMB', 16, 48], ['HEAD', 24, 32], ['BEAD', 8, 8], ['BEAD2', 8, 8], ['WIRE', 8, 8], ['EYE', 8, 8], ['SKIN', 12, 12], ['CUT', 12, 12],
], 1));
PG.paint((P) => {
  const suit = ramp(0x2c2a30, 6, 0x0c0a10, 0.25);
  const pin = (r: ReturnType<typeof P.R>) => { skin(P, r, suit, { mott: 0.8, lo: 1, hi: 3 }); for (let x = 0; x < r.w; x += 4) for (let y = 0; y < r.h; y++) if ((y + x) % 3) P.blend(r, x, y, 0xc8c0b0, 0.4); };
  pin(P.R('SUIT')); pin(P.R('LIMB'));
  {
    // the head: ruled ledger paper, columns of tallies in brown ink
    const r = P.R('HEAD');
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) P.set(r, x, y, y % 4 === 0 ? 0xa8b8c8 : x === 5 ? 0xc87070 : 0xe8e0c8);
    for (let k = 0; k < 18; k++) { const x = P.rng.int(7, r.w - 3), y = P.rng.int(1, r.h - 2); for (let i = 0; i < 4; i++) P.set(r, x + i, y, 0x5a3a20); P.set(r, x - 1, y + 1, 0x5a3a20); }
  }
  flat(P, P.R('BEAD'), 0xb82018, 0.1); flat(P, P.R('BEAD2'), 0xe8dcc0, 0.1); flat(P, P.R('WIRE'), 0xc8a048, 0.15);
  eye(P, P.R('EYE'), 0x101010, { slit: true, sclera: 0xf0f0e0 });
  skin(P, P.R('SKIN'), ramp(0xe0d8cc, 5, 0x8a8070, 0.3), { mott: 1 });
  P.cut(P.R('CUT'), 0x2c2a30, { meat: 0x4a1020 });
});

const ROWS = [5, 4, 4];
const ROW_Y = [0.62, 0.5, 0.38];
const WIRE_X = 0.13;
/** one wire's beads: `n` of them slid to the counted (right) side */
function rowGeo(r: number, n: number) {
  return cachedGeo(`c_tallypg:row${r}_${n}`, PG, (ob: OB) => {
    const cnt = ROWS[r];
    for (let i = 0; i < cnt; i++) {
      const counted = i >= cnt - n;
      const x = counted ? WIRE_X - (cnt - 1 - i) * 0.034 : -WIRE_X + i * 0.034;
      ob.blob([x, 0, 0], [0.016, 0.02, 0.02], 6, 4, PG.reg((i + r) % 2 ? 'BEAD2' : 'BEAD'), { emis: counted ? 0.35 : 0 });
    }
  });
}
function buildTally(): Rig {
  const rig = newRig(2.6);
  buildHumanoid(rig, {
    page: PG, key: 't', hipY: 1.3, hipW: 0.2, shoulderW: 0.38, torsoLen: 0.82, torsoR: [0.15, 0.08], waistR: [0.09, 0.07],
    neckLen: 0.24, neckR: 0.035, upper: 0.5, fore: 0.48, armR: 0.035, thigh: 0.66, shin: 0.62, legR: 0.05,
    body: PG.reg('SUIT'), limb: PG.reg('LIMB'), hand: PG.reg('SKIN'), fingers: 3, fingerLen: 0.16,
    head: (ob) => {
      // a ledger stood on end, one slit of an eye, a pencil through it
      obox(ob, [0, 0.2, 0], [0.13, 0.4, 0.11], PG.reg('HEAD'));
      obox(ob, [0, 0.27, 0.058], [0.02, 0.1, 0.01], PG.reg('EYE'), { emis: 0.4 });
      ob.tube([[-0.12, 0.33, -0.02], [0.12, 0.36, 0.0]], [0.008, 0.006], 5, PG.reg('WIRE'), { start: 'pole', end: 'pole' });
    },
    torso: (ob) => {
      // the abacus frame across the open chest
      const W = PG.reg('WIRE');
      obox(ob, [-0.155, 0.5, 0.08], [0.015, 0.36, 0.015], W); obox(ob, [0.155, 0.5, 0.08], [0.015, 0.36, 0.015], W);
      obox(ob, [0, 0.69, 0.08], [0.32, 0.015, 0.015], W); obox(ob, [0, 0.31, 0.08], [0.32, 0.015, 0.015], W);
      for (const y of ROW_Y) ob.tube([[-0.15, y, 0.08], [0.15, y, 0.08]], [0.004, 0.004], 4, W);
    },
  });
  const torso = rig.parts.torso;
  for (let r = 0; r < 3; r++) {
    const g = new THREE.Group(); g.name = 'beads' + r; g.position.set(0, ROW_Y[r], 0.08);
    const mesh = new THREE.Mesh(rowGeo(r, 0), meshOf(rig.parts.torso)!.material as THREE.Material);
    mesh.castShadow = true; g.add(mesh); torso.add(g); rig.parts['beads' + r] = g;
  }
  return rig;
}

function setCount(rig: Rig, k: number) {
  let left = k;
  for (let r = 0; r < 3; r++) {
    const n = Math.max(0, Math.min(ROWS[r], left)); left -= n;
    const m = meshOf(rig.parts['beads' + r]);
    if (m) m.geometry = rowGeo(r, n);
  }
}
const WORDS = ['', 'One.', 'Two.', 'Three.', 'Four.', 'Five.', 'Six.', 'Seven.', 'Eight.', 'Nine.', 'Ten.', 'Eleven.', 'Twelve.', 'THIRTEEN.'];
function animateTally(rig: Rig, c: Creature, t: number, dt: number) {
  applyLook(rig, c, PG, 0.04);
  const ud = rig.root.userData as Record<string, any>;
  const n = netOf(c);
  const seed = hashId(c.id);
  const k = Math.max(0, Math.min(13, n.k | 0));
  if (ud.k !== k) { setCount(rig, k); ud.k = k; }
  const ev = fxPoll(rig, c);
  if (ev?.key === 'click') {
    playAt('tally_click', c, 0.8 + k * 0.03, 22, 0.8 + k * 0.05);
    ud.flick = 1;
    if (k >= 7 && c.visibleToLocal) bus.emit('subtitle', { who: 'Tallyman', text: WORDS[k], dur: 1.6, style: 'creature', x: c.x, y: c.y + 2.7, z: c.z });
  } else if (ev?.key === 'thirteen') { playAt('tally_thirteen', c, 1, 30); if (c.visibleToLocal) bus.emit('subtitle', { who: 'Tallyman', text: WORDS[13], dur: 2.2, style: 'creature', x: c.x, y: c.y + 2.7, z: c.z }); }
  ud.flick = Math.max(0, (ud.flick ?? 0) - dt * 5);
  const hunt = c.state === 'chase' || c.state === 'attack';
  humWalk(rig, c, t, { stride: hunt ? 0.75 : 0.35, arms: hunt ? 0.2 : 0.15, bob: hunt ? 0.06 : 0.02, seed });
  // stillness: the head tracks you, tilting further the higher the count
  const p = live() ? G.local : null;
  let yaw = 0;
  if (p && p.zoneKey === c.zoneKey) { const a = Math.atan2(p.z - c.z, p.x - c.x); yaw = Math.max(-1.2, Math.min(1.2, -((a - c.facing + Math.PI * 3) % (Math.PI * 2) - Math.PI))); }
  ud.hy = lerp(ud.hy ?? 0, yaw, damp(3, dt));
  rot(rig, 'neck', hunt ? 0.35 : 0.05, ud.hy * 0.4, 0);
  rot(rig, 'head', hunt ? 0.2 : 0, ud.hy * 0.5, (k / 13) * 0.5 * (seed < 0.5 ? 1 : -1));
  rot(rig, 'torso', hunt ? 0.35 : 0.02, 0, 0);
  // the counting finger: the right hand raised at the beads, flicking
  if (!hunt) {
    rot(rig, 'armR', -0.5, 0, -0.15); rot(rig, 'foreR', -1.6 + ud.flick * 0.3, 0, 0); rot(rig, 'handR', ud.flick * 0.5, 0, 0);
    rot(rig, 'armL', 0.05, 0, 0.06); rot(rig, 'foreL', -0.1, 0, 0);
  } else {
    // arms forward, reaching, fingers spread
    for (const s of ['L', 'R']) { rot(rig, 'arm' + s, -1.2 + Math.sin(t * 9 + (s === 'L' ? 0 : 3)) * 0.2, 0, 0); rot(rig, 'fore' + s, -0.3 - (c.attackPhase > 0 ? 0.6 : 0), 0, 0); }
  }
  if (c.dead) setCount(rig, 0);
}

function thinkTally(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey), cs = G.creatures, m = c.mem, n = net(c);
  pulse(c);
  m.k = m.k ?? 0;
  // who it can see
  let near: Player | null = null, nd = 22;
  const sees = new Set<string>();
  for (const p of playersIn(c.zoneKey)) {
    const d = dist(p, c);
    if (d > 18 || !lineOfSight(z, c.x, c.z, p.x, p.z)) continue;
    sees.add(p.id);
    if (d < nd) { nd = d; near = p; }
  }
  // count their steps (soft ones don't count; running counts double)
  const last = m.lastN ?? 0;
  let newest = last;
  if (m.ph !== 'hunt') for (const nz of cs.noises) {
    if (nz.t <= last || nz.zone !== c.zoneKey || !nz.by || !sees.has(nz.by)) continue;
    if (nz.kind !== 'step' && nz.kind !== 'run') continue;
    newest = Math.max(newest, nz.t);
    const p = G.players.get(nz.by);
    if (!p || p.stance === 'sneak' || p.stance === 'crawl') continue;
    m.k = Math.min(13, m.k + (nz.kind === 'run' ? 2 : 1));
    m.kT = G.time; m.who = nz.by;
    n.k = m.k; fx(c, 'click');
    if (m.k >= 13) { m.ph = 'hunt'; m.hT = 0; c.targetId = nz.by; fx(c, 'thirteen'); cs.call(c, 'alert'); break; }
  }
  m.lastN = newest;
  if (m.ph === 'hunt') {
    const p = c.targetId ? G.players.get(c.targetId) : null;
    m.hT += dt;
    if (!p || p.body.dead || p.zoneKey !== c.zoneKey || m.hT > 10 || m.hit) {
      m.ph = ''; m.k = 0; n.k = 0; m.hit = false; c.setState('idle'); return true;
    }
    c.setState('chase');
    const reach = (c.sp.attack?.range ?? 1) + p.radius;
    const d = dist(p, c);
    if (d <= reach && c.attackT <= 0) { attack(c, p); m.hit = true; return true; }
    cs.moveTo(c, z, p.x, p.z, c.sp.run, dt, reach * 0.8);
    return true;
  }
  // nobody walking: the beads slide back
  if (m.k > 0 && G.time - (m.kT ?? 0) > 2.5) {
    m.dT = (m.dT ?? 0) + dt;
    if (m.dT > 1.6) {
      m.dT = 0; m.k--; n.k = m.k;
      if (m.k === 4 && (m.peak ?? 0) >= 9 && near && nd < 14 && !m.shown) { m.shown = 1; ruleShown(c); }
    }
  } else m.dT = 0;
  m.peak = m.k > 0 ? Math.max(m.peak ?? 0, m.k) : 0;
  if (near) { hold(c); face(c, near.x, near.z); c.setState('watch'); return true; }
  // alone: it walks its rounds slowly
  if (c.state !== 'wander') { c.setState('wander'); c.goal = cs.wanderSpot(c, z, 10); }
  if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.walk, dt, 0.6) || c.stateT > 18) { c.goal = cs.wanderSpot(c, z, 10); c.stateT = 0; if (rng.chance(0.5)) { hold(c); c.setState('idle'); } }
  return true;
}

const S = def({
  key: 'tallyman', name: 'Tallyman', code: 'RB-13 // ENUMERATOR', temperament: 'stalker', threat: 4,
  hp: 70, walk: 0.8, run: 6.2, turn: 6, radius: 0.32, height: 2.6, sight: 18, fov: 2.2, hearing: 1,
  rule: { name: 'COUNTS YOUR STEPS', text: 'Every step you take where it can see you is a bead on its rack. At thirteen it comes. Sneak (soft steps are not counted) or stand still and the beads slide back.', tell: 'Click. Click. It moves a bead every time I take a step.' },
  attack: { dmg: [16, 26], range: 1.3, cooldown: 1.2, kinds: ['laceration', 'deep'], corrupt: 0.04, knock: 1.1, parts: ['neck', 'torso_u', 'uarm_l', 'uarm_r', 'head'] },
  zones: ['office', 'school', 'hospital', 'mall', 'lobby'], weight: 1, maxPerZone: 1, diet: 'none',
  sounds: snd({ alert: 'tally_thirteen', attack: 'tally_click', hurt: 'tally_step', death: 'tally_thirteen', step: 'tally_step' }),
  scan: { cls: 'Enumerator / rule-bound', notes: ['Charcoal pinstripe on a frame two and a half metres tall. The head is a ledger.', 'Where the ribs should be: an abacus. Thirteen beads on three wires.', 'Every step you take in its sight, a bead slides across. Running counts twice.', 'At thirteen it comes. Sneak, or stand still and let the beads slide back.'] },
  gore: { blood: 'dark', tint: 0x6a4a5a, flesh: 0x3a2a30, sever: ['armL', 'armR', 'foreL', 'foreR', 'thighL', 'thighR', 'shinL', 'shinR'], head: 'head' },
  build: buildTally, animate: animateTally, think: thinkTally,
});
S.animateGallery = galleryDriver('tallyman', ['count', 'walk', 'hunt', 'dead'], animateTally, (pose, fc, t) => {
  fc.state = pose === 'hunt' ? 'chase' : pose === 'walk' ? 'wander' : 'watch';
  fc.speed = pose === 'hunt' ? 6 : pose === 'walk' ? 0.8 : 0;
  fc.phase = (fc.phase ?? 0) + fc.speed / 60 * 3.5;
  fc.mem.netMem = { k: pose === 'count' ? Math.floor(t * 2) % 14 : pose === 'hunt' ? 13 : 3 };
  fc.dead = pose === 'dead';
});
defDread('tallyman', { tilt: 'head', tiltMax: 0.6, twitch: ['handR', 'head'], twitchRate: 0.3, sting: 'chase', cam: 0.8, skipDark: 0.3 });
void bpart;
