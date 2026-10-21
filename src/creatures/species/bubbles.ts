// The future grass field's bubble things.
//
// BUBBLE MITE: a soap bubble the size of a beach ball with a pale mite curled
// up inside it, hanging glowing threads. Whole drifts of them float at head
// height. They go for whatever moves fastest; stand still or creep and they
// drift past. Any hit pops one into sticky goo that slows whoever stands in
// it, and a pop draws the rest of the drift to the noise.
//
// BUBBLE RABBIT: a rabbit made of bubbles, a pearly core in a film shell, ears
// of three stacked bubbles. Harmless and skittish; it bolts from you. Corner
// it and it puffs up and pops in your face. Sneak up from behind and it is
// easy meat (bubble jelly).
import { def, newRig, Rig } from '../species';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { Page, OB, V3, bpart, registerPage, applyLook, galleryDriver, clamp01, lerp, damp, ramp } from '../kit/beasts';
import { filmMat, tpart, rot, scl, vis, skin, film, eye, flat, hitPlayer, playersNear } from '../kit/oddkit';
import { net, netOf, snd, playersIn, dist, hold, hashId, rng, fx, fxPoll, playAt } from '../behaviors_b';
import { pulse, attack, onKilled } from '../behaviors_a';
import { scaredThink } from '../kit/scared';
import { ruleShown } from '../rules';
import { defDread, dreadOnFrame } from '../dread';
import { defOp, op } from '../../game/ops';
import { lineOfSight } from '../../world/collision';
import '../../audio/sounds_creatures_d';

const PG = registerPage(new Page('c_bubpg', 96, 96, [
  ['FILM', 48, 40], ['MITE', 20, 14], ['TEND', 6, 24], ['PEARL', 32, 24], ['EYE', 8, 8], ['NOSE', 6, 6], ['CUT', 10, 10],
], 3));
const PALS = [[0xff9ad8, 0xb8a0ff, 0x80e0ff, 0xa8ffc8, 0xfff0a0], [0x90f0ff, 0xc0a0ff, 0xff98c0, 0xffe090, 0xa0ffd0], [0xd0a8ff, 0x88d8ff, 0xb0ffb0, 0xffc8a0, 0xff9ae0]];
const CORE = [0xff9ad4, 0x7ae8c0, 0xb09aff];
PG.paint((P, v) => {
  film(P, P.R('FILM'), PALS[v], { salt: v + 1, bands: 3 + v });
  skin(P, P.R('MITE'), ramp(0xe8dcc8, 6, 0x6a5a68, 0.4), { mott: 1.6, stripes: 3 });
  { const r = P.R('TEND'); for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) P.set(r, x, y, y % 4 === 0 ? 0xffffff : PALS[v][(y >> 2) % 5]); }
  { const r = P.R('PEARL'); film(P, r, [CORE[v], PALS[v][1], CORE[v], PALS[v][2], CORE[v]], { salt: 7 + v, bands: 2, glint: true }); }
  eye(P, P.R('EYE'), 0x201830, { pupil: 0x050308, sclera: 0x302040 });
  flat(P, P.R('NOSE'), 0xff7ab8);
  P.cut(P.R('CUT'), CORE[v], { meat: 0xff8ad0, bone: 0xffffff, marrow: 0xffc0e8 });
});

