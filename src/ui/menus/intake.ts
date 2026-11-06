// UNIT INTAKE: the creator, played in unit room 4 (room3d.ts) with the lights
// on. The unit hangs in the arms' grip and there are NO PAGES: tap a part of
// the unit and the camera flies to it; the part's tech screen opens right
// beside it, with a lead to the part (tap empty space, or Done, to go back out):
//   head      by where you tap: the face (shape, ears, wear), the eyes (lids,
//             iris, brows, eyewear, the optic), the nose and mouth (beard,
//             mask, the jaw), the hair (cut, colour, headgear), the marks
//   chest     the body: frame, build, height, skin, the suit design, dermal plate
//   neck      the chip sockets in the spine port, the spine, neck and back kit
//   each arm  flesh, or hardware: the arm, the hand
//   each leg  flesh, or hardware
// Designs (dyes, visors, helmets, masks, kit), chips and limbs are researched
// on the control room's main computer (src/game/unitTree.ts); only what is
// researched is offered here, and what is fitted stays fitted for every new
// unit (the Meridian file). ←/→ (the d-pad, a swipe, the wheel, the chevrons)
// browse and the model changes LIVE; ↑/↓ or a tap pick the line; Q / E step
// through the parts. A change is made for real by a robot tool (creator/ops.ts)
// in a mini-game (creator/qte.ts): saw, scalpel, laser, die stamp, clipper,
// spray nozzle, injector, clamp, welder, and the ceiling press for the frame;
// hardware is welded on, chips are seated by the injector. A clean job ends in
// a flourish, a botched one in a mishap; the change takes either way.
// Mini-games can be switched off ("just apply"); Esc / B / SKIP always just applies.
// Everyone wears the issue suit (prisonerOutfitFor is the one outfit path).
import { wornCos, setWornCos } from '../../game/meridian';
import { COSMETIC, wornIn, setWorn, type CosSlot } from '../../game/cosmetics';
import { CYBER_PARTS, cyberDef, SLOT_KIND, slotConflicts, type CyberSlot } from '../../survival/cyberParts';
import { fittedLimbs, fittedChips, setLimb, setChip, chipSockets, chipNodes, owned, rankOf, treeNodes, designOwned, limbOwned } from '../../game/unitTree';
import type { Appearance, Outfit } from '../../entities/humanRig';
import { randomAppearance, EYE_COLORS, SKIN_TONES } from '../../entities/humanRig';
import { Player } from '../../entities/player';
import { occupationByKey, type Occupation } from '../../survival/traits';
import { hasItemDef, itemDef } from '../../items/item';
import {
  FACE_SHAPES, EYE_SHAPES, BROWS, NOSES, MOUTHS, EARS, FACIAL_HAIR_ALL, HAIR_STYLES_ALL, HAIR_DYES,
  feetKitItems, randomLooks, suitNumber, shapeOf, eyeShapeOf, browsOf, noseOf, mouthOf, type Opt,
} from '../../entities/humanLooks';
import { h, esc, FocusNav, sfx } from './common';
import { SubjectRoom, type PartKey, type ShotName } from './room3d';
import { installRetroKit } from './retroKit';
import { G } from '../../game/G';
import { PRESETS } from './terms';
import { CONTRACT_SANDBOX } from '../../game/debt/defaults';
import { chipUrl, shortView } from './btnKit';
import { chevron, diamond } from './creator/sprites';
import { runOp, TOOL_NAME, type OpDef } from './creator/ops';
import { playGame, autoPlay, type Grade } from './creator/qte';
import './noir.css';
import './creator/creator.css';

export interface IntakeResult {
  name: string; app: Appearance; occupation: string; traits: string[];
  sandbox: Record<string, number>; seed: number; directives: boolean;
}

// ---------------------------------------------------------------- names
const FIRST = ['Robin', 'Sam', 'Alex', 'Jordan', 'Casey', 'Morgan', 'Riley', 'Quinn', 'Avery', 'Jamie', 'Dana', 'Lee', 'Noor', 'Emil', 'Ines', 'Tomas', 'Aiko', 'Ola', 'Mara', 'Felix', 'Rosa', 'Ivan', 'June', 'Theo',
  'Wren', 'Hollis', 'Marisol', 'Desmond', 'Priya', 'Kofi', 'Elena', 'Sven', 'Yusuf', 'Margot', 'Dale', 'Bea', 'Otis', 'Lena', 'Rafael', 'Hana', 'Cyril', 'Nell', 'Arturo', 'Signe', 'Cormac', 'Zofia', 'Ade', 'Pim'];
const LAST = ['Okonkwo', 'Varga', 'Lindqvist', 'Moreau', 'Halloran', 'Petrov', 'Nakamura', 'Silva', 'Brennan', 'Kowalski', 'Adeyemi', 'Haugen', 'Duarte', 'Novak', 'Reyes', 'Ferreira', 'Lund', 'Castell',
  'Ashdown', 'Pell', 'Marchetti', 'Osei', 'Whitlock', 'Szabo', 'Quintero', 'Abernathy', 'Kaur', 'Doyle', 'Vance', 'Tanaka', 'Mbeki', 'Sorensen', 'Greaves', 'Ibarra', 'Holm', 'Fairweather', 'Okafor', 'Rusk'];
const pickR = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
export function randomName() {
  const r = Math.random();
  if (r < 0.14) return `${pickR(FIRST)} ${String.fromCharCode(65 + Math.floor(Math.random() * 26))}. ${pickR(LAST)}`;
  return `${pickR(FIRST)} ${pickR(LAST)}`;
}

// ---------------------------------------------------------------- what the prisoner wears
const START_CLOTHES = ['tshirt', 'jeans', 'sneakers', 'socks'];
/** dress a throwaway Player-shaped object and read its Outfit (the game's own rules) */
function outfitOfItems(keys: string[]): { outfit: Outfit; held: string | null } {
  const fake: any = { worn: new Map(), handR: null, handL: null, lightItem: null, outfitDirty: false };
  const wear = (k: string) => { if (!hasItemDef(k)) return; try { Player.prototype.wear.call(fake, { uid: 0, key: k, cond: 1, age: 0 } as any); } catch { /* not wearable */ } };
  for (const k of keys) wear(k);
  let outfit: Outfit = {};
  try { outfit = Player.prototype.computeOutfit.call(fake); } catch { /* keep naked default */ }
  return { outfit, held: null };
}
/** the occupation's starting look (kept for other callers) */
export function outfitFor(occKey: string): { outfit: Outfit; held: string | null } {
  const o = occupationByKey(occKey) as Occupation & Record<string, any>;
  const clothes: string[] = (o.clothes || o.outfit || o.wear || START_CLOTHES).filter((k: string) => hasItemDef(k));
  return outfitOfItems([...clothes, ...o.items.filter((k) => hasItemDef(k) && (itemDef(k).clothing || itemDef(k).bag))]);
}
/** the issue suit the unit wears in the room (the first that exists), plus the chosen footwear. The one outfit path. */
export const ISSUE_SUITS = ['prison_jumpsuit', 'janitor_uniform'];
export function prisonerOutfitFor(app: Appearance, inspect = false): Outfit {
  const suit = ISSUE_SUITS.find((k) => hasItemDef(k));
  const keys = [...(suit ? [suit] : []), ...feetKitItems(app)];
  const { outfit } = outfitOfItems(keys);
  if (suit && suit !== 'prison_jumpsuit') for (const k of ['torso', 'legs'] as const) if (outfit[k]) outfit[k] = { ...outfit[k]!, color: 0xd9a826 };
  if ((app.feetKit ?? 'slipons') === 'slipons' && !hasItemDef('canvas_slipons')) outfit.feet = { tex: 'c_shoes_sneaker', color: 0xe4e0d4, item: 'slipons' };
  // examining the skin: the top half of the suit comes down
  if (inspect) outfit.torso = { tex: (app.bodyShape ?? 0.3) > 0.5 ? 'c_bandeau' : 'c_bare', color: 0xe8e4d8, sleeve: 'none' };
  return outfit;
}

