// SUBJECT INTAKE: the creator, played in the subject room (room3d.ts) with
// the lights on. There is no panel and no form: the subject hangs in the
// arms' grip and the page is EIGHT SECTIONS, one part of the body at a time,
// each with its own camera shot:
//   1 Body (the frame: the press makes a fresh clone; build, height)
//   2 Skin   3 Face   4 Eyes (and iris)   5 Nose & mouth   6 Hair (cut, colour)
//   7 Brows & beard   8 Marks (scars, freckles, wear)
// The section's name and the current look float as free text. Two arrow
// signs either side of the subject (and ←/→, the d-pad, a swipe, the wheel)
// swipe through the looks; ↑/↓ or a tap pick which line of a section the
// arrows change. A BACK and a NEXT sign hang at the bottom: BACK on the first
// section returns to the dark, NEXT on the last one sends the subject into
// the game. Everyone wears the Remittance issue jumpsuit; there is no
// wardrobe and no operating table here any more (the table lives in-game).
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
import { SubjectRoom, type PartKey } from './room3d';
import { installRetroKit } from './retroKit';
import { G } from '../../game/G';
import { PRESETS } from './terms';
import { CONTRACT_SANDBOX } from '../../game/debt/defaults';
import { chipUrl, shortView } from './btnKit';
import { hangSign, type HangSign } from './signs';
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

// ---------------------------------------------------------------- sections
type Shot = 'face' | 'body' | 'full' | 'feet';
type Val = { name: string; chip?: number };
interface Line { label: string; list: () => Val[]; get: () => number; set: (i: number) => void; maul?: boolean; press?: boolean; part?: string }
interface Section { key: string; title: string; note: string; shot: Shot; part: string; lines: Line[] }
const SKIN_ALL = [0xf8dcc8, ...SKIN_TONES, 0x4a2c1c];
const BUILDS: [string, string, number][] = [['wiry', 'Wiry', 58], ['slim', 'Slim', 64], ['average', 'Average', 75], ['broad', 'Broad', 86], ['stocky', 'Stocky', 92], ['heavy', 'Heavy', 108]];
const HEIGHTS = [0.92, 0.94, 0.96, 0.98, 1, 1.02, 1.04, 1.06, 1.08];
const PART_SECTION: Record<string, string> = { head: 'face', hair: 'hair', torso: 'skin', armL: 'skin', armR: 'skin', handL: 'skin', handR: 'skin', legL: 'body', legR: 'body', feet: 'body' };
const opts = (l: Opt[]): Val[] => l.map((o) => ({ name: o.name }));

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

/** the room's camera hooks */
type RoomCam = { shot?: (k: string, ms?: number) => void; setFraming?: (dx: number | null, dy?: number | null) => void };

