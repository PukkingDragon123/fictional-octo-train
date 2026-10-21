// Executions: contextual finishers on a staggered, downed or dying creature.
// Each is a short choreography of beats (player animation, the creature's
// pose, blows, severed parts, the killing outcome) with camera work: the view
// swings round, pushes in, freezes on impacts and slows on the kill. Variants
// by creature size (tiny / small / man-sized / big) and weapon class. The host
// does the damage, the cutting and the death (src/combat/creatureState.ts ops),
// so corpses keep every wound in co-op and in saves.
import { G } from '../game/G';
import { bus } from '../core/events';
import type { Player } from '../entities/player';
import type { Creature } from '../creatures/creature';
import { moveCircle } from '../world/collision';
import { shake, punch, hitstop, slowmo, kick } from '../gfx/juice';
import { cbOp, flinch, killable, flag } from './creatureState';
import { sizeClass, type WClass, type Wielded } from './moves';
import type { Marks } from './glyphs';

interface Beat {
  at: number;
  /** player animation and its length */
  anim?: [string, number];
  /** creature pose: d down, k kneeling, l lifted, s reeling, x held */
  pose?: string;
  /** a blow that does not kill (fraction of the creature's health) */
  hit?: number;
  /** cut a part off: 'arm' | 'leg' | 'head' | 'jaw' | 'any' */
  sever?: string;
  /** the death: f = outcome (hb head burst, bs cut in two, gb gibbed, op opened, head decapitated) */
  kill?: string;
  /** what it was done with, for the blood (defaults to the weapon's) */
  kind?: string;
  snd?: string;
  /** camera: yaw swing (radians), push-in, pitch */
  cam?: [number, number, number?];
  slow?: [number, number];
  /** move the survivor to this distance from the creature */
  to?: number;
  word?: string;
}
interface ExecDef { key: string; sizes: number[]; cls: WClass[] | null; dur: number; dist: number; beats: (w: Wielded) => Beat[] }

const CHOP: WClass[] = ['axe', 'heavy'];
const CUT: WClass[] = ['blade', 'axe'];
const BASH: WClass[] = ['blunt', 'heavy', 'improvised', 'unarmed', 'cyber'];
const FISTS: WClass[] = ['unarmed', 'cyber'];

/** the light-attack animation of a class */
const lightOf = (w: Wielded) => (w.cls === 'unarmed' || w.cls === 'cyber' ? 'cb_jab' : w.feel.lightAnim);