// =====================================================================================
// BUBBLE MITE
// =====================================================================================
const FLOAT_Y = 1.15;
function buildMite(): Rig {
  const rig = newRig(FLOAT_Y + 0.3);
  const fl = bpart(rig, 'float', rig.body, [0, FLOAT_Y, 0], PG, null, null);
  tpart(rig, 'bubble', fl, [0, 0, 0], PG, 'mbubble', filmMat(0.42), (ob) => ob.blob([0, 0, 0], [0.3, 0.3, 0.3], 14, 9, PG.reg('FILM'), { emis: 0.35 }));
  const mite = bpart(rig, 'mite', fl, [0, -0.02, 0], PG, 'mite', (ob) => {
    const M = PG.reg('MITE');
    ob.blob([0, 0, -0.02], [0.07, 0.05, 0.09], 8, 6, M, { emis: 0.15 });
    ob.blob([0, 0.01, 0.08], [0.045, 0.04, 0.04], 7, 5, M, { emis: 0.15 });
    ob.blob([0, 0.025, 0.11], [0.018, 0.018, 0.012], 6, 4, PG.reg('EYE'), { emis: 0.6 });
    for (const s of [-1, 1]) {
      ob.cone([s * 0.02, -0.005, 0.11], [s * 0.4, -0.3, 1], 0.009, 0.05, 4, M);
      for (let i = 0; i < 3; i++) ob.cone([s * 0.05, -0.01, 0.03 - i * 0.05], [s, -0.6, 0.2 - i * 0.3], 0.008, 0.09, 4, M);
    }
  });
  void mite;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    bpart(rig, 'tendril' + i, fl, [Math.cos(a) * 0.12, -0.26, Math.sin(a) * 0.12], PG, 'tend', (ob) => {
      const path: V3[] = [];
      for (let k = 0; k <= 6; k++) path.push([Math.sin(k * 1.3) * 0.03, -k * 0.07, Math.cos(k * 1.1) * 0.02]);
      ob.tube(path, path.map((_, k) => 0.012 * (1 - k / 8)), 5, PG.reg('TEND'), { start: 'pole', end: 'pole', emis: 0.7 });
    });
  }
  rig.eyes = [];
  return rig;
}

function animateMite(rig: Rig, c: Creature, t: number, dt: number) {
  applyLook(rig, c, PG, 0.12);
  const ud = rig.root.userData as Record<string, any>;
  const seed = hashId(c.id);
  const fl = rig.parts.float;
  const n = netOf(c);
  const ev = fxPoll(rig, c);
  if (ev?.key === 'nudge') playAt('bubble_wob', c, 0.6, 12);
  if (c.dead) {
    // popped: the film is gone, the mite drops and curls
    vis(rig, 'bubble', false);
    ud.dy = Math.max(-FLOAT_Y + 0.08, (ud.dy ?? 0) - dt * 3);
    fl.position.y = FLOAT_Y + ud.dy;
    rot(rig, 'mite', Math.PI, 0, 0.4);
    for (let i = 0; i < 3; i++) vis(rig, 'tendril' + i, false);
    return;
  }
  vis(rig, 'bubble', true);
  ud.dy = 0;
  const bob = Math.sin(t * 1.3 + seed * 9) * 0.12 + Math.sin(t * 0.47 + seed * 3) * 0.06;
  ud.lean = lerp(ud.lean ?? 0, Math.min(0.5, c.speed * 0.2), damp(3, dt));
  fl.position.y = FLOAT_Y + bob;
  fl.rotation.set(ud.lean, 0, Math.sin(t * 0.9 + seed) * 0.1);
  // the film wobbles; it stretches toward what it strikes
  const atk = c.attackPhase > 0 ? 1 : 0;
  const w = Math.sin(t * 6 + seed * 5) * 0.045;
  scl(rig, 'bubble', 1 + w - atk * 0.12, 1 - w - atk * 0.1, 1 + atk * 0.35);
  const mite = rig.parts.mite;
  mite.rotation.set(Math.sin(t * 0.7) * 0.3, t * (n.hunt ? 2.2 : 0.6) + seed * 6, Math.sin(t * 1.1) * 0.3);
  mite.position.z = atk * 0.1;
  for (let i = 0; i < 3; i++) rot(rig, 'tendril' + i, Math.sin(t * 2 + i * 2 + seed * 4) * 0.35 - ud.lean * 0.8, 0, Math.cos(t * 1.7 + i) * 0.3);
  if (c.hitFlash > 0) scl(rig, 'bubble', 1.15, 0.85, 1.15);
}

