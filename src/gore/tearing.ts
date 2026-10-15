// Who tears what off whom. Per species: which of a survivor's limbs it goes
// for, how often a landed hit turns into a grab-and-rip, how long the victim
// is held before it comes away, and which of its own parts it needs to do it
// (a hound without its jaw does not tear anything). The other half of the
// file is what losing parts does to a creature that is still alive: missing
// legs slow it to a limp, a crawl, a drag; missing arms or jaw weaken or end
// its attack; a lost head kills most things (not mannequins or furniture).
//
// Part names come from each species' `gore` block (src/creatures/species/);
// they are matched by role (leg, arm, jaw, head) so this keeps working while
// species are rewritten. Creatures store lost parts in c.mem.severed.
import type { BodyPart } from '../items/item';
import type { SpeciesDef } from '../creatures/species';
import { goreOf } from './kinds';

export type TearVerb = 'bite' | 'crush' | 'wrench' | 'pull' | 'snap';
export interface TearDef {
  /** survivor parts it goes for (the cut is at the top of the part: everything below goes too) */
  parts: [BodyPart, number][];
  /** chance a landed hit becomes a tear (scaled by damage and how helpless the victim is) */
  chance: number;
  /** seconds the victim is held before the limb comes away */
  hold: number;
  verb: TearVerb;
  /** its own parts it tears with (regex on gore part names); if all of them are gone it cannot tear */
  with?: RegExp;
  /** the victim's last coherent thought */
  line: string;
}

const ARMS: [BodyPart, number][] = [['hand_l', 2], ['hand_r', 2], ['farm_l', 2], ['farm_r', 2], ['uarm_l', 1], ['uarm_r', 1]];
export const TEARS: Record<string, TearDef> = {
  // hounds worry hands and forearms until they come off
  grinhound: { parts: [['hand_l', 3], ['hand_r', 3], ['farm_l', 2], ['farm_r', 2]], chance: 0.09, hold: 1.4, verb: 'bite', with: /head|jaw/i, line: 'It has my arm— it has my ARM—' },
  goodboy: { parts: [['hand_l', 1], ['hand_r', 1]], chance: 0.004, hold: 1.2, verb: 'bite', with: /head|jaw/i, line: 'Bad dog— BAD—' },
  // the sofa folds shut on a leg and rips it out at the knee or the hip
  davenport: { parts: [['shin_l', 3], ['shin_r', 3], ['thigh_l', 1], ['thigh_r', 1], ['foot_l', 1], ['foot_r', 1]], chance: 0.1, hold: 1.7, verb: 'crush', line: 'The cushions— my leg is IN it—' },
  // the thing under the carpet takes feet
  underlay: { parts: [['foot_l', 5], ['foot_r', 5], ['shin_l', 1], ['shin_r', 1]], chance: 0.13, hold: 1.9, verb: 'pull', with: /arm/i, line: 'Something has my foot under the floor—' },
  // the drywall man wrenches an arm into the wall and keeps it
  drywall_man: { parts: ARMS, chance: 0.08, hold: 1.8, verb: 'wrench', with: /arm|hand/i, line: 'He is pulling it into the WALL—' },
  // the corridor leviathan rolls over legs and crushes them flat
  occupant: { parts: [['thigh_l', 2], ['thigh_r', 2], ['shin_l', 3], ['shin_r', 3], ['foot_l', 1], ['foot_r', 1]], chance: 0.14, hold: 1.1, verb: 'crush', line: 'It is ON me— my legs—' },
  // the rest, rarely
  echo: { parts: ARMS, chance: 0.04, hold: 1.5, verb: 'pull', with: /arm|fore/i, line: 'It is wearing my voice and pulling—' },
  employee: { parts: [['hand_l', 2], ['hand_r', 2], ['farm_l', 1], ['farm_r', 1]], chance: 0.04, hold: 1.2, verb: 'snap', with: /arm|hand/i, line: 'Its grip is plastic— it will not let go—' },
  swivel: { parts: [['foot_l', 1], ['foot_r', 1]], chance: 0.03, hold: 1.3, verb: 'bite', line: 'The wheels— my foot—' },
  lifeguard: { parts: [['foot_l', 2], ['foot_r', 2], ['shin_l', 1], ['shin_r', 1]], chance: 0.05, hold: 2.0, verb: 'pull', with: /arm|fore/i, line: 'It is dragging me under—' },
  hollow: { parts: [['hand_l', 1], ['hand_r', 1], ['farm_l', 1], ['farm_r', 1]], chance: 0.03, hold: 1.6, verb: 'pull', with: /arm/i, line: 'Let GO of me—' },
  ventling: { parts: [['hand_l', 1], ['hand_r', 1]], chance: 0.012, hold: 1.0, verb: 'bite', with: /head/i, line: 'My fingers— it took my—' },
  stilt_doe: { parts: [['uarm_l', 1], ['uarm_r', 1]], chance: 0.02, hold: 1.0, verb: 'snap', line: 'It kicked— my arm—' },
};
export const tearDef = (key: string): TearDef | null => TEARS[key] ?? null;

