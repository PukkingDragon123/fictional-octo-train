// COWERLING: knee-high, hairless and pinkish grey, all eyes, with two huge
// membrane ears it folds down over them when it is frightened, which is
// always. It carries a little cloth bundle of things it has found. It runs
// from you, plays dead when you get close (on its back, stiff, peeking), and
// if you corner it, it kneels and begs. Leave it be and it leaves you
// something from its bundle. Kill one and the rest in that place never trust
// anyone again. It only bites if you hurt it and it has nowhere to go.
import { horrify } from '../kit/horror';
import { def, newRig, Rig } from '../species';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Creature } from '../creature';
import { Page, V3, bpart, registerPage, applyLook, galleryDriver, lerp, damp, ramp } from '../kit/beasts';
import { rot, skin, eye, flat } from '../kit/oddkit';
import { netOf, snd, hashId, rng, dropGift } from '../behaviors_b';
import { onKilled } from '../behaviors_a';
import { scaredThink, distrust } from '../kit/scared';
import { defDread } from '../dread';
import '../../audio/sounds_creatures_d';

const PG = registerPage(new Page('c_cowpg', 64, 64, [
  ['FUR', 32, 24], ['EAR', 16, 24], ['EYE', 10, 10], ['CLOTH', 12, 12], ['CUT', 10, 10],
], 3));
const TONES = [0xc8a8a8, 0xb8b0b8, 0xd0b8a0];
PG.paint((P, v) => {
  const R = ramp(TONES[v], 6, 0x5a4048, 0.4);
  skin(P, P.R('FUR'), R, { mott: 1.4, salt: v + 1 });
  { const r = P.R('FUR'); P.strokes(r, R, () => 3, { density: 0.25, flow: () => [0, 1], len: [1, 3], salt: 2 }); }
  {
    // thin pink membrane with veins, lit from behind
    const r = P.R('EAR');
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) P.set(r, x, y, lerpC(0xf0b0b0, 0xc87880, Math.abs(x + 0.5 - r.w / 2) / (r.w / 2)));
    for (let i = 0; i < 4; i++) P.walk(r, r.w / 2, r.h - 1, r.h, (i - 1.5) * 0.25, -1, 0xa04050, 0.6, 0.3, 0.2);
  }
  eye(P, P.R('EYE'), 0x101018, { pupil: 0x000000, sclera: 0x202028 });
  flat(P, P.R('CLOTH'), [0x6a7a9a, 0x9a6a5a, 0x7a8a5a][v], 0.15);
  P.cut(P.R('CUT'), TONES[v], { meat: 0xb04050 });
});
function lerpC(a: number, b: number, t: number) { const k = Math.max(0, Math.min(1, t)); const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k); return (ch(16) << 16) | (ch(8) << 8) | ch(0); }