function thinkMite(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey), cs = G.creatures, m = c.mem, n = net(c);
  pulse(c);
  // the fastest mover it can see
  let best: Player | null = null, bs = 0;
  for (const p of playersIn(c.zoneKey)) {
    const d = dist(p, c);
    if (d > 13) continue;
    const s = p.speed * (p.stance === 'sneak' ? 0.5 : 1);
    if (s > bs && lineOfSight(z, c.x, c.z, p.x, p.z)) { bs = s; best = p; }
  }
  const lure = m.lure as { x: number; z: number; t: number } | undefined;
  let gx: number | null = null, gz = 0, sp = 0.45;
  if (best && bs > 1.3) {
    gx = best.x; gz = best.z; sp = Math.min(2.7, 1.1 + bs * 0.35);
    m.lostT = 0;
    if (!n.hunt) { n.hunt = 1; fx(c, 'nudge'); }
    c.targetId = best.id;
    const d = dist(best, c);
    if (d < 0.8 && c.attackT <= 0) { attack(c, best); return true; }
  } else if (lure && G.time - lure.t < 6) {
    gx = lure.x; gz = lure.z; sp = 2.2;
  } else {
    // they stood still: it loses them and drifts on
    if (n.hunt && best) { m.lostT = (m.lostT ?? 0) + dt; if (m.lostT > 1.2) { n.hunt = 0; if (dist(best, c) < 5) ruleShown(c); } }
    else n.hunt = 0;
    m.wT = (m.wT ?? 0) - dt;
    if (m.wT <= 0 || !m.w) { m.wT = rng.float(3, 7); m.w = cs.wanderSpot(c, z, 7); }
    gx = m.w.x; gz = m.w.z; sp = 0.45;
  }
  // drift with inertia (no pathfinding; it floats over low things)
  const dx = gx - c.x, dz = gz - c.z, d = Math.hypot(dx, dz) || 1;
  const k = damp(1.6, dt);
  const tv = d < 0.3 ? 0 : sp;
  c.vx += ((dx / d) * tv - c.vx) * k; c.vz += ((dz / d) * tv - c.vz) * k;
  c.speed = Math.max(0.02, Math.hypot(c.vx, c.vz));
  c.targetFacing = Math.atan2(c.vz, c.vx);
  c.setState(n.hunt ? 'chase' : 'wander');
  return true;
}

// a pop: goo on the floor that slows, and the rest of the drift comes to the noise
interface Goo { zone: string; x: number; z: number; r: number; until: number }
const GOO: Goo[] = [];
defOp('odd_goo', (a: { z: string; x: number; zz: number; r: number }) => {
  GOO.push({ zone: a.z, x: a.x, z: a.zz, r: a.r, until: G.time + 45 });
  if (GOO.length > 24) GOO.shift();
});
dreadOnFrame((dt) => {
  const p = G.local;
  if (!p || !GOO.length) return;
  for (let i = GOO.length - 1; i >= 0; i--) {
    const g = GOO[i];
    if (G.time > g.until) { GOO.splice(i, 1); continue; }
    if (g.zone !== p.zoneKey || Math.hypot(p.x - g.x, p.z - g.z) > g.r) continue;
    const k = Math.exp(-dt * 18);
    p.vx *= k; p.vz *= k;
    if (!(p as any).__gooSaid || G.time - (p as any).__gooSaid > 30) { (p as any).__gooSaid = G.time; bus.emit('think', p, 'Sticky. It is like wading through syrup.'); }
  }
});
function popGoo(c: Creature, r: number) {
  op('odd_goo', { z: c.zoneKey, x: +c.x.toFixed(2), zz: +c.z.toFixed(2), r });
  op('decal', { z: c.zoneKey, d: { x: c.x, z: c.z, w: r * 2, d: r * 2, rot: rng.float(0, 6), tex: 'decal_glow_paint' } });
}
onKilled('bubble_mite', (c) => {
  popGoo(c, 1.1);
  for (const o of G.creatures.creatures.values() as IterableIterator<Creature>) {
    if (o === c || o.dead || o.zoneKey !== c.zoneKey || o.sp.key !== 'bubble_mite' || Math.hypot(o.x - c.x, o.z - c.z) > 10) continue;
    o.mem.lure = { x: c.x, z: c.z, t: G.time };
  }
});