const DEFS: ExecDef[] = [
  { key: 'crush', sizes: [0], cls: null, dur: 1.5, dist: 0.45, beats: () => [
    { at: 0, anim: ['cb_stomp', 0.55], pose: 'd', cam: [0.35, 0.32, -8] },
    { at: 0.29, hit: 0.4, kind: 'blunt', snd: 'cb_stomp' },
    { at: 0.6, anim: ['cb_stomp', 0.6] },
    { at: 0.92, kill: 'gb', kind: 'blunt', snd: 'gore_burst', slow: [0.3, 500], word: 'CRUSHED' },
  ] },
  { key: 'pinStab', sizes: [0, 1], cls: ['blade', 'spear'], dur: 1.75, dist: 0.6, beats: (w) => [
    { at: 0, anim: ['cb_kick', 0.5], pose: 'd', cam: [0.4, 0.34, -10] },
    { at: 0.24, hit: 0.15, kind: 'blunt', snd: 'cb_stomp' },
    { at: 0.5, anim: ['cb_downstab', 1.2] },
    { at: 0.87, hit: 0.45, kind: w.hitKind, snd: 'gore_squelch' },
    { at: 1.3, kill: 'op', kind: w.hitKind, snd: 'gore_tear', slow: [0.3, 500], word: 'PINNED' },
  ] },
  { key: 'curbStomp', sizes: [1, 2], cls: BASH, dur: 2.0, dist: 0.6, beats: () => [
    { at: 0, anim: ['cb_kick', 0.55], pose: 'd', cam: [0.42, 0.36, -10] },
    { at: 0.25, hit: 0.2, kind: 'blunt', snd: 'cb_impact' },
    { at: 0.6, anim: ['cb_stomp', 0.5] },
    { at: 0.86, hit: 0.4, kind: 'blunt', snd: 'gore_bone_crack' },
    { at: 1.15, anim: ['cb_stomp', 0.55] },
    { at: 1.45, kill: 'hb', kind: 'blunt', snd: 'gore_burst', slow: [0.22, 650], cam: [-0.15, 0.42], word: 'CURB STOMP' },
  ] },
  { key: 'skewer', sizes: [1], cls: ['spear', 'blade'], dur: 2.2, dist: 0.75, beats: (w) => [
    { at: 0, anim: ['cb_lift', 1.6], cam: [0.5, 0.3, -6] },
    { at: 0.3, hit: 0.45, kind: w.hitKind, snd: 'gore_squelch' },
    { at: 0.55, pose: 'l' },
    { at: 1.2, hit: 0.2, kind: w.hitKind, snd: 'gore_wet_hit' },
    { at: 1.6, anim: ['cb_heavy', 0.5], pose: 'd' },
    { at: 1.8, kill: 'op', kind: w.hitKind, snd: 'gore_tear', slow: [0.25, 600], word: 'SKEWERED' },
  ] },
  { key: 'cleave', sizes: [1, 2], cls: CHOP, dur: 1.85, dist: 0.85, beats: (w) => [
    { at: 0, anim: ['cb_kick', 0.5], pose: 'd', cam: [0.3, 0.3, -8] },
    { at: 0.24, hit: 0.15, kind: 'blunt', snd: 'cb_impact' },
    { at: 0.55, anim: ['cb_charge', 0.45], snd: 'cb_charge', cam: [0.15, 0.42, -12] },
    { at: 1.0, anim: ['cb_heavy', 0.6], snd: 'cb_whoosh_big' },
    { at: 1.24, kill: w.cls === 'axe' ? 'bs' : 'hb', kind: w.cls === 'axe' ? 'axe' : 'blunt', snd: 'gore_burst', slow: [0.2, 700], word: w.cls === 'axe' ? 'CLEAVED' : 'FLATTENED' },
  ] },
  { key: 'hamstringBehead', sizes: [2], cls: CUT, dur: 2.4, dist: 0.85, beats: (w) => [
    { at: 0, anim: [lightOf(w), 0.45], cam: [0.55, 0.34, -6] },
    { at: 0.2, sever: 'leg', kind: w.hitKind, snd: 'limb_rip' },
    { at: 0.25, pose: 'k' },
    { at: 0.7, anim: ['cb_charge', 0.5], snd: 'cb_charge' },
    { at: 1.2, anim: ['cb_heavy', 0.55], snd: 'cb_whoosh_big', cam: [-0.2, 0.45, -10] },
    { at: 1.42, kill: 'head', kind: w.hitKind, snd: 'gore_tear', slow: [0.2, 750], word: 'BEHEADED' },
  ] },
  { key: 'skullCave', sizes: [2], cls: ['blunt', 'heavy', 'improvised'], dur: 2.4, dist: 0.8, beats: () => [
    { at: 0, anim: ['swing', 0.45], cam: [0.5, 0.32, -6] },
    { at: 0.2, hit: 0.25, kind: 'blunt', snd: 'gore_bone_crack' },
    { at: 0.24, pose: 'k' },
    { at: 0.6, anim: ['smash', 0.85] },
    { at: 1.09, hit: 0.4, kind: 'blunt', snd: 'cb_impact' },
    { at: 1.45, anim: ['smash', 0.85], cam: [-0.15, 0.45, -12] },
    { at: 1.94, kill: 'hb', kind: 'blunt', snd: 'gore_burst', slow: [0.22, 650], word: 'CAVED IN' },
  ] },
  { key: 'impale', sizes: [2], cls: ['spear'], dur: 2.4, dist: 0.9, beats: () => [
    { at: 0, anim: ['cb_lift', 1.8], cam: [0.5, 0.3, -4] },
    { at: 0.3, hit: 0.4, kind: 'spear', snd: 'gore_squelch' },
    { at: 0.6, pose: 'l' },
    { at: 1.2, hit: 0.2, kind: 'spear', snd: 'gore_wet_hit' },
    { at: 1.85, anim: ['cb_heavy', 0.5], pose: 'd' },
    { at: 2.05, kill: 'op', kind: 'spear', snd: 'gore_tear', slow: [0.25, 600], word: 'IMPALED' },
  ] },
  { key: 'limbRip', sizes: [1, 2], cls: FISTS, dur: 2.6, dist: 0.5, beats: () => [
    { at: 0, anim: ['cb_rip', 1.4], pose: 's', cam: [0.45, 0.38, -8] },
    { at: 1.1, sever: 'arm', kind: 'bite', snd: 'limb_rip', slow: [0.35, 400] },
    { at: 1.45, anim: ['cb_kick', 0.55], pose: 'd' },
    { at: 1.7, hit: 0.25, kind: 'blunt', snd: 'cb_impact' },
    { at: 1.95, anim: ['cb_stomp', 0.55], cam: [-0.2, 0.44, -12] },
    { at: 2.25, kill: 'hb', kind: 'blunt', snd: 'gore_burst', slow: [0.22, 650], word: 'TORN APART' },
  ] },
  { key: 'topple', sizes: [3], cls: null, dur: 3.0, dist: 1.0, beats: (w) => [
    { at: 0, anim: [lightOf(w), 0.45], cam: [0.5, 0.25, -4] },
    { at: 0.2, sever: 'leg', kind: w.hitKind === 'unarmed' ? 'blunt' : w.hitKind, snd: 'limb_rip' },
    { at: 0.55, anim: [lightOf(w), 0.45] },
    { at: 0.75, hit: 0.2, kind: w.hitKind, snd: 'cb_impact', pose: 'd' },
    { at: 1.1, anim: ['cb_leap', 0.8], to: 0.25, cam: [0.2, 0.4, -14] },
    { at: 1.9, anim: ['cb_downstab', 1.0] },
    { at: 2.21, hit: 0.35, kind: w.hitKind, snd: 'gore_squelch' },
    { at: 2.57, kill: BASH.includes(w.cls) ? 'hb' : 'head', kind: w.hitKind, snd: 'gore_burst', slow: [0.2, 800], word: 'FELLED' },
  ] },
];