// ------------------------------------------------------------------ creatures losing parts
export type PartRole = 'leg' | 'arm' | 'jaw' | 'head' | 'tail' | 'other';
const LEG = /(leg|shin|thigh|foot|paw|hoof|calf)/i;
const ARM = /(arm|fore|hand|claw|pincer|wing)/i;
export function partRole(name: string, head?: string): PartRole {
  if (head && name === head) return 'head';
  if (/jaw|mouth|mandible/i.test(name)) return 'jaw';
  if (/^head/i.test(name)) return 'head';
  if (/tail/i.test(name)) return 'tail';
  if (LEG.test(name)) return 'leg';
  if (ARM.test(name)) return 'arm';
  return 'other';
}
/** which limb a part belongs to ('thighL' and 'shinL' are both limb 'L'; 'leg0' and 'shin0' are limb '0') */
export function limbId(name: string): string {
  const s = name.replace(/^(u|f)?(arm|fore|hand|claw|pincer|wing|leg|shin|thigh|foot|paw|hoof|calf)/i, '');
  return s || name;
}

/** things that keep going without a head */
export const HEADLESS_OK = new Set(['employee', 'davenport', 'swivel', 'plushkin', 'custodian', 'occupant', 'lamplighter']);

export interface CreatureLimbFx {
  /** movement multiplier */
  move: number;
  /** attack damage multiplier (0 = it can no longer hurt you) */
  atk: number;
  /** 0 walks, 1 limps / hobbles badly, 2 crawls and drags itself */
  crawl: 0 | 1 | 2;
  /** which side it favours (for a limp roll): -1 left, 1 right, 0 none */
  side: -1 | 0 | 1;
  /** can it still tear (has its jaw / arms) */
  canTear: boolean;
  legsLost: number; legs: number; armsLost: number; arms: number;
}

export function creatureLimbFx(sp: SpeciesDef, severed: readonly string[]): CreatureLimbFx {
  const gd = goreOf(sp);
  const names = gd.sever || [];
  const legs = new Set<string>(), arms = new Set<string>();
  const lostLegs = new Set<string>(), lostArms = new Set<string>();
  let jawLost = false;
  for (const n of names) {
    const r = partRole(n, gd.head);
    if (r === 'leg') legs.add(limbId(n)); else if (r === 'arm') arms.add(limbId(n));
  }
  for (const n of severed) {
    const r = partRole(n, gd.head);
    if (r === 'leg') lostLegs.add(limbId(n)); else if (r === 'arm') lostArms.add(limbId(n)); else if (r === 'jaw') jawLost = true;
  }
  const L = legs.size, LL = Math.min(L, lostLegs.size), A = arms.size, AL = Math.min(A, lostArms.size);
  let move = 1, crawl: 0 | 1 | 2 = 0;
  const flying = !!sp.flags?.flying;
  if (flying) {
    // a bird with no wings hops about on the floor
    if (A > 0 && AL >= 1) { move = AL >= A ? 0.25 : 0.55; crawl = AL >= A ? 2 : 1; }
  } else if (L > 0 && LL > 0) {
    if (L <= 2) { move = LL >= 2 ? 0.2 : 0.34; crawl = LL >= 2 ? 2 : 1; }
    else { const f = LL / L; move = f >= 0.75 ? 0.18 : f >= 0.5 ? 0.42 : 0.7; crawl = f >= 0.75 ? 2 : f >= 0.5 ? 1 : 0; }
  }
  // what it attacks with
  const bites = !!sp.attack?.kinds.includes('bite') || /head|jaw/i.test(TEARS[sp.key]?.with?.source ?? '');
  let atk = 1;
  if (A > 0 && AL > 0) atk *= 1 - (AL / A) * (bites ? 0.25 : 0.7);
  if (jawLost) atk *= bites ? 0.15 : 0.7;
  if (crawl === 2) atk *= 0.75;
  const tw = TEARS[sp.key]?.with;
  const tearParts = tw ? names.filter((n) => tw.test(n)) : [];
  const canTear = !tw || tearParts.length === 0 || tearParts.some((n) => !severed.includes(n));
  // limp toward the side that is missing more
  let side: -1 | 0 | 1 = 0;
  if (LL) { let l = 0, r = 0; for (const id of lostLegs) { if (/L|0|2/.test(id)) l++; else r++; } side = l > r ? -1 : r > l ? 1 : 0; }
  return { move, atk: Math.max(0, atk), crawl, side, canTear: canTear && atk > 0.3, legsLost: LL, legs: L, armsLost: AL, arms: A };
}