const MITE = def({
  key: 'bubble_mite', name: 'Bubble Mite', code: 'FG-02 // FLOATING DRIFT', temperament: 'hostile', threat: 2,
  hp: 6, walk: 0.5, run: 2.7, turn: 3, radius: 0.32, height: 1.5, sight: 13, fov: 3.1, hearing: 0.6,
  rule: { name: 'DRIFTS TO MOTION', text: 'It floats toward whatever moves fastest. Stand still or creep and it drifts past. Any hit pops it, and the goo slows whoever stands in it.', tell: 'Bubbles. Drifting toward me every time I move.' },
  attack: { dmg: [3, 6], range: 0.55, cooldown: 1.4, kinds: ['burn', 'scratch'], corrupt: 0, knock: 0.25, parts: ['head', 'neck', 'torso_u', 'farm_l', 'farm_r'] },
  zones: ['meadow'], weight: 3, group: [3, 6], maxPerZone: 14, diet: 'none',
  flags: { flying: true, noCorpse: true, pack: true },
  sounds: snd({ alert: 'bubble_wob', attack: 'bubble_wob', hurt: 'bubble_wob', death: 'bubble_pop', loop: 'bubble_drift' }),
  remains: 'none',
  scan: { cls: 'Floating drift / swarm', notes: ['A soap bubble with a pale mite curled up inside, trailing glowing threads.', 'It goes for the fastest mover it can see. Things that stand still are not there to it.', 'Any blow pops it. The goo sticks to boots.', 'A pop brings the rest of the drift.'] },
  gore: { blood: 'glow', tint: 0xffc8f8, flesh: 0xffd8f0, sever: ['tendril0', 'tendril1', 'tendril2'], head: 'mite', gib: true },
  build: buildMite, animate: animateMite, think: thinkMite,
});
MITE.animateGallery = galleryDriver('bubble_mite', ['drift', 'hunt', 'attack', 'dead'], animateMite, (pose, fc, t) => {
  fc.speed = pose === 'hunt' ? 2 : pose === 'drift' ? 0.4 : 0;
  fc.mem.netMem = { hunt: pose === 'hunt' ? 1 : 0 };
  fc.attackPhase = pose === 'attack' && (t % 1.5) < 0.4 ? 0.2 : 0;
  fc.dead = pose === 'dead';
});
defDread('bubble_mite', { stutter: 0.05 });