/** the combo finisher on something on the floor: push, ground, stomp... and this */
function groundFinish(w: Wielded): ExecDef {
  const thrust = w.cls === 'blade' || w.cls === 'spear';
  const fists = w.cls === 'unarmed' || w.cls === 'cyber';
  const beats: Beat[] = thrust ? [
    { at: 0, anim: ['cb_downstab', 1.2], pose: 'd', cam: [0.4, 0.38, -12] },
    { at: 0.37, hit: 0.4, kind: w.hitKind, snd: 'gore_squelch' },
    { at: 0.8, kill: w.cls === 'blade' ? 'head' : 'op', kind: w.hitKind, snd: 'gore_tear', slow: [0.22, 650], word: 'FINISHED' },
  ] : fists ? [
    { at: 0, anim: ['cb_stomp', 0.55], pose: 'd', cam: [0.4, 0.38, -12] },
    { at: 0.3, kill: 'hb', kind: 'blunt', snd: 'gore_burst', slow: [0.22, 650], word: 'FINISHED' },
  ] : [
    { at: 0, anim: ['cb_slash', 0.62], pose: 'd', cam: [0.4, 0.38, -12] },
    { at: 0.29, kill: w.cls === 'axe' ? 'bs' : 'hb', kind: w.hitKind, snd: 'gore_burst', slow: [0.22, 650], word: 'FINISHED' },
  ];
  return { key: 'groundFinish', sizes: [0, 1, 2, 3], cls: null, dur: thrust ? 1.25 : 0.95, dist: 0.6, beats: () => beats };
}

export function pickExec(c: Creature, w: Wielded, combo = false): ExecDef {
  if (combo) return groundFinish(w);
  const size = sizeClass(c);
  const fits = DEFS.filter((d) => d.sizes.includes(size) && (!d.cls || d.cls.includes(w.cls)));
  // the generic one for the size if nothing class-specific fits
  const pool = fits.length ? fits : DEFS.filter((d) => d.sizes.includes(size) && (d.key === 'curbStomp' || d.key === 'crush' || d.key === 'topple'));
  const specific = pool.filter((d) => d.cls);
  const from = specific.length && Math.random() < 0.8 ? specific : pool;
  return from[Math.floor(Math.random() * from.length)] ?? DEFS[0];
}

interface Running { def: ExecDef; beats: Beat[]; c: Creature; w: Wielded; t: number; bi: number; dir: number; dist: number; yaw: number; killed: boolean }

export class Executions {
  cur: Running | null = null;
  /** for tests: the last finished execution */
  last: { key: string; id: string; killed: boolean } | null = null;

  get active() { return !!this.cur; }

  start(p: Player, c: Creature, w: Wielded, combo = false): string | null {
    if (this.cur || c.dead || !killable(c)) return null;
    const def = pickExec(c, w, combo);
    const dir = Math.atan2(c.z - p.z, c.x - p.x);
    this.cur = { def, beats: def.beats(w), c, w, t: 0, bi: 0, dir, dist: def.dist + c.radius, yaw: 0, killed: false };
    p.actions.clear();
    p.stopAnim();
    (p as any).cbIframe = G.time + def.dur + 0.4;
    cbOp({ t: 'exec', id: c.id, by: p.id, dur: def.dur + 0.6, pose: 'x' });
    flag(c, 'cbx', 'x');
    G.audio?.at?.('cb_exec', p.x, p.z, 0.9);
    hitstop(70); punch(0.06, 0.25);
    bus.emit('executionStart', p, c, def.key);
    return def.key;
  }

