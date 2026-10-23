// TITHE: something the Remittance Programme would recognise. A bloated,
// sallow body on long knuckle-walking arms, its back shingled with coins, a
// head that is mostly a brass-lipped coin slot with a receipt-paper tongue
// curling out of it, and two little eyes up top that only look at what you
// are carrying. It only ever hunts the survivor carrying the most, and a
// hit from it knocks your best thing out of your pack. Drop your goods and it
// stops to eat them; kill it and it coughs everything back up.
import { horrify } from '../kit/horror';
import { def, newRig, Rig } from '../species';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import type { Item } from '../../items/item';
import { Page, V3, bpart, registerPage, applyLook, galleryDriver, lerp, damp, ramp } from '../kit/beasts';
import { rot, scl, skin, eye, flat } from '../kit/oddkit';
import { net, netOf, snd, playersIn, dist, hold, face, hashId, rng, fx, fxPoll, playAt } from '../behaviors_b';
import { pulse, attack, onPlayerHit, onKilled, floorItemsAround, takeFloorItem, dropStored, restoreStore, isPrecious } from '../behaviors_a';
import { ruleShown } from '../rules';
import { defDread } from '../dread';
import { itemValue } from '../../game/debt/values';
import { serializeItem } from '../../items/factory';
import { op } from '../../game/ops';
import '../../audio/sounds_creatures_d';

const PG = registerPage(new Page('c_tithepg', 96, 96, [
  ['SKIN', 56, 40], ['LIMB', 16, 40], ['COIN', 12, 12], ['BRASS', 12, 12], ['PAPER', 10, 40], ['SLOT', 12, 12], ['EYE', 8, 8], ['CUT', 12, 12],
], 2));
PG.paint((P, v) => {
  const R = ramp(v ? 0xa8a080 : 0x9aa088, 6, 0x3a3428, 0.3);
  skin(P, P.R('SKIN'), R, { mott: 2, spots: [0.1, 1], salt: 6 });
  skin(P, P.R('LIMB'), R, { mott: 1.4, stripes: 6, salt: 8 });
  {
    const r = P.R('COIN');
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const d = Math.hypot(x + 0.5 - r.w / 2, y + 0.5 - r.h / 2) / (r.w / 2);
      P.set(r, x, y, d > 0.85 ? 0x8a6a20 : d > 0.7 ? 0xf0d070 : (x + y) % 4 === 0 ? 0xb89038 : 0xd8b048);
    }
  }
  flat(P, P.R('BRASS'), 0xc8a048, 0.2);
  { const r = P.R('PAPER'); for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) P.set(r, x, y, y % 3 === 0 && x > 1 && x < r.w - 2 && (x * 7 + y) % 5 > 1 ? 0x5a5a6a : 0xf4f0e4); }
  { const r = P.R('SLOT'); for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) P.set(r, x, y, Math.abs(x + 0.5 - r.w / 2) < 1.6 ? 0x050203 : 0x3a1a10); }
  eye(P, P.R('EYE'), 0xe8c020, { sclera: 0x1a1408 });
  P.cut(P.R('CUT'), 0x9aa088, { meat: 0x7a3020 });
});