// =====================================================================================
// BUBBLE RABBIT
// =====================================================================================
function buildRabbit(): Rig {
  const rig = newRig(0.5);
  const PE = PG.reg('PEARL');
  const body = bpart(rig, 'core', rig.body, [0, 0.2, 0], PG, 'rcore', (ob) => {
    ob.blob([0, 0, 0], [0.16, 0.14, 0.19], 12, 8, PE, { emis: 0.06 });
  });
  tpart(rig, 'shell', body, [0, 0, 0], PG, 'rshell', filmMat(0.38), (ob) => ob.blob([0, 0.01, 0], [0.2, 0.18, 0.23], 12, 8, PG.reg('FILM'), { emis: 0.3 }));
  const head = bpart(rig, 'head', body, [0, 0.13, 0.15], PG, 'rhead', (ob) => {
    ob.blob([0, 0, 0], [0.1, 0.095, 0.1], 10, 7, PE, { emis: 0.06 });
    for (const s of [-1, 1]) ob.blob([s * 0.06, 0.02, 0.07], [0.022, 0.026, 0.016], 6, 4, PG.reg('EYE'), { emis: 0.2 });
    ob.blob([0, -0.02, 0.1], [0.016, 0.012, 0.01], 5, 3, PG.reg('NOSE'), { emis: 0.3 });
  });
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    bpart(rig, 'ear' + s, head, [k * 0.045, 0.07, -0.02], PG, 'rear', (ob) => {
      ob.blob([0, 0.05, 0], [0.04, 0.055, 0.03], 7, 5, PE, { emis: 0.08 });
      ob.blob([0, 0.13, -0.005], [0.034, 0.045, 0.026], 7, 5, PE, { emis: 0.08 });
      ob.blob([0, 0.2, -0.01], [0.026, 0.034, 0.02], 6, 4, PE, { emis: 0.08 });
    });
    bpart(rig, 'legB' + s, body, [k * 0.1, -0.13, -0.08], PG, 'rlegb', (ob) => ob.blob([0, -0.02, 0.03], [0.05, 0.04, 0.09], 7, 5, PE, { emis: 0.12 }));
    bpart(rig, 'legF' + s, body, [k * 0.06, -0.13, 0.12], PG, 'rlegf', (ob) => ob.blob([0, -0.02, 0.01], [0.03, 0.03, 0.04], 6, 4, PE, { emis: 0.12 }));
  }
  bpart(rig, 'tail', body, [0, 0.03, -0.2], PG, 'rtail', (ob) => ob.blob([0, 0, 0], [0.05, 0.05, 0.05], 6, 4, PG.reg('FILM'), { emis: 0.4 }));
  return rig;
}

function animateRabbit(rig: Rig, c: Creature, t: number, dt: number) {
  applyLook(rig, c, PG, 0.1);
  const ud = rig.root.userData as Record<string, any>;
  const n = netOf(c);
  const seed = hashId(c.id);
  const ev = fxPoll(rig, c);
  if (ev?.key === 'inflate') playAt('bubble_inflate', c, 0.9, 16);
  const core = rig.parts.core;
  const moving = c.speed > 0.3;
  const ph = c.phase * 0.5;
  // hops: the whole bubble bounds, squashing on landing
  const hop = moving ? Math.abs(Math.sin(ph)) : 0;
  const land = moving ? Math.max(0, 1 - Math.abs(Math.sin(ph)) * 4) : 0;
  ud.inf = lerp(ud.inf ?? 0, n.inf ? 1 : 0, damp(n.inf ? 1.2 : 8, dt));
  const inf = ud.inf as number;
  const cower = n.pose === 'cower' ? 1 : 0;
  ud.cw = lerp(ud.cw ?? 0, cower, damp(5, dt));
  const shake = inf > 0.05 ? Math.sin(t * 60) * 0.02 * inf : 0;
  core.position.set(shake, 0.2 + hop * (c.state === 'flee' ? 0.22 : 0.12) - ud.cw * 0.05, 0);
  const sq = 1 + land * 0.12;
  const big = 1 + inf * 0.8;
  core.scale.set(sq * big, (1 - land * 0.15 - ud.cw * 0.15) * big, big);
  core.rotation.set(moving ? -Math.cos(ph) * 0.25 : 0, 0, 0);
  // head: nose twitch, looks about; ears flop with the hops and flatten when it cowers
  const twitch = Math.floor(t * 7 + seed * 10) % 5 === 0 ? 0.04 : 0;
  rot(rig, 'head', -0.1 + twitch + (c.state === 'graze' ? 0.6 + Math.sin(t * 9) * 0.05 : 0), Math.sin(t * 0.6 + seed * 4) * 0.4 * (moving ? 0.2 : 1), 0);
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    const flop = moving ? Math.cos(ph) * 0.4 : Math.sin(t * 1.3 + k + seed * 6) * 0.08;
    rot(rig, 'ear' + s, -0.25 - flop - ud.cw * 1.1 - inf * 0.6, 0, k * (0.15 + ud.cw * 0.4));
    rot(rig, 'legB' + s, moving ? Math.sin(ph) * 0.9 : 0, 0, 0);
    rot(rig, 'legF' + s, moving ? -Math.sin(ph + 0.6) * 0.7 : 0, 0, 0);
  }
  rot(rig, 'tail', 0, 0, Math.sin(t * 8) * 0.2);
  if (c.dead) {
    // deflated
    core.scale.set(1.15, 0.45, 1.1);
    core.position.y = 0.08;
    vis(rig, 'shell', false);
  } else vis(rig, 'shell', true);
}

