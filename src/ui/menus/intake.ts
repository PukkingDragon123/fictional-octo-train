// SUBJECT INTAKE: the creator, played in the subject room (room3d.ts) with
// the lights on. The subject hangs in the arms' grip; the page is EIGHT
// SECTIONS, one part of the body at a time, and the camera closes in on
// whatever line is being changed:
//   1 Body (frame, build, height)  2 Skin  3 Face (shape, ears)
//   4 Eyes (shape, iris)  5 Nose & mouth  6 Hair (cut, colour)
//   7 Beard & brows  8 Marks (scars, freckles, wear)
// A clean lab interface: floating Alagard words and small crisp pixel-art
// chevrons, no plates, no boxes. ←/→ (the d-pad, a swipe, the wheel, the
// chevrons) browse the looks and the model changes LIVE while the scanner
// arm sweeps the part; ↑/↓ or a tap pick the line. A change is then made for
// real by a robot tool (creator/ops.ts) in a mini-game (creator/qte.ts):
// saw, scalpel, laser, die stamp, clipper, spray nozzle, injector, clamp,
// welder, and the ceiling press for the frame. A clean job ends in a
// flourish, a botched one in a mishap; the change takes either way.
// OPERATE (or leaving the section) runs the pending changes. Mini-games can
// be switched off ("just apply"); Esc / B / SKIP always just applies.
// Everyone wears the issue suit (prisonerOutfitFor is the one outfit path).
import { wornCos } from '../../game/meridian';
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
/** the issue suit the subject wears in the room (the first that exists), plus the chosen footwear. The one outfit path. */
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

// ---------------------------------------------------------------- sections
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
}
interface Section { key: string; title: string; note: string; lines: Line[] }
const SKIN_ALL = [0xf8dcc8, ...SKIN_TONES, 0x4a2c1c];
const BUILDS: [string, string, number][] = [['wiry', 'Wiry', 58], ['slim', 'Slim', 64], ['average', 'Average', 75], ['broad', 'Broad', 86], ['stocky', 'Stocky', 92], ['heavy', 'Heavy', 108]];
const HEIGHTS = [0.92, 0.94, 0.96, 0.98, 1, 1.02, 1.04, 1.06, 1.08];
const PART_SECTION: Record<string, string> = { head: 'face', hair: 'hair', torso: 'skin', armL: 'skin', armR: 'skin', handL: 'skin', handR: 'skin', legL: 'body', legR: 'body', feet: 'body' };
const opts = (l: Opt[]): Val[] => l.map((o) => ({ name: o.name }));
const FEM = 0.88, MASC = 0.1;

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