function buildCower(): Rig {
  const rig = newRig(0.6);
  const F = PG.reg('FUR');
  const body = bpart(rig, 'body', rig.body, [0, 0.26, 0], PG, 'cbody', (ob) => {
    ob.blob([0, 0.06, -0.02], [0.13, 0.16, 0.11], 10, 7, F);
  });
  const head = bpart(rig, 'head', body, [0, 0.2, 0.05], PG, 'chead', (ob) => {
    ob.blob([0, 0.03, 0.02], [0.11, 0.1, 0.1], 10, 7, F);
    ob.blob([0, -0.02, 0.1], [0.04, 0.03, 0.03], 6, 4, F);
    for (const s of [-1, 1]) ob.blob([s * 0.05, 0.04, 0.085], [0.042, 0.05, 0.03], 8, 5, PG.reg('EYE'), { emis: 0.12 });
  });
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    bpart(rig, 'ear' + s, head, [k * 0.07, 0.1, -0.01], PG, 'cear', (ob) => {
      const a: V3[] = [], b: V3[] = [];
      for (let i = 0; i <= 5; i++) { const y = i * 0.045, w = 0.05 * Math.sin((i / 5) * Math.PI * 0.85 + 0.25); a.push([-w, y, 0]); b.push([w, y, -0.01]); }
      ob.strip(a, b, PG.reg('EAR'), { double: true, emis: 0.1 });
    });
    bpart(rig, 'arm' + s, body, [k * 0.1, 0.13, 0.04], PG, 'carm', (ob) => {
      ob.tube([[0, 0, 0], [0, -0.08, 0.03], [0, -0.15, 0.06]], [0.022, 0.018, 0.015], 5, F, { start: 'pole' });
      for (let f = 0; f < 3; f++) ob.cone([(f - 1) * 0.01, -0.15, 0.07], [(f - 1) * 0.3, -1, 0.5], 0.006, 0.035, 3, F);
    });
    bpart(rig, 'leg' + s, body, [k * 0.07, -0.08, 0], PG, 'cleg', (ob) => {
      ob.tube([[0, 0, 0], [0, -0.09, 0.03], [0, -0.17, 0]], [0.035, 0.025, 0.02], 5, F, { start: 'pole' });
      ob.blob([0, -0.18, 0.04], [0.025, 0.012, 0.05], 5, 3, F);
    });
  }
  bpart(rig, 'bundle', rig.parts.armL, [0, -0.17, 0.07], PG, 'cbundle', (ob) => { ob.blob([0, -0.03, 0], [0.05, 0.045, 0.045], 7, 5, PG.reg('CLOTH')); ob.cone([0, 0.01, 0], [0, 1, 0], 0.02, 0.04, 4, PG.reg('CLOTH')); });
  bpart(rig, 'tail', body, [0, -0.05, -0.1], PG, 'ctail', (ob) => ob.tube([[0, 0, 0], [0, -0.06, -0.12], [0, -0.1, -0.25], [0.04, -0.1, -0.33]], [0.015, 0.012, 0.009, 0.006], 4, F, { start: 'pole', end: 'pole' }));
  return rig;
}
function animateCower(rig: Rig, c: Creature, t: number, dt: number) {
  applyLook(rig, c, PG, 0.12);
  const ud = rig.root.userData as Record<string, any>;
  const n = netOf(c);
  const seed = hashId(c.id);
  const pose = c.dead ? '' : (n.pose as string) || '';
  const k = (name: string, target: number, rate = 6) => (ud[name] = lerp(ud[name] ?? 0, target, damp(rate, dt)));
  const dead = k('pd', pose === 'dead' ? 1 : 0, 9), beg = k('pb', pose === 'beg' ? 1 : 0), cow = k('pc', pose === 'cower' || c.state === 'flee' ? 1 : 0);
  const moving = c.speed > 0.2, ph = c.phase * 0.5;
  const tremble = (cow + beg) * Math.sin(t * 45 + seed * 9) * 0.015;
  // playing dead: rolled onto its back, limbs stuck up stiff, now and then one eye... no, it is dead. Definitely.
  rig.body.rotation.x = -dead * 1.5;
  rig.body.position.y = dead * 0.1 - beg * 0.08 + (moving ? Math.abs(Math.sin(ph)) * 0.04 : 0);
  rig.body.position.x = tremble;
  rot(rig, 'body', cow * 0.35 + beg * -0.15 + (moving ? 0.25 : 0), 0, 0);
  const peek = dead > 0.9 && Math.sin(t * 0.7 + seed * 6) > 0.92 ? 0.4 : 0;
  rot(rig, 'head', cow * 0.3 + beg * (0.2 + Math.max(0, Math.sin(t * 6)) * 0.25) + dead * -0.4 + peek, Math.sin(t * 1.3 + seed * 4) * 0.25 * (1 - dead - beg), 0);
  for (const [s, kk] of [['L', 1], ['R', -1]] as const) {
    // ears down over the eyes when frightened, up and swivelling when not
    rot(rig, 'ear' + s, 0.2 + cow * 1.9 + dead * 0.8 + Math.sin(t * 0.9 + kk + seed * 3) * 0.1 * (1 - cow), kk * 0.2, kk * (0.5 - cow * 0.3));
    const sw = moving ? Math.sin(ph + (kk > 0 ? 0 : Math.PI)) : 0;
    rot(rig, 'leg' + s, sw * 0.7 - dead * 1.2 - beg * 1.4, 0, kk * dead * 0.3);
    // begging: both hands together, raised; dead: stuck straight up
    rot(rig, 'arm' + s, -sw * 0.5 - beg * (1.3 + Math.sin(t * 6) * 0.15) - dead * 1.4 - cow * 0.6, 0, -kk * beg * 0.45);
  }
  rot(rig, 'tail', moving ? Math.sin(t * 12) * 0.3 : -cow * 0.5, Math.sin(t * 2 + seed) * 0.3, 0);
}