function buildTithe(): Rig {
  const rig = newRig(1.4);
  const S = PG.reg('SKIN'), L = PG.reg('LIMB');
  const body = bpart(rig, 'body', rig.body, [0, 0.75, 0], PG, 'tbody', (ob) => {
    ob.blob([0, 0, -0.05], [0.33, 0.3, 0.46], 12, 8, S);
    // shingled with coins, overlapping like scales
    for (let i = 0; i < 18; i++) {
      const a = -0.9 + (i % 6) * 0.36, row = Math.floor(i / 6);
      const zz = 0.2 - row * 0.2;
      const rr = 0.3 * Math.sqrt(Math.max(0.2, 1 - (zz / 0.5) ** 2));
      ob.blob([Math.sin(a) * rr, Math.cos(a) * rr * 0.95 + 0.02, zz - 0.05], [0.055, 0.012, 0.055], 7, 2, PG.reg('COIN'), { emis: 0.15, rot: [0.3 - row * 0.1, 0, -a] });
    }
  });
  const head = bpart(rig, 'head', body, [0, 0.12, 0.42], PG, 'thead', (ob) => {
    ob.blob([0, 0.02, 0.06], [0.2, 0.22, 0.17], 10, 7, S);
    // two little eyes, high up
    for (const s of [-1, 1]) ob.blob([s * 0.06, 0.19, 0.15], [0.022, 0.018, 0.015], 6, 4, PG.reg('EYE'), { emis: 0.5 });
    // brass lips round a coin slot down the whole face
    for (const s of [-1, 1]) ob.tube([[s * 0.035, 0.14, 0.215], [s * 0.04, 0.0, 0.225], [s * 0.035, -0.14, 0.2]], [0.022, 0.025, 0.02], 6, PG.reg('BRASS'), { start: 'pole', end: 'pole' });
  });
  bpart(rig, 'jaw', head, [0, 0, 0.215], PG, 'tjaw', (ob) => ob.quad([[-0.03, -0.14, 0], [0.03, -0.14, 0], [0.03, 0.14, 0], [-0.03, 0.14, 0]], PG.reg('SLOT'), undefined, { double: true }));
  bpart(rig, 'tongue', head, [0, -0.08, 0.22], PG, 'ttongue', (ob) => {
    const a: V3[] = [], b: V3[] = [];
    for (let k = 0; k <= 8; k++) { const y = -k * 0.07, z = 0.04 + Math.sin(k * 0.6) * 0.06 + k * 0.012; a.push([-0.04, y, z]); b.push([0.04, y, z]); }
    ob.strip(a, b, PG.reg('PAPER'), { double: true });
  });
  void head;
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    const arm = bpart(rig, 'arm' + s, body, [k * 0.26, -0.02, 0.28], PG, 'tarm', (ob) => ob.tube([[0, 0, 0], [0, -0.22, 0.05], [0, -0.42, 0.04]], [0.07, 0.055, 0.045], 7, L, { start: 'pole' }));
    bpart(rig, 'fore' + s, arm, [0, -0.42, 0.04], PG, 'tfore', (ob) => {
      ob.tube([[0, 0, 0], [0, -0.16, 0.04], [0, -0.3, 0.06]], [0.045, 0.035, 0.03], 6, L, { start: 'pole' });
      for (let f = 0; f < 4; f++) ob.cone([(f - 1.5) * 0.022, -0.3, 0.07], [(f - 1.5) * 0.25, -0.5, 1], 0.012, 0.12, 3, L);
    });
    bpart(rig, 'leg' + s, body, [k * 0.2, -0.16, -0.32], PG, 'tleg', (ob) => {
      ob.tube([[0, 0, 0], [0, -0.22, 0.08], [0, -0.42, -0.02], [0, -0.58, 0.04]], [0.11, 0.09, 0.06, 0.05], 7, L, { start: 'pole' });
      ob.blob([0, -0.6, 0.1], [0.06, 0.03, 0.1], 6, 4, L);
    });
    void arm;
  }
  return rig;
}
function animateTithe(rig: Rig, c: Creature, t: number, dt: number) {
  applyLook(rig, c, PG, 0.08);
  const ud = rig.root.userData as Record<string, any>;
  const n = netOf(c);
  const seed = hashId(c.id);
  const ev = fxPoll(rig, c);
  if (ev?.key === 'chew') playAt('tithe_chew', c, 0.9, 16);
  else if (ev?.key === 'print') playAt('tithe_print', c, 0.8, 16);
  else if (ev?.key === 'jingle') playAt('tithe_jingle', c, 0.9, 20);
  const moving = c.speed > 0.2, ph = c.phase * 0.5;
  const eating = !!n.eat;
  const hunt = c.state === 'chase';
  rig.body.position.y = moving ? Math.abs(Math.sin(ph)) * 0.05 : Math.sin(t * 1.2 + seed * 4) * 0.015;
  rot(rig, 'body', (eating ? 0.35 : hunt ? -0.05 : 0.08) + (moving ? Math.sin(ph * 2) * 0.03 : 0), 0, moving ? Math.sin(ph) * 0.06 : 0);
  scl(rig, 'body', 1 + (hunt ? Math.sin(t * 24) * 0.012 : 0));
  rot(rig, 'head', eating ? 0.5 + Math.sin(t * 9) * 0.08 : hunt ? -0.15 : Math.sin(t * 0.7 + seed) * 0.1, Math.sin(t * 0.5 + seed * 3) * 0.25 * (hunt ? 0.2 : 1), 0);
  ud.slot = lerp(ud.slot ?? 0, eating || c.attackPhase > 0 ? 1 : 0, damp(10, dt));
  scl(rig, 'jaw', 1 + ud.slot * 2.2 + (eating ? Math.max(0, Math.sin(t * 12)) * 0.8 : 0), 1, 1);
  rot(rig, 'tongue', 0.15 + Math.sin(t * 2.3 + seed) * 0.12 + (moving ? 0.25 : 0), 0, Math.sin(t * 1.7) * 0.15);
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    const sw = moving ? Math.sin(ph + (k > 0 ? 0 : Math.PI)) : 0;
    rot(rig, 'arm' + s, sw * 0.55 - (c.attackPhase > 0 ? 1.2 : 0) - (eating ? 0.3 : 0), 0, k * 0.12);
    rot(rig, 'fore' + s, -0.35 + Math.max(0, -sw) * 0.5, 0, 0);
    rot(rig, 'leg' + s, moving ? -Math.sin(ph + (k > 0 ? Math.PI : 0)) * 0.45 : 0, 0, 0);
  }
}

