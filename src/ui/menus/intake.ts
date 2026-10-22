// SUBJECT INTAKE: the creator, played in the subject room (room3d.ts) with
// the lights on, all on ONE page. The subject hangs in the arms' grip.
//  LEFT    the appearance: page plates (FACE, HAIR, SKIN, BODY, MARKS, ID) and
//          rows of free-floating labels, each with a bakelite rocker key.
//          Face rows are cut by the tool arm (the saw); scroll / swipe the
//          head for a whole new face.
//  LEVERS  the body type: two knife-switch levers either side of the subject.
//          Throwing one drops the press, the arms bring a fresh clone of
//          that type with the same choices out of the hatch.
//  RIGHT   the issue store: the wardrobe on a green phosphor terminal
//          (wardrobe.ts). Every piece is free.
//  CONFIRM hands over to the operating table (src/ui/surgery: startSurgery,
//          looked up at run time; without it the Rehab Section deals the
//          programme and conditions), then PROCESSED. The sentencing terms
//          (world rules) open on a terminal from the bottom bar.
import type { Appearance, Outfit } from '../../entities/humanRig';
import { randomAppearance, EYE_COLORS, SKIN_TONES } from '../../entities/humanRig';
import { Player } from '../../entities/player';
import { TRAITS, occupationByKey, type Occupation } from '../../survival/traits';
import { hasItemDef, itemDef } from '../../items/item';
import {
  FACE_SHAPES, EYE_SHAPES, BROWS, NOSES, MOUTHS, EARS, FACIAL_HAIR_ALL, HAIR_STYLES_ALL, HAIR_DYES, TATTOO_SPOTS, TATTOOS, tattoosFor, SCAR_SPOTS, BODY_SCARS,
  KNUCKLES, NAILS, SUIT_SLEEVES, SUIT_WEAR, STAINS, PATCHES, FEET_KIT, feetKitItems, randomLooks, suitNumber, shapeOf, eyeShapeOf, browsOf, noseOf, mouthOf, type Opt,
} from '../../entities/humanLooks';
import type { CosSlot } from '../../game/cosmetics';
import { h, esc, FocusNav, sfx, confirmDialog } from './common';
import { SubjectRoom, type PartKey } from './room3d';
import { installRetroKit } from './retroKit';
import { G } from '../../game/G';
import { toUrl } from '../pixelkit';
import { tattooImage } from './art';
import { rehabStation, type RehabCtx } from './rehab';
import { termsStation, type TermsCtx, PRESETS } from './terms';
import { CONTRACT_SANDBOX } from '../../game/debt/defaults';
import { plateBtn, rocker, lever, chipUrl, type PlateButton, type Rocker, type Lever } from './btnKit';
import { terminal } from './terminal';
import { wardrobe } from './wardrobe';
import './noir.css';

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
/** the Remittance issue: the jumpsuit (or a stand-in until it exists) and the chosen footwear */
export function prisonerOutfitFor(app: Appearance, inspect = false): Outfit {
  const keys = [hasItemDef('prison_jumpsuit') ? 'prison_jumpsuit' : 'janitor_uniform', ...feetKitItems(app)];
  const { outfit } = outfitOfItems(keys);
  if (!hasItemDef('prison_jumpsuit')) for (const k of ['torso', 'legs'] as const) if (outfit[k]) outfit[k] = { ...outfit[k]!, color: 0xd9a826 };
  if ((app.feetKit ?? 'slipons') === 'slipons' && !hasItemDef('canvas_slipons')) outfit.feet = { tex: 'c_shoes_sneaker', color: 0xe4e0d4, item: 'slipons' };
  // examining body marks: the top half of the jumpsuit comes down
  if (inspect) outfit.torso = { tex: (app.bodyShape ?? 0.3) > 0.5 ? 'c_bandeau' : 'c_bare', color: 0xe8e4d8, sleeve: 'none' };
  return outfit;
}

// ---------------------------------------------------------------- the operating table (cyberware agent), found at run time
type SurgeryFn = (...a: any[]) => unknown;
async function findSurgery(): Promise<SurgeryFn | null> {
  const mods = import.meta.glob(['../surgery/*.ts', '../surgery.ts']);
  const rank = (k: string) => (/index\.ts$/.test(k) ? 0 : /surgery\.ts$/.test(k) ? 1 : /table|start|flow/.test(k) ? 2 : 3);
  for (const k of Object.keys(mods).sort((a, b) => rank(a) - rank(b))) {
    try { const m: any = await mods[k](); if (typeof m.startSurgery === 'function') return m.startSurgery; } catch (e) { console.warn('surgery module', k, e); }
  }
  return null;
}

