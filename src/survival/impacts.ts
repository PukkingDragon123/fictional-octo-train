// What the world does back to the body when the body hits it (round 20).
// Everything lands in the one injury model (Body.addInjury, per body part);
// this only decides which part, what kind of wound and how bad:
//
//   bareStrike   a fist (or a foot) on something hard. Plaster bruises the
//                knuckles, brick and concrete split them, metal splits them
//                and can break the hand (a boxer's fracture, worse on a hand
//                that is already sore or broken); glass cuts and can leave a
//                shard. Gloves take some of it. A broken hand swung again
//                hurts like nothing else.
//   fallImpact   the body hits the floor: on the front it lands on its hands
//                and knees (scraped palms, bruised knees, a wrist that can
//                break on a hard fall), on the back the hips, the spine and the
//                head take it; a heavy fall can crack a shin or an ankle.
//   cuts bleed through the model's own bleed rates (INJURY_INFO).
//
// The hands also get a status of their own on the body console's moodle tray
// ('hands': sore, split knuckles, broken), and the health check
// (src/ui/body/health3d.ts) shows each of these on the unit's own body.
import { G } from '../game/G';
import { bus } from '../core/events';
import type { Player } from '../entities/player';
import type { BodyPart } from '../items/item';
import { itemDef } from '../items/item';
import type { Body, Injury, Moodle } from './body';
import { MOODLE_HOOKS } from './body';

/** how hard a thing is to the hand */
export type Surface = 'soft' | 'wood' | 'plaster' | 'stone' | 'metal' | 'glass';
const HARD: Record<Surface, number> = { soft: 0, wood: 0.45, plaster: 0.55, stone: 0.9, metal: 1, glass: 0.7 };

/** a furniture material (src/world/debris.ts Mat) as the hand meets it */
export function surfaceOfMat(m: string): Surface {
  switch (m) {
    case 'metal': case 'elec': return 'metal';
    case 'ceramic': return 'stone';
    case 'glass': return 'glass';
    case 'wood': case 'plastic': return 'wood';
    default: return 'soft';
  }
}
/** a wall by its sound (src/world/defs.ts WallDef.sound) */
export function surfaceOfWall(sound: string | undefined): Surface {
  return sound === 'concrete' ? 'stone' : sound === 'metal' ? 'metal' : sound === 'glass' ? 'glass' : sound === 'wood' ? 'wood' : 'plaster';
}

/** 0..0.7: what the gloves (or boots) on a part take off a blow */
function guard(p: Player, part: BodyPart): number {
  let best = 0;
  for (const it of p.worn.values()) {
    const c = itemDef(it.key).clothing;
    if (!c?.covers?.includes(part)) continue;
    best = Math.max(best, Math.min(0.7, ((c.scratch ?? 0) + (c.bite ?? 0) * 0.5) / 45));
  }
  return best;
}

const rnd = Math.random;
let thinkAt = 0;
function think(p: Player, lines: string[], gap = 6) {
  if (!p.isLocal || G.time - thinkAt < gap) return;
  thinkAt = G.time;
  bus.emit('think', p, lines[Math.floor(rnd() * lines.length)]);
}
function sound(p: Player, key: string, vol: number) { try { G.audio?.at?.(key, p.x, p.z, vol); } catch { /* no audio */ } }

/** how hurt a part already is (0..1): bruises and breaks that are still fresh */
function sore(b: Body, part: BodyPart): number {
  let s = 0;
  for (const i of b.parts[part].injuries) s += (i.type === 'fracture' ? 1 : i.type === 'bruise' ? i.sev : i.sev * 0.5) * (1 - i.heal);
  return Math.min(1, s);
}

/**
 * A bare fist (or a kick) on something. `force` ~1 a normal swing, up to ~2 a
 * full heavy one. Returns the worst wound it left (or null).
 */