// ------------------------------------------------------------------ brain
const THRESH = 12;
function carried(p: Player): number { let v = 0; try { for (const it of p.allItems()) v += itemValue(it); } catch { /* remote */ } return v; }
function thinkTithe(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey), cs = G.creatures, m = c.mem, n = net(c);
  pulse(c);
  restoreStore(c, 'gut');
  // weigh everyone's pack once a second
  m.vT = (m.vT ?? 0) - dt;
  if (m.vT <= 0) {
    m.vT = 1;
    let best: Player | null = null, bv = THRESH;
    for (const p of playersIn(c.zoneKey)) { if (dist(p, c) > 28) continue; const v = carried(p); if (v >= bv) { bv = v; best = p; } }
    // the one it was after is not worth it any more: they dropped their goods
    if (m.mark && (!best || best.id !== m.mark)) { const old = G.players.get(m.mark); if (old && dist(old, c) < 12) ruleShown(c); }
    m.mark = best?.id ?? null; m.markV = bv;
    // goods on the floor close by
    m.food = null; let fd = 11;
    for (const wi of floorItemsAround(z, c.x, c.z, 10)) {
      if (isPrecious(wi.item) || itemValue(wi.item) <= 0) continue;
      const d = Math.hypot(wi.x - c.x, wi.z - c.z);
      if (d < fd) { fd = d; m.food = wi.item.uid; }
    }
  }
  // eating comes first
  if (m.food) {
    const wi = floorItemsAround(z, c.x, c.z, 11).find((w) => w.item.uid === m.food);
    if (!wi) { m.food = null; n.eat = 0; }
    else {
      const d = Math.hypot(wi.x - c.x, wi.z - c.z);
      if (d > 0.7) { n.eat = 0; c.setState('investigate'); cs.moveTo(c, z, wi.x, wi.z, c.sp.walk * 1.8, dt, 0.5); return true; }
      hold(c); face(c, wi.x, wi.z); c.setState('eat'); n.eat = 1;
      m.eT = (m.eT ?? 0) + dt;
      if (m.eT > 0.4 && !m.chewed) { m.chewed = 1; fx(c, 'chew'); }
      if (m.eT > 2.2) { takeFloorItem(c, wi, 'gut'); m.eT = 0; m.chewed = 0; m.food = null; n.eat = 0; fx(c, 'print'); }
      return true;
    }
  }
  n.eat = 0; m.eT = 0;
  const p = m.mark ? G.players.get(m.mark) : null;
  if (p && p.zoneKey === c.zoneKey && !p.body.dead) {
    c.targetId = p.id; c.setState('chase');
    const reach = (c.sp.attack?.range ?? 1) + p.radius, d = dist(p, c);
    if (d <= reach && c.attackT <= 0) { attack(c, p); return true; }
    cs.moveTo(c, z, p.x, p.z, c.sp.run, dt, reach * 0.8);
    if (c.noiseCooldown <= 0) { fx(c, 'jingle'); c.noiseCooldown = 3; }
    return true;
  }
  // poor survivors are not its business: it wanders, nose down
  if (c.state !== 'wander' || !c.goal) { c.setState('wander'); c.goal = cs.wanderSpot(c, z, 12); }
  if (cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.walk, dt, 0.6) || c.stateT > 16) { c.goal = null; c.stateT = 0; }
  return true;
}
// a hit from it shakes the best thing out of your pack, onto the floor in front of it
onPlayerHit('tithe', (p, h) => {
  let best: Item | null = null, bv = 0;
  for (const it of p.allItems()) { if (isPrecious(it)) continue; const v = itemValue(it); if (v > bv) { bv = v; best = it; } }
  if (!best) return;
  p.removeItem(best);
  bus.emit('inventoryChanged', p);
  const a = Math.atan2(h.from[1] - p.z, h.from[0] - p.x);
  op('dropFloor', { z: p.zoneKey, item: serializeItem(best), x: p.x + Math.cos(a) * 0.6, zz: p.z + Math.sin(a) * 0.6, y: 0.9, v: [Math.cos(a) * 1.5, 1.6, Math.sin(a) * 1.5] });
  bus.emit('think', p, `It knocked my ${best.name || 'things'} loose. It is going for it.`);
});
onKilled('tithe', (c) => { dropStored(c, 'gut'); });