// ---------------------------------------------------------------- pages and camera shots
type Shot = 'face' | 'body' | 'full' | 'feet';
type PageKey = 'face' | 'hair' | 'skin' | 'body' | 'marks' | 'id' | 'ward';
const PAGES: [PageKey, string, Shot][] = [['face', 'Face', 'face'], ['hair', 'Hair', 'face'], ['skin', 'Skin', 'face'], ['body', 'Body', 'body'], ['marks', 'Marks', 'body'], ['id', 'Papers', 'full']];
const SHOT_PART: Record<Shot, string> = { face: 'head', body: 'torso', full: 'full', feet: 'feet' };
const PART_PAGE: Record<string, PageKey> = { head: 'face', hair: 'hair', torso: 'marks', armL: 'marks', armR: 'marks', handL: 'skin', handR: 'skin', legL: 'body', legR: 'body', feet: 'body' };
const PART_LABEL: Record<string, string> = { head: 'Face · scroll for a new one', hair: 'Hair', torso: 'Body marks', armL: 'Left arm', armR: 'Right arm', handL: 'Hands', handR: 'Hands', legL: 'Build', legR: 'Build', feet: 'Feet' };
const SLOT_SHOT: Record<CosSlot, Shot> = { suit: 'full', hat: 'face', eyes: 'face', face: 'face', neck: 'body', back: 'full' };
const SKIN_ALL = [0xf8dcc8, ...SKIN_TONES, 0x4a2c1c];
const BUILDS: [string, string, number][] = [['wiry', 'Wiry', 58], ['slim', 'Slim', 64], ['average', 'Average', 75], ['broad', 'Broad', 86], ['stocky', 'Stocky', 92], ['heavy', 'Heavy', 108]];
const HEIGHTS = [0.92, 0.94, 0.96, 0.98, 1, 1.02, 1.04, 1.06, 1.08];
/** a plain word for a colour: skin by depth, eyes and hair by hue */
function colourName(c: number, kind: 'skin' | 'eye' | 'hair'): string {
  const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let hue = 0;
  if (d) hue = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue *= 60;
  if (kind === 'skin') return l > 0.86 ? 'porcelain' : l > 0.76 ? 'fair' : l > 0.66 ? 'light' : l > 0.54 ? 'tan' : l > 0.42 ? 'brown' : l > 0.28 ? 'dark' : 'deep';
  if (l < 0.13) return 'black';
  if (sat < 0.14 || d < 0.06) return l > 0.82 ? 'white' : l > 0.55 ? 'grey' : l > 0.3 ? 'ash' : 'charcoal';
  if (kind === 'eye') return hue < 40 ? (l < 0.35 ? 'dark brown' : l < 0.5 ? 'brown' : 'amber') : hue < 70 ? 'hazel' : hue < 165 ? 'green' : hue < 260 ? (l > 0.6 ? 'pale blue' : 'blue') : 'violet';
  if (hue < 18 || hue >= 340) return l < 0.4 ? 'auburn' : 'red';
  if (hue < 45) return l < 0.22 ? 'dark brown' : l < 0.36 ? 'brown' : l < 0.6 ? 'copper' : 'strawberry';
  if (hue < 70) return l < 0.5 ? 'dirty blond' : l < 0.75 ? 'blond' : 'platinum';
  if (hue < 165) return 'green';
  if (hue < 260) return 'blue';
  return 'pink';
}

/** the room's camera hooks (the scene worker adds them; older rooms simply lack them) */
type RoomCam = { shot?: (k: string, ms?: number) => void; setFraming?: (dx: number) => void };