const GIFTS: [string, number][] = [['battery', 3], ['bandage', 3], ['candy_bar', 3], ['coins', 4], ['glowstick', 2], ['screws', 2], ['marbles', 1], ['glow_dust', 1]];
function thinkCower(c: Creature, dt: number): boolean {
  return scaredThink(c, dt, {
    fleeR: 7, sneakR: 3, playDeadR: 3.4, cornered: 'beg', roam: 9,
    gift: (cc, p) => {
      dropGift(cc, rng.weighted(GIFTS));
      if (p.isLocal) bus.emit('think', p, 'It left something on the floor for me. For not hurting it.');
    },
  });
}
onKilled('cowerling', (c) => distrust(c));

const S = def({
  key: 'cowerling', name: 'Cowerling', code: 'PV-02 // TIMID', temperament: 'skittish', threat: 0,
  hp: 14, walk: 1.1, run: 4.6, turn: 10, radius: 0.18, height: 0.6, sight: 14, fov: 2.6, hearing: 1.6,
  rule: { name: 'SCARED STIFF', text: 'It runs, plays dead when you come close, and begs when cornered. Leave it be and it leaves you a gift. Kill one and the rest never trust you again. It only bites if hurt with nowhere to run.', tell: 'Something small just fell over. It is pretending to be dead.' },
  attack: { dmg: [3, 6], range: 0.7, cooldown: 2, kinds: ['bite'], corrupt: 0, knock: 0.2, parts: ['hand_l', 'hand_r', 'shin_l', 'shin_r', 'foot_l', 'foot_r'] },
  zones: ['lobby', 'house', 'suburbs', 'fields', 'parking', 'tunnels', 'school'], weight: 1.6, group: [1, 3], maxPerZone: 5, diet: 'items',
  meat: [['meat_raw', 1]],
  sounds: snd({ idle: 'cower_squeak', alert: 'cower_squeak', hurt: 'cower_squeak', death: 'cower_die', call: 'cower_beg' }),
  scan: { cls: 'Timid scavenger / harmless', notes: ['Knee-high, all eyes, with huge membrane ears it folds over them when afraid.', 'It runs. Close up it plays dead. Cornered, it kneels and begs.', 'Spare one and it leaves you something from its bundle.', 'They remember a killing. The rest of them stop trusting anyone.'] },
  gore: { blood: 'pale', flesh: 0xc8a8a8, sever: ['earL', 'earR', 'armL', 'armR', 'legL', 'legR', 'tail'], head: 'head' },
  build: buildCower, animate: animateCower, think: thinkCower,
});
(S as any).handlesSevered = true;
S.animateGallery = galleryDriver('cowerling', ['idle', 'walk', 'flee', 'dead', 'beg', 'cower'], animateCower, (pose, fc) => {
  fc.state = pose === 'flee' ? 'flee' : pose === 'walk' ? 'wander' : 'idle';
  fc.speed = pose === 'walk' ? 1 : pose === 'flee' ? 4 : 0;
  fc.phase = (fc.phase ?? 0) + fc.speed / 60 * 8;
  fc.mem.netMem = { pose: pose === 'dead' ? 'dead' : pose === 'beg' ? 'beg' : pose === 'cower' ? 'cower' : '' };
});
defDread('cowerling', {});

// the horror layer: faceted wet materials, twitches, ragged breathing, lunges, recoils, a weighted death
horrify(S, { twitch: 0.9, snap: 0.22 });