/** show the intake; resolves with the processed subject or null if they went back to the dark */
export function intakeForm(opts0: { title?: string; sandbox?: boolean; directives?: boolean; submit?: string; room?: SubjectRoom; app?: Appearance } = {}): Promise<IntakeResult | null> {
  return new Promise((resolve) => {
    installRetroKit();
    const app: Appearance = opts0.app ? { ...opts0.app } : { ...randomAppearance(Math.random), ...randomLooks(Math.random, Math.random() < 0.5) };
    // everyone wears the Remittance issue: no cosmetics
    app.cos = [];
    const name = randomName();
    const sb: Record<string, number> = { ...CONTRACT_SANDBOX, ...((G?.sandbox as any) || {}), ...PRESETS.standard.s };
    const seed = Math.floor(Math.random() * 99999);
    const directives = opts0.directives ?? true;
    let phase: 'intro' | 'look' | 'out' = 'intro';
    let closing = false;
    let busy = false;

    // ---------------- the room (the title's, or one of our own)
    let ownHost: HTMLElement | null = null;
    let room = opts0.room;
    if (!room) { ownHost = h('div', 'nx nx-stage nx-own'); document.body.append(ownHost); room = new SubjectRoom(ownHost); }
    const stage = room;
    const cam = stage as unknown as RoomCam;
    const portrait = () => window.innerHeight > window.innerWidth * 1.05;
    const frame = () => cam.setFraming?.(portrait() ? 0 : 0.1, portrait() ? 0.32 : 0.04);
    const refreshLooks = () => { stage.setAppearance(app); stage.setOutfit(prisonerOutfitFor(app)); };

    // ---------------- faces: the saw cuts each face part on
    const shapeIndex = () => {
      if (app.jaw != null) return app.jaw;
      const sh = shapeOf(app);
      return sh.jaw > 1.04 ? 6 : sh.jaw < 0.98 ? 4 : 0;
    };
    const fem = () => (app.bodyShape ?? 0.3) > 0.5;

    // ---------------- the eight sections
    const SECTIONS: Section[] = [
      { key: 'body', title: 'Body', note: 'the press makes the frame', shot: 'full', part: 'full', lines: [
        { label: 'Frame', list: () => [{ name: 'Female' }, { name: 'Male' }], get: () => (fem() ? 0 : 1), set: (i) => { void clone(i === 0); }, press: true },
        { label: 'Build', list: () => BUILDS.map(([, l, kg]) => ({ name: `${l} · ${kg} kg` })), get: () => Math.max(0, BUILDS.findIndex((b) => b[0] === String(app.build))), set: (i) => { (app as any).build = BUILDS[i][0]; } },
        { label: 'Height', list: () => HEIGHTS.map((v) => ({ name: `${Math.round(172 * v)} cm` })), get: () => HEIGHTS.reduce((bi, v, i) => (Math.abs(v - app.height) < Math.abs(HEIGHTS[bi] - app.height) ? i : bi), 0), set: (i) => { app.height = HEIGHTS[i]; } },
      ] },
      { key: 'skin', title: 'Skin', note: 'one tone, head to foot', shot: 'body', part: 'torso', lines: [
        { label: 'Tone', list: () => SKIN_ALL.map((c) => ({ name: colourName(c, 'skin'), chip: c })), get: () => Math.max(0, SKIN_ALL.indexOf(app.skin)), set: (i) => { app.skin = SKIN_ALL[i]; } },
      ] },
      { key: 'face', title: 'Face', note: 'the saw cuts a new one on', shot: 'face', part: 'head', lines: [
        { label: 'Shape', list: () => opts(FACE_SHAPES), get: () => shapeIndex(), set: (i) => { app.jaw = i; }, maul: true },
        { label: 'Ears', list: () => opts(EARS), get: () => app.ears ?? 0, set: (i) => { app.ears = i; }, maul: true },
      ] },
      { key: 'eyes', title: 'Eyes', note: 'shape, then the iris', shot: 'face', part: 'head', lines: [
        { label: 'Shape', list: () => opts(EYE_SHAPES), get: () => eyeShapeOf(app), set: (i) => { app.eyeShape = i; }, maul: true },
        { label: 'Iris', list: () => EYE_COLORS.map((c) => ({ name: colourName(c, 'eye'), chip: c })), get: () => Math.max(0, EYE_COLORS.indexOf(app.eyeColor ?? EYE_COLORS[0])), set: (i) => { app.eyeColor = EYE_COLORS[i]; } },
      ] },
      { key: 'nose', title: 'Nose & mouth', note: 'the middle of the face', shot: 'face', part: 'head', lines: [
        { label: 'Nose', list: () => opts(NOSES), get: () => noseOf(app), set: (i) => { app.nose = i; }, maul: true },
        { label: 'Mouth', list: () => opts(MOUTHS), get: () => mouthOf(app), set: (i) => { app.mouth = i; }, maul: true },
      ] },
      { key: 'hair', title: 'Hair', note: 'cut and colour', shot: 'face', part: 'hair', lines: [
        { label: 'Cut', list: () => opts(HAIR_STYLES_ALL), get: () => Math.max(0, HAIR_STYLES_ALL.findIndex((o) => o.key === app.hairStyle)), set: (i) => { (app as any).hairStyle = HAIR_STYLES_ALL[i].key; } },
        { label: 'Colour', list: () => HAIR_DYES.map((c) => ({ name: colourName(c, 'hair'), chip: c })), get: () => Math.max(0, HAIR_DYES.indexOf(app.hair)), set: (i) => { app.hair = HAIR_DYES[i]; } },
      ] },
      { key: 'beard', title: 'Brows & beard', note: 'what grows on the face', shot: 'face', part: 'head', lines: [
        { label: 'Beard', list: () => opts(FACIAL_HAIR_ALL), get: () => Math.max(0, FACIAL_HAIR_ALL.findIndex((f) => f.key === (app.facialHair || 'none'))), set: (i) => { (app as any).facialHair = FACIAL_HAIR_ALL[i].key; app.beard = FACIAL_HAIR_ALL[i].key === 'beard'; } },
        { label: 'Brows', list: () => opts(BROWS), get: () => browsOf(app), set: (i) => { app.brows = i; }, maul: true },
      ] },
      { key: 'marks', title: 'Marks', note: 'what the years left', shot: 'face', part: 'head', lines: [
        { label: 'Scars', list: () => [{ name: 'None' }, { name: 'One' }, { name: 'Two' }, { name: 'Several' }], get: () => app.scars ?? 0, set: (i) => { app.scars = i; } },
        { label: 'Freckles', list: () => [{ name: 'None' }, { name: 'A few' }, { name: 'Lots' }], get: () => ((app.freckles ?? 0) < 0.15 ? 0 : (app.freckles ?? 0) < 0.6 ? 1 : 2), set: (i) => { app.freckles = [0, 0.4, 0.9][i]; } },
        { label: 'Wear', list: () => [{ name: 'Young' }, { name: 'Lined' }, { name: 'Weathered' }, { name: 'Old' }], get: () => Math.min(3, Math.round((app.age ?? 0) / 0.3)), set: (i) => { app.age = [0, 0.3, 0.6, 0.9][i]; } },
      ] },
    ];
    let si = 0, li = 0;

    // ---------------- skeleton: free text, two arrow signs, BACK and NEXT
    const root = h('div', 'nx ik4');
    const head = h('div', 'ik4-head kf');
    const linesEl = h('div', 'ik4-lines');
    const toast = h('div', 'ik4-toast kf');
    const stampEl = h('div', 'ik3-stamp');
    const prevA: HangSign = hangSign('', () => step(-1), { kind: 'wood', shape: 'arrowL', chevron: true, size: 'lg', hang: 'hook', minW: 38, chain: 6, sound: 'rocker', aria: 'Previous look (←)', cls: 'ik4-arrow l' });
    const nextA: HangSign = hangSign('', () => step(1), { kind: 'wood', shape: 'arrowR', chevron: true, size: 'lg', hang: 'hook', minW: 38, chain: 6, sound: 'rocker', aria: 'Next look (→)', cls: 'ik4-arrow r' });
    const backS: HangSign = hangSign('Back', () => back(), { kind: 'tin', shape: 'arrowL', size: 'lg', hang: 'bracketL', sound: 'back', cls: 'ik4-back' });
    const nextS: HangSign = hangSign('Next', () => next(), { kind: 'red', shape: 'arrowR', size: 'lg', hang: 'bracketR', sound: 'plate', cls: 'ik4-next' });
    root.append(head, linesEl, prevA, nextA, backS, nextS, toast, stampEl);

    let toastT = 0;
    const say = (s: string) => { toast.innerHTML = s; toast.classList.remove('on'); void toast.offsetWidth; toast.classList.add('on'); clearTimeout(toastT); toastT = window.setTimeout(() => toast.classList.remove('on'), 2600); };

    // ---------------- painting the free text
    const lineBtns: HTMLButtonElement[] = [];
    const paintHead = (animate: boolean) => {
      const S = SECTIONS[si];
      head.innerHTML = `<span class="n">${si + 1} / ${SECTIONS.length}</span><b>${esc(S.title)}</b><small>${esc(S.note)}</small>${si === 0 ? `<em>subject · ${esc(name)}</em>` : ''}`;
      if (animate) { head.classList.remove('in'); void head.offsetWidth; head.classList.add('in'); }
    };
    const paintLines = (animate = false, only = -1) => {
      const S = SECTIONS[si];
      if (lineBtns.length !== S.lines.length || animate) {
        linesEl.innerHTML = ''; lineBtns.length = 0;
        S.lines.forEach((L, i) => {
          const b = h('button', 'ik4-line kf');
          b.type = 'button';
          b.addEventListener('click', () => { if (li !== i) { li = i; sfx('tick'); paintLines(); } });
          b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && li !== i && phase === 'look') { li = i; paintLines(); sfx('tick'); } });
          linesEl.append(b); lineBtns.push(b);
        });
        if (animate) { linesEl.classList.remove('in'); void linesEl.offsetWidth; linesEl.classList.add('in'); }
      }
      S.lines.forEach((L, i) => {
        if (only >= 0 && i !== only) { lineBtns[i].classList.toggle('on', i === li); return; }
        const list = L.list(), k = L.get(), v = list[k];
        const b = lineBtns[i];
        b.classList.toggle('on', i === li);
        b.setAttribute('aria-label', `${L.label}: ${v?.name ?? ''} (${k + 1} of ${list.length})`);
        b.innerHTML = `<span class="l">${esc(L.label)}</span><span class="v">${v?.chip != null ? `<img src="${chipUrl(v.chip)}" alt="">` : ''}<i>${esc(v?.name ?? '?')}</i></span><span class="c">${k + 1}/${list.length}</span>`;
        if (only === i) { const vv = b.querySelector('.v') as HTMLElement; vv.classList.remove('in'); void vv.offsetWidth; vv.classList.add('in'); }
      });
    };

    // ---------------- stepping a look
    const step = (d: -1 | 1) => {
      if (phase !== 'look' || busy || closing) return;
      const L = SECTIONS[si].lines[li];
      const n = L.list().length;
      const i = (L.get() + d + n) % n;
      if (L.press) { L.set(i); return; }
      (d < 0 ? prevA : nextA).kick(d * 1.8);
      if (L.maul) {
        void stage.maul(() => { L.set(i); stage.setAppearance(app); paintLines(false, li); });
        paintLines(false, li);
      } else { L.set(i); refreshLooks(); paintLines(false, li); }
      sfx('key', 0.8);
    };
    const pickLine = (d: number) => {
      const n = SECTIONS[si].lines.length;
      if (n < 2) return;
      li = (li + d + n) % n;
      sfx('tick');
      paintLines();
    };

    // ---------------- the body type: the press
    const clone = async (f: boolean) => {
      if (closing || busy || stage.busy || phase !== 'look') return;
      busy = true;
      root.classList.add('pressing');
      sfx('lever');
      await stage.press(() => {
        app.bodyShape = f ? 0.82 + Math.random() * 0.12 : 0.04 + Math.random() * 0.16;
        refreshLooks();
      });
      stage.setView('creator');
      goShot();
      root.classList.remove('pressing');
      busy = false;
      paintLines(false, li);
      say(`<b>Clone ${f ? 'F' : 'M'}-${Math.floor(100 + Math.random() * 900)}</b> · same choices, fresh body`);
    };

    // ---------------- sections
    const goShot = () => {
      const S = SECTIONS[si];
      frame();
      stage.setFocus(S.part);
      cam.shot?.(S.shot, 800);
    };
    const setSection = (i: number) => {
      si = Math.max(0, Math.min(SECTIONS.length - 1, i));
      li = 0;
      root.dataset.section = SECTIONS[si].key;
      paintHead(true);
      paintLines(true);
      goShot();
      backS.setLabel(si === 0 ? 'Leave' : 'Back');
      nextS.setLabel(si === SECTIONS.length - 1 ? 'Begin' : 'Next');
      sfx('tab');
    };
    const next = () => {
      if (phase !== 'look' || busy || closing) return;
      if (si < SECTIONS.length - 1) { setSection(si + 1); return; }
      void finish();
    };
    const back = () => {
      if (phase !== 'look' || busy || closing) return;
      if (si > 0) { setSection(si - 1); return; }
      void leave();
    };

    // ---------------- touch / wheel / clicking the body
    stage.onSwipe = (d) => step(d);
    stage.onPick = (p: PartKey | null) => {
      if (phase !== 'look' || closing || busy || !p) return;
      const k = PART_SECTION[p];
      const i = SECTIONS.findIndex((S) => S.key === k);
      if (i >= 0 && i !== si) setSection(i);
    };

    // ---------------- the end: processed, into the game
    const finish = async () => {
      closing = true; phase = 'out'; root.dataset.phase = 'out';
      sfx('confirm');
      stage.setView('creator');
      stage.setFocus('head');
      cam.shot?.('face', 700);
      const number = suitNumber(stage.rigSeed);
      stampEl.innerHTML = `<b>${esc(opts0.submit ? opts0.submit.toUpperCase() : 'PROCESSED')}</b><span>${esc(number)} · ${esc(name.toUpperCase())}</span>`;
      await new Promise((r) => setTimeout(r, 700));
      sfx('shutter'); stage.flashOnce();
      await new Promise((r) => setTimeout(r, 450));
      sfx('stamp'); stampEl.classList.add('on');
      await new Promise((r) => setTimeout(r, 1200));
      close({ name: name.slice(0, 24), app: { ...app, cos: [] }, occupation: 'unemployed', traits: [], sandbox: { ...sb }, seed, directives });
    };
    const leave = async () => {
      closing = true; phase = 'out'; root.dataset.phase = 'out';
      await stage.lightsOff();
      close(null);
    };

    let nav: FocusNav;
    const close = (r: IntakeResult | null) => {
      nav.destroy();
      clearTimeout(toastT);
      window.removeEventListener('resize', onResize);
      stage.onSwipe = undefined; stage.onHeadScroll = undefined; stage.onPick = undefined; stage.onHover = undefined;
      if (ownHost) { stage.dispose(); ownHost.remove(); }
      root.remove();
      if (G?.input) G.input.textFocus = false;
      resolve(r);
    };
    let lastP = portrait(), lastS = shortView();
    const onResize = () => { if (portrait() !== lastP || shortView() !== lastS) { lastP = portrait(); lastS = shortView(); root.classList.toggle('portrait', lastP); if (phase === 'look') goShot(); } };
    window.addEventListener('resize', onResize);

    // ---------------- go: lights on, then the first section
    document.body.append(root);
    root.dataset.phase = 'intro';
    root.classList.toggle('portrait', portrait());
    refreshLooks();
    stage.setFocus('full');
    nav = new FocusNav(root, {
      onBack: () => back(),
      onTab: (d) => { if (phase === 'look' && !busy) setSection(si + d); },
      onArrow: (dx, dy) => {
        if (phase === 'look') { if (dx) step(dx < 0 ? -1 : 1); else if (dy) pickLine(dy); }
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
      [prevA, nextA].forEach((s, i) => s.swayIn(i * 120, 0.32));
      [backS, nextS].forEach((s, i) => s.swayIn(200 + i * 120, 0.28));
      requestAnimationFrame(() => nextS.focus({ preventScroll: true }));
    });
    if (import.meta.env.DEV) (window as any).__intake = { stage, app, setSection, step, next, back, get phase() { return phase; }, get section() { return si; } };
  });
}
