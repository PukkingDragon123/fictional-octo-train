// LINTEL: a door frame that wants you. Two posts of chipped cream trim for
// legs, a heavy lintel beam for shoulders with a keyhole plate for a face,
// a curtain of long teeth hanging in the doorway, and two door leaves for
// arms that swing out and slam. Inside the room it belongs to it is very
// fast. It cannot cross a threshold: get out through a doorway and all it can
// do is stand in it and rattle.
import { horrify } from '../kit/horror';
import { def, newRig, Rig } from '../species';
import { G } from '../../game/G';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import type { Zone } from '../../world/zone';
import { Page, bpart, registerPage, applyLook, galleryDriver, lerp, damp, ramp } from '../kit/beasts';
import { rot, obox, skin, eye, flat } from '../kit/oddkit';
import { net, netOf, snd, playersIn, dist, hold, face, hashId, rng, fx, fxPoll, playAt } from '../behaviors_b';
import { pulse, attack } from '../behaviors_a';
import { ruleShown } from '../rules';
import { defDread } from '../dread';
import '../../audio/sounds_creatures_d';

const PG = registerPage(new Page('c_lintpg', 96, 96, [
  ['TRIM', 32, 64], ['LEAF', 32, 48], ['WOOD', 16, 16], ['TOOTH', 8, 8], ['SLOT', 16, 16], ['BRASS', 8, 8], ['EYE', 8, 8], ['CUT', 12, 12],
], 2));
PG.paint((P, v) => {
  // old gloss trim, chipped to the wood, grimy where hands have been
  const R = ramp(v ? 0xd8d0b8 : 0xe0d8c4, 6, 0x6a604c, 0.3);
  const trim = (r: ReturnType<typeof P.R>) => {
    skin(P, r, R, { mott: 0.9, lo: 2, hi: 4.4, salt: 4 });
    for (let k = 0; k < r.w * r.h / 60; k++) P.spot(r, P.rng.int(0, r.w - 1), P.rng.int(0, r.h - 1), P.rng.float(0.6, 1.8), P.rng.float(0.6, 2.2), 0x8a6a40, 0.9);
    for (let y = 0; y < r.h; y++) P.blend(r, 2, y, 0xffffff, 0.25);
  };
  trim(P.R('TRIM'));
  {
    const r = P.R('LEAF');
    trim(r);
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { if (x === 3 || x === r.w - 4 || y === 3 || y === Math.floor(r.h / 2) || y === r.h - 4) P.blend(r, x, y, 0x5a5040, 0.4); }
  }
  skin(P, P.R('WOOD'), ramp(0x8a6038, 5, 0x3a2410, 0.3), { stripes: 5 });
  flat(P, P.R('TOOTH'), 0xece4cc, 0.12);
  { const r = P.R('SLOT'); for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) P.set(r, x, y, y % 5 === 0 ? 0x4a0a10 : 0x120406); }
  flat(P, P.R('BRASS'), 0xc8a050, 0.2);
  eye(P, P.R('EYE'), 0x6a3a10, { slit: true, sclera: 0xe8d8a0 });
  P.cut(P.R('CUT'), 0xe0d8c4, { meat: 0x8a6038, bone: 0xc89060, marrow: 0x6a4020, fat: 0xa87850 });
});