// ---------------------------------------------------------------- the unit's fit, carried on the preview while it is worked
interface Fit { limbs: Partial<Record<CyberSlot, string>>; chips: string[] }
const fitOf = (a: Appearance): Fit => ((a as any).__fit as Fit) ?? { limbs: {}, chips: [] };
const withFit = (a: Appearance, f: Fit) => { (a as any).__fit = f; };
/** the look without the fit (what the rig and the save get) */
const lookOf = (a: Appearance): Appearance => { const { __fit, ...look } = a as any; void __fit; return look as Appearance; };
/** the unit as the unit room keeps it: the issue suit, the designs, the fitted limbs */
export function unitOutfit(app: Appearance, inspect = false, limbs?: Partial<Record<CyberSlot, string>>): Outfit {
  const o = prisonerOutfitFor(app, inspect);
  const l = limbs ?? fittedLimbs();
  return Object.keys(l).length ? { ...o, cond: { ...(o.cond || {}), cyber: { ...l } as Record<string, string> } } : o;
}

// ---------------------------------------------------------------- lines and zones
type Val = { name: string; chip?: number };
type Gradual = 'skin' | 'hair' | 'eye';
interface Line {
  id: string; label: string; list: () => Val[]; get: (a: Appearance) => number; set: (a: Appearance, i: number) => void;
  /** the close-up while this line is picked */
  shot: ShotName;
  /** how the change is made (the press is the frame) */
  op: OpDef | 'press';
  /** colour changes run gradually with the work */
  gradual?: Gradual;
  /** one more word under the value (research hints) */
  hint?: () => string;
  /** the change is part of the unit's permanent fit: saved as soon as it is operated */
  keep?: (a: Appearance) => void;
}
/** a part of the unit you can tap: its tech screen, its lines, where the camera and the tool go */
interface Zone { key: string; title: string; note: string; shot: ShotName; anchor: string; lines: Line[] }
const SKIN_ALL = [0xf8dcc8, ...SKIN_TONES, 0x4a2c1c];
const BUILDS: [string, string, number][] = [['wiry', 'Wiry', 58], ['slim', 'Slim', 64], ['average', 'Average', 75], ['broad', 'Broad', 86], ['stocky', 'Stocky', 92], ['heavy', 'Heavy', 108]];
const HEIGHTS = [0.92, 0.94, 0.96, 0.98, 1, 1.02, 1.04, 1.06, 1.08];
const opts = (l: Opt[]): Val[] => l.map((o) => ({ name: o.name }));
const FEM = 0.88, MASC = 0.1;
/** a tap on the head picks the zone by the nearest landmark */
const HEAD_PICK: [string, string][] = [['chin', 'face'], ['jaw', 'face'], ['ear', 'face'], ['eyes', 'eyes'], ['eyeR', 'eyes'], ['brows', 'eyes'], ['nose', 'mouth'], ['mouth', 'mouth'], ['cheek', 'marks'], ['forehead', 'hair'], ['scalp', 'hair'], ['temple', 'hair'], ['templeR', 'hair'], ['crown', 'hair']];
/** the zones that get a marker on the body in the overview */
const MARKED = ['hair', 'face', 'eyes', 'neck', 'body', 'armL', 'armR', 'legL', 'legR'];