/** show the intake; resolves with the processed subject or null if they went back to the dark */
export function intakeForm(opts0: { title?: string; sandbox?: boolean; directives?: boolean; submit?: string; room?: SubjectRoom; app?: Appearance } = {}): Promise<IntakeResult | null> {
  return new Promise((resolve) => {
    installRetroKit();
    const app: Appearance = opts0.app ? { ...opts0.app } : { ...randomAppearance(Math.random), ...randomLooks(Math.random, Math.random() < 0.5) };
    // the commendation dyes picked in the Meridian file (src/game/meridian.ts) go on at intake
    app.cos = wornCos();
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
    const frame = () => stage.setFraming(portrait() ? 0 : 0.16, portrait() ? 0.3 : 0.02);
    // the Body section shows the suit he will wear; from Skin on the top half comes down for the examination (and the hood with it)
    const show = (a: Appearance) => { stage.setAppearance(a); stage.setOutfit(prisonerOutfitFor(a, phase === 'look' && SECTIONS[si]?.key !== 'body')); };

    const shapeIndex = (a: Appearance) => {
      if (a.jaw != null) return a.jaw;
      const sh = shapeOf(a);
      return sh.jaw > 1.04 ? 6 : sh.jaw < 0.98 ? 4 : 0;
    };
    const fem = (a: Appearance) => (a.bodyShape ?? 0.3) > 0.5;

    // ---------------- the eight sections, every line with its tool and its game
    const SECTIONS: Section[] = [
      { key: 'body', title: 'Body', note: 'the frame, the build, the height', lines: [
        { id: 'frame', label: 'Frame', shot: 'full', op: 'press', list: () => [{ name: 'Female' }, { name: 'Male' }], get: (a) => (fem(a) ? 0 : 1), set: (a, i) => { a.bodyShape = i === 0 ? FEM : MASC; } },
        { id: 'build', label: 'Build', shot: 'full', list: () => BUILDS.map(([, l, kg]) => ({ name: `${l} · ${kg} kg` })), get: (a) => Math.max(0, BUILDS.findIndex((b) => b[0] === String(a.build))), set: (a, i) => { (a as any).build = BUILDS[i][0]; },
          op: { tool: 'clamp', anchor: 'chest', game: 'rhythm', beats: 5, tempo: 104, verb: 'Pump', shot: 'body', does: 'pumps the ribs to size' } },
        { id: 'height', label: 'Height', shot: 'full', list: () => HEIGHTS.map((v) => ({ name: `${Math.round(172 * v)} cm` })), get: (a) => HEIGHTS.reduce((bi, v, i) => (Math.abs(v - a.height) < Math.abs(HEIGHTS[bi] - a.height) ? i : bi), 0), set: (a, i) => { a.height = HEIGHTS[i]; },
          op: { tool: 'clamp', anchor: 'belly', game: 'hold', verb: 'Stretch', shot: 'body', does: 'racks the spine' } },
      ] },
      { key: 'skin', title: 'Skin', note: 'one tone, head to foot', lines: [
        { id: 'tone', label: 'Tone', shot: 'skin', gradual: 'skin', list: () => SKIN_ALL.map((c) => ({ name: colourName(c, 'skin'), chip: c })), get: (a) => Math.max(0, SKIN_ALL.indexOf(a.skin)), set: (a, i) => { a.skin = SKIN_ALL[i]; },
          op: { tool: 'spray', anchor: 'chest', game: 'aim', targets: ['face', 'neck', 'chest', 'armL', 'armR'], verb: 'Spray', shot: 'skin', does: 'sprays the new tone on' } },
      ] },
      { key: 'face', title: 'Face', note: 'the bone under it', lines: [
        { id: 'shape', label: 'Shape', shot: 'face', list: () => opts(FACE_SHAPES), get: (a) => shapeIndex(a), set: (a, i) => { a.jaw = i; },
          op: { tool: 'saw', anchor: 'chin', game: 'trace', path: 'jaw', verb: 'Slice', shot: 'face', does: 'cuts along the jaw' } },
        { id: 'ears', label: 'Ears', shot: 'ears', list: () => opts(EARS), get: (a) => a.ears ?? 0, set: (a, i) => { a.ears = i; },
          op: { tool: 'scalpel', anchor: 'ear', game: 'trace', path: 'ear', verb: 'Cut', shot: 'ears', does: 'trims round the ear' } },
      ] },
      { key: 'eyes', title: 'Eyes', note: 'the lids, then the iris', lines: [
        { id: 'eyeShape', label: 'Shape', shot: 'eyes', list: () => opts(EYE_SHAPES), get: (a) => eyeShapeOf(a), set: (a, i) => { a.eyeShape = i; },
          op: { tool: 'laser', anchor: 'eyes', game: 'trace', path: 'eyes', verb: 'Burn', shot: 'eyes', does: 'reshapes the lids' } },
        { id: 'iris', label: 'Iris', shot: 'eyes', gradual: 'eye', list: () => EYE_COLORS.map((c) => ({ name: colourName(c, 'eye'), chip: c })), get: (a) => Math.max(0, EYE_COLORS.indexOf(a.eyeColor ?? EYE_COLORS[0])), set: (a, i) => { a.eyeColor = EYE_COLORS[i]; },
          op: { tool: 'injector', anchor: 'eyeL', game: 'hold', verb: 'Inject', shot: 'eyes', does: 'dyes the iris' } },
      ] },
      { key: 'nose', title: 'Nose & mouth', note: 'the middle of the face', lines: [
        { id: 'nose', label: 'Nose', shot: 'nose', list: () => opts(NOSES), get: (a) => noseOf(a), set: (a, i) => { a.nose = i; },
          op: { tool: 'stamp', anchor: 'nose', game: 'tap', hits: 2, verb: 'Stamp', shot: 'nose', does: 'presses the cartilage' } },
        { id: 'mouth', label: 'Mouth', shot: 'mouth', list: () => opts(MOUTHS), get: (a) => mouthOf(a), set: (a, i) => { a.mouth = i; },
          op: { tool: 'welder', anchor: 'mouth', game: 'rhythm', beats: 5, tempo: 120, verb: 'Weld', shot: 'mouth', does: 'tacks the lips' } },
      ] },
      { key: 'hair', title: 'Hair', note: 'cut and colour', lines: [
        { id: 'cut', label: 'Cut', shot: 'hair', list: () => opts(HAIR_STYLES_ALL), get: (a) => Math.max(0, HAIR_STYLES_ALL.findIndex((o) => o.key === a.hairStyle)), set: (a, i) => { (a as any).hairStyle = HAIR_STYLES_ALL[i].key; },
          op: { tool: 'clipper', anchor: 'scalp', game: 'trace', path: 'scalp', verb: 'Shave', shot: 'hair', does: 'runs over the scalp' } },
        { id: 'colour', label: 'Colour', shot: 'hair', gradual: 'hair', list: () => HAIR_DYES.map((c) => ({ name: colourName(c, 'hair'), chip: c })), get: (a) => Math.max(0, HAIR_DYES.indexOf(a.hair)), set: (a, i) => { a.hair = HAIR_DYES[i]; },
          op: { tool: 'spray', anchor: 'scalp', game: 'aim', targets: ['scalp', 'temple', 'templeR', 'crown'], verb: 'Dye', shot: 'hair', does: 'sprays the dye in' } },
      ] },
      { key: 'beard', title: 'Beard & brows', note: 'what grows on the face', lines: [
        { id: 'beard', label: 'Beard', shot: 'beard', list: () => opts(FACIAL_HAIR_ALL), get: (a) => Math.max(0, FACIAL_HAIR_ALL.findIndex((f) => f.key === (a.facialHair || 'none'))), set: (a, i) => { (a as any).facialHair = FACIAL_HAIR_ALL[i].key; a.beard = FACIAL_HAIR_ALL[i].key === 'beard'; },
          op: { tool: 'clipper', anchor: 'chin', game: 'rhythm', beats: 4, tempo: 108, verb: 'Trim', shot: 'beard', does: 'trims the jaw' } },
        { id: 'brows', label: 'Brows', shot: 'brows', list: () => opts(BROWS), get: (a) => browsOf(a), set: (a, i) => { a.brows = i; },
          op: { tool: 'scalpel', anchor: 'brows', game: 'trace', path: 'brows', verb: 'Shape', shot: 'brows', does: 'shapes the brow line' } },
      ] },
      { key: 'marks', title: 'Marks', note: 'what the years left', lines: [
        { id: 'scars', label: 'Scars', shot: 'marks', list: () => [{ name: 'None' }, { name: 'One' }, { name: 'Two' }, { name: 'Several' }], get: (a) => a.scars ?? 0, set: (a, i) => { a.scars = i; },
          op: { tool: 'scalpel', anchor: 'cheek', game: 'trace', path: 'scar', verb: 'Carve', shot: 'marks', does: 'carves or closes scars' } },
        { id: 'freckles', label: 'Freckles', shot: 'face', list: () => [{ name: 'None' }, { name: 'A few' }, { name: 'Lots' }], get: (a) => ((a.freckles ?? 0) < 0.15 ? 0 : (a.freckles ?? 0) < 0.6 ? 1 : 2), set: (a, i) => { a.freckles = [0, 0.4, 0.9][i]; },
          op: { tool: 'injector', anchor: 'cheek', game: 'rhythm', beats: 5, tempo: 126, verb: 'Dot', shot: 'face', paint: 0x7a4a24, does: 'inks the freckles' } },
        { id: 'wear', label: 'Wear', shot: 'face', list: () => [{ name: 'Young' }, { name: 'Lined' }, { name: 'Weathered' }, { name: 'Old' }], get: (a) => Math.min(3, Math.round((a.age ?? 0) / 0.3)), set: (a, i) => { a.age = [0, 0.3, 0.6, 0.9][i]; },
          op: { tool: 'injector', anchor: 'forehead', game: 'hold', verb: 'Age', shot: 'face', paint: 0x8ab060, does: 'serum for the years' } },
      ] },
    ];
    let si = 0, li = 0;
    const cur = () => SECTIONS[si].lines[li];
    const pending = (L: Line) => L.get(app) !== L.get(done);
    const sectionPending = (S = SECTIONS[si]) => S.lines.filter(pending);

    // ---------------- skeleton: floating words, pixel chevrons
    const root = h('div', 'nx cz');
    const head = h('div', 'cz-head');
    const linesEl = h('div', 'cz-lines');
    const toolEl = h('div', 'cz-tool');
    const tabs = h('nav', 'cz-tabs');
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
    top.append(h('div', 'cz-id', `<span>subject</span> <b>${esc(name)}</b>`), gamesB);
    const col = h('div', 'cz-col');
    col.append(linesEl, toolEl);
    root.append(head, col, tabs, backB, nextB, top, result, toast);

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
      const S = SECTIONS[si];
      head.innerHTML = `<span class="n">${String(si + 1).padStart(2, '0')} <i>/</i> ${String(SECTIONS.length).padStart(2, '0')}</span><b>${esc(S.title)}</b><small>${esc(S.note)}</small>`;
      if (animate) { head.classList.remove('in'); void head.offsetWidth; head.classList.add('in'); }
    };
    const paintTabs = () => {
      tabs.innerHTML = '';
      SECTIONS.forEach((S, i) => {
        const b = h('button', 'cz-tab' + (i === si ? ' on' : '') + (sectionPending(S).length ? ' pend' : ''), `<span>${esc(S.title.split(' ')[0])}</span>`) as HTMLButtonElement;
        b.type = 'button';
        b.setAttribute('aria-label', `${S.title}${i === si ? ' (here)' : ''}`);
        b.addEventListener('click', () => { if (i !== si) void goSection(i); });
        tabs.append(b);
      });
    };
    const paintTool = () => {
      const L = cur();
      if (L.op === 'press') { toolEl.innerHTML = `<b>The press</b><span>a fresh body, same choices</span>`; return; }
      const thumb = stage.toolThumb(L.op.tool, 36);
      toolEl.innerHTML = `${thumb ? `<img src="${thumb}" alt="">` : ''}<b>${esc(TOOL_NAME[L.op.tool])}</b><span>${esc(L.op.does)}</span>`;
    };
    const lineEls: HTMLElement[] = [];
    const paintLines = (animate = false, only = -1) => {
      const S = SECTIONS[si];
      if (lineEls.length !== S.lines.length || animate) {
        linesEl.innerHTML = ''; lineEls.length = 0;
        S.lines.forEach((_L, i) => {
          const row = h('div', 'cz-line');
          const lab = h('button', 'cz-lab') as HTMLButtonElement; lab.type = 'button';
          const l = h('button', 'cz-arr l', `<img src="${chevron('l')}" alt="">`) as HTMLButtonElement; l.type = 'button';
          const v = h('span', 'cz-v');
          const r = h('button', 'cz-arr r', `<img src="${chevron('r')}" alt="">`) as HTMLButtonElement; r.type = 'button';
          const c = h('span', 'cz-c');
          const p = h('span', 'cz-pend', `<img src="${diamond()}" alt=""><em>unoperated</em>`);
          l.setAttribute('aria-label', 'Previous'); r.setAttribute('aria-label', 'Next look');
          const pickMe = () => { if (li !== i && phase === 'look' && !busy) { li = i; sfx('tick'); paintLines(); lineChanged(); } };
          lab.addEventListener('click', pickMe);
          l.addEventListener('click', () => { pickMe(); step(-1); });
          r.addEventListener('click', () => { pickMe(); step(1); });
          row.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') pickMe(); });
          const vrow = h('div', 'cz-vrow');
          vrow.append(l, v, r, c, p);
          row.append(lab, vrow);
          linesEl.append(row); lineEls.push(row);
        });
        if (animate) { linesEl.classList.remove('in'); void linesEl.offsetWidth; linesEl.classList.add('in'); }
      }
      S.lines.forEach((L, i) => {
        const row = lineEls[i];
        row.classList.toggle('on', i === li);
        row.classList.toggle('pend', pending(L));
        if (only >= 0 && i !== only) return;
        const list = L.list(), k = L.get(app), v = list[k];
        (row.querySelector('.cz-lab') as HTMLElement).innerHTML = `<span>${esc(L.label)}</span>`;
        const ve = row.querySelector('.cz-v') as HTMLElement;
        ve.innerHTML = `${v?.chip != null ? `<img src="${chipUrl(v.chip)}" alt="">` : ''}<i>${esc(v?.name ?? '?')}</i>`;
        (row.querySelector('.cz-c') as HTMLElement).textContent = `${k + 1}/${list.length}`;
        row.setAttribute('aria-label', `${L.label}: ${v?.name ?? ''} (${k + 1} of ${list.length})`);
        if (only === i) { ve.classList.remove('in'); void ve.offsetWidth; ve.classList.add('in'); }
      });
      paintNext();
    };
    const paintNext = () => {
      const n = sectionPending().length;
      nextB.classList.toggle('op', n > 0);
      nextB.innerHTML = n > 0 ? `<span>Operate</span><img src="${chevron('r', 'red')}" alt="">` : `<span>${si === SECTIONS.length - 1 ? 'Begin' : 'Next'}</span><img src="${chevron('r', 'green')}" alt="">`;
      nextB.setAttribute('aria-label', n > 0 ? `Operate (${n} change${n > 1 ? 's' : ''})` : si === SECTIONS.length - 1 ? 'Begin' : 'Next section');
      backB.innerHTML = `<img src="${chevron('l', 'steel')}" alt=""><span>${si === 0 ? 'Leave' : 'Back'}</span>`;
      tabs.querySelectorAll('.cz-tab').forEach((t, i) => t.classList.toggle('pend', sectionPending(SECTIONS[i]).length > 0));
    };

    // ---------------- the line in view: camera, tool, scanner
    const lineChanged = () => {
      const L = cur();
      frame();
      void stage.shot(L.shot, 750);
      if (L.op === 'press') { stage.useTool(null); stage.scan(true, 'chest'); }
      else { stage.useTool(L.op.tool, L.op.anchor); if (L.op.paint !== undefined) stage.setPaint(L.op.paint); stage.scan(true, L.op.anchor); }
      paintTool();
      scanPulse();
    };
    let scanT = 0;
    const scanPulse = () => {
      const L = cur();
      stage.scan(true, L.op === 'press' ? 'chest' : L.op.anchor);
      clearTimeout(scanT);
      scanT = window.setTimeout(() => stage.scan(false), 1600);
    };

    // ---------------- browsing: the model changes live
    const step = (d: -1 | 1) => {
      if (phase !== 'look' || busy || closing) return;
      const L = cur();
      const n = L.list().length;
      L.set(app, (L.get(app) + d + n) % n);
      if (L.gradual === 'skin' || L.gradual === 'hair') stage.setPaint(L.gradual === 'skin' ? app.skin : app.hair);
      if (L.gradual === 'eye') stage.setPaint(app.eyeColor ?? 0x40a0ff);
      show(app);
      paintLines(false, li);
      scanPulse();
      sfx('key', 0.8);
      if (L.op === 'press' && pending(L)) say('<b>The press</b> · OPERATE makes the new frame');
    };
    const pickLine = (d: number) => {
      const n = SECTIONS[si].lines.length;
      if (n < 2) return;
      li = (li + d + n) % n;
      sfx('tick');
      paintLines();
      lineChanged();
    };

    // ---------------- operating: each pending change by its tool
    const opLine = async (L: Line) => {
      if (!pending(L)) return;
      const from = L.get(done), to = L.get(app);
      const target: Appearance = { ...app };
      // on the table he still has the old part; the work brings in the new one
      const before: Appearance = { ...app };
      L.set(before, from);
      if (L.op === 'press') {
        show(before);
        const res = games ? await playGame(stage, { kind: 'tap', tool: 'stamp', verb: 'Slam', anchor: 'chest', hits: 1, hint: matchMedia('(pointer: coarse)').matches ? 'tap to drop the press' : 'press <b>space</b> in the lit teeth to drop the press' }, root, true) : await autoPlay(stage, { kind: 'tap', tool: 'stamp', verb: '', anchor: 'chest' }, true);
        root.classList.add('pressing');
        sfx('lever');
        await stage.press(() => show(target));
        stage.setView('creator');
        root.classList.remove('pressing');
        verdict(res.grade, res.skipped, { big: res.grade === 'fail' ? 'Messy press' : 'Clean press', small: `clone ${to === 0 ? 'F' : 'M'}-${Math.floor(100 + Math.random() * 900)} · same choices, fresh body` });
        L.set(done, to);
        return;
      }
      const op = L.op;
      show(before);
      const grad = L.gradual;
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
      L.set(done, to);
    };
    const operateSection = async (S = SECTIONS[si]) => {
      const list = sectionPending(S);
      if (!list.length) return;
      busy = true;
      root.classList.add('operating');
      // the picked line first, then the rest in order
      const order = [...list].sort((a, b) => (a === cur() ? -1 : b === cur() ? 1 : 0));
      for (const L of order) {
        if (closing) break;
        li = S.lines.indexOf(L);
        paintLines();
        await opLine(L);
        paintLines(false, li);
        await new Promise((r) => setTimeout(r, 380));
      }
      root.classList.remove('operating');
      busy = false;
      paintLines();
      lineChanged();
    };

    // ---------------- sections
    const setSection = (i: number) => {
      const wasBody = SECTIONS[si].key === 'body';
      si = Math.max(0, Math.min(SECTIONS.length - 1, i));
      if (wasBody !== (SECTIONS[si].key === 'body')) show(app);
      li = 0;
      root.dataset.section = SECTIONS[si].key;
      paintHead(true);
      paintLines(true);
      paintTabs();
      lineChanged();
      sfx('tab');
    };
    /** leave this section for another: its pending changes are operated first */
    const goSection = async (i: number) => {
      if (phase !== 'look' || busy || closing) return;
      if (sectionPending().length) { await operateSection(); }
      if (closing) return;
      setSection(i);
    };
    const next = async () => {
      if (phase !== 'look' || busy || closing) return;
      if (sectionPending().length) { await operateSection(); return; }
      if (si < SECTIONS.length - 1) { setSection(si + 1); return; }
      void finish();
    };
    const back = () => {
      if (phase !== 'look' || busy || closing) return;
      if (si > 0) { void goSection(si - 1); return; }
      void leave();
    };

    // ---------------- touch / wheel / clicking the body
    stage.onSwipe = (d) => step(d);
    stage.onPick = (p: PartKey | null) => {
      if (phase !== 'look' || closing || busy || !p) return;
      const k = PART_SECTION[p];
      const i = SECTIONS.findIndex((S) => S.key === k);
      if (i >= 0 && i !== si) void goSection(i);
    };

    // ---------------- the end: a last scan, the photo, into the game
    const finish = async () => {
      // anything changed and never operated (a jump between sections) is made now
      for (const S of SECTIONS) if (sectionPending(S).length) { const k = SECTIONS.indexOf(S); si = k; paintHead(false); paintLines(true); await operateSection(S); }
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
      result.innerHTML = `<b>${esc(name)}</b><small>${esc(number)} · intake complete</small>`;
      void result.offsetWidth; result.classList.add('on');
      await new Promise((r) => setTimeout(r, 500));
      sfx('shutter'); stage.flashOnce();
      await new Promise((r) => setTimeout(r, 1400));
      close({ name: name.slice(0, 24), app: { ...app, cos: wornCos() }, occupation: 'unemployed', traits: [], sandbox: { ...sb }, seed, directives });
    };
    const leave = async () => {
      closing = true; phase = 'out'; root.dataset.phase = 'out';
      // the unoperated preview goes: he is put back as he was
      show(done);
      await stage.lightsOff();
      close(null);
    };

    let nav: FocusNav;
    const close = (r: IntakeResult | null) => {
      nav.destroy();
      clearTimeout(toastT); clearTimeout(scanT); clearTimeout(resT);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onEnter, true);
      stage.onSwipe = undefined; stage.onHeadScroll = undefined; stage.onPick = undefined; stage.onHover = undefined;
      stage.scan(false);
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
    const onResize = () => { if (portrait() !== lastP || shortView() !== lastS) { lastP = portrait(); lastS = shortView(); root.classList.toggle('portrait', lastP); if (phase === 'look' && !busy) lineChanged(); } };
    window.addEventListener('resize', onResize);

    // ---------------- go: lights on, then the first section
    document.body.append(root);
    root.dataset.phase = 'intro';
    root.classList.toggle('portrait', portrait());
    paintTop();
    show(app);
    stage.setFocus('full');
    nav = new FocusNav(root, {
      onBack: () => back(),
      onTab: (d) => { if (phase === 'look' && !busy) void goSection(si + d); },
      onArrow: (dx, dy) => {
        if (phase === 'look' && !busy) { if (dx) step(dx < 0 ? -1 : 1); else if (dy) pickLine(dy); }
        return true;
      },
      autofocus: false,
    });
    stage.lightsOn().then(() => {
      if (closing) return;
      phase = 'look';
      root.dataset.phase = 'look';
      stage.setView('creator');
      setSection(0);
      requestAnimationFrame(() => nextB.focus({ preventScroll: true }));
    });
    if (import.meta.env.DEV) (window as any).__intake = { stage, app, get done() { return done; }, setSection, step, next, back, pickLine, operateSection, get phase() { return phase; }, get section() { return si; }, get busy() { return busy; }, setGames: (v: boolean) => { games = v; paintTop(); } };
  });
}
