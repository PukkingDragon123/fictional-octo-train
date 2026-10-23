// HUSH: tall, pale and stretched thin, and where the head should be, a great
// flared horn like an old gramophone's, brass outside and wet pink folds
// inside. One long finger is always raised to where a mouth would be. It is
// blind. It goes for the loudest sound in the building, and it silences
// whatever made it: you, or anything else. Walk soft, stand still when it is
// close, and throw something to send it somewhere else.
import { horrify } from '../kit/horror';
import { def, newRig, Rig } from '../species';
import { G } from '../../game/G';
import type { Creature } from '../creature';
import { Page, V3, bpart, registerPage, applyLook, galleryDriver, lerp, damp, ramp } from '../kit/beasts';
import { rot, skin, buildHumanoid, humWalk, surfacePart } from '../kit/oddkit';
import { net, netOf, snd, playersIn, dist, hold, face, hashId, rng, fx, fxPoll, playAt } from '../behaviors_b';
import { pulse, attack } from '../behaviors_a';
import { ruleShown } from '../rules';
import { defDread } from '../dread';
import { wallsBetween } from '../../world/collision';
import '../../audio/sounds_creatures_d';

const PG = registerPage(new Page('c_hushpg', 96, 96, [
  ['SKIN', 48, 40], ['LIMB', 16, 48], ['HORN', 48, 24], ['EAR', 24, 24], ['CUT', 12, 12],
], 1));
PG.paint((P) => {
  const R = ramp(0xc8ccd4, 6, 0x5a6070, 0.35);
  skin(P, P.R('SKIN'), R, { mott: 1.2, salt: 2 });
  { const r = P.R('SKIN'); for (let i = 0; i < 10; i++) P.walk(r, P.rng.int(0, r.w - 1), P.rng.int(0, r.h - 1), 14, 0, 1, 0x7a6a8a, 0.35, 0.5, 0.15); }
  skin(P, P.R('LIMB'), R, { mott: 1, stripes: 3, salt: 4 });
  {
    // brass gone green at the seams
    const r = P.R('HORN');
    P.fill(r, ramp(0xb89040, 6, 0x3a2a10, 0.45), (u, v, x, y) => 2 + Math.sin(u * Math.PI * 16) * 0.8 + v * 1.6, 0.3);
    for (let x = 0; x < r.w; x += 6) for (let y = 0; y < r.h; y++) P.blend(r, x, y, 0x4a8a6a, 0.35 + P.n(r, x, y, 2, 1, 5) * 0.3);
  }
  {
    const r = P.R('EAR');
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const d = Math.hypot(x + 0.5 - r.w / 2, y + 0.5 - r.h / 2) / (r.w / 2);
      const fold = Math.sin(d * 14 + Math.atan2(y - r.h / 2, x - r.w / 2) * 2);
      P.set(r, x, y, d < 0.2 ? 0x1a0408 : fold > 0.4 ? 0xe89aa0 : fold > -0.3 ? 0xc06a78 : 0x7a2a3a);
    }
  }
  P.cut(P.R('CUT'), 0xc8ccd4, { meat: 0x8a3a4a });
});