  update(dt: number, p: Player, marks: Marks) {
    const e = this.cur; if (!e) return;
    e.t += dt;
    const c = e.c;
    // hold the survivor in place at the right distance, facing it
    const tx = c.x - Math.cos(e.dir) * e.dist, tz = c.z - Math.sin(e.dir) * e.dist;
    const z = G.getZone(p.zoneKey);
    const k = 1 - Math.exp(-12 * dt);
    moveCircle(z, p, (tx - p.x) * k, (tz - p.z) * k, { ignoreLow: false });
    p.vx = p.vz = 0; p.speed = 0; p.running = false;
    p.facing = p.targetFacing = Math.atan2(c.z - p.z, c.x - p.x);
    while (e.bi < e.beats.length && e.t >= e.beats[e.bi].at) this.fire(e, e.beats[e.bi++], p, marks);
    if (e.t >= e.def.dur || p.body.dead) this.end(p);
  }

  private fire(e: Running, b: Beat, p: Player, marks: Marks) {
    const c = e.c;
    const kind = b.kind || e.w.hitKind;
    const dx = c.x - p.x, dz = c.z - p.z;
    if (b.anim) p.playAnim(b.anim[0], b.anim[1]);
    if (b.to !== undefined) e.dist = b.to + c.radius * 0.5;
    if (b.pose) { cbOp({ t: 'pose', id: c.id, pose: b.pose }); flag(c, 'cbx', b.pose); }
    if (b.cam) {
      const [yaw, push, pitch] = b.cam;
      const side = e.yaw === 0 ? (Math.random() < 0.5 ? 1 : -1) : Math.sign(e.yaw);
      G.camera?.orbitBy?.(yaw * side, 0); e.yaw += yaw * side;
      G.camera?.pushIn?.(push, 0.35, pitch ?? -8);
    }
    if (b.snd) G.audio?.at?.(b.snd, c.x, c.z, 1);
    const impact = (big: number) => {
      hitstop(60 + big * 40); shake(0.35 + big * 0.35, 0.3); punch(0.04 + big * 0.05, 0.22); kick(dx, dz, 0.15 + big * 0.2);
      flinch(c, dx, dz, 0.8 + big);
      G.pointLight(c.x, c.y + c.height * 0.6, c.z, 0xffd0a0, 1.0 + big * 0.8, 3);
      G.gore?.lensNear?.(c.x, c.z, 0.25 + big * 0.35);
      G.audio?.hit?.(kind === 'unarmed' ? 'blunt' : kind, c.x, c.z, big > 0.5);
    };
    if (b.hit && !c.dead) {
      // a blow that leaves it alive for the finish
      const dmg = Math.max(1, Math.min(c.sp.hp * b.hit, c.hp - 1));
      G.combat?.dealCreature?.(p, c, { dmg, kind, knock: 0.04, crit: true, po: 0 });
      impact(0.4);
    }
    if (b.sever && !c.dead) {
      cbOp({ t: 'sev', id: c.id, role: b.sever, k: kind === 'unarmed' ? 'axe' : kind, fx: p.x, fz: p.z, by: p.id });
      impact(0.8);
    }
    if (b.kill) {
      if (!c.dead) cbOp({ t: 'kill', id: c.id, by: p.id, k: kind === 'unarmed' ? 'blunt' : kind, dmg: Math.max(20, c.sp.hp), fx: p.x, fz: p.z, f: b.kill });
      e.killed = true;
      impact(1.2);
      shake(0.9, 0.5);
      p.body.addXp(e.w.cls === 'blade' || e.w.cls === 'axe' ? 'blade' : e.w.cls === 'spear' ? 'spear' : 'blunt', 12);
      p.body.addXp('strength', 3);
    }
    if (b.slow) slowmo(b.slow[0], b.slow[1]);
    if (b.word) marks.float(b.word, c.x, c.y + Math.min(2.4, c.height + 0.4), c.z, 0xff4a30, 1.4, 1.3);
  }

  end(p: Player) {
    const e = this.cur; if (!e) return;
    this.cur = null;
    if (e.yaw) { G.camera?.orbitBy?.(-e.yaw, 0); G.camera?.endOrbit?.(); }
    G.camera?.pushIn?.(0, 0.6);
    if (!e.c.dead) cbOp({ t: 'free', id: e.c.id });
    if (!e.c.dead) flag(e.c, 'cbx', 0);
    p.stopAnim();
    this.last = { key: e.def.key, id: e.c.id, killed: e.killed || e.c.dead };
    bus.emit('execution', p, e.c, e.def.key);
  }
}