/** show the intake; resolves with the processed subject or null if they withdrew */
export function intakeForm(opts: { title?: string; sandbox?: boolean; directives?: boolean; submit?: string; room?: SubjectRoom; app?: Appearance } = {}): Promise<IntakeResult | null> {
  return new Promise((resolve) => {
    installRetroKit();
    const app: Appearance = opts.app ? { ...opts.app } : { ...randomAppearance(Math.random), ...randomLooks(Math.random, Math.random() < 0.5) };
    if (!app.cos) app.cos = [];
    let name = randomName();
    let occ = 'unemployed';
    const traits = new Set<string>();
    let preset = 'standard';
    const sb: Record<string, number> = { ...CONTRACT_SANDBOX, ...((G?.sandbox as any) || {}), ...PRESETS.standard.s };
    let seed = Math.floor(Math.random() * 99999);
    let directives = opts.directives ?? true;
    const withSandbox = opts.sandbox !== false;
    let phase: 'intro' | 'look' | 'out' = 'intro';
    let page: PageKey = 'face';
    let closing = false;

    // ---------------- the room (the title's, or one of our own)
    let ownHost: HTMLElement | null = null;
    let room = opts.room;
    if (!room) { ownHost = h('div', 'nx nx-stage nx-own'); document.body.append(ownHost); room = new SubjectRoom(ownHost); }
    const stage = room;
    const cam = stage as unknown as RoomCam;
    let curShot: Shot = 'full';
    const shot = (k: Shot, part?: string) => {
      curShot = k;
      stage.setFocus(part ?? SHOT_PART[k]);
      cam.shot?.(k, 700);
    };

    // ---------------- skeleton
    const root = h('div', 'nx ik3');
    const top = h('div', 'ik3-top');
    const plate = h('div', 'ik3-title kf', `<b class="kf-cap">${esc(opts.title || 'Subject intake')}</b><small class="kf-it">Meridian Institute · Remittance Programme</small>`);
    const back = plateBtn('Withdraw', () => withdraw(), { finish: 'oxblood', size: 'md', shape: 'arrowL', lamp: false, sound: 'back' });
    top.append(back, plate);
    const left = h('section', 'ik3-left');
    const tabsEl = h('div', 'ik3-tabs');
    tabsEl.setAttribute('role', 'tablist');
    const pageEl = h('div', 'ik3-page');
    const actions = h('div', 'ik3-acts');
    left.append(tabsEl, pageEl, actions);
    const wardHost = h('section', 'ik3-right');
    const bottom = h('div', 'ik3-bottom');
    const confirmBtn = plateBtn('Confirm', () => finish(), { finish: 'brass', size: 'lg', sub: 'to the operating table', lamp: 'green', sound: '' });
    const termsBtn = plateBtn('Sentencing terms', () => openTerms(), { finish: 'olive', size: 'md', shape: 'tag', lamp: false });
    bottom.append(...(withSandbox ? [termsBtn] : []), confirmBtn);
    const hint = h('div', 'ik3-hint kf kf-it', '');
    const hoverTag = h('div', 'ik3-hovertag kf');
    const toast = h('div', 'ik3-toast kf');
    const levers = h('div', 'ik3-levers');
    const lvHead = h('div', 'ik3-lv-h kf', '<b class="kf-cap">Body type</b><small class="kf-it">throw a lever · the press takes this one</small>');
    const sheet = h('div', 'ik3-sheet');
    const stampEl = h('div', 'ik3-stamp');
    root.append(top, left, wardHost, levers, lvHead, bottom, hint, hoverTag, toast, sheet, stampEl);

    // ---------------- helpers
    let toastT = 0;
    const say = (s: string) => { toast.innerHTML = s; toast.classList.remove('on'); void toast.offsetWidth; toast.classList.add('on'); clearTimeout(toastT); toastT = window.setTimeout(() => toast.classList.remove('on'), 3200); };
    let looksT = 0;
    const inspect = () => phase === 'look' && page === 'marks';
    const refreshLooks = () => {
      clearTimeout(looksT);
      looksT = window.setTimeout(() => { stage.setAppearance(app); stage.setOutfit(prisonerOutfitFor(app, inspect())); }, 30);
    };
    const portrait = () => window.innerHeight > window.innerWidth * 1.05;
    const updateHint = () => {
      const coarse = matchMedia('(pointer: coarse)').matches;
      hint.innerHTML = phase === 'look'
        ? (coarse ? 'swipe on the head: a new face · drag: turn · tap a part' : 'wheel on the head: a new face · drag: turn · click a part · Q / E pages')
        : '';
    };

    // ---------------- a row: free label, the value, a rocker key
    type RowOpt = { name: string; chip?: number; img?: string; note?: string };
    const rows: (() => void)[] = [];
    const rockers: Rocker[] = [];
    const row = (label: string, list: () => RowOpt[], get: () => number, set: (i: number) => void, o: { maul?: boolean; shot?: Shot; part?: string; count?: boolean } = {}) => {
      const r = h('div', 'ik3-row');
      const l = h('span', 'ik3-rl kf kf-cap', esc(label));
      const v = h('span', 'ik3-rv kf');
      const paint = () => {
        const L = list(), i = get(), it = L[i];
        v.innerHTML = `${it?.chip != null ? `<img class="ik3-chip" src="${chipUrl(it.chip)}" alt="">` : ''}${it?.img ? `<img class="ik3-thumb" src="${it.img}" alt="">` : ''}<i>${esc(it?.name ?? '?')}</i>${o.count === false ? '' : `<em>${i + 1}/${L.length}</em>`}`;
        v.title = it?.note || '';
      };
      const step = (d: -1 | 1) => {
        if (phase !== 'look') return;
        const L = list();
        const i = (get() + d + L.length) % L.length;
        if (o.shot) shot(o.shot, o.part);
        if (o.maul) { void stage.maul(() => { set(i); paint(); stage.setAppearance(app); }); return; }
        set(i); paint(); refreshLooks();
      };
      const rk = rocker(step, { label, finish: 'cream', seed: label.length * 13 });
      rockers.push(rk);
      for (const b of [rk.prev, rk.next]) b.addEventListener('focus', () => { if (o.shot && curShot !== o.shot) shot(o.shot, o.part); });
      paint();
      rows.push(paint);
      r.append(l, v, rk.el);
      return r;
    };
    const optRow = (label: string, list: Opt[], get: () => string, set: (k: string) => void, o: { shot?: Shot; part?: string } = {}) =>
      row(label, () => list, () => Math.max(0, list.findIndex((x) => x.key === get())), (i) => set(list[i].key), o);
    const colourRow = (label: string, kind: 'skin' | 'eye' | 'hair', list: number[], get: () => number, set: (c: number) => void, o: { shot?: Shot; part?: string } = {}) =>
      row(label, () => list.map((c) => ({ name: colourName(c, kind), chip: c })), () => Math.max(0, list.indexOf(get())), (i) => set(list[i]), o);
    const shapeIndex = () => {
      if (app.jaw != null) return app.jaw;
      const s = shapeOf(app);
      return s.jaw > 1.04 ? 6 : s.jaw < 0.98 ? 4 : 0;
    };

    // ---------------- faces: scroll the head, the saw makes a new one (history so scrolling back returns)
    type Face = { jaw: number; eyeShape: number; brows: number; nose: number; mouth: number; ears: number };
    const curFace = (): Face => ({ jaw: shapeIndex(), eyeShape: eyeShapeOf(app), brows: browsOf(app), nose: noseOf(app), mouth: mouthOf(app), ears: app.ears ?? 0 });
    const faces: Face[] = [curFace()];
    let faceAt = 0;
    const rndFace = (): Face => ({ jaw: Math.floor(Math.random() * FACE_SHAPES.length), eyeShape: Math.floor(Math.random() * EYE_SHAPES.length), brows: Math.floor(Math.random() * BROWS.length), nose: Math.floor(Math.random() * NOSES.length), mouth: Math.floor(Math.random() * MOUTHS.length), ears: Math.floor(Math.random() * EARS.length) });
    let mauling = false;
    const newFace = (dir: 1 | -1) => {
      if (phase !== 'look' || mauling || stage.busy) return;
      faces[faceAt] = curFace();
      if (dir > 0) { faceAt++; if (faceAt >= faces.length) faces.push(rndFace()); }
      else if (faceAt > 0) faceAt--; else { faces.unshift(rndFace()); }
      const f = faces[faceAt];
      mauling = true;
      if (page !== 'face') setPage('face', false);
      shot('face');
      stage.maul(() => { Object.assign(app, f); stage.setAppearance(app); for (const p of rows) p(); }).then(() => { mauling = false; });
      say(`<b>Face ${faceAt + 1}</b> · scroll ${dir > 0 ? 'on' : 'back'} for another`);
    };
    stage.onHeadScroll = (d) => newFace(d);

    // ---------------- the pages
    let tatSpot = 'chest', scarSpot = 'chest';
    let nameInput: HTMLInputElement | null = null;
    const buildPage = (k: PageKey): HTMLElement => {
      rows.length = 0;
      rockers.length = 0;
      const wrap = h('div', 'ik3-rows');
      const add = (...els: HTMLElement[]) => wrap.append(...els);
      if (k === 'face') {
        const m = { maul: true, shot: 'face' as Shot };
        add(
          row('Face shape', () => FACE_SHAPES, () => shapeIndex(), (i) => { app.jaw = i; }, m),
          row('Eyes', () => EYE_SHAPES, () => eyeShapeOf(app), (i) => { app.eyeShape = i; }, m),
          row('Brows', () => BROWS, () => browsOf(app), (i) => { app.brows = i; }, m),
          row('Nose', () => NOSES, () => noseOf(app), (i) => { app.nose = i; }, m),
          row('Mouth', () => MOUTHS, () => mouthOf(app), (i) => { app.mouth = i; }, m),
          row('Ears', () => EARS, () => app.ears ?? 0, (i) => { app.ears = i; }, m),
          colourRow('Iris', 'eye', EYE_COLORS, () => app.eyeColor ?? EYE_COLORS[0], (c) => { app.eyeColor = c; }, { shot: 'face' }),
        );
      } else if (k === 'hair') {
        add(
          optRow('Cut', HAIR_STYLES_ALL, () => app.hairStyle || HAIR_STYLES_ALL[0].key, (v) => { (app as any).hairStyle = v; }, { shot: 'face', part: 'hair' }),
          colourRow('Dye', 'hair', HAIR_DYES, () => app.hair, (c) => { app.hair = c; }, { shot: 'face', part: 'hair' }),
          optRow('Facial hair', FACIAL_HAIR_ALL, () => app.facialHair || 'none', (v) => { (app as any).facialHair = v; app.beard = v === 'beard'; }, { shot: 'face' }),
        );
      } else if (k === 'skin') {
        add(
          colourRow('Skin', 'skin', SKIN_ALL, () => app.skin, (c) => { app.skin = c; }, { shot: 'face' }),
          row('Freckles', () => [{ name: 'None' }, { name: 'A few' }, { name: 'Lots' }], () => ((app.freckles ?? 0) < 0.15 ? 0 : (app.freckles ?? 0) < 0.6 ? 1 : 2), (i) => { app.freckles = [0, 0.4, 0.9][i]; }, { shot: 'face' }),
          row('Wear and tear', () => [{ name: 'Young' }, { name: 'Lined' }, { name: 'Weathered' }, { name: 'Old' }], () => Math.min(3, Math.round((app.age ?? 0) / 0.3)), (i) => { app.age = [0, 0.3, 0.6, 0.9][i]; }, { shot: 'face' }),
          row('Face scars', () => [{ name: 'None' }, { name: 'One' }, { name: 'Two' }, { name: 'Several' }], () => app.scars ?? 0, (i) => { app.scars = i; }, { shot: 'face' }),
          row('Nails', () => Object.values(NAILS).map((n) => ({ name: n.name, chip: n.color || undefined })), () => Math.max(0, Object.keys(NAILS).indexOf(app.nails || 'clean')), (i) => { app.nails = Object.keys(NAILS)[i]; }, { shot: 'body', part: 'handR' }),
        );
      } else if (k === 'body') {
        add(
          row('Build', () => BUILDS.map(([, l, kg]) => ({ name: `${l} · ${kg} kg` })), () => Math.max(0, BUILDS.findIndex((b) => b[0] === String(app.build))), (i) => { (app as any).build = BUILDS[i][0]; }, { shot: 'full', count: false }),
          row('Height', () => HEIGHTS.map((v) => ({ name: `${Math.round(172 * v)} cm` })), () => HEIGHTS.reduce((bi, v, i) => (Math.abs(v - app.height) < Math.abs(HEIGHTS[bi] - app.height) ? i : bi), 0), (i) => { app.height = HEIGHTS[i]; }, { shot: 'full', count: false }),
          optRow('Sleeves', SUIT_SLEEVES, () => app.suit?.sleeves || 'down', (v) => { (app.suit ||= {}).sleeves = v; }, { shot: 'body' }),
          optRow('Footwear', FEET_KIT, () => app.feetKit ?? 'slipons', (v) => { app.feetKit = v; }, { shot: 'feet' }),
        );
      } else if (k === 'marks') {
        const spots = ['chest', 'back', 'belly', 'neck', 'face', 'uarm_l', 'farm_l', 'uarm_r', 'farm_r'].filter((s) => TATTOO_SPOTS[s]);
        if (!spots.includes(tatSpot)) tatSpot = spots[0];
        const designs = () => ['', ...tattoosFor(tatSpot)];
        let designRow: HTMLElement;
        add(
          row('Ink spot', () => spots.map((s) => ({ name: TATTOO_SPOTS[s].name + (app.tattoos?.[s] ? ' · inked' : '') })), () => spots.indexOf(tatSpot), (i) => { tatSpot = spots[i]; for (const p of rows) p(); }, { shot: 'body' }),
          designRow = row('Tattoo', () => designs().map((d) => (d ? { name: TATTOOS[d].name, img: toUrl(tattooImage(d, 1)) } : { name: 'None' })), () => Math.max(0, designs().indexOf(app.tattoos?.[tatSpot] || '')), (i) => {
            const d = designs()[i]; const t = { ...(app.tattoos || {}) };
            if (d) t[tatSpot] = d; else delete t[tatSpot];
            app.tattoos = t; sfx('grind', 0.3);
            for (const p of rows) p();
          }, { shot: 'body' }),
        );
        void designRow;
        const sSpots = Object.keys(SCAR_SPOTS);
        if (!sSpots.includes(scarSpot)) scarSpot = sSpots[0];
        const kinds = ['', ...Object.keys(BODY_SCARS)];
        add(
          row('Wound spot', () => sSpots.map((s) => ({ name: SCAR_SPOTS[s].name + (app.bodyScars?.[s] ? ' · marked' : '') })), () => sSpots.indexOf(scarSpot), (i) => { scarSpot = sSpots[i]; for (const p of rows) p(); }, { shot: 'body' }),
          row('Old wound', () => kinds.map((s) => ({ name: s ? BODY_SCARS[s] : 'None' })), () => Math.max(0, kinds.indexOf(app.bodyScars?.[scarSpot] || '')), (i) => {
            const s = kinds[i]; const t = { ...(app.bodyScars || {}) };
            if (s) t[scarSpot] = s; else delete t[scarSpot];
            app.bodyScars = t; for (const p of rows) p();
          }, { shot: 'body' }),
          row('Knuckles', () => Object.values(KNUCKLES).map((v) => ({ name: v.l || v.r ? `${v.name} · ${v.l || '·'} ${v.r || '·'}` : v.name })), () => Math.max(0, Object.keys(KNUCKLES).indexOf(app.knuckles || 'none')), (i) => { app.knuckles = Object.keys(KNUCKLES)[i]; }, { shot: 'body', part: 'handR' }),
        );
      } else if (k === 'id') {
        const nr = h('div', 'ik3-row ik3-name');
        const ni = h('input', 'ik3-name-i') as HTMLInputElement;
        ni.value = name; ni.maxLength = 24; ni.spellcheck = false; ni.setAttribute('aria-label', 'Name');
        ni.addEventListener('input', () => { name = ni.value; });
        ni.addEventListener('focus', () => { if (G?.input) G.input.textFocus = true; });
        ni.addEventListener('blur', () => { if (G?.input) G.input.textFocus = false; });
        nameInput = ni;
        const dice = plateBtn('', () => { name = randomName(); ni.value = name; }, { glyph: 'dice', lamp: false, size: 'sm', finish: 'cream', shape: 'key', aria: 'Another name' });
        nr.append(h('span', 'ik3-rl kf kf-cap', 'Name'), ni, dice);
        add(nr, h('p', 'ik3-note kf kf-it', 'Number D-____ · assigned at processing, stencilled on your back'));
        const suit = () => (app.suit ||= {});
        add(
          optRow('Condition', SUIT_WEAR, () => String(suit().wear ?? 0), (v) => { suit().wear = Number(v); }, { shot: 'full' }),
          optRow('Stains', STAINS, () => suit().stains || 'none', (v) => { suit().stains = v; }, { shot: 'full' }),
          optRow('Number patch', PATCHES, () => suit().patch || 'stitched', (v) => { suit().patch = v; }, { shot: 'body' }),
        );
      }
      return wrap;
    };
    const tabBtns = new Map<PageKey, PlateButton>();
    const pageList = (): PageKey[] => [...PAGES.map((p) => p[0]), ...(portrait() ? ['ward' as PageKey] : [])];
    const buildTabs = () => {
      tabsEl.innerHTML = '';
      tabBtns.clear();
      for (const k of pageList()) {
        const label = k === 'ward' ? 'Wardrobe' : PAGES.find((p) => p[0] === k)![1];
        const b = plateBtn(label, () => setPage(k), { finish: k === 'ward' ? 'olive' : 'steel', size: 'sm', lamp: false, shape: 'key', full: true, cls: 'pb-c', sound: 'rocker', hover: '' });
        b.setAttribute('role', 'tab');
        b.classList.toggle('on', k === page);
        tabsEl.append(b);
        tabBtns.set(k, b);
      }
    };
    const setPage = (k: PageKey, sound = true) => {
      const wasInspect = inspect();
      if (k === 'ward' && !portrait()) k = 'face';
      page = k;
      for (const [tk, b] of tabBtns) { b.classList.toggle('on', tk === k); b.setAttribute('aria-selected', String(tk === k)); }
      root.dataset.page = k;
      pageEl.innerHTML = '';
      if (k === 'ward') {
        pageEl.append(ward.el);
        shot(SLOT_SHOT[ward.slot]);
      } else {
        pageEl.append(buildPage(k));
        if (wardHost.firstChild !== ward.el) wardHost.append(ward.el);
        shot((PAGES.find((p) => p[0] === k) || PAGES[0])[2]);
      }
      pageEl.scrollTop = 0;
      if (wasInspect !== inspect()) stage.setOutfit(prisonerOutfitFor(app, inspect()));
      if (sound) sfx('tab');
    };
    // the two plates under the page
    const sawBtn = plateBtn('New face', () => newFace(1), { glyph: 'saw', lamp: false, size: 'sm', finish: 'steel', aria: 'Saw on a new face (or scroll on the head)' });
    const someBtn = plateBtn('Somebody else', () => randomizeLooks(), { glyph: 'dice', lamp: false, size: 'sm', finish: 'steel' });
    actions.append(sawBtn, someBtn);

    // ---------------- the issue store (right)
    const ward = wardrobe({
      app,
      thumb: (k) => stage.thumb(k),
      canWear: () => phase === 'look',
      onWear: (slot, k) => {
        if (slot === 'back' && k) stage.orbitTo(1.0);
        refreshLooks();
      },
      onSlot: (slot) => { if (curShot !== SLOT_SHOT[slot]) shot(SLOT_SHOT[slot]); },
    });
    wardHost.append(ward.el);

    // ---------------- the body type levers
    const fem = () => (app.bodyShape ?? 0.3) > 0.5;
    const lvF: Lever = lever('Female', 'frame', () => clone(true), { handle: 'oxblood', seed: 31 });
    const lvM: Lever = lever('Male', 'frame', () => clone(false), { handle: 'navy', seed: 57 });
    lvF.el.classList.add('l'); lvM.el.classList.add('r');
    levers.append(lvF.el, lvM.el);
    const paintSex = () => { lvF.set(fem()); lvM.set(!fem()); };
    const clone = async (f: boolean) => {
      if (closing || stage.busy || phase !== 'look') return;
      root.classList.add('pressing');
      for (const b of [lvF.el, lvM.el, confirmBtn, termsBtn, back]) b.disabled = true;
      const L = f ? lvF : lvM;
      (f ? lvM : lvF).set(false);
      await L.pull();
      sfx('press');
      await stage.press(() => {
        app.bodyShape = f ? 0.82 + Math.random() * 0.12 : 0.04 + Math.random() * 0.16;
        stage.setAppearance(app);
        stage.setOutfit(prisonerOutfitFor(app, inspect()));
      });
      stage.setView('creator');
      shot(curShot);
      for (const b of [lvF.el, lvM.el, confirmBtn, termsBtn, back]) b.disabled = false;
      root.classList.remove('pressing');
      paintSex();
      say(`<b>Clone ${f ? 'F' : 'M'}-${Math.floor(100 + Math.random() * 900)}</b> · same choices, fresh body`);
      L.el.focus({ preventScroll: true });
    };

    // ---------------- picking on the body
    stage.onHover = (p, x, y) => {
      if (phase !== 'look' || closing) p = null;
      hoverTag.classList.toggle('on', !!p);
      if (!p) return;
      hoverTag.innerHTML = `<b>${esc(PART_LABEL[p] || p)}</b>`;
      hoverTag.style.transform = `translate(${Math.round(x + 16)}px, ${Math.round(y + 12)}px)`;
    };
    stage.onPick = (p: PartKey | null) => {
      if (phase !== 'look' || closing || !p) return;
      const t = PART_PAGE[p];
      if (t) setPage(t);
      stage.setFocus(p === 'head' ? 'head' : p);
    };

    // ---------------- steps
    const randomizeLooks = () => {
      if (phase !== 'look' || stage.busy) return;
      const keep = { cos: app.cos, bodyShape: app.bodyShape };
      Object.assign(app, randomAppearance(Math.random), randomLooks(Math.random, fem()), keep);
      faces.length = 0; faces.push(curFace()); faceAt = 0;
      sfx('confirm');
      void stage.maul(() => { stage.setAppearance(app); stage.setOutfit(prisonerOutfitFor(app, inspect())); });
      setPage(page, false);
    };
    const layout = () => {
      root.classList.toggle('portrait', portrait());
      const had = page;
      buildTabs();
      cam.setFraming?.(0);
      if (had === 'ward' && !portrait()) setPage('face', false);
      else if (phase === 'look') setPage(had, false);
    };
    let lastPortrait = portrait();
    const onResize = () => { if (portrait() !== lastPortrait) { lastPortrait = portrait(); layout(); } };
    window.addEventListener('resize', onResize);
    const toLook = () => {
      if (closing) return;
      phase = 'look';
      root.dataset.phase = 'look';
      stage.setView('creator');
      layout();
      paintSex();
      updateHint();
      requestAnimationFrame(() => confirmBtn.focus({ preventScroll: true }));
    };

    // ---------------- sheets on a terminal: sentencing terms, the rehab fallback
    const termsCtx: TermsCtx = {
      sb, get preset() { return preset; }, set preset(v) { preset = v; },
      get seed() { return seed; }, set seed(v) { seed = v; },
      get directives() { return directives; }, set directives(v) { directives = v; },
      get name() { return name; },
    };
    let sheetNav: FocusNav | null = null;
    const openSheet = (title: string, sub: string, el: HTMLElement, done: string, onDone: () => void, onTab?: (d: -1 | 1) => void) => {
      sheetNav?.destroy();
      sheet.innerHTML = '';
      const t = terminal({ title, sub, cls: 'ik3-sheet-t', model: 'Meridian · Records' });
      t.body.append(el);
      const ok = plateBtn(done, () => { closeSheet(); onDone(); }, { finish: 'brass', size: 'md', lamp: 'green' });
      t.keys.append(ok);
      sheet.append(t.el);
      sheet.classList.add('on');
      sfx('open', 0.7);
      sheetNav = new FocusNav(sheet, { onBack: () => closeSheet(), autofocus: true, onTab });
    };
    const closeSheet = () => { sheetNav?.destroy(); sheetNav = null; sheet.classList.remove('on'); sheet.innerHTML = ''; };
    let terms: ReturnType<typeof termsStation> | null = null;
    const openTerms = () => {
      if (closing || stage.busy) return;
      if (!terms) terms = termsStation(termsCtx);
      openSheet('Sentencing terms', 'form R-7 · the world you are sent to', terms.el, 'Done', () => termsBtn.focus({ preventScroll: true }));
      terms.enter();
    };
    const points = () => {
      let p = occupationByKey(occ).points;
      for (const k of traits) p += TRAITS.find((x) => x.key === k)?.cost ?? 0;
      return p;
    };
    const rehabCtx: RehabCtx = {
      get occ() { return occ; }, set occ(v) { occ = v; },
      traits, points, onChange: () => rehab?.refresh(),
      get name() { return name; },
      mugshot: () => stage.snapshot(24, 24),
    };
    let rehab: ReturnType<typeof rehabStation> | null = null;
    const rehabSheet = () => new Promise<void>((res) => {
      if (!rehab) rehab = rehabStation(rehabCtx);
      const go = () => { if (points() < 0) { sfx('error'); rehab!.deny('Not enough credits: drop a condition or take a cheaper programme.'); openSheet('Rehab section', 'programmes · conditions', rehab!.el, 'Continue', go); return; } res(); };
      openSheet('Rehab section', 'programmes · conditions', rehab.el, 'Continue', go);
      rehab.enter();
    });

    // ---------------- confirm: operating table, then processed
    const finish = async () => {
      if (closing || stage.busy || phase !== 'look') return;
      if (!name.trim()) { sfx('error'); setPage('id'); say('The subject needs a name.'); requestAnimationFrame(() => nameInput?.focus()); return; }
      if (points() < 0) { sfx('error'); return; }
      closing = true;
      phase = 'out';
      root.dataset.phase = 'out';
      sfx('confirm');
      const start = await findSurgery();
      if (start) {
        root.style.display = 'none';
        stage.paused = true;
        const ctx = { name: name.trim(), outfit: prisonerOutfitFor(app), occupation: occ, traits: [...traits] };
        const out: any = await new Promise((res) => {
          let done = false;
          const fin = (v?: unknown) => { if (!done) { done = true; res(v ?? null); } };
          try {
            const r: any = start(app, fin, ctx);
            if (r && typeof r.then === 'function') r.then(fin, (e: unknown) => { console.warn('surgery failed', e); fin(null); });
          } catch (e) { console.warn('surgery failed', e); fin(null); }
        });
        stage.paused = false;
        root.style.display = '';
        if (!out) {
          // they climbed off the table: back to the page
          closing = false; phase = 'look'; root.dataset.phase = 'look';
          stage.setOutfit(prisonerOutfitFor(app, inspect()));
          shot(curShot);
          requestAnimationFrame(() => confirmBtn.focus({ preventScroll: true }));
          return;
        }
        if (out && typeof out === 'object') {
          if (typeof out.occupation === 'string') occ = out.occupation;
          if (Array.isArray(out.traits)) { traits.clear(); for (const t of out.traits) traits.add(t); }
          if (out.app && typeof out.app === 'object') Object.assign(app, out.app);
        }
      } else {
        await rehabSheet();
      }
      // PROCESSED
      stage.setView('creator');
      stage.setOutfit(prisonerOutfitFor(app));
      shot('face');
      const number = suitNumber(stage.rigSeed);
      stampEl.innerHTML = `<b>${esc(opts.submit ? opts.submit.toUpperCase() : 'PROCESSED')}</b><span>${esc(number)} · ${esc(name.trim().toUpperCase())}</span>`;
      await new Promise((r) => setTimeout(r, 700));
      sfx('shutter'); stage.flashOnce();
      await new Promise((r) => setTimeout(r, 500));
      sfx('stamp'); stampEl.classList.add('on');
      await new Promise((r) => setTimeout(r, 1300));
      close({ name: name.trim().slice(0, 24), app: { ...app }, occupation: occ, traits: [...traits], sandbox: { ...sb }, seed, directives });
    };

    const withdraw = async () => {
      if (closing || stage.busy) return;
      const ok = await confirmDialog({ title: 'Withdraw', body: 'Back to the dark? Nothing here is kept.', ok: 'Withdraw', cancel: 'Stay', danger: true });
      if (!ok || closing) return;
      closing = true;
      phase = 'out';
      root.dataset.phase = 'out';
      await stage.lightsOff();
      close(null);
    };

    let nav: FocusNav;
    const close = (r: IntakeResult | null) => {
      nav.destroy(); sheetNav?.destroy();
      clearTimeout(looksT); clearTimeout(toastT);
      window.removeEventListener('resize', onResize);
      rehab?.destroy(); terms?.destroy();
      stage.onHeadScroll = undefined; stage.onPick = undefined; stage.onHover = undefined;
      if (ownHost) { stage.dispose(); ownHost.remove(); }
      root.remove();
      if (G?.input) G.input.textFocus = false;
      resolve(r);
    };

    // ---------------- go: lights on, then the page
    document.body.append(root);
    root.dataset.phase = 'intro';
    root.classList.toggle('portrait', portrait());
    stage.setAppearance(app);
    stage.setOutfit(prisonerOutfitFor(app, false));
    stage.setFocus('full');
    buildTabs();
    pageEl.append(buildPage('face'));
    nav = new FocusNav(root, {
      onBack: () => { if (closing) return; if (sheet.classList.contains('on')) closeSheet(); else if (phase === 'look') withdraw(); },
      onTab: (d) => {
        if (closing || phase !== 'look') return;
        if (ward.contains(document.activeElement)) { ward.setSlot(d); return; }
        const L = pageList(); const i = L.indexOf(page);
        setPage(L[(i + d + L.length) % L.length]);
      },
      autofocus: false,
    });
    stage.lightsOn().then(() => { if (!closing) toLook(); });
    if (import.meta.env.DEV) (window as any).__intake = { stage, app, setPage, newFace, clone, finish, ward, openTerms, get phase() { return phase; } };
  });
}