const BEAM_Y = 1.2;
function buildLintel(): Rig {
  const rig = newRig(2.4);
  const T = PG.reg('TRIM');
  const beam = bpart(rig, 'beam', rig.body, [0, BEAM_Y, 0], PG, 'beam', (ob) => {
    obox(ob, [0, 1.0, 0], [1.34, 0.2, 0.16], T);
    obox(ob, [0, 1.13, 0.0], [1.44, 0.06, 0.2], T);
    obox(ob, [0, 0.88, 0.0], [1.1, 0.04, 0.12], PG.reg('WOOD'));
  });
  bpart(rig, 'head', beam, [0, 1.0, 0.085], PG, 'lhead', (ob) => {
    obox(ob, [0, 0, 0], [0.14, 0.18, 0.025], PG.reg('BRASS'));
    obox(ob, [0, 0.02, 0.014], [0.05, 0.05, 0.01], PG.reg('EYE'), { emis: 0.6 });
    obox(ob, [0, -0.05, 0.014], [0.02, 0.05, 0.01], PG.reg('SLOT'));
  });
  bpart(rig, 'jaw', beam, [0, 0.9, 0], PG, 'ljaw', (ob) => {
    ob.quad([[-0.4, -0.5, -0.03], [0.4, -0.5, -0.03], [0.4, 0, -0.03], [-0.4, 0, -0.03]], PG.reg('SLOT'), undefined, { double: true });
    for (let i = 0; i < 9; i++) { const x = -0.36 + i * 0.09, h = 0.28 + ((i * 7) % 4) * 0.07; ob.cone([x, 0, 0], [0, -1, 0.05], 0.03, h, 4, PG.reg('TOOTH')); }
  });
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    const th = bpart(rig, 'thigh' + s, beam, [k * 0.58, 0.9, 0], PG, 'lthigh', (ob) => obox(ob, [0, -0.5, 0], [0.13, 1.0, 0.11], T));
    const sh = bpart(rig, 'shin' + s, th, [0, -1.0, 0], PG, 'lshin', (ob) => { obox(ob, [0, -0.52, 0], [0.12, 1.04, 0.1], T); obox(ob, [0, -1.08, 0.02], [0.17, 0.08, 0.16], PG.reg('WOOD')); });
    void sh;
    // the door leaves: hinged on the inside of each post
    bpart(rig, 'arm' + s, beam, [k * 0.5, 0.86, 0.02], PG, 'lleaf', (ob) => {
      obox(ob, [-k * 0.22, -0.75, 0], [0.44, 1.5, 0.04], PG.reg('LEAF'));
      ob.blob([-k * 0.38, -0.8, 0.04], [0.025, 0.025, 0.025], 6, 4, PG.reg('BRASS'));
    });
  }
  return rig;
}
function animateLintel(rig: Rig, c: Creature, t: number, dt: number) {
  applyLook(rig, c, PG, 0.04);
  const ud = rig.root.userData as Record<string, any>;
  const n = netOf(c);
  const seed = hashId(c.id);
  const ev = fxPoll(rig, c);
  if (ev?.key === 'rattle') { playAt('lintel_rattle', c, 1, 24); ud.rat = 1.2; }
  ud.rat = Math.max(0, (ud.rat ?? 0) - dt);
  const moving = c.speed > 0.3;
  // it walks by rocking from post to post, rigid, like something being walked across a floor
  const ph = c.phase * 0.5;
  const rock = moving ? Math.sin(ph) * 0.16 : 0;
  rig.body.rotation.z = rock;
  rig.body.position.y = moving ? Math.abs(Math.sin(ph)) * 0.08 : 0;
  rot(rig, 'beam', moving ? -0.08 : 0, 0, 0);
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    rot(rig, 'thigh' + s, moving ? Math.sin(ph + (k > 0 ? 0 : Math.PI)) * 0.3 : 0, 0, 0);
    rot(rig, 'shin' + s, moving ? Math.max(0, Math.sin(ph + (k > 0 ? Math.PI / 2 : -Math.PI / 2))) * 0.3 : 0, 0, 0);
    // leaves: ajar at rest, swung wide while it hunts, slammed shut on the strike, shaking at the threshold
    const hunt = c.state === 'chase' ? 1 : 0;
    const strike = c.attackPhase > 0 ? 1 : 0;
    const rattle = ud.rat > 0 ? Math.sin(t * 38 + k) * 0.25 : 0;
    const open = strike ? -0.05 : hunt ? 1.3 : n.wait ? 0.6 : 0.12 + Math.sin(t * 0.4 + seed * 5 + k) * 0.05;
    rot(rig, 'arm' + s, 0, k * (open + rattle), 0);
  }
  const bite = c.attackPhase > 0 ? 1 : 0;
  ud.jaw = lerp(ud.jaw ?? 0, bite ? 0.9 : c.state === 'chase' ? 0.3 : 0, damp(bite ? 20 : 4, dt));
  rot(rig, 'jaw', -ud.jaw, 0, ud.rat > 0 ? Math.sin(t * 30) * 0.05 : 0);
  rot(rig, 'head', 0, 0, Math.sin(t * 0.5 + seed * 3) * 0.1);
}

