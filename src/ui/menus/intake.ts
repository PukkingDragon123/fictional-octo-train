// INTAKE PROCESSING. A new debtor-convict is processed in three rooms:
//  01 INTAKE  the prisoner stands under the mugshot lights; click or tap the
//             body itself to examine a part, and the options appear as things
//             in the room (an identikit frame, a barber's chart, a tattoo
//             flash sheet, a fingerprint card, the uniform issue slip...)
//  02 REHAB   jobs and traits as rehab programmes and conditions (rehab.ts)
//  03 TERMS   the sentencing terms clipboard: world rules (terms.ts)
// PROCESS walks back to the lights for the mugshot: number board, flash,
// profile, flash, PROCESSED.
import { Appearance, Outfit, SKIN_TONES, randomAppearance, EYE_COLORS } from '../../entities/humanRig';
import { Player } from '../../entities/player';
import { OCCUPATIONS, TRAITS, Occupation, occupationAvailable, traitAvailable, occupationByKey } from '../../survival/traits';
import { hasItemDef, itemDef } from '../../items/item';
import {
  FACE_SHAPES, EYE_SHAPES, BROWS, NOSES, MOUTHS, EARS, FACIAL_HAIR_ALL, HAIR_STYLES_ALL, HAIR_DYES, TATTOO_SPOTS, TATTOOS, tattoosFor, SCAR_SPOTS, BODY_SCARS,
  KNUCKLES, NAILS, SUIT_SLEEVES, SUIT_WEAR, STAINS, PATCHES, FEET_KIT, feetKitItems, randomLooks, suitNumber, shapeOf, eyeShapeOf, browsOf, noseOf, mouthOf, Opt,
} from '../../entities/humanLooks';
import { h, esc, FocusNav, sfx, hoverFocus, confirmDialog } from './common';
import { IntakeStage, Pickable } from './preview3d';
import { G } from '../../game/G';
import { toUrl } from '../pixelkit';
import { tattooImage, hairIcon, stampWord } from './art';
import { rehabStation, RehabCtx } from './rehab';
import { termsStation, TermsCtx, PRESETS } from './terms';
import './diegetic.css';

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
  const r = outfitOfItems([...clothes, ...o.items.filter((k) => hasItemDef(k) && (itemDef(k).clothing || itemDef(k).bag))]);
  return r;
}
/** the Remittance issue: jumpsuit (or a stand-in until it exists) and the chosen footwear */
function prisonerOutfit(app: Appearance, inspect: boolean): Outfit {
  const keys = [hasItemDef('prison_jumpsuit') ? 'prison_jumpsuit' : 'janitor_uniform', ...feetKitItems(app)];
  const { outfit } = outfitOfItems(keys);
  if (!hasItemDef('prison_jumpsuit')) {
    // stand-in: the coverall painter in programme yellow
    for (const k of ['torso', 'legs'] as const) if (outfit[k]) outfit[k] = { ...outfit[k]!, color: 0xd9a826 };
  }
  // canvas slip-ons: plain off-white shoes (the slippers item is pink and fluffy)
  if ((app.feetKit ?? 'slipons') === 'slipons' && !hasItemDef('canvas_slipons')) outfit.feet = { tex: 'c_shoes_sneaker', color: 0xe4e0d4, item: 'slipons' };
  if (inspect) {
    // examining body marks: the top half of the jumpsuit comes down
    outfit.torso = { tex: (app.bodyShape ?? 0.3) > 0.5 ? 'c_bandeau' : 'c_bare', color: 0xe8e4d8, sleeve: 'none' };
  }
  return outfit;
}