export function bareStrike(p: Player, surf: Surface, o: { force?: number; hand?: 'L' | 'R'; kick?: boolean } = {}): Injury | null {
  const b = p.body;
  if (b.dead) return null;
  const H = HARD[surf];
  if (H <= 0) return null;
  const F = Math.max(0.4, Math.min(2.2, o.force ?? 1));
  if (o.kick) return kickInto(p, surf, H, F);
  // which fist: the free one (the right unless it is gone or full)
  let side: 'l' | 'r' = o.hand ? (o.hand === 'L' ? 'l' : 'r') : 'r';
  if (b.isSevered(`hand_${side}` as BodyPart)) side = side === 'r' ? 'l' : 'r';
  const hand = `hand_${side}` as BodyPart;
  if (b.isSevered(hand)) return null;
  const g = guard(p, hand);
  const before = sore(b, hand);
  const broken = b.parts[hand].injuries.some((i) => i.type === 'fracture' && i.heal < 0.6);
  let worst: Injury | null = null;
  const keep = (i: Injury | null) => { if (i && (!worst || rank(i) > rank(worst))) worst = i; return i; };
  // a broken hand swung into anything: white pain
  if (broken) {
    keep(b.addInjury(hand, 'bruise', 0.3 + 0.2 * F));
    b.panic = Math.min(100, b.panic + 18);
    sound(p, 'gore_bone_crack', 0.35);
    think(p, ['AAH— my hand. My hand is broken.', 'Stupid. It\'s broken. Stop hitting things with it.', 'The bones grind. I felt them grind.'], 2.5);
  }
  if (surf === 'glass') {
    // a fist through glass: cut knuckles and wrist, a shard left in it now and then
    const cut = keep(b.addInjury(hand, rnd() < 0.35 ? 'glass' : 'laceration', Math.min(1, (0.3 + rnd() * 0.25) * F * (1 - g)), { dirty: true }));
    if (rnd() < 0.3 * F * (1 - g)) keep(b.addInjury(`farm_${side}` as BodyPart, 'laceration', 0.25 + rnd() * 0.2, { dirty: true }));
    if (cut) think(p, ['Glass. Glass in my knuckles.', 'Cut myself open on it.'], 5);
    return worst;
  }
  // bruised knuckles: most blows on anything hard
  if (rnd() < H * (0.5 + 0.25 * F) * (1 - g)) keep(b.addInjury(hand, 'bruise', Math.min(0.9, 0.1 + 0.22 * H * F + rnd() * 0.12 + before * 0.15)));
  // split knuckles: the skin over them bursts on brick, concrete and steel
  if (H >= 0.5 && rnd() < (H - 0.35) * 0.55 * F * (1 - g * 1.4)) {
    const k = b.addInjury(hand, H >= 0.9 ? 'laceration' : 'scratch', Math.min(0.6, 0.15 + 0.15 * H * F + rnd() * 0.1), { dirty: true });
    // knuckle skin bleeds, but it is not an artery
    k.bleed = Math.min(k.bleed, 0.12 + 0.1 * H);
    (k as Injury & { cause?: string }).cause = 'knuckles';
    keep(k);
    sound(p, 'gore_wet_hit', 0.25);
    think(p, ['My knuckles split open.', 'Ow. Ow. That opened my knuckles.', 'Skin\'s gone off my knuckles.'], 8);
  }
  // a boxer's fracture: the hand gives before the steel does
  const fx = (surf === 'metal' ? 0.05 : surf === 'stone' ? 0.03 : 0.004) * F * F * (1 - g) * (1 + before * 2.5);
  if (!broken && rnd() < fx) {
    keep(b.addInjury(hand, 'fracture', 0.35 + rnd() * 0.25 + (F - 1) * 0.1));
    b.panic = Math.min(100, b.panic + 12);
    sound(p, 'gore_bone_crack', 0.6);
    think(p, ['Something in my hand cracked.', 'I heard it break. I heard my hand break.', 'That\'s broken. That\'s broken.'], 1);
  } else if (!broken && worst) think(p, surf === 'metal' ? ['Steel doesn\'t give. My hand does.', 'Punching metal. Great idea.'] : ['That hurt more than it hurt the wall.', 'My hand…'], 9);
  return worst;
}

function kickInto(p: Player, surf: Surface, H: number, F: number): Injury | null {
  const b = p.body;
  const side: 'l' | 'r' = b.isSevered('foot_r') ? 'l' : 'r';
  const foot = `foot_${side}` as BodyPart;
  if (b.isSevered(foot)) return null;
  const g = guard(p, foot);
  let worst: Injury | null = null;
  if (surf === 'glass') return rnd() < 0.4 * (1 - g) ? b.addInjury(rnd() < 0.5 ? foot : `shin_${side}` as BodyPart, 'laceration', 0.3, { dirty: true }) : null;
  if (rnd() < H * 0.35 * F * (1 - g)) worst = b.addInjury(rnd() < 0.6 ? foot : `shin_${side}` as BodyPart, 'bruise', 0.15 + 0.2 * H * F);
  // a stubbed, broken toe on steel in soft shoes
  if (surf === 'metal' && rnd() < 0.015 * F * (1 - g)) { worst = b.addInjury(foot, 'fracture', 0.3); sound(p, 'gore_bone_crack', 0.4); think(p, ['My foot— something went in my foot.'], 1); }
  return worst;
}

/**
 * The body hit the floor. how: 'front' (pitched forward: hands and knees), 'back' (thrown
 * down: hips, back, the back of the head); strength 0..1.5 (how hard), speed m/s.
 */