const S = def({
  key: 'tithe', name: 'Tithe', code: 'RB-21 // COLLECTOR', temperament: 'hostile', threat: 3,
  hp: 75, walk: 1.3, run: 4.4, turn: 6, radius: 0.42, height: 1.4, sight: 20, fov: 2.6, hearing: 1.2,
  rule: { name: 'TAKES THE RICHEST', text: 'It only hunts whoever is carrying the most, and a hit knocks your best thing loose. Drop your goods and it stops to eat them; kill it and it coughs everything back up.', tell: 'Coins on its back. It is looking at my pack, not at me.' },
  attack: { dmg: [10, 18], range: 1.1, cooldown: 1.5, kinds: ['bite', 'laceration'], corrupt: 0.02, knock: 1.0, parts: ['torso_l', 'thigh_l', 'thigh_r', 'hand_l', 'hand_r'] },
  zones: ['market', 'mall', 'lobby', 'parking', 'office'], weight: 1, maxPerZone: 1, diet: 'items',
  sounds: snd({ idle: 'tithe_jingle', alert: 'tithe_growl', attack: 'tithe_growl', hurt: 'tithe_jingle', death: 'tithe_jingle' }),
  scan: { cls: 'Collector / rule-bound', notes: ['A bloated body shingled with coins. The face is a coin slot with brass lips; the tongue is a receipt.', 'It ignores the poor. It hunts the survivor with the most in their pack.', 'Its blows knock the best thing out of your pack, and it stops to eat what falls.', 'Kill it and it coughs up everything it ate.'] },
  gore: { blood: 'red', tint: 0xc8a060, flesh: 0x8a7a50, sever: ['armL', 'armR', 'foreL', 'foreR', 'legL', 'legR', 'tongue'], head: 'head' },
  build: buildTithe, animate: animateTithe, think: thinkTithe,
});
S.animateGallery = galleryDriver('tithe', ['idle', 'walk', 'hunt', 'eat', 'dead'], animateTithe, (pose, fc, t) => {
  fc.state = pose === 'hunt' ? 'chase' : pose === 'eat' ? 'eat' : 'idle';
  fc.speed = pose === 'walk' ? 1.3 : pose === 'hunt' ? 4 : 0;
  fc.phase = (fc.phase ?? 0) + fc.speed / 60 * 4;
  fc.mem.netMem = { eat: pose === 'eat' ? 1 : 0 };
  fc.attackPhase = pose === 'hunt' && (t % 2) < 0.4 ? 0.2 : 0;
  fc.dead = pose === 'dead';
});
defDread('tithe', { twitch: ['head'], twitchRate: 0.3, sting: 'hit', cam: 0.5 });
void eye;

// the horror layer: faceted wet materials, twitches, ragged breathing, lunges, recoils, a weighted death
horrify(S, { twitch: 0.4, snap: 0.25 });