/** a plain word for a colour: skin by depth, eyes and hair by hue */
function colourName(c: number, kind: 'skin' | 'eye' | 'hair'): string {
  const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let hue = 0;
  if (d) hue = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue *= 60;
  if (kind === 'skin') return l > 0.86 ? 'Porcelain' : l > 0.76 ? 'Fair' : l > 0.66 ? 'Light' : l > 0.54 ? 'Tan' : l > 0.42 ? 'Brown' : l > 0.28 ? 'Dark' : 'Deep';
  if (l < 0.13) return 'Black';
  if (sat < 0.14 || d < 0.06) return l > 0.82 ? 'White' : l > 0.55 ? 'Grey' : l > 0.3 ? 'Ash' : 'Charcoal';
  if (kind === 'eye') return hue < 40 ? (l < 0.35 ? 'Dark brown' : l < 0.5 ? 'Brown' : 'Amber') : hue < 70 ? 'Hazel' : hue < 165 ? 'Green' : hue < 260 ? (l > 0.6 ? 'Pale blue' : 'Blue') : 'Violet';
  if (hue < 18 || hue >= 340) return l < 0.4 ? 'Auburn' : 'Red';
  if (hue < 45) return l < 0.22 ? 'Dark brown' : l < 0.36 ? 'Brown' : l < 0.6 ? 'Copper' : 'Strawberry';
  if (hue < 70) return l < 0.5 ? 'Dirty blond' : l < 0.75 ? 'Blond' : 'Platinum';
  if (hue < 165) return 'Green';
  if (hue < 260) return 'Blue';
  return 'Pink';
}
const mixC = (a: number, b: number, t: number) => {
  const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/** mini-games on (play them) or off (the robot just applies) — remembered */
const GAMES_KEY = 'noclip.creator.games';
function gamesOn(): boolean { try { return localStorage.getItem(GAMES_KEY) !== '0'; } catch { return true; } }
function setGamesOn(v: boolean) { try { localStorage.setItem(GAMES_KEY, v ? '1' : '0'); } catch { /* private mode */ } }

/** show the intake; resolves with the processed unit or null if they went back to the dark */
export function intakeForm(opts0: { title?: string; sandbox?: boolean; directives?: boolean; submit?: string; room?: SubjectRoom; app?: Appearance; part?: PartKey } = {}): Promise<IntakeResult | null> {
  return new Promise((resolve) => {
    installRetroKit();
    const app: Appearance = opts0.app ? { ...opts0.app } : { ...randomAppearance(Math.random), ...randomLooks(Math.random, Math.random() < 0.5) };
    // the designs picked in the Meridian file (researched, or earned) go on at intake; the fitted chips and limbs come with them
    app.cos = wornCos();
    withFit(app, { limbs: fittedLimbs(), chips: fittedChips() });
    /** the look as operated so far (app is the live preview) */
    let done: Appearance = { ...app };
    const name = randomName();
    const sb: Record<string, number> = { ...CONTRACT_SANDBOX, ...((G?.sandbox as any) || {}), ...PRESETS.standard.s };
    const seed = Math.floor(Math.random() * 99999);
    const directives = opts0.directives ?? true;
    let phase: 'intro' | 'look' | 'out' = 'intro';
    let closing = false;
    let busy = false;
    let games = gamesOn();

    // ---------------- the room (the title's, or one of our own)
    let ownHost: HTMLElement | null = null;
    let room = opts0.room;
    if (!room) { ownHost = h('div', 'nx nx-stage nx-own'); document.body.append(ownHost); room = new SubjectRoom(ownHost); }
    const stage = room;
    const portrait = () => window.innerHeight > window.innerWidth * 1.05;
    let zone: Zone | null = null;
    // the subject sits off-centre so the part's screen has room beside it
    const frame = () => stage.setFraming(portrait() ? 0 : zone ? 0.2 : 0, portrait() ? 0.3 : 0.02);
    // the jumpsuit stays on; examining the skin brings the top half down
    const show = (a: Appearance) => { stage.setAppearance(lookOf(a)); stage.setOutfit(unitOutfit(lookOf(a), phase === 'look' && !!zone && cur()?.id === 'tone', fitOf(a).limbs)); };

    const shapeIndex = (a: Appearance) => {
      if (a.jaw != null) return a.jaw;
      const sh = shapeOf(a);
      return sh.jaw > 1.04 ? 6 : sh.jaw < 0.98 ? 4 : 0;
    };
    const fem = (a: Appearance) => (a.bodyShape ?? 0.3) > 0.5;

    // ---------------- designs: only what the research tree (or a commendation) has issued
    const designKeys = (slot: CosSlot): (string | null)[] => {
      const own = [...COSMETIC.values()].filter((c) => c.slot === slot && designOwned(c.key)).map((c) => c.key);
      return slot === 'suit' ? ['suit_std', ...own.filter((k) => k !== 'suit_std')] : [null, ...own];
    };
    const lockedDesigns = (slot: CosSlot) => treeNodes('design').filter((n) => n.cos && COSMETIC.get(n.cos)?.slot === slot && !rankOf(n)).length;
    const designLine = (slot: CosSlot, label: string, shot: ShotName, op: OpDef): Line => {
      const keys = designKeys(slot);
      return {
        id: 'cos_' + slot, label, shot, op,
        list: () => keys.map((k) => ({ name: k ? COSMETIC.get(k)!.name : 'None', chip: k ? COSMETIC.get(k)!.color : undefined })),
        get: (a) => Math.max(0, keys.indexOf(wornIn(a, slot))),
        set: (a, i) => { setWorn(a, slot, keys[i]); },
        hint: () => { const n = lockedDesigns(slot); return n ? `${n} more on the research tree` : ''; },
        keep: (a) => setWornCos((a.cos || []).filter((k) => k !== 'suit_std')),
      };
    };
    // ---------------- hardware: researched limbs, flesh first
    const limbKeys = (slot: CyberSlot): (string | null)[] => [null, ...CYBER_PARTS.filter((d) => d.kind === SLOT_KIND[slot] && limbOwned(d.key)).map((d) => d.key)];
    const lockedLimbs = (slot: CyberSlot) => CYBER_PARTS.filter((d) => d.kind === SLOT_KIND[slot] && !limbOwned(d.key)).length;
    const limbLine = (slot: CyberSlot, label: string, shot: ShotName, anchor: string): Line => {
      const keys = limbKeys(slot);
      return {
        id: 'hw_' + slot, label, shot,
        op: { tool: 'welder', anchor, game: 'rhythm', beats: 5, tempo: 112, verb: 'Weld', shot, does: 'takes the flesh off and welds the hardware to the socket' },
        list: () => keys.map((k) => ({ name: k ? cyberDef(k)!.name : 'Flesh', chip: k ? cyberDef(k)!.glow : undefined })),
        get: (a) => Math.max(0, keys.indexOf(fitOf(a).limbs[slot] ?? null)),
        set: (a, i) => {
          const f = fitOf(a), limbs = { ...f.limbs };
          const k = keys[i];
          if (k) { for (const c of slotConflicts(slot)) delete limbs[c]; limbs[slot] = k; } else delete limbs[slot];
          withFit(a, { ...f, limbs });
        },
        hint: () => { const k = keys.length > 1 ? '' : 'flesh only for now'; const n = lockedLimbs(slot); return [k, n ? `${n} more on the research tree` : ''].filter(Boolean).join(' · '); },
        keep: (a) => { const l = fitOf(a).limbs; for (const s of [slot, ...slotConflicts(slot)]) setLimb(s, l[s] ?? null); },
      };
    };
    // ---------------- chips: one per socket, seated in the spine port
    const chipKeys = (): (string | null)[] => [null, ...chipNodes().filter((n) => owned(n.key)).map((n) => n.key)];
    const chipName = (k: string | null) => { if (!k) return 'Empty'; const n = chipNodes().find((q) => q.key === k)!; const r = rankOf(n); return `${n.title}${r > 1 ? ' ' + 'I'.repeat(r) : ''}`; };
    const chipLine = (i: number): Line => {
      const keys = chipKeys();
      return {
        id: 'chip' + i, label: `Socket ${i + 1}`, shot: 'neck',
        op: { tool: 'injector', anchor: 'neck', game: 'hold', verb: 'Seat', shot: 'neck', does: 'seats the chip in the spine port' },
        list: () => keys.map((k) => ({ name: chipName(k), chip: k ? chipNodes().find((q) => q.key === k)!.chip!.color : undefined })),
        get: (a) => Math.max(0, keys.indexOf(fitOf(a).chips[i] ?? null)),
        set: (a, j) => {
          const f = fitOf(a), chips = [...f.chips];
          while (chips.length <= i) chips.push(null as any);
          const k = keys[j];
          // a chip lives in one socket: taking it here empties the other
          const other = k ? chips.indexOf(k) : -1;
          if (other >= 0 && other !== i) chips[other] = chips[i];
          chips[i] = k as any;
          withFit(a, { ...f, chips });
        },
        hint: () => { const n = chipNodes().filter((q) => !owned(q.key)).length; return keys.length > 1 ? (n ? `${n} more on the research tree` : '') : 'no chips researched yet'; },
        keep: (a) => { fitOf(a).chips.forEach((k, j) => setChip(j, k ?? null)); },
      };
    };

    // ---------------- every line, then the parts of the unit they belong to
    const L: Record<string, Line> = {
      frame: { id: 'frame', label: 'Frame', shot: 'full', op: 'press', list: () => [{ name: 'Female' }, { name: 'Male' }], get: (a) => (fem(a) ? 0 : 1), set: (a, i) => { a.bodyShape = i === 0 ? FEM : MASC; } },
      build: { id: 'build', label: 'Build', shot: 'full', list: () => BUILDS.map(([, l, kg]) => ({ name: `${l} · ${kg} kg` })), get: (a) => Math.max(0, BUILDS.findIndex((b) => b[0] === String(a.build))), set: (a, i) => { (a as any).build = BUILDS[i][0]; },
        op: { tool: 'clamp', anchor: 'chest', game: 'rhythm', beats: 5, tempo: 104, verb: 'Pump', shot: 'body', does: 'pumps the ribs to size' } },
      height: { id: 'height', label: 'Height', shot: 'full', list: () => HEIGHTS.map((v) => ({ name: `${Math.round(172 * v)} cm` })), get: (a) => HEIGHTS.reduce((bi, v, i) => (Math.abs(v - a.height) < Math.abs(HEIGHTS[bi] - a.height) ? i : bi), 0), set: (a, i) => { a.height = HEIGHTS[i]; },
        op: { tool: 'clamp', anchor: 'belly', game: 'hold', verb: 'Stretch', shot: 'body', does: 'racks the spine' } },
      tone: { id: 'tone', label: 'Skin', shot: 'skin', gradual: 'skin', list: () => SKIN_ALL.map((c) => ({ name: colourName(c, 'skin'), chip: c })), get: (a) => Math.max(0, SKIN_ALL.indexOf(a.skin)), set: (a, i) => { a.skin = SKIN_ALL[i]; },
        op: { tool: 'spray', anchor: 'chest', game: 'aim', targets: ['face', 'neck', 'chest', 'armL', 'armR'], verb: 'Spray', shot: 'skin', does: 'sprays the new tone on' } },
      shape: { id: 'shape', label: 'Shape', shot: 'face', list: () => opts(FACE_SHAPES), get: (a) => shapeIndex(a), set: (a, i) => { a.jaw = i; },
        op: { tool: 'saw', anchor: 'chin', game: 'trace', path: 'jaw', verb: 'Slice', shot: 'face', does: 'cuts along the jaw' } },
      ears: { id: 'ears', label: 'Ears', shot: 'ears', list: () => opts(EARS), get: (a) => a.ears ?? 0, set: (a, i) => { a.ears = i; },
        op: { tool: 'scalpel', anchor: 'ear', game: 'trace', path: 'ear', verb: 'Cut', shot: 'ears', does: 'trims round the ear' } },
      eyeShape: { id: 'eyeShape', label: 'Lids', shot: 'eyes', list: () => opts(EYE_SHAPES), get: (a) => eyeShapeOf(a), set: (a, i) => { a.eyeShape = i; },
        op: { tool: 'laser', anchor: 'eyes', game: 'trace', path: 'eyes', verb: 'Burn', shot: 'eyes', does: 'reshapes the lids' } },
      iris: { id: 'iris', label: 'Iris', shot: 'eyes', gradual: 'eye', list: () => EYE_COLORS.map((c) => ({ name: colourName(c, 'eye'), chip: c })), get: (a) => Math.max(0, EYE_COLORS.indexOf(a.eyeColor ?? EYE_COLORS[0])), set: (a, i) => { a.eyeColor = EYE_COLORS[i]; },
        op: { tool: 'injector', anchor: 'eyeL', game: 'hold', verb: 'Inject', shot: 'eyes', does: 'dyes the iris' } },
      nose: { id: 'nose', label: 'Nose', shot: 'nose', list: () => opts(NOSES), get: (a) => noseOf(a), set: (a, i) => { a.nose = i; },
        op: { tool: 'stamp', anchor: 'nose', game: 'tap', hits: 2, verb: 'Stamp', shot: 'nose', does: 'presses the cartilage' } },
      mouth: { id: 'mouth', label: 'Mouth', shot: 'mouth', list: () => opts(MOUTHS), get: (a) => mouthOf(a), set: (a, i) => { a.mouth = i; },
        op: { tool: 'welder', anchor: 'mouth', game: 'rhythm', beats: 5, tempo: 120, verb: 'Weld', shot: 'mouth', does: 'tacks the lips' } },
      cut: { id: 'cut', label: 'Cut', shot: 'hair', list: () => opts(HAIR_STYLES_ALL), get: (a) => Math.max(0, HAIR_STYLES_ALL.findIndex((o) => o.key === a.hairStyle)), set: (a, i) => { (a as any).hairStyle = HAIR_STYLES_ALL[i].key; },
        op: { tool: 'clipper', anchor: 'scalp', game: 'trace', path: 'scalp', verb: 'Shave', shot: 'hair', does: 'runs over the scalp' } },
      colour: { id: 'colour', label: 'Colour', shot: 'hair', gradual: 'hair', list: () => HAIR_DYES.map((c) => ({ name: colourName(c, 'hair'), chip: c })), get: (a) => Math.max(0, HAIR_DYES.indexOf(a.hair)), set: (a, i) => { a.hair = HAIR_DYES[i]; },
        op: { tool: 'spray', anchor: 'scalp', game: 'aim', targets: ['scalp', 'temple', 'templeR', 'crown'], verb: 'Dye', shot: 'hair', does: 'sprays the dye in' } },
      beard: { id: 'beard', label: 'Beard', shot: 'beard', list: () => opts(FACIAL_HAIR_ALL), get: (a) => Math.max(0, FACIAL_HAIR_ALL.findIndex((f) => f.key === (a.facialHair || 'none'))), set: (a, i) => { (a as any).facialHair = FACIAL_HAIR_ALL[i].key; a.beard = FACIAL_HAIR_ALL[i].key === 'beard'; },
        op: { tool: 'clipper', anchor: 'chin', game: 'rhythm', beats: 4, tempo: 108, verb: 'Trim', shot: 'beard', does: 'trims the jaw' } },
      brows: { id: 'brows', label: 'Brows', shot: 'brows', list: () => opts(BROWS), get: (a) => browsOf(a), set: (a, i) => { a.brows = i; },
        op: { tool: 'scalpel', anchor: 'brows', game: 'trace', path: 'brows', verb: 'Shape', shot: 'brows', does: 'shapes the brow line' } },
      scars: { id: 'scars', label: 'Scars', shot: 'marks', list: () => [{ name: 'None' }, { name: 'One' }, { name: 'Two' }, { name: 'Several' }], get: (a) => a.scars ?? 0, set: (a, i) => { a.scars = i; },
        op: { tool: 'scalpel', anchor: 'cheek', game: 'trace', path: 'scar', verb: 'Carve', shot: 'marks', does: 'carves or closes scars' } },
      freckles: { id: 'freckles', label: 'Freckles', shot: 'face', list: () => [{ name: 'None' }, { name: 'A few' }, { name: 'Lots' }], get: (a) => ((a.freckles ?? 0) < 0.15 ? 0 : (a.freckles ?? 0) < 0.6 ? 1 : 2), set: (a, i) => { a.freckles = [0, 0.4, 0.9][i]; },
        op: { tool: 'injector', anchor: 'cheek', game: 'rhythm', beats: 5, tempo: 126, verb: 'Dot', shot: 'face', paint: 0x7a4a24, does: 'inks the freckles' } },
      wear: { id: 'wear', label: 'Wear', shot: 'face', list: () => [{ name: 'Young' }, { name: 'Lined' }, { name: 'Weathered' }, { name: 'Old' }], get: (a) => Math.min(3, Math.round((a.age ?? 0) / 0.3)), set: (a, i) => { a.age = [0, 0.3, 0.6, 0.9][i]; },
        op: { tool: 'injector', anchor: 'forehead', game: 'hold', verb: 'Age', shot: 'face', paint: 0x8ab060, does: 'serum for the years' } },
      cos_suit: designLine('suit', 'Suit design', 'body', { tool: 'spray', anchor: 'chest', game: 'aim', targets: ['chest', 'belly', 'armL', 'armR'], verb: 'Dye', shot: 'body', does: 'dyes the suit in the new design' }),
      cos_hat: designLine('hat', 'Headgear', 'hair', { tool: 'clamp', anchor: 'scalp', game: 'hold', verb: 'Fit', shot: 'hair', does: 'clamps the headgear on' }),
      cos_eyes: designLine('eyes', 'Eyewear', 'eyes', { tool: 'clamp', anchor: 'eyes', game: 'hold', verb: 'Fit', shot: 'eyes', does: 'sets the visor on the face' }),
      cos_face: designLine('face', 'Mask', 'mouth', { tool: 'clamp', anchor: 'mouth', game: 'hold', verb: 'Fit', shot: 'mouth', does: 'straps the mask on' }),
      cos_neck: designLine('neck', 'Neck', 'neck', { tool: 'clamp', anchor: 'neck', game: 'hold', verb: 'Fit', shot: 'neck', does: 'fastens it round the neck' }),
      cos_back: designLine('back', 'Back', 'body', { tool: 'welder', anchor: 'chest', game: 'rhythm', beats: 4, tempo: 100, verb: 'Weld', shot: 'body', does: 'bolts the kit to the back' }),
      hw_eyes: limbLine('eyes', 'Optic', 'eyes', 'eyes'),
      hw_jaw: limbLine('jaw', 'Jaw', 'mouth', 'chin'),
      hw_spine: limbLine('spine', 'Spine', 'neck', 'neck'),
      hw_skin: limbLine('skin', 'Dermis', 'body', 'chest'),
      hw_arm_l: limbLine('arm_l', 'Arm', 'armL', 'armL'),
      hw_hand_l: limbLine('hand_l', 'Hand', 'armL', 'forearmL'),
      hw_arm_r: limbLine('arm_r', 'Arm', 'armR', 'armR'),
      hw_hand_r: limbLine('hand_r', 'Hand', 'armR', 'forearmR'),
      hw_leg_l: limbLine('leg_l', 'Leg', 'legL', 'thigh'),
      hw_leg_r: limbLine('leg_r', 'Leg', 'legR', 'thighR'),
    };
    // the hardware lines say which side and the research behind them
    L.hw_eyes.op = { tool: 'laser', anchor: 'eyes', game: 'trace', path: 'eyes', verb: 'Burn', shot: 'eyes', does: 'burns the sockets clean and seats the optic' };
    L.hw_jaw.op = { tool: 'saw', anchor: 'chin', game: 'trace', path: 'jaw', verb: 'Saw', shot: 'mouth', does: 'saws the jaw off and bolts the new one on' };
    const chips = Array.from({ length: chipSockets() }, (_, i) => chipLine(i));
    const Z = (key: string, title: string, note: string, shot: ShotName, anchor: string, ids: (string | Line)[]): Zone => ({ key, title, note, shot, anchor, lines: ids.map((q) => (typeof q === 'string' ? L[q] : q)) });
    const ZONES: Zone[] = [
      Z('hair', 'Hair', 'cut, colour, headgear', 'hair', 'scalp', ['cut', 'colour', 'cos_hat']),
      Z('face', 'Face', 'the bone under it', 'face', 'chin', ['shape', 'ears', 'wear']),
      Z('eyes', 'Eyes', 'lids, iris, brows, what covers them', 'eyes', 'eyes', ['eyeShape', 'iris', 'brows', 'cos_eyes', 'hw_eyes']),
      Z('mouth', 'Nose & mouth', 'and what grows round it', 'mouth', 'mouth', ['nose', 'mouth', 'beard', 'cos_face', 'hw_jaw']),
      Z('marks', 'Marks', 'what the years left', 'marks', 'cheek', ['scars', 'freckles']),
      Z('neck', 'Neck & spine', 'the chip sockets in the spine port', 'neck', 'neck', [...chips, 'hw_spine', 'cos_neck', 'cos_back']),
      Z('body', 'Body', 'the frame, the skin, the suit', 'full', 'chest', ['frame', 'build', 'height', 'tone', 'cos_suit', 'hw_skin']),
      Z('armL', 'Left arm', 'flesh, or hardware', 'armL', 'armL', ['hw_arm_l', 'hw_hand_l']),
      Z('armR', 'Right arm', 'flesh, or hardware', 'armR', 'armR', ['hw_arm_r', 'hw_hand_r']),
      Z('legL', 'Left leg', 'flesh, or hardware', 'legL', 'thigh', ['hw_leg_l']),
      Z('legR', 'Right leg', 'flesh, or hardware', 'legR', 'thighR', ['hw_leg_r']),
    ];
    let li = 0;
    const cur = (): Line | null => (zone ? zone.lines[li] ?? null : null);
    const pending = (Ln: Line) => Ln.get(app) !== Ln.get(done);
    const zonePending = (z = zone) => (z ? z.lines.filter(pending) : []);
    const allPending = () => ZONES.some((z) => zonePending(z).length);

    // ---------------- skeleton: the part's tech screen, floating words, pixel chevrons
    const root = h('div', 'nx cz');
    const head = h('div', 'cz-head'); head.dataset.term = 'INTAKE TERM';
    const linesEl = h('div', 'cz-lines');
    const toolEl = h('div', 'cz-tool');
    const marks = h('div', 'cz-marks');
    const lead = h('div', 'cz-lead');
    const hint = h('div', 'cz-hint');
    const top = h('div', 'cz-top');
    const result = h('div', 'cz-result');
    const toast = h('div', 'cz-toast');
    const backB = h('button', 'cz-back cz-word') as HTMLButtonElement;
    const nextB = h('button', 'cz-next cz-word') as HTMLButtonElement;
    backB.type = nextB.type = 'button';
    backB.addEventListener('click', () => back());
    nextB.addEventListener('click', () => next());
    const gamesB = h('button', 'cz-games cz-word') as HTMLButtonElement;
    gamesB.type = 'button';
    gamesB.addEventListener('click', () => { games = !games; setGamesOn(games); paintTop(); sfx('toggle'); say(games ? '<b>Mini-games on</b> · you work the tools' : '<b>Just apply</b> · the robot works alone'); });
    top.append(h('div', 'cz-id', `<span>unit</span> <b>${esc(name)}</b>`), gamesB);
    const col = h('div', 'cz-col'); col.dataset.term = 'UNIT SPEC';
    col.append(linesEl, toolEl);
    root.append(marks, lead, head, col, hint, backB, nextB, top, result, toast);

    let toastT = 0;
    const say = (s: string) => { toast.innerHTML = s; toast.classList.remove('on'); void toast.offsetWidth; toast.classList.add('on'); clearTimeout(toastT); toastT = window.setTimeout(() => toast.classList.remove('on'), 2600); };
    let resT = 0;
    const verdict = (g: Grade, skipped: boolean, w: { big: string; small: string }) => {
      result.className = `cz-result g-${skipped ? 'skip' : g}`;
      result.innerHTML = skipped ? `<b>Applied</b>` : `<b>${esc(w.big)}</b><small>${esc(w.small)}</small>`;
      void result.offsetWidth; result.classList.add('on');
      clearTimeout(resT); resT = window.setTimeout(() => result.classList.remove('on'), 1900);
    };

    // ---------------- painting
    const paintTop = () => { gamesB.innerHTML = `<span>mini-games</span> <b>${games ? 'On' : 'Off'}</b>`; gamesB.setAttribute('aria-pressed', String(games)); };
    const paintHead = (animate: boolean) => {
      if (zone) head.innerHTML = `<span class="n">${esc(zone.key === 'neck' ? `${chips.length} socket${chips.length > 1 ? 's' : ''}` : 'unit part')}</span><b>${esc(zone.title)}</b><small>${esc(zone.note)}</small>`;
      else head.innerHTML = `<span class="n">unit room 4</span><b>The unit</b><small>tap a part to work on it</small>`;
      if (animate) { head.classList.remove('in'); void head.offsetWidth; head.classList.add('in'); }
    };
    const paintTool = () => {
      const Ln = cur();
      if (!Ln) { toolEl.innerHTML = ''; return; }
      if (Ln.op === 'press') { toolEl.innerHTML = `<b>The press</b><span>a fresh body, same choices</span>`; return; }
      const thumb = stage.toolThumb(Ln.op.tool, 36);
      toolEl.innerHTML = `${thumb ? `<img src="${thumb}" alt="">` : ''}<b>${esc(TOOL_NAME[Ln.op.tool])}</b><span>${esc(Ln.op.does)}</span>`;
    };
    const lineEls: HTMLElement[] = [];
    const paintLines = (animate = false, only = -1) => {
      if (!zone) { linesEl.innerHTML = ''; lineEls.length = 0; return; }
      const Zn = zone;
      if (lineEls.length !== Zn.lines.length || animate) {
        linesEl.innerHTML = ''; lineEls.length = 0;
        Zn.lines.forEach((_L, i) => {
          const row = h('div', 'cz-line');
          const lab = h('button', 'cz-lab') as HTMLButtonElement; lab.type = 'button';
          const l = h('button', 'cz-arr l', `<img src="${chevron('l')}" alt="">`) as HTMLButtonElement; l.type = 'button';
          const v = h('span', 'cz-v');
          const r = h('button', 'cz-arr r', `<img src="${chevron('r')}" alt="">`) as HTMLButtonElement; r.type = 'button';
          const c = h('span', 'cz-c');
          const p = h('span', 'cz-pend', `<img src="${diamond()}" alt=""><em>unoperated</em>`);
          const hn = h('span', 'cz-hn');
          l.setAttribute('aria-label', 'Previous'); r.setAttribute('aria-label', 'Next');
          const pickMe = () => { if (li !== i && phase === 'look' && !busy) { li = i; sfx('tick'); paintLines(); lineChanged(); } };
          lab.addEventListener('click', pickMe);
          l.addEventListener('click', () => { pickMe(); step(-1); });
          r.addEventListener('click', () => { pickMe(); step(1); });
          row.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') pickMe(); });
          const vrow = h('div', 'cz-vrow');
          vrow.append(l, v, r, c, p);
          row.append(lab, vrow, hn);
          linesEl.append(row); lineEls.push(row);
        });
        if (animate) { linesEl.classList.remove('in'); void linesEl.offsetWidth; linesEl.classList.add('in'); }
      }
      Zn.lines.forEach((Ln, i) => {
        const row = lineEls[i];
        row.classList.toggle('on', i === li);
        row.classList.toggle('pend', pending(Ln));
        if (only >= 0 && i !== only) return;
        const list = Ln.list(), k = Ln.get(app), v = list[k];
        (row.querySelector('.cz-lab') as HTMLElement).innerHTML = `<span>${esc(Ln.label)}</span>`;
        const ve = row.querySelector('.cz-v') as HTMLElement;
        ve.innerHTML = `${v?.chip != null ? `<img src="${chipUrl(v.chip)}" alt="">` : ''}<i>${esc(v?.name ?? '?')}</i>`;
        (row.querySelector('.cz-c') as HTMLElement).textContent = `${k + 1}/${list.length}`;
        (row.querySelector('.cz-hn') as HTMLElement).textContent = Ln.hint?.() ?? '';
        row.setAttribute('aria-label', `${Ln.label}: ${v?.name ?? ''} (${k + 1} of ${list.length})`);
        if (only === i) { ve.classList.remove('in'); void ve.offsetWidth; ve.classList.add('in'); }
      });
      paintNext();
    };
    const paintNext = () => {
      if (!zone) {
        nextB.classList.remove('op');
        nextB.innerHTML = `<span>${esc(opts0.submit ? cap(opts0.submit) : 'Begin')}</span><img src="${chevron('r', 'green')}" alt="">`;
        nextB.setAttribute('aria-label', 'Begin: the unit goes to the link rig');
        backB.innerHTML = `<img src="${chevron('l', 'steel')}" alt=""><span>Leave</span>`;
        return;
      }
      const n = zonePending().length;
      nextB.classList.toggle('op', n > 0);
      nextB.innerHTML = n > 0 ? `<span>Operate</span><img src="${chevron('r', 'red')}" alt="">` : `<span>Done</span><img src="${chevron('r', 'green')}" alt="">`;
      nextB.setAttribute('aria-label', n > 0 ? `Operate (${n} change${n > 1 ? 's' : ''})` : 'Done with this part');
      backB.innerHTML = `<img src="${chevron('l', 'steel')}" alt=""><span>The unit</span>`;
    };
    // the markers on the body (overview) and the lead from the screen to the part (in a zone)
    const markEls = new Map<string, HTMLButtonElement>();
    const buildMarks = () => {
      marks.innerHTML = ''; markEls.clear();
      for (const k of MARKED) {
        const z = ZONES.find((q) => q.key === k)!;
        const b = h('button', 'cz-mk', `<i></i><span>${esc(z.title)}</span>`) as HTMLButtonElement;
        b.type = 'button';
        b.addEventListener('click', () => { if (phase === 'look' && !busy) void goZone(z); });
        marks.append(b); markEls.set(k, b);
      }
    };
    let raf = 0;
    const track = () => {
      raf = requestAnimationFrame(track);
      if (phase !== 'look') return;
      if (!zone) {
        for (const [k, b] of markEls) {
          const z = ZONES.find((q) => q.key === k)!;
          const p = stage.anchorScreen(z.anchor);
          b.style.visibility = p ? '' : 'hidden';
          if (p) b.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
        }
        return;
      }
      if (portrait()) return;
      // the tech screen sits beside the part, on whichever side has the room; the lead runs to the part
      const p = stage.anchorScreen(zone.anchor);
      const VW = window.innerWidth, VH = window.innerHeight;
      const cw = col.offsetWidth || 320, ch = col.offsetHeight || 300;
      const px = p?.x ?? VW / 2, py = p?.y ?? VH / 2;
      const right = px < VW * 0.42;
      let x = right ? px + 120 : px - 120 - cw;
      x = Math.max(16, Math.min(VW - cw - 16, x));
      const y = Math.max(96, Math.min(VH - ch - 80, py - ch / 2));
      col.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      const ex = right ? x : x + cw, ey = Math.max(y + 24, Math.min(y + ch - 24, py));
      const dx = px - ex, dy = py - ey, len = Math.hypot(dx, dy);
      lead.style.width = Math.max(0, len - 8) + 'px';
      lead.style.transform = `translate(${Math.round(ex)}px, ${Math.round(ey)}px) rotate(${Math.atan2(dy, dx)}rad)`;
      lead.style.visibility = p ? '' : 'hidden';
    };

    // ---------------- the line in view: camera, tool, scanner
    const lineChanged = () => {
      const Ln = cur();
      if (!Ln) return;
      frame();
      void stage.shot(Ln.shot, 750);
      if (Ln.op === 'press') { stage.useTool(null); stage.scan(true, 'chest'); }
      else { stage.useTool(Ln.op.tool, Ln.op.anchor); if (Ln.op.paint !== undefined) stage.setPaint(Ln.op.paint); stage.scan(true, Ln.op.anchor); }
      paintTool();
      scanPulse();
      show(app);
    };
    let scanT = 0;
    const scanPulse = () => {
      const Ln = cur();
      if (!Ln) return;
      stage.scan(true, Ln.op === 'press' ? 'chest' : Ln.op.anchor);
      clearTimeout(scanT);
      scanT = window.setTimeout(() => stage.scan(false), 1600);
    };

    // ---------------- browsing: the model changes live
    const step = (d: -1 | 1) => {
      const Ln = cur();
      if (phase !== 'look' || busy || closing || !Ln) return;
      const n = Ln.list().length;
      if (n < 2) { sfx('error', 0.4); say(`<b>${esc(Ln.label)}</b> · ${esc(Ln.hint?.() || 'nothing else to fit')}`); return; }
      Ln.set(app, (Ln.get(app) + d + n) % n);
      if (Ln.gradual === 'skin' || Ln.gradual === 'hair') stage.setPaint(Ln.gradual === 'skin' ? app.skin : app.hair);
      if (Ln.gradual === 'eye') stage.setPaint(app.eyeColor ?? 0x40a0ff);
      show(app);
      paintLines(false, li);
      scanPulse();
      sfx('key', 0.8);
      if (Ln.op === 'press' && pending(Ln)) say('<b>The press</b> · OPERATE makes the new frame');
    };
    const pickLine = (d: number) => {
      if (!zone) return;
      const n = zone.lines.length;
      if (n < 2) return;
      li = (li + d + n) % n;
      sfx('tick');
      paintLines();
      lineChanged();
    };

    // ---------------- operating: each pending change by its tool
    const opLine = async (Ln: Line) => {
      if (!pending(Ln)) return;
      const from = Ln.get(done), to = Ln.get(app);
      const target: Appearance = { ...app };
      // on the table the unit still has the old part; the work brings in the new one
      const before: Appearance = { ...app };
      Ln.set(before, from);
      if (Ln.op === 'press') {
        show(before);
        const res = games ? await playGame(stage, { kind: 'tap', tool: 'stamp', verb: 'Slam', anchor: 'chest', hits: 1, hint: matchMedia('(pointer: coarse)').matches ? 'tap to drop the press' : 'press <b>space</b> in the lit teeth to drop the press' }, root, true) : await autoPlay(stage, { kind: 'tap', tool: 'stamp', verb: '', anchor: 'chest' }, true);
        root.classList.add('pressing');
        sfx('lever');
        await stage.press(() => show(target));
        stage.setView('creator');
        root.classList.remove('pressing');
        verdict(res.grade, res.skipped, { big: res.grade === 'fail' ? 'Messy press' : 'Clean press', small: `clone ${to === 0 ? 'F' : 'M'}-${Math.floor(100 + Math.random() * 900)} · same choices, fresh body` });
        Ln.set(done, to);
        return;
      }
      const op = Ln.op;
      show(before);
      const grad = Ln.gradual;
      let lastQ = -1;
      const fromC = grad === 'skin' ? before.skin : grad === 'hair' ? before.hair : grad === 'eye' ? before.eyeColor ?? EYE_COLORS[0] : 0;
      const toC = grad === 'skin' ? target.skin : grad === 'hair' ? target.hair : grad === 'eye' ? target.eyeColor ?? EYE_COLORS[0] : 0;
      if (grad) stage.setPaint(toC);
      await runOp({
        room: stage, host: root, def: op, games,
        onProgress: grad ? (k) => {
          // the colour comes in with the work, in a few steps (each one re-bakes the skin)
          const q = Math.min(5, Math.floor(k * 5.999));
          if (q === lastQ) return;
          lastQ = q;
          const c = mixC(fromC, toC, q / 5);
          const a = { ...before };
          if (grad === 'skin') a.skin = c; else if (grad === 'hair') a.hair = c; else a.eyeColor = c;
          show(a);
        } : undefined,
        onClimax: () => { if (!grad) { show(target); sfx('squelch', 0.5); } },
        verdict,
      });
      show(target);
      Ln.set(done, to);
      // the fit is the unit programme's, not this unit's: it stays fitted
      try { Ln.keep?.(done); } catch (e) { console.warn('unit fit', e); }
    };
    const operateZone = async (Zn = zone) => {
      if (!Zn) return;
      const list = zonePending(Zn);
      if (!list.length) return;
      busy = true;
      root.classList.add('operating');
      // the picked line first, then the rest in order
      const order = [...list].sort((a, b) => (a === cur() ? -1 : b === cur() ? 1 : 0));
      for (const Ln of order) {
        if (closing) break;
        li = Zn.lines.indexOf(Ln);
        paintLines();
        await opLine(Ln);
        paintLines(false, li);
        await new Promise((r) => setTimeout(r, 380));
      }
      root.classList.remove('operating');
      busy = false;
      paintLines();
      lineChanged();
    };

    // ---------------- parts: fly in, fly out
    const setZone = (z: Zone | null, from?: string) => {
      zone = z;
      li = 0;
      if (z && from) { const i = z.lines.findIndex((q) => q.op !== 'press' && q.op.anchor === from); if (i >= 0) li = i; }
      root.dataset.zone = z?.key ?? '';
      root.classList.toggle('zoned', !!z);
      paintHead(true);
      paintLines(true);
      if (z) { lineChanged(); sfx('servo', 0.5); }
      else {
        stage.useTool(null); stage.scan(false); frame(); void stage.shot('full', 800); show(app); paintTool(); paintNext();
        hint.innerHTML = `<span>tap a part of the unit</span>`;
      }
      requestAnimationFrame(() => (z ? (linesEl.querySelector('.cz-line.on .cz-arr.r') as HTMLElement | null) : nextB)?.focus({ preventScroll: true }));
    };
    /** leave this part for another: its pending changes are operated first */
    const goZone = async (z: Zone | null, from?: string) => {
      if (phase !== 'look' || busy || closing) return;
      if (zonePending().length) await operateZone();
      if (closing) return;
      setZone(z, from);
    };
    const next = async () => {
      if (phase !== 'look' || busy || closing) return;
      if (zone) { if (zonePending().length) { await operateZone(); return; } void goZone(null); return; }
      void finish();
    };
    const back = () => {
      if (phase !== 'look' || busy || closing) return;
      if (zone) { void goZone(null); return; }
      void leave();
    };
    /** a tap: which part of the unit is it? (the head by its nearest landmark) */
    const zoneAt = (p: PartKey | null, x: number, y: number): { z: Zone; from?: string } | null => {
      if (!p) return null;
      const near = (pairs: [string, string][]) => {
        let best: [string, string] | null = null, bd = Infinity;
        for (const pr of pairs) { const s = stage.anchorScreen(pr[0]); if (!s) continue; const d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = pr; } }
        return best;
      };
      const by = (k: string) => ZONES.find((q) => q.key === k)!;
      if (p === 'head') { const b = near(HEAD_PICK); return b ? { z: by(b[1]), from: b[0] } : { z: by('face') }; }
      if (p === 'hair') return { z: by('hair') };
      if (p === 'torso') { const b = near([['neck', 'neck'], ['chest', 'body'], ['belly', 'body']]); return { z: by(b?.[1] ?? 'body') }; }
      if (p === 'armL' || p === 'handL') return { z: by('armL'), from: p === 'handL' ? 'forearmL' : 'armL' };
      if (p === 'armR' || p === 'handR') return { z: by('armR'), from: p === 'handR' ? 'forearmR' : 'armR' };
      if (p === 'legL') return { z: by('legL') };
      if (p === 'legR') return { z: by('legR') };
      const b = near([['thigh', 'legL'], ['thighR', 'legR']]);
      return { z: by(b?.[1] ?? 'legL') };
    };

    // ---------------- touch / wheel / clicking the unit
    stage.onSwipe = undefined;
    stage.onPick = (p: PartKey | null) => {
      if (phase !== 'look' || closing || busy) return;
      const pt = lastPtr;
      const hit = zoneAt(p, pt.x, pt.y);
      // empty space: back out to the whole unit
      if (!hit) { if (zone) void goZone(null); return; }
      if (hit.z !== zone) void goZone(hit.z, hit.from);
      else if (hit.from) { const i = zone.lines.findIndex((q) => q.op !== 'press' && q.op.anchor === hit.from); if (i >= 0 && i !== li) { li = i; paintLines(); lineChanged(); } }
    };
    const lastPtr = { x: 0, y: 0 };
    const onPtr = (e: PointerEvent) => { lastPtr.x = e.clientX; lastPtr.y = e.clientY; };
    window.addEventListener('pointerdown', onPtr, true);
    stage.onHeadScroll = (d) => { if (zone && phase === 'look' && !busy) step(d > 0 ? 1 : -1); };

    // ---------------- the end: a last scan, the photo, into the game
    const finish = async () => {
      // anything changed and never operated is made now
      for (const Zn of ZONES) if (zonePending(Zn).length) { setZone(Zn); await operateZone(Zn); }
      closing = true; phase = 'out'; root.dataset.phase = 'out';
      sfx('confirm');
      stage.useTool(null);
      stage.clean();
      stage.setFraming(0, portrait() ? 0.2 : 0);
      void stage.shot('full', 900);
      stage.scan(true, 'chest');
      sfx('scan');
      await new Promise((r) => setTimeout(r, 900));
      stage.scan(true, 'face');
      await stage.shot('face', 800);
      stage.scan(false);
      const number = suitNumber(stage.rigSeed);
      result.className = 'cz-result g-id';
      result.innerHTML = `<b>${esc(name)}</b><small>${esc(number)} · unit ready for the link</small>`;
      void result.offsetWidth; result.classList.add('on');
      await new Promise((r) => setTimeout(r, 500));
      sfx('shutter'); stage.flashOnce();
      await new Promise((r) => setTimeout(r, 1400));
      close({ name: name.slice(0, 24), app: { ...lookOf(app), cos: wornCos() }, occupation: 'unemployed', traits: [], sandbox: { ...sb }, seed, directives });
    };
    const leave = async () => {
      closing = true; phase = 'out'; root.dataset.phase = 'out';
      // the unoperated preview goes: the unit is put back as it was
      show(done);
      await stage.lightsOff();
      close(null);
    };

    let nav: FocusNav;
    const close = (r: IntakeResult | null) => {
      nav.destroy();
      cancelAnimationFrame(raf);
      clearTimeout(toastT); clearTimeout(scanT); clearTimeout(resT);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onEnter, true);
      window.removeEventListener('pointerdown', onPtr, true);
      stage.onSwipe = undefined; stage.onHeadScroll = undefined; stage.onPick = undefined; stage.onHover = undefined;
      stage.scan(false);
      // the room keeps the unit as fitted
      stage.setOutfit(unitOutfit(lookOf(done)));
      if (ownHost) { stage.dispose(); ownHost.remove(); }
      root.remove();
      if (G?.input) G.input.textFocus = false;
      resolve(r);
    };
    // Enter with nothing focused (or the page itself) is NEXT
    const onEnter = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || phase !== 'look' || busy) return;
      const a = document.activeElement;
      if (!a || a === document.body || a === root) { e.preventDefault(); void next(); }
    };
    window.addEventListener('keydown', onEnter, true);
    let lastP = portrait(), lastS = shortView();
    const onResize = () => { if (portrait() !== lastP || shortView() !== lastS) { lastP = portrait(); lastS = shortView(); root.classList.toggle('portrait', lastP); if (phase === 'look' && !busy) { if (zone) lineChanged(); else frame(); } } };
    window.addEventListener('resize', onResize);

    // ---------------- go: lights on, then the whole unit (or straight to the part that was tapped)
    document.body.append(root);
    root.dataset.phase = 'intro';
    root.classList.toggle('portrait', portrait());
    paintTop();
    buildMarks();
    show(app);
    stage.setFocus('full');
    nav = new FocusNav(root, {
      onBack: () => back(),
      onTab: (d) => { if (phase !== 'look' || busy) return; const i = zone ? ZONES.indexOf(zone) : d > 0 ? -1 : 0; void goZone(ZONES[(i + d + ZONES.length) % ZONES.length]); },
      onArrow: (dx, dy) => {
        if (phase === 'look' && !busy && zone) { if (dx) step(dx < 0 ? -1 : 1); else if (dy) pickLine(dy); return true; }
        return false;
      },
      autofocus: false,
    });
    raf = requestAnimationFrame(track);
    stage.lightsOn().then(() => {
      if (closing) return;
      phase = 'look';
      root.dataset.phase = 'look';
      stage.setView('creator');
      const startPart = opts0.part ? zoneAt(opts0.part, window.innerWidth / 2, window.innerHeight * 0.35) : null;
      setZone(startPart?.z ?? null, startPart?.from);
      if (!startPart) say('<b>The unit</b> · tap a part to work on it');
    });
    if (import.meta.env.DEV) (window as any).__intake = { stage, app, get done() { return done; }, zones: ZONES, goZone: (k: string | null) => goZone(k ? ZONES.find((q) => q.key === k) ?? null : null), step, next, back, pickLine, operateZone, get phase() { return phase; }, get zone() { return zone?.key ?? null; }, get busy() { return busy; }, setGames: (v: boolean) => { games = v; paintTop(); } };
  });
}
const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