// ------------------------------------------------------------------ brain: the room is the world
function roomAt(z: Zone, x: number, zz: number) { const tx = Math.floor(x), ty = Math.floor(zz); return z.inb(tx, ty) ? z.room[z.idx(tx, ty)] : -1; }
function inside(c: Creature, z: Zone, x: number, zz: number) {
  const m = c.mem;
  if (m.room > 0) return roomAt(z, x, zz) === m.room;
  return Math.hypot(x - c.home.x, zz - c.home.z) < 6.5;
}
function thinkLintel(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey), cs = G.creatures, m = c.mem, n = net(c);
  pulse(c);
  if (m.room === undefined) { m.room = roomAt(z, c.x, c.z); if (m.room < 0) m.room = 0; }
  // whoever is in its room
  let prey: Player | null = null, pd = 30, out: Player | null = null, od = 9;
  for (const p of playersIn(c.zoneKey)) {
    const d = dist(p, c);
    if (inside(c, z, p.x, p.z)) { if (d < pd) { pd = d; prey = p; } }
    else if (d < od) { od = d; out = p; }
  }
  n.wait = 0;
  if (prey) {
    m.chased = prey.id;
    c.targetId = prey.id;
    c.setState('chase');
    const reach = (c.sp.attack?.range ?? 1) + prey.radius;
    if (pd <= reach && c.attackT <= 0) { attack(c, prey); return true; }
    cs.moveTo(c, z, prey.x, prey.z, c.sp.run, dt, reach * 0.8);
    guard(c, z, dt);
    return true;
  }
  if (out) {
    // at the threshold: as close as its room lets it get, rattling
    if (m.chased === out.id) { m.chased = null; ruleShown(c); }
    let gx = c.x, gz = c.z;
    const steps = Math.ceil(od / 0.4);
    for (let i = 1; i <= steps; i++) { const x = lerp(c.x, out.x, i / steps), zz = lerp(c.z, out.z, i / steps); if (!inside(c, z, x, zz)) break; gx = x; gz = zz; }
    c.setState('warn'); n.wait = 1;
    if (Math.hypot(gx - c.x, gz - c.z) > 0.5) { cs.moveTo(c, z, gx, gz, c.sp.walk * 2, dt, 0.3); guard(c, z, dt); }
    else { hold(c); face(c, out.x, out.z); if (c.noiseCooldown <= 0) { fx(c, 'rattle'); c.noiseCooldown = 2.2 + rng.float(0, 1); } }
    return true;
  }
  // nobody: back to its wall, still as a door frame
  m.chased = null;
  if (dist(c.home, c) > 0.8) { c.setState('travel'); cs.moveTo(c, z, c.home.x, c.home.z, c.sp.walk, dt, 0.5); guard(c, z, dt); }
  else { hold(c); c.setState('idle'); }
  return true;
}
/** never one step over the threshold */
function guard(c: Creature, z: Zone, dt: number) {
  const nx = c.x + c.vx * dt * 4, nz = c.z + c.vz * dt * 4;
  if (!inside(c, z, nx, nz)) { hold(c); if (!inside(c, z, c.x, c.z)) { c.x = c.home.x; c.z = c.home.z; } }
}

const S = def({
  key: 'lintel', name: 'Lintel', code: 'RB-04 // THRESHOLD-BOUND', temperament: 'territorial', threat: 4,
  hp: 110, walk: 1.2, run: 6.4, turn: 7, radius: 0.5, height: 2.4, sight: 20, fov: 3.1, hearing: 1,
  rule: { name: 'BOUND TO ITS ROOM', text: 'Inside its room it is fast and it kills. It cannot cross a threshold: get out through a doorway and all it can do is stand there and rattle.', tell: 'That door frame is standing in the middle of the room.' },
  attack: { dmg: [20, 32], range: 1.2, cooldown: 1.4, kinds: ['fracture', 'bruise', 'bite'], corrupt: 0, knock: 1.6, parts: ['torso_u', 'torso_l', 'head', 'uarm_l', 'uarm_r'] },
  zones: ['house', 'school', 'office', 'hospital', 'lab'], weight: 0.8, maxPerZone: 1, diet: 'none',
  sounds: snd({ idle: 'lintel_creak', alert: 'lintel_rattle', attack: 'lintel_slam', hurt: 'lintel_creak', death: 'lintel_slam' }),
  scan: { cls: 'Threshold-bound / territorial', notes: ['Two posts of chipped trim, a lintel beam, a keyhole plate for a face. A curtain of teeth hangs in the doorway.', 'It belongs to one room. Inside it, it is very fast.', 'It cannot cross a threshold. Outside the room you are safe; it will stand in the doorway and rattle.', 'The door leaves are its arms. They slam.'] },
  gore: { blood: 'plaster', tint: 0xe8dcc0, flesh: 0x8a6038, sever: ['armL', 'armR', 'thighL', 'thighR', 'shinL', 'shinR', 'jaw'], head: 'head' },
  build: buildLintel, animate: animateLintel, think: thinkLintel,
});
(S as any).handlesSevered = true;
S.animateGallery = galleryDriver('lintel', ['still', 'walk', 'hunt', 'rattle', 'dead'], animateLintel, (pose, fc, t) => {
  fc.state = pose === 'hunt' ? 'chase' : pose === 'rattle' ? 'warn' : 'idle';
  fc.speed = pose === 'walk' ? 1.2 : pose === 'hunt' ? 5 : 0;
  fc.phase = (fc.phase ?? 0) + fc.speed / 60 * 3;
  fc.attackPhase = pose === 'hunt' && (t % 2) < 0.4 ? 0.2 : 0;
  fc.mem.netMem = { wait: pose === 'rattle' ? 1 : 0, fx: pose === 'rattle' ? Math.floor(t / 1.2) : undefined, fk: 'rattle' };
  fc.dead = pose === 'dead';
});
defDread('lintel', { stutter: 0.1, watchFreeze: true, twitch: ['armL', 'armR'], twitchRate: 0.3, sting: 'hit', cam: 0.8 });

// the horror layer: faceted wet materials, twitches, ragged breathing, lunges, recoils, a weighted death
horrify(S, { twitch: 0.3, snap: 0.2 });