function thinkRabbit(c: Creature, dt: number): boolean {
  const n = net(c), m = c.mem;
  // puffing up to pop
  if (n.inf) {
    hold(c);
    m.infT = (m.infT ?? 0) + dt;
    if (m.infT > 1.15) {
      for (const p of playersNear(c, c.x, c.z, 1.9)) hitPlayer(c, p, rng.float(5, 9), ['burn', 'scratch'], 0.9, ['head', 'neck', 'torso_u', 'hand_l', 'hand_r']);
      popGoo(c, 1.4);
      ruleShown(c);
      G.creatures.kill(c, G.getZone(c.zoneKey), undefined, { dmg: 60, kind: 'blunt', fx: c.x, fz: c.z });
    }
    return true;
  }
  return scaredThink(c, dt, {
    fleeR: 8, sneakR: 2.2, cornered: 'custom', roam: 10,
    onCornered: (cc) => { net(cc).inf = 1; cc.mem.infT = 0; fx(cc, 'inflate'); cc.setState('warn'); },
  });
}

const RAB = def({
  key: 'bubble_rabbit', name: 'Bubble Rabbit', code: 'FG-05 // FILM LAGOMORPH', temperament: 'skittish', threat: 0,
  hp: 12, walk: 1.4, run: 5.8, turn: 10, radius: 0.22, height: 0.55, sight: 14, fov: 2.8, hearing: 1.5,
  rule: { name: 'DO NOT CORNER IT', text: 'It bolts from you. Corner it and it puffs up and pops in your face. Sneak up from behind and it is easy meat.', tell: 'A rabbit. Made of bubbles. It has seen me.' },
  attack: { dmg: [5, 9], range: 1.6, cooldown: 3, kinds: ['burn'], corrupt: 0, knock: 0.6 },
  zones: ['meadow'], weight: 4, group: [1, 4], maxPerZone: 10, diet: 'none',
  meat: [['bubble_jelly', 2]],
  sounds: snd({ idle: 'bubble_squeak', alert: 'bubble_squeak', hurt: 'bubble_squeak', death: 'bubble_pop' }),
  scan: { cls: 'Grazer / skittish', notes: ['A pearly core inside a film of soap. The ears are three bubbles stacked.', 'It runs from you, zig-zagging. Sneaking gets you close.', 'Cornered, it inflates and pops. It stings.', 'Edible: bubble jelly. Fizzes on the tongue.'] },
  gore: { blood: 'glow', tint: 0xffb8f0, flesh: 0xffc8ec, sever: ['earL', 'earR', 'legBL', 'legBR', 'legFL', 'legFR', 'tail'], head: 'head' },
  build: buildRabbit, animate: animateRabbit, think: thinkRabbit,
});
(RAB as any).handlesSevered = true;
RAB.animateGallery = galleryDriver('bubble_rabbit', ['idle', 'hop', 'flee', 'cower', 'inflate', 'dead'], animateRabbit, (pose, fc) => {
  fc.state = pose === 'flee' ? 'flee' : pose === 'hop' ? 'wander' : 'idle';
  fc.speed = pose === 'hop' ? 1.4 : pose === 'flee' ? 5.5 : 0;
  fc.phase = (fc.phase ?? 0) + fc.speed / 60 * 6;
  fc.mem.netMem = { pose: pose === 'cower' ? 'cower' : '', inf: pose === 'inflate' ? 1 : 0 };
  fc.dead = pose === 'dead';
});
void clamp01;
