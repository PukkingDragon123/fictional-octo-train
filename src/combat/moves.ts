// Weapon classes and the move table: how each class of thing in your hand
// feels (speed, reach, arc, charge time, poise damage, what it does to
// flesh) and what every move costs. Tuning lives here.
import { G } from '../game/G';
import type { Player } from '../entities/player';
import { itemDef, type Item, type WeaponProps } from '../items/item';

export type WClass = 'unarmed' | 'blade' | 'blunt' | 'axe' | 'spear' | 'heavy' | 'improvised' | 'cyber';

export interface ClassFeel {
  /** seconds per light strike (before weapon speed and skill) */
  light: number;
  /** player anim for a light strike */
  lightAnim: string;
  /** seconds to a full charge */
  chargeT: number;
  /** heavy damage multiplier at full charge */
  heavyMul: number;
  /** heavy release strike length */
  heavyDur: number;
  /** sprint-lunge damage multiplier */
  lungeMul: number;
  /** extra reach over the item's range */
  reach: number;
  /** half-angle of the swing arc (radians) */
  arc: number;
  /** poise damage multiplier (stagger / knockdown) */
  poise: number;
  /** knockback multiplier */
  knock: number;
  /** most targets one swing can hit */
  multi: number;
  /** stamina per light strike (lung balloon) */
  stam: number;
  /** gore kind for the blood and dismemberment */
  hitKind: string;
  /** chance a finisher takes a limb or head */
  sever: number;
  label: string;
}

export const FEEL: Record<WClass, ClassFeel> = {
  unarmed: { light: 0.3, lightAnim: 'cb_jab', chargeT: 0.55, heavyMul: 2.3, heavyDur: 0.42, lungeMul: 1.4, reach: 0, arc: 0.9, poise: 1.0, knock: 1.0, multi: 1, stam: 0.022, hitKind: 'unarmed', sever: 0.15, label: 'fists' },
  blade: { light: 0.3, lightAnim: 'swing', chargeT: 0.6, heavyMul: 2.1, heavyDur: 0.4, lungeMul: 2.4, reach: 0.05, arc: 0.65, poise: 0.65, knock: 0.6, multi: 1, stam: 0.022, hitKind: 'blade', sever: 0.85, label: 'blade' },
  blunt: { light: 0.42, lightAnim: 'swing', chargeT: 0.85, heavyMul: 2.4, heavyDur: 0.5, lungeMul: 1.5, reach: 0.1, arc: 1.0, poise: 1.5, knock: 1.3, multi: 2, stam: 0.032, hitKind: 'blunt', sever: 0.3, label: 'blunt' },
  axe: { light: 0.55, lightAnim: 'swing2h', chargeT: 1.0, heavyMul: 2.6, heavyDur: 0.58, lungeMul: 1.7, reach: 0.1, arc: 0.9, poise: 1.6, knock: 1.2, multi: 2, stam: 0.05, hitKind: 'axe', sever: 1, label: 'axe' },
  spear: { light: 0.45, lightAnim: 'stab', chargeT: 0.8, heavyMul: 2.2, heavyDur: 0.46, lungeMul: 2.7, reach: 0.4, arc: 0.4, poise: 1.0, knock: 1.1, multi: 2, stam: 0.035, hitKind: 'spear', sever: 0.4, label: 'spear' },
  heavy: { light: 0.7, lightAnim: 'swing2h', chargeT: 1.25, heavyMul: 2.8, heavyDur: 0.72, lungeMul: 1.6, reach: 0.15, arc: 1.15, poise: 2.6, knock: 1.8, multi: 3, stam: 0.07, hitKind: 'blunt', sever: 0.6, label: 'heavy' },
  improvised: { light: 0.48, lightAnim: 'swing', chargeT: 0.8, heavyMul: 2.0, heavyDur: 0.5, lungeMul: 1.3, reach: 0, arc: 0.95, poise: 1.1, knock: 1.0, multi: 1, stam: 0.035, hitKind: 'blunt', sever: 0.2, label: 'improvised' },
  cyber: { light: 0.26, lightAnim: 'cb_jab', chargeT: 0.6, heavyMul: 2.9, heavyDur: 0.42, lungeMul: 2.0, reach: 0.1, arc: 0.9, poise: 2.2, knock: 1.9, multi: 2, stam: 0.02, hitKind: 'blunt', sever: 0.9, label: 'cyber limbs' },
};

/**
 * What cyberware does to a fight. The cyberware agent implements
 * `G.cyber.combat(p)` (optional): return null for nothing, or overrides.
 * `cls: 'cyber'` turns empty hands into augmented limbs; `hitKind: 'blade'`
 * makes them cut (arm blades); the multipliers scale everything.
 */
export interface CyberCombat { cls?: WClass; hitKind?: string; dmgMul?: number; speedMul?: number; poiseMul?: number; stamMul?: number; label?: string }

const UNARMED: WeaponProps = { kind: 'unarmed', dmg: [2, 4], range: 0.85, speed: 1.6, endurance: 0.03, crit: 0.05, knock: 0.4, durability: 1, noise: 4 };

export interface Wielded {
  it: Item | null;
  w: WeaponProps;
  armed: boolean;
  cls: WClass;
  feel: ClassFeel;
  /** combined damage / speed / poise multipliers from cyberware */
  dmgMul: number; speedMul: number; poiseMul: number; stamMul: number;
  hitKind: string;
  /** a gun or a throwable: those keep their own verbs */
  ranged: boolean;
}