function buildHush(): Rig {
  const rig = newRig(2.3);
  buildHumanoid(rig, {
    page: PG, key: 'h', hipY: 1.12, hipW: 0.18, shoulderW: 0.36, torsoLen: 0.72, torsoR: [0.13, 0.08], waistR: [0.08, 0.06],
    neckLen: 0.12, neckR: 0.035, upper: 0.5, fore: 0.52, armR: 0.03, thigh: 0.56, shin: 0.56, legR: 0.045,
    body: PG.reg('SKIN'), limb: PG.reg('LIMB'), fingers: 4, fingerLen: 0.17,
    head: (ob) => {
      // the horn: narrow at the neck, curving forward and flaring wide
      const path: V3[] = [[0, 0, -0.02], [0, 0.12, 0.02], [0, 0.22, 0.12], [0, 0.27, 0.28], [0, 0.29, 0.42]];
      ob.tube(path, [0.04, 0.05, 0.08, 0.17, 0.3], 14, PG.reg('HORN'), { start: 'pole', end: null, up: [0, 0, 1] });
      // the wet folds inside the bell
      ob.blob([0, 0.285, 0.38], [0.27, 0.27, 0.05], 14, 6, PG.reg('EAR'), { rot: [Math.PI / 2 - 0.12, 0, 0], emis: 0.08 });
    },
  });
  // brass and wet folds: the horn shines
  surfacePart(rig, 'head', 'lacquer');
  return rig;
}
function animateHush(rig: Rig, c: Creature, t: number, dt: number) {
  applyLook(rig, c, PG, 0.04);
  const ud = rig.root.userData as Record<string, any>;
  const n = netOf(c);
  const seed = hashId(c.id);
  const ev = fxPoll(rig, c);
  if (ev?.key === 'shh') playAt('hush_shh', c, 0.9, 22);
  else if (ev?.key === 'hear') { playAt('hush_inhale', c, 0.8, 18); ud.snap = 1; }
  else if (ev?.key === 'shriek') playAt('hush_shriek', c, 1, 30);
  ud.snap = Math.max(0, (ud.snap ?? 0) - dt * 2);
  humWalk(rig, c, t, { stride: c.state === 'chase' ? 0.7 : 0.4, arms: 0.2, bob: 0.03, seed });
  // listening: the horn sweeps slowly; it snaps round to a sound
  const listen = c.state === 'idle' || c.state === 'watch';
  ud.sweep = listen ? Math.sin(t * 0.45 + seed * 5) * 0.7 : lerp(ud.sweep ?? 0, 0, damp(4, dt));
  rot(rig, 'neck', 0.1 + ud.snap * 0.2, ud.sweep * 0.5, 0);
  rot(rig, 'head', (n.cock ? 0.15 : 0) + Math.sin(t * 7) * 0.02 * ud.snap, ud.sweep * 0.5, Math.sin(t * 0.3 + seed) * 0.15);
  rot(rig, 'torso', c.state === 'chase' ? 0.3 : 0.06, 0, 0);
  // one long finger to where a mouth would be
  if (c.attackPhase > 0) { rot(rig, 'armL', -1.6, 0, 0.2); rot(rig, 'armR', -1.6, 0, -0.2); rot(rig, 'foreL', -0.2); rot(rig, 'foreR', -0.2); }
  else { rot(rig, 'armR', -0.35, 0, -0.35); rot(rig, 'foreR', -2.2, 0.3, 0); rot(rig, 'handR', -0.3, 0, 0); }
}

function thinkHush(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey), cs = G.creatures, m = c.mem, n = net(c);
  pulse(c);
  // the loudest new sound it can hear
  const last = m.lastN ?? 0;
  let newest = last, best: { x: number; z: number; r: number; by?: string; loud: boolean } | null = null;
  for (const nz of cs.noises) {
    if (nz.t <= last || nz.zone !== c.zoneKey) continue;
    newest = Math.max(newest, nz.t);
    if (nz.kind.startsWith('poke:')) continue;
    const p = nz.by ? G.players.get(nz.by) : null;
    if (p && (p.stance === 'sneak' || p.stance === 'crawl') && (nz.kind === 'step' || nz.kind === 'run')) continue;
    const d = Math.hypot(nz.x - c.x, nz.z - c.z);
    const r = nz.radius * c.sp.hearing * Math.pow(0.65, wallsBetween(z, c.x, c.z, nz.x, nz.z, 4));
    if (d < r && (!best || r - d > best.r)) best = { x: nz.x, z: nz.z, r: r - d, by: nz.by, loud: nz.radius > 9 };
  }
  m.lastN = newest;
  if (best) {
    const was = m.goal;
    m.goal = { x: best.x, z: best.z, t: G.time, by: best.by, loud: best.loud };
    if (!was || G.time - was.t > 3) fx(c, 'hear');
    // drawn off to something that was not you, while you are right there
    const byPlayer = best.by && G.players.has(best.by);
    if (!byPlayer) for (const p of playersIn(c.zoneKey)) if (dist(p, c) < 12) { ruleShown(c); break; }
  }
  // up close it hears breath and fabric: anyone moving within arm's reach
  for (const p of playersIn(c.zoneKey)) {
    const d = dist(p, c);
    if (d < 1.5 && p.speed > 0.3 && p.stance !== 'sneak' && c.attackT <= 0) { face(c, p.x, p.z); attack(c, p); return true; }
    if (d < 2.6 && (p.stance === 'sneak' || p.speed < 0.1) && !m.passShown) { m.passShown = 1; m.passT = G.time; }
  }
  if (m.passShown === 1 && G.time - m.passT > 4) { m.passShown = 2; ruleShown(c); }
  const g = m.goal as { x: number; z: number; t: number; by?: string; loud: boolean } | undefined;
  if (g && G.time - g.t < 9) {
    const d = Math.hypot(g.x - c.x, g.z - c.z);
    n.cock = 1;
    if (d > 1.0) { c.setState(g.loud ? 'chase' : 'investigate'); cs.moveTo(c, z, g.x, g.z, g.loud ? c.sp.run : c.sp.walk * 1.6, dt, 0.8); return true; }
    // there: silence whatever is making it
    hold(c); c.setState('watch');
    for (const o of cs.creatures.values() as IterableIterator<Creature>) {
      if (o === c || o.dead || o.zoneKey !== c.zoneKey || o.sp.key === 'hush' || dist(o, c) > 1.8 || c.attackT > 0) continue;
      if (o.speed > 0.4 || o.state === 'chase' || o.state === 'attack') { face(c, o.x, o.z); c.attackT = c.sp.attack!.cooldown; fx(c, 'shriek'); cs.damage(c.id, o.id, 26, c.x, c.z, 0.6, 'blade'); return true; }
    }
    if (G.time - g.t > 4) m.goal = undefined;
    return true;
  }
  n.cock = 0;
  // nothing to hear: it stands and listens, and now and then it shushes the dark
  hold(c); c.setState('idle');
  if (c.noiseCooldown <= 0) { fx(c, 'shh'); c.noiseCooldown = 6 + rng.float(0, 6); }
  return true;
}