// ---------------------------------------------------------------- labels
const PART_LABEL: Record<string, string> = {
  head: 'FACE', hair: 'HAIR', torso: 'BODY MARKS', armL: 'LEFT ARM', armR: 'RIGHT ARM', handL: 'HANDS', handR: 'HANDS', legL: 'BUILD', legR: 'BUILD', feet: 'FEET',
  chart: 'HEIGHT CHART', board: 'BOOKING BOARD', uniform: 'ISSUE UNIFORM',
};
const TAGS: [string, string][] = [['head', 'Face'], ['hair', 'Hair'], ['torso', 'Body'], ['armL', 'L. arm'], ['armR', 'R. arm'], ['handL', 'Hands'], ['legL', 'Build'], ['feet', 'Feet'], ['uniform', 'Uniform'], ['board', 'Name']];
const SKIN_ALL = [0xf8dcc8, ...SKIN_TONES, 0x4a2c1c];
const BUILDS: [string, string, number][] = [['wiry', 'Wiry', 58], ['slim', 'Slim', 64], ['average', 'Average', 75], ['broad', 'Broad', 86], ['stocky', 'Stocky', 92], ['heavy', 'Heavy', 108]];
const STATIONS = ['INTAKE', 'REHAB', 'TERMS'];
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const fmtDate = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.87`; };

/** show the intake; resolves with the processed prisoner or null if they walked out */
export function intakeForm(opts: { title?: string; sandbox?: boolean; directives?: boolean; submit?: string } = {}): Promise<IntakeResult | null> {
  return new Promise((resolve) => {
    const fem0 = Math.random() < 0.5;
    const app: Appearance = { ...randomAppearance(Math.random), ...randomLooks(Math.random, fem0) };
    let name = randomName();
    let occ = 'unemployed';
    const traits = new Set<string>();
    let preset = 'standard';
    const sb: Record<string, number> = { ...((G?.sandbox as any) || {}), ...PRESETS.standard.s };
    let seed = Math.floor(Math.random() * 99999);
    let directives = opts.directives ?? true;
    const withSandbox = opts.sandbox !== false;
    const stations = withSandbox ? STATIONS : STATIONS.slice(0, 2);
    let station = 0;
    let part: string | null = null;
    let closing = false;

    // ---------------- skeleton
    const root = h('div', 'ik');
    const stageHost = h('div', 'ik-stage');
    const hud = h('div', 'ik-hud');
    const props = h('div', 'ik-props');
    const rooms = [stageHost, h('div', 'ik-room rh'), h('div', 'ik-room tm')];
    root.append(...rooms, hud, props);
    const stage = new IntakeStage(stageHost);
    const portrait = () => innerWidth / innerHeight < 0.8;

    // HUD: plates, station signs, tags, the go button
    const plate = h('div', 'ik-plate', `<b>${esc(opts.title || 'INTAKE PROCESSING')}</b><span>MERIDIAN INSTITUTE · WING B · REMITTANCE PROGRAMME</span>`);
    const rec = h('div', 'ik-rec', '<i></i>CAM 2 <b>REC</b> <span class="tc"></span>');
    const signs = h('div', 'ik-signs');
    const signBtns = stations.map((s, i) => {
      const b = h('button', 'ik-sign' + (i === 0 ? ' on' : ''), `<small>${String(i + 1).padStart(2, '0')}</small>${s}`);
      b.type = 'button';
      hoverFocus(b);
      b.onclick = () => goStation(i);
      signs.append(b);
      return b;
    });
    const back = h('button', 'ik-exit', '<span>◀</span> WITHDRAW');
    back.type = 'button';
    hoverFocus(back);
    back.onclick = () => withdraw();
    const caption = h('div', 'ik-caption');
    const hoverTag = h('div', 'ik-hovertag');
    const tags = h('div', 'ik-tags');
    const tagBtns = new Map<string, HTMLButtonElement>();
    for (const [k, l] of TAGS) {
      const b = h('button', 'ik-tag', `<i></i>${esc(l)}`);
      b.type = 'button';
      b.dataset.part = k;
      hoverFocus(b);
      b.onclick = () => select(part === k || (part && sameGroup(part, k)) ? null : k);
      tags.append(b);
      tagBtns.set(k, b);
    }
    const credits = h('div', 'ik-credits', '<span>REHAB CREDITS</span><b>00</b>');
    const go = h('button', 'ik-go', '');
    go.type = 'button';
    hoverFocus(go);
    go.onclick = () => (station < stations.length - 1 ? goStation(station + 1) : processPrisoner());
    const hint = h('div', 'ik-hint', '');
    const flashEl = h('div', 'ik-flash');
    const stampEl = h('div', 'ik-stamp');
    hud.append(plate, rec, signs, back, caption, hoverTag, tags, credits, go, hint, flashEl, stampEl);
    {
      const img = new Image();
      img.src = toUrl(stampWord(opts.submit ? opts.submit.toUpperCase() : 'PROCESSED', 0xc8261e, 3));
      img.alt = 'PROCESSED';
      stampEl.append(img);
    }

    // timecode
    let tcT = 0;
    const tc = rec.querySelector('.tc') as HTMLElement;
    const tick = () => {
      if (!root.isConnected) return;
      const d = new Date();
      tc.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
      tcT = window.setTimeout(tick, 1000);
    };
    tick();

    // ---------------- state helpers
    const points = () => {
      let p = occupationByKey(occ).points;
      for (const k of traits) p += TRAITS.find((x) => x.key === k)?.cost ?? 0;
      return p;
    };
    let lastPts = NaN;
    const updateCredits = () => {
      const p = points();
      const b = credits.querySelector('b') as HTMLElement;
      b.textContent = (p < 0 ? '-' : '') + String(Math.abs(p)).padStart(2, '0');
      credits.classList.toggle('bad', p < 0);
      if (p !== lastPts && !Number.isNaN(lastPts)) { credits.classList.remove('bump'); void credits.offsetWidth; credits.classList.add('bump'); }
      lastPts = p;
      rehab?.refresh();
    };
    const updateGo = () => {
      const last = station === stations.length - 1;
      go.innerHTML = last ? `<b>PROCESS</b><small>${esc(name.trim() || 'unnamed')}</small>` : `<b>NEXT</b><small>${stations[station + 1]} ▶</small>`;
      go.classList.toggle('final', last);
      hint.innerHTML = station === 0
        ? (part ? `<kbd>Esc</kbd> step back · <kbd>Q</kbd><kbd>E</kbd> rooms` : (matchMedia('(pointer: coarse)').matches ? 'tap the prisoner to examine a part · drag to turn them' : 'click the prisoner to examine a part · drag to turn · <kbd>Q</kbd><kbd>E</kbd> rooms'))
        : '<kbd>Q</kbd><kbd>E</kbd> rooms · <kbd>Esc</kbd> back';
    };
    let looksT = 0;
    const refreshLooks = (react = '') => {
      clearTimeout(looksT);
      looksT = window.setTimeout(() => {
        stage.setAppearance(app);
        stage.setOutfit(prisonerOutfit(app, part === 'torso' || part === 'armL' || part === 'armR'));
        if (react) stage.react(react);
        stage.setBoard(name, '', fmtDate());
      }, 30);
    };
    const refreshOutfit = () => stage.setOutfit(prisonerOutfit(app, part === 'torso' || part === 'armL' || part === 'armR'));
    const setCaption = (s: string) => { caption.textContent = s ? 'SUBJECT ' + s : ''; caption.classList.toggle('on', !!s); };
    stage.onEmote = (l) => { if (!closing) setCaption(l); };
    stage.onHover = (p, x, y) => {
      hoverTag.classList.toggle('on', !!p);
      if (!p) return;
      hoverTag.innerHTML = `<b>${esc(PART_LABEL[p] || p)}</b><small>${part && sameGroup(part, p) ? 'examining' : 'examine'}</small>`;
      const r = root.getBoundingClientRect();
      hoverTag.style.transform = `translate(${Math.round(x - r.left + 14)}px, ${Math.round(y - r.top + 10)}px)`;
    };
    stage.onPick = (p) => { if (station !== 0 || closing) return; if (!p) { if (part) select(null); return; } select(part && sameGroup(part, p) ? null : p); };
    const sameGroup = (a: string, b: string) => a === b || (a.startsWith('hand') && b.startsWith('hand')) || (a.startsWith('leg') && b.startsWith('leg')) || ((a === 'legL' || a === 'chart') && (b === 'legL' || b === 'legR' || b === 'chart'));

    // ---------------- examination props
    const select = (k: string | null) => {
      if (closing) return;
      if (k === 'legR') k = 'legL';
      if (k === 'handR') k = 'handL';
      if (k === 'chart') k = 'legL';
      const was = part;
      part = k;
      for (const [tk, b] of tagBtns) b.classList.toggle('on', !!k && sameGroup(k, tk));
      root.classList.toggle('examining', !!k);
      stage.focus(k === 'legL' ? 'legs' : k === 'handL' ? 'hands' : k, portrait() ? 'bottom' : 'right');
      const inspectNow = k === 'torso' || k === 'armL' || k === 'armR', inspectWas = was === 'torso' || was === 'armL' || was === 'armR';
      if (inspectNow !== inspectWas) refreshOutfit();
      props.innerHTML = '';
      props.classList.toggle('on', !!k);
      if (k) {
        const el = buildProps(k);
        props.append(el);
        props.scrollTop = 0;
        sfx('open', 0.5);
        if (k === 'head') stage.react('stare');
        else if (k === 'hair') stage.react('touch_hair');
        else if (k === 'feet') stage.react('look_down');
        else if (k === 'board') stage.react('crack_neck');
      } else sfx('back', 0.5);
      updateGo();
    };

    /** a physical object holding options: a labelled frame / sheet / card */
    const obj = (kind: string, title: string, sub = '') => {
      const o = h('section', 'ob ob-' + kind, `<header><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</header>`);
      return o;
    };
    const opt = (cls: string, html: string, on: boolean, click: () => void, label?: string) => {
      const b = h('button', 'ob-o ' + cls + (on ? ' on' : ''), html);
      b.type = 'button';
      if (label) b.setAttribute('aria-label', label);
      b.setAttribute('aria-pressed', String(on));
      hoverFocus(b);
      b.onclick = () => { click(); };
      return b;
    };
    const mark = (wrap: HTMLElement, b: HTMLElement) => { wrap.querySelectorAll('.ob-o').forEach((o) => { o.classList.toggle('on', o === b); o.setAttribute('aria-pressed', String(o === b)); }); };
    /** identikit strip: ◀ LABEL · VALUE ▶ */
    const strip = (label: string, list: Opt[], get: () => number, set: (i: number) => void, react = 'stare') => {
      const s = h('div', 'ob-strip');
      const val = h('button', 'ob-strip-v', '');
      val.type = 'button';
      const paint = () => { const i = get(); val.innerHTML = `<small>${esc(label)}</small><b>${esc(list[i]?.name ?? '?')}</b><em>${i + 1}/${list.length}</em>`; val.title = list[get()]?.note || ''; };
      const step = (d: number) => { const i = (get() + d + list.length) % list.length; set(i); paint(); sfx('tick'); s.classList.remove('flip'); void s.offsetWidth; s.classList.add('flip'); refreshLooks(react); };
      const l = h('button', 'ob-strip-a', '◀'); l.type = 'button'; l.setAttribute('aria-label', label + ': previous'); l.onclick = () => step(-1);
      const r = h('button', 'ob-strip-a', '▶'); r.type = 'button'; r.setAttribute('aria-label', label + ': next'); r.onclick = () => step(1);
      val.onclick = () => step(1);
      for (const b of [l, val, r]) hoverFocus(b);
      paint();
      s.append(l, val, r);
      return s;
    };
    const swatches = (list: number[], cur: () => number, set: (c: number) => void, cls = 'chip', react = 'stare') => {
      const row = h('div', 'ob-swatches ' + cls);
      for (const c of list) {
        const b = opt('ob-sw', `<i style="background:${hex(c)}"></i>`, c === cur(), () => { set(c); mark(row, b); sfx('toggle'); refreshLooks(react); }, 'colour ' + hex(c));
        row.append(b);
      }
      return row;
    };
    const tape = (label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void, fmt: (v: number) => string, react = '') => {
      const w = h('label', 'ob-tape');
      const inp = h('input') as HTMLInputElement;
      inp.type = 'range'; inp.min = String(min); inp.max = String(max); inp.step = String(step); inp.value = String(get());
      inp.setAttribute('aria-label', label);
      const out = h('output', '', esc(fmt(get())));
      const paint = () => w.style.setProperty('--p', String((Number(inp.value) - min) / (max - min)));
      paint();
      hoverFocus(inp);
      inp.oninput = () => { set(Number(inp.value)); out.textContent = fmt(Number(inp.value)); paint(); sfx('tick'); refreshLooks(); };
      inp.onchange = () => { if (react) stage.react(react); };
      w.append(h('span', 'ob-tape-l', esc(label)), inp, out);
      return w;
    };
    const stampRow = (label: string, list: Opt[], cur: () => string, set: (k: string) => void, react = '') => {
      const row = h('div', 'ob-row', `<span class="ob-row-l">${esc(label)}</span>`);
      const box = h('div', 'ob-row-o');
      for (const o of list) {
        const b = opt('ob-box', `<i></i>${esc(o.name)}`, o.key === cur(), () => { set(o.key); mark(box, b); sfx('stamp', 0.5); refreshLooks(react); });
        box.append(b);
      }
      row.append(box);
      return row;
    };

    let tatSpot = 'chest', scarSpot = 'chest';
    const buildProps = (k: string): HTMLElement => {
      const wrap = h('div', 'ik-props-in');
      const close = h('button', 'ik-props-x', 'DONE ✓');
      close.type = 'button'; hoverFocus(close); close.onclick = () => select(null);
      if (k === 'head') {
        const kit = obj('kit', 'IDENTIKIT', 'composite face kit · flip each strip');
        kit.append(
          strip('Face shape', FACE_SHAPES, () => shapeIndex(), (i) => { app.jaw = i; }),
          strip('Eyes', EYE_SHAPES, () => eyeShapeOf(app), (i) => { app.eyeShape = i; }),
          strip('Brows', BROWS, () => browsOf(app), (i) => { app.brows = i; }, 'crack_neck'),
          strip('Nose', NOSES, () => noseOf(app), (i) => { app.nose = i; }, 'wipe'),
          strip('Mouth', MOUTHS, () => mouthOf(app), (i) => { app.mouth = i; }),
          strip('Ears', EARS, () => app.ears ?? 0, (i) => { app.ears = i; }, 'turn_head'),
          strip('Facial hair', FACIAL_HAIR_ALL, () => Math.max(0, FACIAL_HAIR_ALL.findIndex((f) => f.key === (app.facialHair || 'none'))), (i) => { (app as any).facialHair = FACIAL_HAIR_ALL[i].key; app.beard = FACIAL_HAIR_ALL[i].key === 'beard'; }),
          strip('Face scars', [{ key: '0', name: 'None' }, { key: '1', name: 'One' }, { key: '2', name: 'Two' }, { key: '3', name: 'Several' }], () => app.scars ?? 0, (i) => { app.scars = i; }),
          strip('Freckles', [{ key: '0', name: 'None' }, { key: '1', name: 'A few' }, { key: '2', name: 'Lots' }], () => ((app.freckles ?? 0) < 0.15 ? 0 : (app.freckles ?? 0) < 0.6 ? 1 : 2), (i) => { app.freckles = [0, 0.4, 0.9][i]; }),
          strip('Wear and tear', [{ key: '0', name: 'Young' }, { key: '1', name: 'Lined' }, { key: '2', name: 'Weathered' }, { key: '3', name: 'Old' }], () => Math.min(3, Math.round((app.age ?? 0) / 0.3)), (i) => { app.age = [0, 0.3, 0.6, 0.9][i]; }),
        );
        const eyes = obj('cork', 'IRIS SAMPLES', 'pinned');
        eyes.append(swatches(EYE_COLORS, () => app.eyeColor ?? -1, (c) => { app.eyeColor = c; }, 'marbles'));
        const skin = obj('cork', 'SKIN TONE', 'paint chips');
        skin.append(swatches(SKIN_ALL, () => app.skin, (c) => { app.skin = c; }, 'chip'));
        wrap.append(kit, eyes, skin);
      } else if (k === 'hair') {
        const chart = obj('chart', 'CLIPPER CHART', 'barber · wing B');
        const grid = h('div', 'ob-grid hair');
        for (const st of HAIR_STYLES_ALL) {
          const b = opt('ob-card', `<img src="${toUrl(hairIcon(st.key, app.hair, app.skin))}" alt=""><span>${esc(st.name)}</span>`, app.hairStyle === st.key, () => { (app as any).hairStyle = st.key; mark(grid, b); sfx('toggle'); refreshLooks('touch_hair'); });
          grid.append(b);
        }
        chart.append(grid);
        const dye = obj('cork', 'DYE SAMPLES', 'tufts');
        dye.append(swatches(HAIR_DYES, () => app.hair, (c) => { app.hair = c; grid.querySelectorAll('img').forEach((im, i) => { (im as HTMLImageElement).src = toUrl(hairIcon(HAIR_STYLES_ALL[i].key, c, app.skin)); }); }, 'tufts', 'touch_hair'));
        const fh = obj('kit', 'FACIAL HAIR');
        fh.append(strip('Facial hair', FACIAL_HAIR_ALL, () => Math.max(0, FACIAL_HAIR_ALL.findIndex((f) => f.key === (app.facialHair || 'none'))), (i) => { (app as any).facialHair = FACIAL_HAIR_ALL[i].key; app.beard = FACIAL_HAIR_ALL[i].key === 'beard'; }));
        wrap.append(chart, dye, fh);
      } else if (k === 'torso' || k === 'armL' || k === 'armR') {
        if (k === 'torso') {
          const sc = obj('scale', 'BUILD', 'platform scale · kg');
          const row = h('div', 'ob-scale');
          for (const [bk, bl, kg] of BUILDS) {
            const b = opt('ob-weight', `<b>${kg}</b><span>${esc(bl)}</span>`, String(app.build) === bk, () => { (app as any).build = bk; mark(row, b); sfx('toggle'); refreshLooks('stretch'); });
            row.append(b);
          }
          sc.append(row, tape('Frame', 0, 1, 0.05, () => app.bodyShape ?? 0.3, (v) => { app.bodyShape = v; }, (v) => (v < 0.34 ? 'square' : v > 0.66 ? 'curved' : 'in between'), 'stretch'));
          const skin = obj('cork', 'SKIN TONE', 'paint chips');
          skin.append(swatches(SKIN_ALL, () => app.skin, (c) => { app.skin = c; }, 'chip'));
          wrap.append(sc, skin);
        }
        const spots = k === 'torso' ? ['chest', 'back', 'belly', 'neck', 'face'] : k === 'armL' ? ['uarm_l', 'farm_l'] : ['uarm_r', 'farm_r'];
        if (!spots.includes(tatSpot)) tatSpot = spots[0];
        const flash = obj('sheet', 'TATTOO FLASH', 'pick a spot, then a design');
        const spotRow = h('div', 'ob-spots');
        const dGrid = h('div', 'ob-grid flash');
        const paintDesigns = () => {
          dGrid.innerHTML = '';
          const cur = app.tattoos?.[tatSpot] || '';
          const none = opt('ob-flash none', '<span>NONE</span>', !cur, () => { const t = { ...(app.tattoos || {}) }; delete t[tatSpot]; app.tattoos = t; mark(dGrid, none); sfx('back', 0.5); refreshLooks(); paintSpots(); });
          dGrid.append(none);
          for (const d of tattoosFor(tatSpot)) {
            const b = opt('ob-flash', `<img src="${toUrl(tattooImage(d, 3))}" alt=""><span>${esc(TATTOOS[d].name)}</span>`, cur === d, () => {
              app.tattoos = { ...(app.tattoos || {}), [tatSpot]: d }; mark(dGrid, b); sfx('stamp', 0.4); refreshLooks(); stage.doFlash(false); paintSpots();
            });
            dGrid.append(b);
          }
        };
        const paintSpots = () => {
          spotRow.innerHTML = '';
          for (const sp of spots) {
            const has = !!app.tattoos?.[sp];
            const b = opt('ob-spot' + (has ? ' inked' : ''), `<i></i>${esc(TATTOO_SPOTS[sp].name)}`, sp === tatSpot, () => { tatSpot = sp; mark(spotRow, b); sfx('tick'); paintDesigns(); });
            spotRow.append(b);
          }
        };
        paintSpots(); paintDesigns();
        flash.append(spotRow, dGrid);
        const sSpots = Object.keys(SCAR_SPOTS).filter((s) => (k === 'torso' ? ['brow', 'chest', 'belly', 'back'] : k === 'armL' ? ['uarm_l', 'farm_l'] : ['uarm_r', 'farm_r']).includes(s));
        if (!sSpots.includes(scarSpot)) scarSpot = sSpots[0];
        const med = obj('card', 'MEDICAL HISTORY', 'old wounds, noted');
        const sRow = h('div', 'ob-spots');
        const kRow = h('div', 'ob-row-o');
        const paintKinds = () => {
          kRow.innerHTML = '';
          const cur = app.bodyScars?.[scarSpot] || '';
          const none = opt('ob-box', '<i></i>None', !cur, () => { const t = { ...(app.bodyScars || {}) }; delete t[scarSpot]; app.bodyScars = t; mark(kRow, none); sfx('back', 0.5); refreshLooks(); });
          kRow.append(none);
          for (const [sk, sl] of Object.entries(BODY_SCARS)) {
            const b = opt('ob-box', `<i></i>${esc(sl)}`, cur === sk, () => { app.bodyScars = { ...(app.bodyScars || {}), [scarSpot]: sk }; mark(kRow, b); sfx('stamp', 0.5); refreshLooks('wipe'); });
            kRow.append(b);
          }
        };
        for (const sp of sSpots) {
          const b = opt('ob-spot', `<i></i>${esc(SCAR_SPOTS[sp].name)}`, sp === scarSpot, () => { scarSpot = sp; mark(sRow, b); sfx('tick'); paintKinds(); });
          sRow.append(b);
        }
        paintKinds();
        med.append(sRow, kRow);
        wrap.append(flash, med);
      } else if (k === 'handL') {
        const card = obj('card', 'FINGERPRINT CARD', 'right hand · left hand');
        card.append(h('div', 'ob-prints', '<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>'));
        const kn = h('div', 'ob-grid knuckles');
        for (const [kk, kv] of Object.entries(KNUCKLES)) {
          const b = opt('ob-knuckle', `<b>${esc(kv.l || '·')}</b><b>${esc(kv.r || '·')}</b><span>${esc(kv.name)}</span>`, (app.knuckles || 'none') === kk, () => { app.knuckles = kk; mark(kn, b); sfx('stamp', 0.4); refreshLooks(); stage.doFlash(false); });
          kn.append(b);
        }
        card.append(h('div', 'ob-sub', 'KNUCKLES'), kn, h('div', 'ob-sub', 'NAILS'));
        const nl = h('div', 'ob-row-o');
        for (const [nk, nv] of Object.entries(NAILS)) {
          const b = opt('ob-box', `<i style="${nv.color ? `background:${hex(nv.color)}` : ''}"></i>${esc(nv.name)}`, (app.nails || 'clean') === nk, () => { app.nails = nk; mark(nl, b); sfx('toggle'); refreshLooks(); });
          nl.append(b);
        }
        card.append(nl);
        const skin = obj('cork', 'SKIN TONE', 'paint chips');
        skin.append(swatches(SKIN_ALL, () => app.skin, (c) => { app.skin = c; }, 'chip'));
        wrap.append(card, skin);
      } else if (k === 'legL') {
        const m = obj('tape', 'MEASUREMENT', 'against the chart');
        m.append(
          tape('Height', 0.92, 1.08, 0.01, () => app.height, (v) => { app.height = v; }, (v) => `${Math.round(172 * v)} cm`, 'stretch'),
          tape('Frame', 0, 1, 0.05, () => app.bodyShape ?? 0.3, (v) => { app.bodyShape = v; }, (v) => (v < 0.34 ? 'square' : v > 0.66 ? 'curved' : 'in between'), 'stretch'),
        );
        const sc = obj('scale', 'BUILD', 'platform scale · kg');
        const row = h('div', 'ob-scale');
        for (const [bk, bl, kg] of BUILDS) {
          const b = opt('ob-weight', `<b>${kg}</b><span>${esc(bl)}</span>`, String(app.build) === bk, () => { (app as any).build = bk; mark(row, b); sfx('toggle'); refreshLooks('stretch'); });
          row.append(b);
        }
        sc.append(row);
        wrap.append(m, sc);
      } else if (k === 'feet') {
        const t = obj('tags', 'PROPERTY · FOOTWEAR', 'issued on intake');
        const row = h('div', 'ob-grid feet');
        for (const f of FEET_KIT) {
          const b = opt('ob-luggage', `<i></i><b>${esc(f.name)}</b>`, (app.feetKit ?? 'slipons') === f.key, () => { app.feetKit = f.key; mark(row, b); sfx('toggle'); refreshLooks('look_down'); });
          row.append(b);
        }
        t.append(row);
        wrap.append(t);
      } else if (k === 'uniform') {
        const s = obj('slip', 'UNIFORM ISSUE SLIP', 'form U-2 · stamp one per line');
        const suit = () => (app.suit ||= {});
        s.append(
          stampRow('Sleeves', SUIT_SLEEVES, () => suit().sleeves || 'down', (v) => { suit().sleeves = v; }, 'stretch'),
          stampRow('Condition', SUIT_WEAR, () => String(suit().wear ?? 0), (v) => { suit().wear = Number(v); }),
          stampRow('Stains', STAINS, () => suit().stains || 'none', (v) => { suit().stains = v; }, 'wipe'),
          stampRow('Number patch', PATCHES, () => suit().patch || 'stitched', (v) => { suit().patch = v; }),
        );
        s.append(h('p', 'ob-note', 'Your number is assigned when you are processed. It is stencilled on your back.'));
        wrap.append(s);
      } else if (k === 'board') {
        const b = obj('felt', 'BOOKING BOARD', 'name of the debtor');
        const row = h('div', 'ob-namerow');
        const ni = h('input', 'ob-name') as HTMLInputElement;
        ni.value = name; ni.maxLength = 24; ni.spellcheck = false; ni.setAttribute('aria-label', 'Name');
        ni.addEventListener('input', () => { name = ni.value; stage.setBoard(name, '', fmtDate()); updateGo(); rehab?.refresh(); });
        ni.addEventListener('focus', () => { if (G?.input) G.input.textFocus = true; });
        ni.addEventListener('blur', () => { if (G?.input) G.input.textFocus = false; });
        const dice = h('button', 'ob-dice', '⚄ <span>Another name</span>');
        (dice as HTMLButtonElement).type = 'button';
        hoverFocus(dice);
        dice.onclick = () => { name = randomName(); ni.value = name; stage.setBoard(name, '', fmtDate()); sfx('click'); updateGo(); stage.react('crack_neck'); };
        row.append(ni, dice);
        b.append(row, h('p', 'ob-note', 'NUMBER: <b>D-____</b> · assigned at processing'));
        wrap.append(b);
        requestAnimationFrame(() => { if (!matchMedia('(pointer: coarse)').matches) ni.focus({ preventScroll: true }); });
      }
      const someone = h('button', 'ik-props-rand', '⚄ Somebody else');
      (someone as HTMLButtonElement).type = 'button';
      hoverFocus(someone);
      someone.onclick = () => randomizeLooks();
      const foot = h('div', 'ik-props-foot');
      foot.append(someone, close);
      wrap.append(foot);
      return wrap;
    };
    const shapeIndex = () => {
      if (app.jaw != null) return app.jaw;
      const s = shapeOf(app);
      return s.jaw > 1.04 ? 6 : s.jaw < 0.98 ? 4 : 0;
    };

    // ---------------- stations
    const rehabCtx: RehabCtx = {
      get occ() { return occ; }, set occ(v) { occ = v; updateCredits(); },
      traits, points, onChange: () => updateCredits(),
      get name() { return name; },
      mugshot: () => stage.snapshot(24, 24),
    };
    let rehab: ReturnType<typeof rehabStation> | null = null;
    const termsCtx: TermsCtx = {
      sb, get preset() { return preset; }, set preset(v) { preset = v; },
      get seed() { return seed; }, set seed(v) { seed = v; },
      get directives() { return directives; }, set directives(v) { directives = v; },
      get name() { return name; },
    };
    let terms: ReturnType<typeof termsStation> | null = null;
    const goStation = (i: number) => {
      if (closing) return;
      i = Math.max(0, Math.min(stations.length - 1, i));
      if (i === station && rooms[i].classList.contains('on')) return;
      const dir = i > station ? 1 : -1;
      station = i;
      if (part && i !== 0) select(null);
      signBtns.forEach((b, j) => b.classList.toggle('on', j === i));
      rooms.forEach((r, j) => { r.classList.toggle('on', j === i); r.classList.toggle('from-l', dir < 0); });
      root.dataset.station = String(i);
      stage.visible = i === 0;
      if (i === 1) { if (!rehab) { rehab = rehabStation(rehabCtx); rooms[1].append(rehab.el); } rehab.enter(); }
      if (i === 2) { if (!terms) { terms = termsStation(termsCtx); rooms[2].append(terms.el); } terms.enter(); }
      sfx('tab');
      updateGo();
      requestAnimationFrame(() => (rooms[i].querySelector('button:not([disabled]), input') as HTMLElement | null)?.focus?.({ preventScroll: true }));
    };

    // ---------------- actions
    const randomizeLooks = () => {
      const fem = Math.random() < 0.5;
      Object.assign(app, randomAppearance(Math.random), randomLooks(Math.random, fem));
      sfx('confirm');
      refreshLooks('stretch');
      if (part) { const k = part; part = null; select(k); }
    };

    const withdraw = async () => {
      if (closing) return;
      const ok = await confirmDialog({ title: 'WITHDRAW', body: 'Walk out of processing? Nothing here is kept.', ok: 'Walk out', cancel: 'Stay', danger: true });
      if (ok) close(null);
    };

    const processPrisoner = () => {
      if (closing) return;
      if (points() < 0) {
        sfx('error');
        go.classList.remove('shake'); void go.offsetWidth; go.classList.add('shake');
        credits.classList.remove('bad'); void credits.offsetWidth; credits.classList.add('bad');
        goStation(1);
        rehab?.deny('Not enough rehab credits: drop a condition or take a cheaper programme.');
        return;
      }
      if (!name.trim()) { sfx('error'); goStation(0); select('board'); return; }
      closing = true;
      root.classList.add('processing');
      goStationRaw(0);
      select0();
      stage.idle = false;
      const number = suitNumber(stage.rigSeed);
      stage.setBoard(name.trim(), number, fmtDate());
      stage.frameKey('mugshot');
      stage.holdBoard(true);
      stage.setYaw(0);
      const steps: [number, () => void][] = [
        [300, () => setCaption('HOLDS THE BOARD')],
        [1300, () => { caption.textContent = 'OFFICER: Look at the camera.'; caption.classList.add('on'); }],
        [2300, () => { shutter(); }],
        [3500, () => { caption.textContent = 'OFFICER: Turn to your left.'; stage.setYaw(Math.PI / 2); }],
        [4900, () => { shutter(); }],
        [6000, () => { stage.setYaw(0); caption.textContent = `${number} · ${name.trim().toUpperCase()}`; }],
        [6500, () => { sfx('stamp'); stampEl.classList.add('on'); }],
        [7800, () => close({ name: name.trim().slice(0, 24), app: { ...app }, occupation: occ, traits: [...traits], sandbox: { ...sb }, seed, directives })],
      ];
      for (const [t, f] of steps) timers.push(window.setTimeout(f, t));
    };
    const timers: number[] = [];
    const shutter = () => {
      sfx('shutter');
      stage.doFlash(true);
      flashEl.classList.remove('on'); void flashEl.offsetWidth; flashEl.classList.add('on');
    };
    const goStationRaw = (i: number) => {
      station = i;
      signBtns.forEach((b, j) => b.classList.toggle('on', j === i));
      rooms.forEach((r, j) => r.classList.toggle('on', j === i));
      root.dataset.station = String(i);
      stage.visible = i === 0;
    };
    const select0 = () => { part = null; props.classList.remove('on'); props.innerHTML = ''; root.classList.remove('examining'); for (const b of tagBtns.values()) b.classList.remove('on'); stage.focus(null, 'none'); };

    let nav: FocusNav;
    const close = (r: IntakeResult | null) => {
      nav.destroy();
      clearTimeout(tcT); clearTimeout(looksT);
      for (const t of timers) clearTimeout(t);
      rehab?.destroy(); terms?.destroy();
      stage.dispose();
      root.remove();
      if (G?.input) G.input.textFocus = false;
      resolve(r);
    };

    // ---------------- go
    document.body.append(root);
    rooms[0].classList.add('on');
    root.dataset.station = '0';
    stage.setAppearance(app);
    stage.setOutfit(prisonerOutfit(app, false));
    stage.setBoard(name, '', fmtDate());
    updateCredits();
    updateGo();
    nav = new FocusNav(root, {
      onBack: () => { if (closing) return; if (part) select(null); else if (station > 0) goStation(station - 1); else withdraw(); },
      onTab: (d) => { if (!closing) goStation(station + d); },
      autofocus: false,
    });
    if (!matchMedia('(pointer: coarse)').matches) requestAnimationFrame(() => tagBtns.get('head')?.focus({ preventScroll: true }));
    sfx('open');
    window.addEventListener('resize', onResize);
    function onResize() { if (!root.isConnected) { window.removeEventListener('resize', onResize); return; } if (part) stage.focus(part === 'legL' ? 'legs' : part === 'handL' ? 'hands' : part, portrait() ? 'bottom' : 'right'); }
    if (import.meta.env.DEV) (window as any).__intake = { stage, app, select, goStation, process: processPrisoner, randomizeLooks, refreshLooks, get part() { return part; }, rehab: () => rehab, terms: () => terms, traits, setOcc: (k: string) => { occ = k; updateCredits(); } };
    void OCCUPATIONS; void occupationAvailable; void traitAvailable;
  });
}
