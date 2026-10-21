// SUBJECT INTAKE: the creator, played in the subject room (room3d.ts) with
// the lights on. The subject hangs in mid-air in the arms' grip.
//  LEFT   the body lab: face (an identikit, or scroll / swipe the head and the
//         tool arm saws a new one on), hair, body, colours, marks, ID.
//  RIGHT  the wardrobe: jumpsuits, headwear, eyewear, masks, neck and back
//         pieces. Locked ones can be tried on and bought with research
//         points (src/game/cosmetics.ts); bought ones stay across runs.
//  CONFIRM APPEARANCE  then the body type: a pink and a blue button. Either
//         one drops the press on the subject and the arms fetch a fresh clone
//         of that type with the same choices out of the hatch.
//  CONFIRM  hands over to the operating table (src/ui/surgery: startSurgery,
//         looked up at run time and skipped if it is not there; without it the
//         Rehab Section deals the programme and conditions), then PROCESSED.
// Sentencing terms (world rules) are a sheet you can open from the last step.
import type { Appearance, Outfit } from '../../entities/humanRig';
import { randomAppearance, EYE_COLORS, SKIN_TONES } from '../../entities/humanRig';
import { Player } from '../../entities/player';
import { TRAITS, occupationByKey, type Occupation } from '../../survival/traits';
import { hasItemDef, itemDef } from '../../items/item';
import {
  FACE_SHAPES, EYE_SHAPES, BROWS, NOSES, MOUTHS, EARS, FACIAL_HAIR_ALL, HAIR_STYLES_ALL, HAIR_DYES, TATTOO_SPOTS, TATTOOS, tattoosFor, SCAR_SPOTS, BODY_SCARS,
  KNUCKLES, NAILS, SUIT_SLEEVES, SUIT_WEAR, STAINS, PATCHES, FEET_KIT, feetKitItems, randomLooks, suitNumber, shapeOf, eyeShapeOf, browsOf, noseOf, mouthOf, type Opt,
} from '../../entities/humanLooks';
import { COSMETICS, COS_SLOTS, COSMETIC, ownsCosmetic, buyCosmetic, wornIn, setWorn, stripUnowned, type CosSlot, type CosmeticDef } from '../../game/cosmetics';
import { researchPoints } from '../../game/research';
import { bus } from '../../core/events';
import { h, esc, FocusNav, sfx, hoverFocus, confirmDialog } from './common';
import { SubjectRoom, type PartKey } from './room3d';
import { installRetroKit, nixieHtml } from './retroKit';
import { G } from '../../game/G';
import { toUrl } from '../pixelkit';
import { tattooImage, hairIcon } from './art';
import { rehabStation, type RehabCtx } from './rehab';
import { termsStation, type TermsCtx, PRESETS } from './terms';
import { CONTRACT_SANDBOX } from '../../game/debt/defaults';
import { uiSettings } from './settings';
import './diegetic.css';
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

// ---------------------------------------------------------------- labels
const TABS: [string, string, string][] = [['face', 'FACE', 'head'], ['hair', 'HAIR', 'hair'], ['body', 'BODY', 'full'], ['colour', 'COLOUR', 'full'], ['marks', 'MARKS', 'torso'], ['id', 'ID', 'full']];
const PART_TAB: Record<string, string> = { head: 'face', hair: 'hair', torso: 'marks', armL: 'marks', armR: 'marks', handL: 'marks', handR: 'marks', legL: 'body', legR: 'body', feet: 'id' };
const PART_LABEL: Record<string, string> = { head: 'FACE · scroll to saw a new one', hair: 'HAIR', torso: 'BODY MARKS', armL: 'LEFT ARM', armR: 'RIGHT ARM', handL: 'HANDS', handR: 'HANDS', legL: 'BUILD', legR: 'BUILD', feet: 'FEET' };
const SKIN_ALL = [0xf8dcc8, ...SKIN_TONES, 0x4a2c1c];
const BUILDS: [string, string, number][] = [['wiry', 'Wiry', 58], ['slim', 'Slim', 64], ['average', 'Average', 75], ['broad', 'Broad', 86], ['stocky', 'Stocky', 92], ['heavy', 'Heavy', 108]];
const SLOT_PART: Record<CosSlot, string> = { suit: 'full', hat: 'hair', eyes: 'head', face: 'head', neck: 'torso', back: 'full' };
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