const S = def({
  key: 'hush', name: 'Hush', code: 'RB-17 // AUDITORY', temperament: 'hostile', threat: 4,
  hp: 65, walk: 1.0, run: 5.6, turn: 6, radius: 0.3, height: 2.3, sight: 0.1, fov: 0.1, hearing: 2.0,
  rule: { name: 'HUNTS SOUND', text: 'It is blind and goes for the loudest sound. Running, shouting and breaking things bring it. Walk soft, stand still when it is close, and throw something to send it elsewhere.', tell: 'Shhhh. Something out there is shushing me.' },
  attack: { dmg: [16, 26], range: 1.2, cooldown: 1.4, kinds: ['laceration', 'deep'], corrupt: 0.03, knock: 1.0, parts: ['neck', 'head', 'torso_u', 'uarm_l', 'uarm_r'] },
  zones: ['tunnels', 'stairwell', 'pools', 'server', 'corrupt', 'lab'], weight: 1, maxPerZone: 1, diet: 'none',
  sounds: snd({ idle: 'hush_shh', alert: 'hush_inhale', attack: 'hush_shriek', hurt: 'hush_shriek', death: 'hush_shriek' }),
  scan: { cls: 'Auditory predator / blind', notes: ['A great flared horn where the head should be: brass outside, wet folds within.', 'Blind. It goes for the loudest sound it can hear and silences what made it, anything at all.', 'Sneaking makes no sound it can find. Up close, it hears you move.', 'Throw something. Break something. It will go and see.'] },
  gore: { blood: 'dark', tint: 0x8a6a7a, flesh: 0xc8ccd4, sever: ['armL', 'armR', 'foreL', 'foreR', 'thighL', 'thighR', 'shinL', 'shinR'], head: 'head' },
  build: buildHush, animate: animateHush, think: thinkHush,
});
S.animateGallery = galleryDriver('hush', ['listen', 'walk', 'hunt', 'attack', 'dead'], animateHush, (pose, fc, t) => {
  fc.state = pose === 'hunt' ? 'chase' : pose === 'walk' ? 'investigate' : 'idle';
  fc.speed = pose === 'walk' ? 1.5 : pose === 'hunt' ? 5 : 0;
  fc.phase = (fc.phase ?? 0) + fc.speed / 60 * 4;
  fc.attackPhase = pose === 'attack' && (t % 1.6) < 0.5 ? 0.2 : 0;
  fc.mem.netMem = { cock: pose === 'hunt' ? 1 : 0 };
  fc.dead = pose === 'dead';
});
defDread('hush', { stutter: 0.06, twitch: ['head'], twitchRate: 0.4, sting: 'swell', cam: 0.7, skipDark: 0.3 });

// the horror layer: faceted wet materials, twitches, ragged breathing, lunges, recoils, a weighted death
horrify(S, { twitch: 0.4, snap: 0.25 });