export function fallImpact(p: Player, how: 'front' | 'back', strength: number, speed = 0): Injury | null {
  const b = p.body;
  if (b.dead) return null;
  const k = Math.max(0.2, Math.min(1.6, strength + Math.max(0, speed - 3) * 0.12 + (b.endurance < 0.1 ? 0.15 : 0)));
  let worst: Injury | null = null;
  const hit = (part: BodyPart, type: Injury['type'], sev: number, dirty = false) => {
    if (b.isSevered(part)) return null;
    const i = b.addInjury(part, type, Math.min(1, sev), { dirty });
    if (!worst || rank(i) > rank(worst)) worst = i;
    return i;
  };
  const side = rnd() < 0.5 ? 'l' : 'r', other = side === 'l' ? 'r' : 'l';
  if (how === 'front') {
    // the hands go out to catch it: scraped palms, a jarred wrist; the knees hit next
    if (rnd() < 0.55 * k) { const s = hit(`hand_${side}` as BodyPart, 'scratch', 0.12 + 0.12 * k, true); if (s) s.bleed = Math.min(s.bleed, 0.06); }
    if (rnd() < 0.6 * k) hit(`shin_${side}` as BodyPart, 'bruise', 0.15 + 0.2 * k);
    if (rnd() < 0.35 * k) hit(`shin_${other}` as BodyPart, 'bruise', 0.12 + 0.15 * k);
    if (rnd() < 0.25 * k) hit(`farm_${side}` as BodyPart, 'bruise', 0.12 + 0.15 * k);
    // a hard fall onto an outstretched hand breaks the wrist
    if (k > 0.75 && rnd() < 0.05 * k) { hit(`farm_${side}` as BodyPart, 'fracture', 0.4); sound(p, 'gore_bone_crack', 0.5); think(p, ['I landed on my wrist. It\'s wrong. It bends wrong.'], 1); }
  } else {
    if (rnd() < 0.55 * k) hit(rnd() < 0.5 ? 'torso_l' : 'torso_u', 'bruise', 0.15 + 0.2 * k);
    if (rnd() < 0.3 * k) hit(`thigh_${side}` as BodyPart, 'bruise', 0.12 + 0.18 * k);
    if (rnd() < 0.18 * k) { hit('head', 'bruise', 0.15 + 0.2 * k); b.panic = Math.min(100, b.panic + 6); }
    if (rnd() < 0.25 * k) hit(`farm_${side}` as BodyPart, 'bruise', 0.1 + 0.12 * k);
  }
  // the legs: a twisted ankle, and on a really bad fall a cracked shin
  if (rnd() < 0.3 * k) hit(`foot_${side}` as BodyPart, 'bruise', 0.15 + 0.2 * k);
  if (k > 1 && rnd() < 0.03 * k) { hit(`shin_${side}` as BodyPart, 'fracture', 0.45); sound(p, 'gore_bone_crack', 0.55); think(p, ['My leg. I can\'t put weight on my leg.'], 1); }
  return worst;
}

function rank(i: Injury): number { return (i.type === 'fracture' ? 3 : i.type === 'bruise' ? 0 : i.type === 'scratch' ? 1 : 2) + i.sev * 0.5; }

// ---------------------------------------------------------------- the hands' own status (the console's moodle tray)
const HAND_NAMES = ['', 'Sore Hands', 'Bruised Knuckles', 'Split Knuckles', 'Broken Hand'];
const HAND_DESC = ['', 'Your knuckles ache. Fists hit softer.', 'Swollen knuckles. Every swing hurts.', 'The skin over your knuckles is split and bleeding.', 'A bone in your hand is broken: weak grip, every blow agony. Splint it.'];
function handsMoodle(b: Body, out: Moodle[]) {
  let lvl = 0;
  for (const part of ['hand_l', 'hand_r'] as BodyPart[]) for (const i of b.parts[part].injuries) {
    if (i.heal > 0.85) continue;
    const l = i.type === 'fracture' ? 4 : i.type === 'laceration' || i.type === 'scratch' || i.type === 'glass' ? (i.bandage ? 2 : 3) : i.type === 'bruise' ? (i.sev > 0.35 ? 2 : 1) : 2;
    lvl = Math.max(lvl, l);
  }
  if (lvl) out.push({ key: 'hands', name: HAND_NAMES[lvl], level: Math.min(4, lvl), desc: HAND_DESC[lvl] });
}
// registered once every module has loaded (the body model and this one import each other's neighbours)
setTimeout(() => { if (!MOODLE_HOOKS.includes(handsMoodle)) MOODLE_HOOKS.push(handsMoodle); }, 0);