/** a jumpsuit pictogram for the wardrobe (tinted, patterned) */
function suitIcon(def: CosmeticDef): string {
  const cv = document.createElement('canvas'); cv.width = 24; cv.height = 28;
  const c = cv.getContext('2d')!;
  const rows = ['....######......', '...########.....', '..##########....', '.####.##.####...', '####..##..####..', '###...##...###..', '##....##....##..', '......##........', '.....####.......', '.....#..#.......', '.....#..#.......', '....##..##......'];
  const col = hex(def.color);
  for (let y = 0; y < 26; y++) for (let x = 0; x < 16; x++) {
    const r = rows[Math.min(rows.length - 1, Math.floor(y / 2.2))];
    if (r[x] !== '#') continue;
    let fill = col;
    if (def.key === 'suit_stripe' && Math.floor(y / 2) % 2) fill = '#1c1a18';
    if (def.key === 'suit_hazard' && y > 14 && (x + y) % 4 < 2) fill = '#17150f';
    if (def.key === 'suit_circuit' && (x % 5 === 0 || y % 6 === 0)) fill = '#3ae8f0';
    c.fillStyle = fill; c.fillRect(x + 4, y + 1, 1, 1);
  }
  return cv.toDataURL();
}

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
    let phase: 'intro' | 'look' | 'sex' | 'out' = 'intro';
    let tab = 'face';
    let closing = false;

    // ---------------- the room (the title's, or one of our own)
    let ownHost: HTMLElement | null = null;
    let room = opts.room;
    if (!room) { ownHost = h('div', 'nx nx-stage nx-own'); document.body.append(ownHost); room = new SubjectRoom(ownHost); }
    const stage = room;

    // ---------------- skeleton
    const root = h('div', 'nx nx-ik');
    const top = h('div', 'ik2-top');
    const plate = h('div', 'ik2-plate', `<b>${esc(opts.title || 'SUBJECT INTAKE')}</b><span>MERIDIAN INSTITUTE · REMITTANCE PROGRAMME</span>`);
    const rpEl = h('div', 'ik2-rp', '');
    const back = h('button', 'ik2-exit', '◀ WITHDRAW');
    back.type = 'button'; hoverFocus(back); back.onclick = () => withdraw();
    top.append(plate, rpEl, back);
    const left = h('aside', 'ik2-left nx-glass');
    const tabsRow = h('div', 'ik2-tabs');
    tabsRow.setAttribute('role', 'tablist');
    const leftBody = h('div', 'ik2-body');
    const leftScreen = h('div', 'ik2-screen nc-crt-dom' + (uiSettings().theme === 'amber' ? ' amber' : ''));
    leftScreen.append(leftBody);
    left.append(h('div', 'ik2-h', '<b>BODY LAB</b><small>colours · faces · hair · build</small>'), tabsRow, leftScreen);
    const right = h('aside', 'ik2-right nx-glass');
    const wardBody = h('div', 'ik2-ward');
    right.append(h('div', 'ik2-h', '<b>WARDROBE</b><small>scroll the collection · buy with research points</small>'), wardBody);
    const bottom = h('div', 'ik2-bottom');
    const confirmBtn = h('button', 'ik2-go', '<b>CONFIRM APPEARANCE</b><small>then the body type ▶</small>');
    confirmBtn.type = 'button'; hoverFocus(confirmBtn); confirmBtn.onclick = () => toSex();
    const hint = h('div', 'ik2-hint nc-free-text', '');
    bottom.append(hint, confirmBtn);
    const hoverTag = h('div', 'ik2-hovertag nc-free-text');
    const toast = h('div', 'ik2-toast nc-free-text');
    // the body-type step
    const sex = h('div', 'ik2-sex');
    const sexHead = h('div', 'ik2-sex-h nc-free-text', '<b>BODY TYPE</b><small>press a button: the press takes this one, the arms bring a fresh clone with the same choices</small>');
    const pink = h('button', 'ik2-big pink', '<i></i><b>PINK</b><small>feminine frame</small>');
    const blue = h('button', 'ik2-big blue', '<i></i><b>BLUE</b><small>masculine frame</small>');
    for (const b of [pink, blue]) { b.type = 'button'; hoverFocus(b); }
    pink.onclick = () => clone(true); blue.onclick = () => clone(false);
    const sexRow = h('div', 'ik2-sex-row'); sexRow.append(pink, blue);
    const sexBar = h('div', 'ik2-sex-bar');
    const backLook = h('button', 'ik2-btn', '◀ APPEARANCE'); backLook.type = 'button'; hoverFocus(backLook); backLook.onclick = () => toLook();
    const termsBtn = h('button', 'ik2-btn', 'SENTENCING TERMS'); termsBtn.type = 'button'; hoverFocus(termsBtn); termsBtn.onclick = () => openTerms();
    const finalBtn = h('button', 'ik2-go final', `<b>CONFIRM</b><small>to the operating table ▶</small>`); finalBtn.type = 'button'; hoverFocus(finalBtn); finalBtn.onclick = () => finish();
    sexBar.append(backLook, ...(withSandbox ? [termsBtn] : []), finalBtn);
    sex.append(sexHead, sexRow, sexBar);
    const sheet = h('div', 'ik2-sheet');
    const stampEl = h('div', 'ik2-stamp');
    root.append(top, left, right, bottom, hoverTag, toast, sex, sheet, stampEl);

    // ---------------- helpers
    const refreshRp = () => { rpEl.innerHTML = `<span class="rk-tape red">RESEARCH</span>${nixieHtml(researchPoints())}`; };
    let toastT = 0;
    const say = (s: string) => { toast.innerHTML = s; toast.classList.add('on'); clearTimeout(toastT); toastT = window.setTimeout(() => toast.classList.remove('on'), 3200); };
    let looksT = 0;
    const inspect = () => phase === 'look' && tab === 'marks';
    const refreshLooks = () => {
      clearTimeout(looksT);
      looksT = window.setTimeout(() => { stage.setAppearance(app); stage.setOutfit(prisonerOutfitFor(app, inspect())); }, 30);
    };
    const updateHint = () => {
      const coarse = matchMedia('(pointer: coarse)').matches;
      hint.innerHTML = phase === 'look'
        ? (coarse ? 'swipe up/down on the head: new face · drag: turn · tap a part' : '<kbd>wheel</kbd> on the head: new face · drag: turn · click a part · <kbd>Q</kbd><kbd>E</kbd> tabs')
        : '';
    };

    // ---------------- widgets (identikit strips, swatches, tapes, stamp rows)
    const opt = (cls: string, html: string, on: boolean, click: () => void, label?: string) => {
      const b = h('button', 'ob-o ' + cls + (on ? ' on' : ''), html);
      b.type = 'button';
      if (label) b.setAttribute('aria-label', label);
      b.setAttribute('aria-pressed', String(on));
      hoverFocus(b);
      b.onclick = () => click();
      return b;
    };
    const mark = (wrap: HTMLElement, b: HTMLElement) => { wrap.querySelectorAll('.ob-o').forEach((o) => { o.classList.toggle('on', o === b); o.setAttribute('aria-pressed', String(o === b)); }); };
    const sec = (title: string, sub = '') => h('section', 'ik2-sec', `<header><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</header>`);
    const strips: (() => void)[] = [];
    const strip = (label: string, list: Opt[], get: () => number, set: (i: number) => void, maul = false) => {
      const s = h('div', 'ob-strip');
      const val = h('button', 'ob-strip-v', '');
      val.type = 'button';
      const paint = () => { const i = get(); val.innerHTML = `<small>${esc(label)}</small><b>${esc(list[i]?.name ?? '?')}</b><em>${i + 1}/${list.length}</em>`; val.title = list[get()]?.note || ''; };
      const step = (d: number) => {
        const i = (get() + d + list.length) % list.length;
        if (maul) { void stage.maul(() => { set(i); paint(); stage.setAppearance(app); }); sfx('tick'); return; }
        set(i); paint(); sfx('tick'); refreshLooks();
      };
      const l = h('button', 'ob-strip-a', '◀'); l.type = 'button'; l.setAttribute('aria-label', label + ': previous'); l.onclick = () => step(-1);
      const r = h('button', 'ob-strip-a', '▶'); r.type = 'button'; r.setAttribute('aria-label', label + ': next'); r.onclick = () => step(1);
      val.onclick = () => step(1);
      for (const b of [l, val, r]) hoverFocus(b);
      paint();
      strips.push(paint);
      s.append(l, val, r);
      return s;
    };
    const swatches = (list: number[], cur: () => number, set: (c: number) => void, cls = 'chip') => {
      const row = h('div', 'ob-swatches ' + cls);
      for (const c of list) {
        const b = opt('ob-sw', `<i style="background:${hex(c)}"></i>`, c === cur(), () => { set(c); mark(row, b); sfx('toggle'); refreshLooks(); }, 'colour ' + hex(c));
        row.append(b);
      }
      return row;
    };
    const tape = (label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void, fmt: (v: number) => string) => {
      const w = h('label', 'ob-tape');
      const inp = h('input') as HTMLInputElement;
      inp.type = 'range'; inp.min = String(min); inp.max = String(max); inp.step = String(step); inp.value = String(get());
      inp.setAttribute('aria-label', label);
      const out = h('output', '', esc(fmt(get())));
      const paint = () => w.style.setProperty('--p', String((Number(inp.value) - min) / (max - min)));
      paint();
      hoverFocus(inp);
      inp.oninput = () => { set(Number(inp.value)); out.textContent = fmt(Number(inp.value)); paint(); sfx('tick'); refreshLooks(); };
      w.append(h('span', 'ob-tape-l', esc(label)), inp, out);
      return w;
    };
    const stampRow = (label: string, list: Opt[], cur: () => string, set: (k: string) => void) => {
      const row = h('div', 'ob-row', `<span class="ob-row-l">${esc(label)}</span>`);
      const box = h('div', 'ob-row-o');
      for (const o of list) {
        const b = opt('ob-box', `<i></i>${esc(o.name)}`, o.key === cur(), () => { set(o.key); mark(box, b); sfx('stamp', 0.5); refreshLooks(); });
        box.append(b);
      }
      row.append(box);
      return row;
    };
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
      if (tab !== 'face') setTab('face', false);
      stage.maul(() => { Object.assign(app, f); stage.setAppearance(app); for (const p of strips) p(); }).then(() => { mauling = false; });
      say(`<b>FACE ${faceAt + 1}</b> · scroll ${dir > 0 ? 'on' : 'back'} for another`);
    };
    stage.onHeadScroll = (d) => newFace(d);

    // ---------------- the body lab (left)
    let tatSpot = 'chest', scarSpot = 'chest';
    const buildTab = (k: string): HTMLElement => {
      strips.length = 0;
      const wrap = h('div', 'ik2-tab');
      if (k === 'face') {
        const saw = h('button', 'ik2-saw', '<b>⟳ SAW ON A NEW FACE</b><small>or scroll / swipe on the head</small>');
        saw.type = 'button'; hoverFocus(saw); saw.onclick = () => newFace(1);
        const kit = sec('IDENTIKIT', 'each strip is cut by the tool arm');
        kit.append(
          strip('Face shape', FACE_SHAPES, () => shapeIndex(), (i) => { app.jaw = i; }, true),
          strip('Eyes', EYE_SHAPES, () => eyeShapeOf(app), (i) => { app.eyeShape = i; }, true),
          strip('Brows', BROWS, () => browsOf(app), (i) => { app.brows = i; }, true),
          strip('Nose', NOSES, () => noseOf(app), (i) => { app.nose = i; }, true),
          strip('Mouth', MOUTHS, () => mouthOf(app), (i) => { app.mouth = i; }, true),
          strip('Ears', EARS, () => app.ears ?? 0, (i) => { app.ears = i; }, true),
          strip('Facial hair', FACIAL_HAIR_ALL, () => Math.max(0, FACIAL_HAIR_ALL.findIndex((f) => f.key === (app.facialHair || 'none'))), (i) => { (app as any).facialHair = FACIAL_HAIR_ALL[i].key; app.beard = FACIAL_HAIR_ALL[i].key === 'beard'; }),
          strip('Face scars', [{ key: '0', name: 'None' }, { key: '1', name: 'One' }, { key: '2', name: 'Two' }, { key: '3', name: 'Several' }], () => app.scars ?? 0, (i) => { app.scars = i; }),
          strip('Freckles', [{ key: '0', name: 'None' }, { key: '1', name: 'A few' }, { key: '2', name: 'Lots' }], () => ((app.freckles ?? 0) < 0.15 ? 0 : (app.freckles ?? 0) < 0.6 ? 1 : 2), (i) => { app.freckles = [0, 0.4, 0.9][i]; }),
          strip('Wear and tear', [{ key: '0', name: 'Young' }, { key: '1', name: 'Lined' }, { key: '2', name: 'Weathered' }, { key: '3', name: 'Old' }], () => Math.min(3, Math.round((app.age ?? 0) / 0.3)), (i) => { app.age = [0, 0.3, 0.6, 0.9][i]; }),
        );
        const eyes = sec('IRIS');
        eyes.append(swatches(EYE_COLORS, () => app.eyeColor ?? -1, (c) => { app.eyeColor = c; }, 'marbles'));
        wrap.append(saw, kit, eyes);
      } else if (k === 'hair') {
        const chart = sec('CUT', 'the clipper chart');
        const grid = h('div', 'ob-grid hair');
        for (const st of HAIR_STYLES_ALL) {
          const b = opt('ob-card', `<img src="${toUrl(hairIcon(st.key, app.hair, app.skin))}" alt=""><span>${esc(st.name)}</span>`, app.hairStyle === st.key, () => { (app as any).hairStyle = st.key; mark(grid, b); sfx('toggle'); refreshLooks(); });
          grid.append(b);
        }
        chart.append(grid);
        const dye = sec('DYE');
        dye.append(swatches(HAIR_DYES, () => app.hair, (c) => { app.hair = c; grid.querySelectorAll('img').forEach((im, i) => { (im as HTMLImageElement).src = toUrl(hairIcon(HAIR_STYLES_ALL[i].key, c, app.skin)); }); }, 'tufts'));
        const fh = sec('FACIAL HAIR');
        fh.append(strip('Facial hair', FACIAL_HAIR_ALL, () => Math.max(0, FACIAL_HAIR_ALL.findIndex((f) => f.key === (app.facialHair || 'none'))), (i) => { (app as any).facialHair = FACIAL_HAIR_ALL[i].key; app.beard = FACIAL_HAIR_ALL[i].key === 'beard'; }));
        wrap.append(chart, dye, fh);
      } else if (k === 'body') {
        const sc = sec('BUILD', 'kg on the platform scale');
        const row = h('div', 'ob-scale');
        for (const [bk, bl, kg] of BUILDS) {
          const b = opt('ob-weight', `<b>${kg}</b><span>${esc(bl)}</span>`, String(app.build) === bk, () => { (app as any).build = bk; mark(row, b); sfx('toggle'); refreshLooks(); });
          row.append(b);
        }
        sc.append(row);
        const m = sec('MEASURE');
        m.append(
          tape('Height', 0.92, 1.08, 0.01, () => app.height, (v) => { app.height = v; }, (v) => `${Math.round(172 * v)} cm`),
          tape('Frame', 0, 1, 0.05, () => app.bodyShape ?? 0.3, (v) => { app.bodyShape = v; }, (v) => (v < 0.34 ? 'square' : v > 0.66 ? 'curved' : 'in between')),
        );
        m.append(h('p', 'ik2-note', 'The body type itself is set after you confirm: pink or blue, and the press.'));
        wrap.append(sc, m);
      } else if (k === 'colour') {
        const skin = sec('SKIN');
        skin.append(swatches(SKIN_ALL, () => app.skin, (c) => { app.skin = c; }, 'chip'));
        const eyes = sec('EYES');
        eyes.append(swatches(EYE_COLORS, () => app.eyeColor ?? -1, (c) => { app.eyeColor = c; }, 'marbles'));
        const hair = sec('HAIR');
        hair.append(swatches(HAIR_DYES, () => app.hair, (c) => { app.hair = c; }, 'tufts'));
        const nails = sec('NAILS');
        const nl = h('div', 'ob-row-o');
        for (const [nk, nv] of Object.entries(NAILS)) {
          const b = opt('ob-box', `<i style="${nv.color ? `background:${hex(nv.color)}` : ''}"></i>${esc(nv.name)}`, (app.nails || 'clean') === nk, () => { app.nails = nk; mark(nl, b); sfx('toggle'); refreshLooks(); });
          nl.append(b);
        }
        nails.append(nl);
        const suit = sec('JUMPSUIT', 'dye and weave: the wardrobe on the right');
        wrap.append(skin, eyes, hair, nails, suit);
      } else if (k === 'marks') {
        const spots = ['chest', 'back', 'belly', 'neck', 'face', 'uarm_l', 'farm_l', 'uarm_r', 'farm_r'].filter((s) => TATTOO_SPOTS[s]);
        if (!spots.includes(tatSpot)) tatSpot = spots[0];
        const flash = sec('TATTOO FLASH', 'pick a spot, then a design');
        const spotRow = h('div', 'ob-spots');
        const dGrid = h('div', 'ob-grid flash');
        const paintDesigns = () => {
          dGrid.innerHTML = '';
          const cur = app.tattoos?.[tatSpot] || '';
          const none = opt('ob-flash none', '<span>NONE</span>', !cur, () => { const t = { ...(app.tattoos || {}) }; delete t[tatSpot]; app.tattoos = t; mark(dGrid, none); sfx('back', 0.5); refreshLooks(); paintSpots(); });
          dGrid.append(none);
          for (const d of tattoosFor(tatSpot)) {
            const b = opt('ob-flash', `<img src="${toUrl(tattooImage(d, 3))}" alt=""><span>${esc(TATTOOS[d].name)}</span>`, cur === d, () => {
              app.tattoos = { ...(app.tattoos || {}), [tatSpot]: d }; mark(dGrid, b); sfx('grind', 0.4); refreshLooks(); paintSpots();
            });
            dGrid.append(b);
          }
        };
        const paintSpots = () => {
          spotRow.innerHTML = '';
          for (const sp of spots) {
            const b = opt('ob-spot' + (app.tattoos?.[sp] ? ' inked' : ''), `<i></i>${esc(TATTOO_SPOTS[sp].name)}`, sp === tatSpot, () => { tatSpot = sp; mark(spotRow, b); sfx('tick'); paintDesigns(); });
            spotRow.append(b);
          }
        };
        paintSpots(); paintDesigns();
        flash.append(spotRow, dGrid);
        const sSpots = Object.keys(SCAR_SPOTS);
        if (!sSpots.includes(scarSpot)) scarSpot = sSpots[0];
        const med = sec('OLD WOUNDS');
        const sRow = h('div', 'ob-spots');
        const kRow = h('div', 'ob-row-o');
        const paintKinds = () => {
          kRow.innerHTML = '';
          const cur = app.bodyScars?.[scarSpot] || '';
          const none = opt('ob-box', '<i></i>None', !cur, () => { const t = { ...(app.bodyScars || {}) }; delete t[scarSpot]; app.bodyScars = t; mark(kRow, none); sfx('back', 0.5); refreshLooks(); });
          kRow.append(none);
          for (const [sk, sl] of Object.entries(BODY_SCARS)) {
            const b = opt('ob-box', `<i></i>${esc(sl)}`, cur === sk, () => { app.bodyScars = { ...(app.bodyScars || {}), [scarSpot]: sk }; mark(kRow, b); sfx('stamp', 0.5); refreshLooks(); });
            kRow.append(b);
          }
        };
        for (const sp of sSpots) {
          const b = opt('ob-spot', `<i></i>${esc(SCAR_SPOTS[sp].name)}`, sp === scarSpot, () => { scarSpot = sp; mark(sRow, b); sfx('tick'); paintKinds(); });
          sRow.append(b);
        }
        paintKinds();
        med.append(sRow, kRow);
        const kn = sec('KNUCKLES');
        const kg = h('div', 'ob-grid knuckles');
        for (const [kk, kv] of Object.entries(KNUCKLES)) {
          const b = opt('ob-knuckle', `<b>${esc(kv.l || '·')}</b><b>${esc(kv.r || '·')}</b><span>${esc(kv.name)}</span>`, (app.knuckles || 'none') === kk, () => { app.knuckles = kk; mark(kg, b); sfx('stamp', 0.4); refreshLooks(); });
          kg.append(b);
        }
        kn.append(kg);
        wrap.append(flash, med, kn);
      } else if (k === 'id') {
        const b = sec('NAME', 'stencilled on the file');
        const row = h('div', 'ob-namerow');
        const ni = h('input', 'ob-name') as HTMLInputElement;
        ni.value = name; ni.maxLength = 24; ni.spellcheck = false; ni.setAttribute('aria-label', 'Name');
        ni.addEventListener('input', () => { name = ni.value; });
        ni.addEventListener('focus', () => { if (G?.input) G.input.textFocus = true; });
        ni.addEventListener('blur', () => { if (G?.input) G.input.textFocus = false; });
        const dice = h('button', 'ob-dice', '⚄ <span>Another</span>');
        dice.type = 'button'; hoverFocus(dice);
        dice.onclick = () => { name = randomName(); ni.value = name; sfx('click'); };
        row.append(ni, dice);
        b.append(row, h('p', 'ik2-note', 'NUMBER: <b>D-____</b> · assigned at processing, stencilled on your back'));
        const u = sec('UNIFORM', 'issue slip U-2');
        const suit = () => (app.suit ||= {});
        u.append(
          stampRow('Sleeves', SUIT_SLEEVES, () => suit().sleeves || 'down', (v) => { suit().sleeves = v; }),
          stampRow('Condition', SUIT_WEAR, () => String(suit().wear ?? 0), (v) => { suit().wear = Number(v); }),
          stampRow('Stains', STAINS, () => suit().stains || 'none', (v) => { suit().stains = v; }),
          stampRow('Number patch', PATCHES, () => suit().patch || 'stitched', (v) => { suit().patch = v; }),
          stampRow('Footwear', FEET_KIT, () => app.feetKit ?? 'slipons', (v) => { app.feetKit = v; }),
        );
        wrap.append(b, u);
      }
      const someone = h('button', 'ik2-rand', '⚄ SOMEBODY ELSE');
      someone.type = 'button'; hoverFocus(someone); someone.onclick = () => randomizeLooks();
      wrap.append(someone);
      return wrap;
    };
    const tabBtns = new Map<string, HTMLButtonElement>();
    for (const [k, l] of TABS) {
      const b = h('button', 'ik2-tab-b', l);
      b.type = 'button'; b.setAttribute('role', 'tab');
      hoverFocus(b, '');
      b.onclick = () => setTab(k);
      tabsRow.append(b); tabBtns.set(k, b);
    }
    const setTab = (k: string, sound = true) => {
      const wasInspect = inspect();
      tab = k;
      for (const [tk, b] of tabBtns) { b.classList.toggle('on', tk === k); b.setAttribute('aria-selected', String(tk === k)); }
      leftBody.innerHTML = '';
      leftBody.append(buildTab(k));
      leftBody.scrollTop = 0;
      stage.setFocus((TABS.find((t) => t[0] === k) || TABS[0])[2]);
      if (wasInspect !== inspect()) stage.setOutfit(prisonerOutfitFor(app, inspect()));
      if (sound) sfx('tab');
    };

    // ---------------- the wardrobe (right)
    const cards = new Map<string, HTMLElement>();
    const buildWardrobe = () => {
      wardBody.innerHTML = '';
      cards.clear();
      for (const [slot, label] of COS_SLOTS) {
        const list = COSMETICS.filter((c) => c.slot === slot);
        if (!list.length) continue;
        wardBody.append(h('div', 'ik2-slot', `<b>${esc(label)}</b>`));
        const grid = h('div', 'ik2-cards');
        if (slot !== 'suit') grid.append(card(null, slot));
        for (const c of list) grid.append(card(c, slot));
        wardBody.append(grid);
      }
      paintCards();
    };
    const card = (c: CosmeticDef | null, slot: CosSlot) => {
      const el = h('div', 'ik2-card');
      const b = h('button', 'ik2-card-b', '');
      b.type = 'button';
      hoverFocus(b);
      const img = c ? (slot === 'suit' ? suitIcon(c) : stage.thumb(c.key)) : '';
      b.innerHTML = `<span class="th">${img ? `<img src="${img}" alt="">` : `<i>${c ? '?' : '∅'}</i>`}</span><span class="nm">${esc(c ? c.name : 'Nothing')}</span><span class="st"></span>`;
      b.onclick = () => wearCard(c, slot);
      el.append(b);
      if (c && c.cost > 0) {
        const buy = h('button', 'ik2-buy', '');
        buy.type = 'button'; hoverFocus(buy);
        buy.onclick = () => buyIt(c);
        el.append(buy);
      }
      if (c) el.title = c.desc;
      cards.set(c ? c.key : 'none:' + slot, el);
      return el;
    };
    const paintCards = () => {
      const rp = researchPoints();
      for (const [k, el] of cards) {
        const none = k.startsWith('none:');
        const slot = (none ? k.slice(5) : COSMETIC.get(k)!.slot) as CosSlot;
        const worn = wornIn(app, slot);
        const on = none ? !worn : worn === k;
        const owned = none || ownsCosmetic(k);
        const c = none ? null : COSMETIC.get(k)!;
        el.classList.toggle('on', on);
        el.classList.toggle('locked', !owned);
        el.classList.toggle('trying', on && !owned);
        const st = el.querySelector('.st') as HTMLElement;
        st.textContent = on ? (owned ? 'WORN' : 'TRYING ON') : owned ? (c && c.cost ? 'OWNED' : 'ISSUE') : `${c!.cost} RP`;
        const buy = el.querySelector('.ik2-buy') as HTMLButtonElement | null;
        if (buy) { buy.hidden = owned; buy.disabled = !owned && rp < c!.cost; buy.innerHTML = `BUY <b>${c!.cost}</b> RP`; }
      }
      refreshRp();
    };
    const wearCard = (c: CosmeticDef | null, slot: CosSlot) => {
      if (phase !== 'look') return;
      const cur = wornIn(app, slot);
      const next = c ? (cur === c.key && slot !== 'suit' ? null : c.key) : null;
      setWorn(app, slot, next);
      sfx(next ? 'clamp' : 'back', 0.7);
      if (c && !ownsCosmetic(c.key) && next) say(`<b>TRYING ON · ${esc(c.name)}</b> · ${c.cost} RP to keep it`);
      stage.setFocus(SLOT_PART[slot]);
      if (slot === 'back' && next) stage.orbitTo(1.0);
      paintCards();
      refreshLooks();
    };
    const buyIt = (c: CosmeticDef) => {
      if (buyCosmetic(c.key)) {
        sfx('unlock');
        say(`<b>ACQUIRED · ${esc(c.name)}</b> · yours on every run`);
        if (wornIn(app, c.slot) !== c.key) setWorn(app, c.slot, c.key);
        refreshLooks();
      } else { sfx('error'); say(`Not enough research points. Missions, scans and quests pay RP.`); }
      paintCards();
    };
    const offRp = bus.on?.('research', () => { if (root.isConnected) paintCards(); });

    // ---------------- picking on the body
    stage.onHover = (p, x, y) => {
      if (phase !== 'look' || closing) p = null;
      hoverTag.classList.toggle('on', !!p);
      if (!p) return;
      hoverTag.innerHTML = `<b>${esc(PART_LABEL[p] || p)}</b>`;
      hoverTag.style.transform = `translate(${Math.round(x + 14)}px, ${Math.round(y + 10)}px)`;
    };
    stage.onPick = (p: PartKey | null) => {
      if (phase !== 'look' || closing || !p) return;
      const t = PART_TAB[p];
      if (t) setTab(t);
      stage.setFocus(p === 'head' ? 'head' : p);
    };

    // ---------------- steps
    const randomizeLooks = () => {
      const fem = (app.bodyShape ?? 0.3) > 0.5;
      const keep = { cos: app.cos, bodyShape: app.bodyShape };
      Object.assign(app, randomAppearance(Math.random), randomLooks(Math.random, fem), keep);
      faces.length = 0; faces.push(curFace()); faceAt = 0;
      sfx('confirm');
      void stage.maul(() => { stage.setAppearance(app); stage.setOutfit(prisonerOutfitFor(app, inspect())); });
      setTab(tab, false);
    };
    const toLook = () => {
      if (closing || stage.busy) return;
      phase = 'look';
      root.dataset.phase = 'look';
      stage.setView('creator');
      setTab(tab, false);
      updateHint();
      requestAnimationFrame(() => confirmBtn.focus({ preventScroll: true }));
    };
    const toSex = () => {
      if (closing || stage.busy || phase !== 'look') return;
      if (!name.trim()) { sfx('error'); setTab('id'); say('The subject needs a name.'); return; }
      const dropped = stripUnowned(app);
      if (dropped.length) say(`Try-ons returned: <b>${dropped.map((k) => esc(COSMETIC.get(k)?.name || k)).join(', ')}</b>. Buy them with RP to keep them.`);
      phase = 'sex';
      root.dataset.phase = 'sex';
      sfx('confirm');
      stage.setOutfit(prisonerOutfitFor(app, false));
      stage.setAppearance(app);
      stage.setView('gender');
      paintSex();
      paintCards();
      requestAnimationFrame(() => ((app.bodyShape ?? 0.3) > 0.5 ? pink : blue).focus({ preventScroll: true }));
    };
    const paintSex = () => {
      const fem = (app.bodyShape ?? 0.3) > 0.5;
      pink.classList.toggle('cur', fem); blue.classList.toggle('cur', !fem);
      pink.querySelector('small')!.textContent = fem ? 'current · press for a fresh clone' : 'feminine frame';
      blue.querySelector('small')!.textContent = !fem ? 'current · press for a fresh clone' : 'masculine frame';
    };
    const clone = async (fem: boolean) => {
      if (closing || stage.busy || phase !== 'sex') return;
      root.classList.add('pressing');
      (fem ? pink : blue).classList.add('down');
      sfx('press');
      await stage.press(() => {
        app.bodyShape = fem ? 0.82 + Math.random() * 0.12 : 0.04 + Math.random() * 0.16;
        if (!fem && app.hairStyle === 'long' && Math.random() < 0) app.hairStyle = 'short';
        stage.setAppearance(app);
        stage.setOutfit(prisonerOutfitFor(app, false));
      });
      (fem ? pink : blue).classList.remove('down');
      root.classList.remove('pressing');
      paintSex();
      say(`<b>CLONE ${fem ? 'P' : 'B'}-${Math.floor(100 + Math.random() * 900)}</b> · same choices, fresh body`);
      (fem ? pink : blue).focus({ preventScroll: true });
    };

    // ---------------- sheets: sentencing terms, the rehab fallback
    const termsCtx: TermsCtx = {
      sb, get preset() { return preset; }, set preset(v) { preset = v; },
      get seed() { return seed; }, set seed(v) { seed = v; },
      get directives() { return directives; }, set directives(v) { directives = v; },
      get name() { return name; },
    };
    let sheetNav: FocusNav | null = null;
    const openSheet = (title: string, el: HTMLElement, done: string, onDone: () => void) => {
      sheetNav?.destroy();
      sheet.innerHTML = '';
      const panel = h('div', 'nx-panel ik2-sheet-p');
      panel.append(h('div', 'nx-panel-h', `<b>${esc(title)}</b>`));
      const body = h('div', 'nx-panel-b'); body.append(el);
      const ok = h('button', 'ik2-go', `<b>${esc(done)}</b>`); ok.type = 'button'; hoverFocus(ok);
      ok.onclick = () => { closeSheet(); onDone(); };
      panel.append(body, ok);
      sheet.append(panel);
      sheet.classList.add('on');
      sfx('open', 0.7);
      sheetNav = new FocusNav(sheet, { onBack: () => closeSheet(), autofocus: true });
    };
    const closeSheet = () => { sheetNav?.destroy(); sheetNav = null; sheet.classList.remove('on'); sheet.innerHTML = ''; };
    let terms: ReturnType<typeof termsStation> | null = null;
    const openTerms = () => {
      if (!terms) terms = termsStation(termsCtx);
      openSheet('SENTENCING TERMS', terms.el, 'DONE ✓', () => finalBtn.focus({ preventScroll: true }));
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
      const go = () => { if (points() < 0) { sfx('error'); rehab!.deny('Not enough credits: drop a condition or take a cheaper programme.'); openSheet('REHAB SECTION', rehab!.el, 'CONTINUE ▶', go); return; } res(); };
      openSheet('REHAB SECTION', rehab.el, 'CONTINUE ▶', go);
      rehab.enter();
    });

    // ---------------- confirm: operating table, then processed
    const finish = async () => {
      if (closing || stage.busy || phase !== 'sex') return;
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
          // they climbed off the table: back to the body type
          closing = false; phase = 'sex'; root.dataset.phase = 'sex';
          requestAnimationFrame(() => finalBtn.focus({ preventScroll: true }));
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
      stage.setFocus('head');
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
      if (closing) return;
      const ok = await confirmDialog({ title: 'WITHDRAW', body: 'Back to the dark? Nothing here is kept (except what you bought).', ok: 'Withdraw', cancel: 'Stay', danger: true });
      if (!ok || closing) return;
      closing = true;
      phase = 'out';
      root.dataset.phase = 'out';
      stripUnowned(app);
      await stage.lightsOff();
      close(null);
    };

    let nav: FocusNav;
    const close = (r: IntakeResult | null) => {
      nav.destroy(); sheetNav?.destroy();
      clearTimeout(looksT); clearTimeout(toastT);
      rehab?.destroy(); terms?.destroy();
      if (typeof offRp === 'function') offRp();
      stage.onHeadScroll = undefined; stage.onPick = undefined; stage.onHover = undefined;
      if (ownHost) { stage.dispose(); ownHost.remove(); }
      root.remove();
      if (G?.input) G.input.textFocus = false;
      resolve(r);
    };

    // ---------------- go: lights on, then the lab
    document.body.append(root);
    root.dataset.phase = 'intro';
    stage.setAppearance(app);
    stage.setOutfit(prisonerOutfitFor(app, false));
    buildWardrobe();
    setTab('face', false);
    stage.setFocus('full');
    refreshRp();
    nav = new FocusNav(root, {
      onBack: () => { if (closing) return; if (sheet.classList.contains('on')) closeSheet(); else if (phase === 'sex') toLook(); else if (phase === 'look') withdraw(); },
      onTab: (d) => { if (closing || phase !== 'look') return; const i = TABS.findIndex((t) => t[0] === tab); setTab(TABS[(i + d + TABS.length) % TABS.length][0]); },
      autofocus: false,
    });
    stage.lightsOn().then(() => { if (!closing) toLook(); });
    if (import.meta.env.DEV) (window as any).__intake = { stage, app, setTab, newFace, toSex, toLook, clone, finish, wearCard: (k: string) => { const c = COSMETIC.get(k)!; wearCard(c, c.slot); }, buyIt: (k: string) => buyIt(COSMETIC.get(k)!), get phase() { return phase; } };
  });
}