/** what the survivor is fighting with right now */
export function wielded(p: Player): Wielded {
  const it = p.handR;
  const d = it ? itemDef(it.key) : null;
  let w: WeaponProps = d?.weapon || UNARMED;
  let cls: WClass;
  if (!it) cls = 'unarmed';
  else if (!d?.weapon) {
    // anything you can lift is a weapon if you swing it hard enough
    const kg = Math.max(0.1, d?.weight ?? 0.5);
    w = { kind: 'blunt', dmg: [Math.min(6, 1 + kg * 1.1), Math.min(10, 2 + kg * 1.8)], range: 0.95, speed: Math.max(0.7, 1.5 - kg * 0.12), endurance: 0.03 + kg * 0.008, crit: 0.05, knock: Math.min(0.8, 0.25 + kg * 0.08), durability: 12, noise: 5 };
    cls = 'improvised';
  } else if (w.kind === 'blade') cls = 'blade';
  else if (w.kind === 'axe') cls = 'axe';
  else if (w.kind === 'spear') cls = 'spear';
  else if (w.kind === 'blunt') cls = (w.twoHanded && (w.dmg[1] >= 10 || w.speed <= 1.0)) || (d as any)?.heavy ? 'heavy' : 'blunt';
  else cls = 'unarmed';
  let dmgMul = 1, speedMul = 1, poiseMul = 1, stamMul = 1, hitKind = '';
  let cy: CyberCombat | null = null;
  try { cy = (G as any).cyber?.combat?.(p) ?? null; } catch { cy = null; }
  if (cy) {
    if (cls === 'unarmed' && cy.cls) cls = cy.cls;
    dmgMul *= cy.dmgMul ?? 1; speedMul *= cy.speedMul ?? 1; poiseMul *= cy.poiseMul ?? 1; stamMul *= cy.stamMul ?? 1;
    if (cy.hitKind && (cls === 'cyber' || cls === 'unarmed')) hitKind = cy.hitKind;
  }
  if (cls === 'cyber' && w === UNARMED) w = { ...UNARMED, dmg: [5, 9], range: 0.95, knock: 0.7 };
  const feel = FEEL[cls];
  return { it, w, armed: !!d?.weapon, cls, feel, dmgMul, speedMul, poiseMul, stamMul, hitKind: hitKind || (w.kind === 'unarmed' ? 'unarmed' : feel.hitKind === 'blunt' && w.kind !== 'blunt' ? w.kind : feel.hitKind), ranged: w.kind === 'firearm' || w.kind === 'thrown' };
}

// ------------------------------------------------------------------ the moves
export type MoveKind = 'light' | 'heavy' | 'lunge' | 'shove' | 'tackle' | 'stomp' | 'slash' | 'jab' | 'flurryEnd' | 'dodge';

export interface MoveSpec {
  /** fraction of the move when the blow lands */
  hitAt: number;
  /** damage multiplier on the weapon's roll */
  dmg: number;
  /** poise damage (before class multiplier) */
  poise: number;
  /** knockback */
  knock: number;
  /** stamina (lung balloon) */
  stam: number;
  /** forward step during the move (metres) */
  step: number;
  /** hitstop on contact (ms) */
  stop: number;
  /** camera trauma on contact */
  shake: number;
}

export const MOVES: Record<MoveKind, MoveSpec> = {
  light: { hitAt: 0.42, dmg: 1, poise: 12, knock: 0.35, stam: 1, step: 0.18, stop: 38, shake: 0.18 },
  jab: { hitAt: 0.45, dmg: 0.5, poise: 7, knock: 0.25, stam: 0.45, step: 0.06, stop: 22, shake: 0.1 },
  flurryEnd: { hitAt: 0.38, dmg: 1.9, poise: 45, knock: 1.6, stam: 1.2, step: 0.35, stop: 85, shake: 0.55 },
  heavy: { hitAt: 0.4, dmg: 1, poise: 34, knock: 1.4, stam: 2.4, step: 0.45, stop: 75, shake: 0.5 },
  lunge: { hitAt: 0.45, dmg: 1, poise: 30, knock: 1.6, stam: 0.09, step: 2.3, stop: 70, shake: 0.45 },
  shove: { hitAt: 0.3, dmg: 0.4, poise: 26, knock: 1.4, stam: 0.04, step: 0.25, stop: 45, shake: 0.25 },
  tackle: { hitAt: 0.35, dmg: 0.7, poise: 60, knock: 2.2, stam: 0.1, step: 1.6, stop: 80, shake: 0.55 },
  stomp: { hitAt: 0.53, dmg: 1.6, poise: 20, knock: 0.1, stam: 0.05, step: 0.15, stop: 90, shake: 0.6 },
  slash: { hitAt: 0.46, dmg: 2.2, poise: 30, knock: 0.3, stam: 1.3, step: 0.2, stop: 80, shake: 0.5 },
  dodge: { hitAt: 0, dmg: 0, poise: 0, knock: 0, stam: 0.075, step: 1.55, stop: 0, shake: 0 },
};

/** how big a thing is, for finishers and knockdowns: 0 tiny, 1 small, 2 man-sized, 3 big */
export function sizeClass(c: { sp: { height: number; hp: number }; radius: number }): 0 | 1 | 2 | 3 {
  const h = c.sp.height, r = c.radius;
  if (h < 0.6 || c.sp.hp <= 15) return 0;
  if (h < 1.25) return 1;
  if (h > 2.45 || r > 0.6) return 3;
  return 2;
}

/** poise a creature has before it staggers (scales with its size and health) */
export function poiseOf(c: { sp: { height: number; hp: number }; radius: number }): number {
  const s = sizeClass(c);
  return [14, 30, 52, 95][s] + Math.min(60, c.sp.hp * 0.15);
}
