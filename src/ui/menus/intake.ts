// Character creation as a Meridian Institute personnel file: a live 3D
// subject viewer on the left (the exact in-game rig, on a turntable) and a
// tabbed terminal form on the right: identity and looks, prior employment
// (occupation), personal particulars (traits on a point budget) and the
// simulation parameters (sandbox settings).
import * as RigMod from '../../entities/humanRig';
import { Appearance, Outfit, SKIN_TONES, HAIR_COLORS, randomAppearance } from '../../entities/humanRig';
import { Player } from '../../entities/player';
import { OCCUPATIONS, TRAITS, SKILLS, Occupation, Trait, occupationAvailable, traitAvailable, occupationByKey } from '../../survival/traits';
import { hasItemDef, itemDef } from '../../items/item';
import { itemIcon } from '../icons';
import { h, esc, mbtn, kbtn, seg, toggle, tabs, swapPage, frame, FocusNav, sfx, hoverFocus } from './common';
import { RigPreview } from './preview3d';
import { G } from '../../game/G';

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

const PRESETS: Record<string, { label: string; note: string; s: Record<string, number> }> = {
  standard: { label: 'Standard', note: 'The simulation as designed.', s: { dayLength: 60, creatures: 1, loot: 1, collapseSpeed: 1, startHour: 8.5, waterShutoffDays: 7, powerShutoffDays: 0, gore: 2 } },
  quiet: { label: 'Quiet Halls', note: 'Few entities, plenty of supplies. For builders and wanderers.', s: { dayLength: 90, creatures: 0.35, loot: 1.6, collapseSpeed: 0.6, startHour: 9, waterShutoffDays: 0, powerShutoffDays: 0, gore: 1 } },
  lost: { label: 'Lost and Alone', note: 'More of them, less of everything else. Water fails on day 3, power on day 14.', s: { dayLength: 60, creatures: 1.6, loot: 0.6, collapseSpeed: 1.3, startHour: 21, waterShutoffDays: 3, powerShutoffDays: 14, gore: 2 } },
};

const LOCK = '<svg viewBox="0 0 12 14"><path d="M3 6V4a3 3 0 0 1 6 0v2h1v8H2V6zm1.5 0h3V4a1.5 1.5 0 0 0-3 0z"/></svg>';
const IC = {
  dice: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16"/><path d="M9 9h.01M15 9h.01M9 15h.01M15 15h.01M12 12h.01" stroke-width="3"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M19 12a7 7 0 1 1-2-5M17 3v4h-4"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M5 12a7 7 0 1 0 2-5M7 3v4h4"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6"/><path d="M10 7v6M7 10h6M15 15l5 5"/></svg>',
  minus: '<svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6"/><path d="M7 10h6M15 15l5 5"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 5l11 7-11 7z"/></svg>',
};

// ---------------------------------------------------------------- appearance fields (incl. ones the rig may add later)
interface FieldSpec { key: string; label: string; kind: 'color' | 'enum' | 'bool' | 'range' | 'int'; vals: any[]; min?: number; max?: number }
const KNOWN = ['skin', 'hair', 'hairStyle', 'face', 'build', 'height', 'beard'];
const BASE_STYLES = ['short', 'long', 'buzz', 'bald', 'ponytail', 'curly', 'bob'];
const RANGE_TEXT: Record<string, (v: number) => string> = {
  bodyShape: (v) => (v < 0.34 ? 'masculine' : v > 0.66 ? 'feminine' : 'in between'),
  age: (v) => (v < 0.25 ? 'young' : v < 0.6 ? 'middle-aged' : 'older'),
  freckles: (v) => (v < 0.05 ? 'none' : v < 0.5 ? 'a few' : 'lots'),
};
const rangeText = (k: string, v: number) => RANGE_TEXT[k]?.(v) ?? String(Math.round(v * 100) / 100);
const LABELS: Record<string, string> = { bodyShape: 'Body shape', eyeColor: 'Eye colour', facialHair: 'Facial hair', freckles: 'Freckles', scars: 'Scars', age: 'Age' };
const humanize = (k: string) => LABELS[k] || k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).replace(/color/i, 'colour');

function discoverFields(): { styles: string[]; faces: number; extra: FieldSpec[] } {
  const mod = RigMod as any;
  const samples: any[] = [];
  for (let i = 0; i < 80; i++) { try { samples.push(randomAppearance(Math.random)); } catch { break; } }
  const styles = new Set<string>([...BASE_STYLES, ...((Array.isArray(mod.HAIR_STYLES) ? mod.HAIR_STYLES : []) as string[])]);
  let faces = typeof mod.FACE_COUNT === 'number' ? mod.FACE_COUNT : 4;
  const seen: Record<string, any[]> = {};
  for (const s of samples) {
    if (s.hairStyle) styles.add(s.hairStyle);
    if (typeof s.face === 'number') faces = Math.max(faces, s.face + 1);
    for (const [k, v] of Object.entries(s)) { if (KNOWN.includes(k) || v === undefined || v === null || typeof v === 'object') continue; (seen[k] ||= []).push(v); }
  }
  const extra: FieldSpec[] = [];
  const optLists = (mod.APPEARANCE_OPTIONS || {}) as Record<string, any[]>;
  for (const [k, vs] of Object.entries(seen)) {
    const listed = optLists[k] || mod[k.replace(/([A-Z])/g, '_$1').toUpperCase() + 'S'];
    const uniq = [...new Set([...(Array.isArray(listed) ? listed : []), ...vs])];
    const label = humanize(k);
    if (typeof vs[0] === 'boolean') extra.push({ key: k, label, kind: 'bool', vals: [false, true] });
    else if (typeof vs[0] === 'string') extra.push({ key: k, label, kind: 'enum', vals: Array.isArray(listed) ? uniq : uniq.sort() });
    else if (typeof vs[0] === 'number') {
      const ints = uniq.every((v) => Number.isInteger(v));
      if (ints && Math.max(...uniq) > 0xff) extra.push({ key: k, label, kind: 'color', vals: uniq.slice(0, 14) });
      else if (ints && Math.max(...uniq) - Math.min(...uniq) <= 10) {
        const lo = Math.min(0, ...uniq), hi = Math.max(...uniq);
        extra.push({ key: k, label, kind: 'int', vals: Array.from({ length: hi - lo + 1 }, (_, i) => lo + i) });
      } else extra.push({ key: k, label, kind: 'range', vals: [], min: Math.min(...uniq), max: Math.max(...uniq) });
    }
  }
  return { styles: [...styles], faces: Math.max(1, Math.min(12, faces)), extra };
}

// ---------------------------------------------------------------- what the occupation starts wearing / holding
const START_CLOTHES = ['tshirt', 'jeans', 'sneakers', 'socks'];
export function outfitFor(occKey: string): { outfit: Outfit; held: string | null } {
  const o = occupationByKey(occKey) as Occupation & Record<string, any>;
  const clothes: string[] = (o.clothes || o.outfit || o.wear || START_CLOTHES).filter((k: string) => hasItemDef(k));
  const fake: any = { worn: new Map(), handR: null, handL: null, lightItem: null, outfitDirty: false };
  const wear = (k: string) => { try { Player.prototype.wear.call(fake, { uid: 0, key: k, cond: 1, age: 0 } as any); } catch { /* not wearable */ } };
  for (const k of clothes) wear(k);
  let held: string | null = null;
  for (const k of o.items || []) {
    if (!hasItemDef(k)) continue;
    const d = itemDef(k);
    if (d.clothing || d.bag) wear(k);
    else if (!held && (d.weapon || d.light || d.tags?.includes('tool') || d.cat === 'tool' || d.cat === 'weapon')) held = k;
  }
  let outfit: Outfit = {};
  try { outfit = Player.prototype.computeOutfit.call(fake); } catch { /* keep naked default */ }
  return { outfit, held };
}

/** show the form; resolves with the filled form or null if cancelled */
export function intakeForm(opts: { title?: string; sandbox?: boolean; directives?: boolean; submit?: string } = {}): Promise<IntakeResult | null> {
  return new Promise((resolve) => {
    const fields = discoverFields();
    const app: Appearance = randomAppearance(Math.random);
    let name = randomName();
    let occ = 'unemployed';
    const traits = new Set<string>();
    let preset = 'standard';
    const sb: Record<string, number> = { ...PRESETS.standard.s };
    let seed = Math.floor(Math.random() * 99999);
    let directives = opts.directives ?? true;
    const withSandbox = opts.sandbox !== false;

    // ---------------- skeleton
    const wrap = h('div', 'pf-wrap');
    const f = frame('Meridian Institute · Personnel file', 'pf', 'FORM 4-B');
    f.screen.classList.add('crt-on');
    wrap.append(f.el);
    const viewer = h('div', 'pf-viewer');
    const form = h('div', 'pf-form');
    f.body.append(viewer, form);

    // viewer chrome
    const hudTL = h('div', 'pf-hud tl', 'SUBJECT VIEW · <b>CAM 01</b>');
    const hudTR = h('div', 'pf-hud tr pf-rec', 'LIVE');
    const hudBL = h('div', 'pf-hud bl', 'ROT 000° · ZOOM 1.0×');
    const hudBR = h('div', 'pf-hud br', '');
    const stamp = h('div', 'pf-stamp', esc(opts.submit || 'APPROVED'));
    const scanline = h('div', 'pf-scanline');
    const idBar = h('div', 'pf-id');
    const idT = h('div', 'pf-id-t', '<div class="pf-id-name"></div><div class="pf-id-job"></div>');
    const tools = h('div', 'pf-tools');
    viewer.append(h('div', 'pf-brackets'), hudTL, hudTR, hudBL, hudBR, scanline, stamp, idBar);
    idBar.append(idT, tools);
    const preview = new RigPreview(viewer);
    viewer.insertBefore(preview.canvas, viewer.firstChild);
    preview.onInfo = (i) => {
      hudBL.textContent = `ROT ${String(i.yaw).padStart(3, '0')}° · ZOOM ${i.zoom.toFixed(1)}×`;
      hudBR.textContent = i.emote ? '> ' + i.emote : '';
    };
    tools.append(
      kbtn(IC.left, () => preview.rotateBy(-0.9), { tip: 'Rotate left (or drag the subject)', sound: 'tick', cls: 'fine' }),
      kbtn(IC.right, () => preview.rotateBy(0.9), { tip: 'Rotate right (or drag the subject)', sound: 'tick', cls: 'fine' }),
      kbtn(IC.minus, () => preview.zoomBy(1.18), { tip: 'Zoom out (or scroll / pinch)', sound: 'tick', cls: 'fine' }),
      kbtn(IC.plus, () => preview.zoomBy(1 / 1.18), { tip: 'Zoom in (or scroll / pinch)', sound: 'tick', cls: 'fine' }),
      kbtn(IC.play, () => preview.emote(), { tip: 'Play an emote (or double-click the subject)' }),
      kbtn(IC.dice, () => randomizeAll(), { tip: 'Randomize everything', cls: 'amber' }),
    );
    const updateId = () => {
      (idT.firstChild as HTMLElement).textContent = (name.trim() || 'UNNAMED').toUpperCase();
      (idT.lastChild as HTMLElement).textContent = occupationByKey(occ).name + ` · ${Math.round(172 * app.height)} cm · ${app.build}`;
    };

    // form chrome
    const head = h('div', 'pf-head');
    const headT = h('div', 'pf-head-t', `<h2>${esc(opts.title || 'FIELD PERSONNEL INTAKE')}</h2><small>"Thank you for your continuity."</small>`);
    const pts = h('div', 'pf-pts', '<b>00</b><span>POINTS</span>');
    head.append(headT, pts);
    const pageNames = ['IDENTITY', 'OCCUPATION', 'TRAITS', ...(withSandbox ? ['SIMULATION'] : [])];
    let pageIdx = 0;
    const page = h('div', 'pf-page');
    const hint = h('div', 'pf-hint', '<kbd>Q</kbd><kbd>E</kbd> section');
    const foot = h('div', 'pf-foot');
    const sum = h('div', 'pf-sum');
    const t = tabs(pageNames.map((n, i) => `${String(i + 1).padStart(2, '0')} ${n}`), 0, (i) => { const d = i > pageIdx ? 1 : -1; pageIdx = i; renderPage(d); });
    const tabRow = h('div', 'pf-tabrow');
    tabRow.append(t.el, hint);
    form.append(head, tabRow, page, foot);
    const approve = mbtn(opts.submit || 'Approve', () => submit(), { primary: true, key: '' });
    approve.classList.add('pf-approve');
    foot.append(mbtn('Back', () => close(null), { key: 'ESC' }), sum, approve);

    // ---------------- state helpers
    const points = () => {
      let p = occupationByKey(occ).points;
      for (const k of traits) p -= TRAITS.find((x) => x.key === k)?.cost ?? 0;
      return p;
    };
    let lastPts = NaN;
    const updatePoints = () => {
      const p = points();
      (pts.firstChild as HTMLElement).textContent = (p < 0 ? '-' : '') + String(Math.abs(p)).padStart(2, '0');
      pts.classList.toggle('bad', p < 0);
      if (p !== lastPts && !Number.isNaN(lastPts)) { pts.classList.remove('bump'); void pts.offsetWidth; pts.classList.add('bump'); }
      lastPts = p;
      approve.classList.toggle('off', p < 0 || !name.trim());
      const o = occupationByKey(occ);
      sum.innerHTML = `<b>${esc(o.name)}</b> · ${traits.size} trait${traits.size === 1 ? '' : 's'}${withSandbox ? ` · ${esc(preset === 'custom' ? 'custom world' : PRESETS[preset].label)} · seed ${seed}` : ''}`;
      updateId();
    };
    let rebuildT = 0;
    const refreshLooks = (react = '') => {
      clearTimeout(rebuildT);
      rebuildT = window.setTimeout(() => {
        preview.setAppearance(app);
        if (react) preview.react(react);
      }, 40);
      updateId();
    };
    const refreshOutfit = (react = '') => {
      shownOcc = occ;
      hudTL.innerHTML = 'SUBJECT VIEW · <b>CAM 01</b>';
      const { outfit, held } = outfitFor(occ);
      preview.setOutfit(outfit, held);
      if (react) preview.react(react);
    };
    // hovered occupation previews its outfit on the subject (debounced: rebuilding a rig costs a few ms)
    let shownOcc = '', previewT = 0;
    const previewOutfit = (key: string) => {
      clearTimeout(previewT);
      previewT = window.setTimeout(() => {
        if (key === shownOcc) return;
        shownOcc = key;
        const { outfit, held } = outfitFor(key);
        preview.setOutfit(outfit, held);
        hudTL.innerHTML = key === occ ? 'SUBJECT VIEW · <b>CAM 01</b>' : `PREVIEW · <b>${esc(occupationByKey(key).name.toUpperCase())}</b>`;
      }, 90);
    };
    const flashScan = () => { scanline.classList.remove('on'); void scanline.offsetWidth; scanline.classList.add('on'); };

    // ---------------- pages (re-rendered with focus + scroll restored)
    const rerender = () => renderPage(0, true);
    const renderPage = (dir: 1 | -1 | 0, keep = false) => {
      const focusKey = (document.activeElement as HTMLElement | null)?.dataset?.k;
      const scroll = page.scrollTop;
      const frag = document.createDocumentFragment();
      const name = pageNames[pageIdx];
      if (name === 'IDENTITY') identityPage(frag);
      else if (name === 'OCCUPATION') occupationPage(frag);
      else if (name === 'TRAITS') traitsPage(frag);
      else simulationPage(frag);
      if (keep) { page.innerHTML = ''; page.append(frag); page.scrollTop = scroll; }
      else { swapPage(page, frag, dir); page.scrollTop = 0; }
      if (focusKey && keep) (page.querySelector(`[data-k="${CSS.escape(focusKey)}"]`) as HTMLElement | null)?.focus({ preventScroll: true });
      updatePoints();
    };

    const section = (title: string, sub = '') => {
      const s = h('section', 'pf-sec');
      s.append(h('h3', '', `${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}`));
      return s;
    };
    const row = (label: string, ...kids: HTMLElement[]) => {
      const r = h('div', 'pf-row', `<span class="pf-l">${esc(label)}</span>`);
      const c = h('div', 'pf-c');
      c.append(...kids);
      r.append(c);
      return r;
    };
    const swatches = (key: string, list: number[], cur: number, set: (c: number) => void, react = 'nod') => list.map((c, i) => {
      const b = h('button', 'pf-sw' + (c === cur ? ' on' : ''));
      b.type = 'button';
      b.style.background = '#' + c.toString(16).padStart(6, '0');
      b.dataset.k = key + i;
      b.setAttribute('aria-label', key + ' ' + (i + 1));
      hoverFocus(b);
      b.onclick = () => { set(c); sfx('toggle'); b.parentElement!.querySelectorAll('.pf-sw').forEach((o) => o.classList.toggle('on', o === b)); refreshLooks(react); flashScan(); };
      return b;
    });
    const keyed = (el: HTMLElement, k: string) => { el.querySelectorAll('button, input').forEach((b, i) => ((b as HTMLElement).dataset.k = k + i)); return el; };

    const identityPage = (P: DocumentFragment) => {
      const s1 = section('NAME OF PERSONNEL');
      const nr = h('div', 'pf-namerow');
      const ni = h('input', 't-field') as HTMLInputElement;
      ni.value = name; ni.maxLength = 24; ni.spellcheck = false; ni.dataset.k = 'name'; ni.setAttribute('aria-label', 'Name');
      ni.addEventListener('input', () => { name = ni.value; updatePoints(); });
      nr.append(ni, kbtn(IC.dice + '<span>Generate</span>', () => { name = randomName(); ni.value = name; updatePoints(); preview.react('nod'); }, { tip: 'Generate a name' }));
      (nr.lastChild as HTMLElement).dataset.k = 'gen';
      s1.append(nr);
      P.append(s1);

      // one control per appearance field; fields the rig gained later are discovered at runtime
      const spec = new Map(fields.extra.map((f) => [f.key, f] as const));
      const used = new Set<string>();
      const control = (key: string, react = 'nod'): HTMLElement | null => {
        const fs = spec.get(key);
        if (!fs) return null;
        used.add(key);
        const cur = (app as any)[key];
        const set = (v: any) => { (app as any)[key] = v; if (key === 'facialHair') app.beard = v === 'beard'; refreshLooks(react); flashScan(); };
        if (fs.kind === 'color') return row(fs.label, ...swatches(key, fs.vals, cur, (c) => { (app as any)[key] = c; }, react));
        if (fs.kind === 'bool') return row(fs.label, keyed(seg('', [[false, 'no'], [true, 'yes']] as [boolean, string][], !!cur, set), key));
        if (fs.kind === 'enum') return row(fs.label, keyed(seg('', fs.vals.map((v) => [v, String(v)] as [any, string]), cur ?? fs.vals[0], set), key));
        if (fs.kind === 'int') return row(fs.label, keyed(seg('', fs.vals.map((v) => [v, v === 0 ? 'none' : String(v)] as [any, string]), cur ?? 0, set), key));
        const r = h('div', 'pf-range');
        const inp = h('input') as HTMLInputElement; inp.type = 'range'; inp.min = String(fs.min); inp.max = String(fs.max); inp.step = String(((fs.max ?? 1) - (fs.min ?? 0)) / 40); inp.value = String(cur ?? fs.min);
        inp.dataset.k = key; inp.setAttribute('aria-label', fs.label);
        const out = h('output', '', esc(rangeText(key, Number(inp.value))));
        const pp = () => inp.style.setProperty('--p', String((Number(inp.value) - fs.min!) / ((fs.max! - fs.min!) || 1)));
        pp();
        hoverFocus(inp);
        inp.oninput = () => { (app as any)[key] = Number(inp.value); out.textContent = rangeText(key, Number(inp.value)); pp(); sfx('tick'); refreshLooks(); };
        inp.onchange = () => { flashScan(); preview.react('scan'); };
        r.append(inp, out);
        return row(fs.label, r);
      };
      const add = (sec: HTMLElement, el: HTMLElement | null) => { if (el) sec.append(el); };

      const sB = section('BODY', 'changes show on the subject live');
      sB.append(row('Skin', ...swatches('skin', SKIN_TONES, app.skin, (c) => { app.skin = c; })));
      add(sB, control('bodyShape', 'look'));
      sB.append(row('Build', keyed(seg('', [['slim', 'slim'], ['average', 'average'], ['broad', 'broad']] as [Appearance['build'], string][], app.build, (v) => { app.build = v; refreshLooks('flex'); flashScan(); }), 'build')));
      const hr = h('div', 'pf-range');
      const hs = h('input') as HTMLInputElement; hs.type = 'range'; hs.min = '0.94'; hs.max = '1.06'; hs.step = '0.01'; hs.value = String(app.height); hs.dataset.k = 'height'; hs.setAttribute('aria-label', 'Height');
      const ho = h('output', '', `${Math.round(172 * app.height)} cm`);
      const paint = () => hs.style.setProperty('--p', String((Number(hs.value) - 0.94) / 0.12));
      paint();
      hoverFocus(hs);
      hs.oninput = () => { app.height = Number(hs.value); ho.textContent = `${Math.round(172 * app.height)} cm`; paint(); sfx('tick'); refreshLooks(); };
      hs.onchange = () => { preview.react('scan'); flashScan(); };
      hr.append(hs, ho);
      sB.append(row('Height', hr));
      P.append(sB);

      const sF = section('FACE');
      sF.append(row('Face', keyed(seg('', Array.from({ length: fields.faces }, (_, i) => [i, String.fromCharCode(65 + i)] as [number, string]), app.face, (v) => { app.face = v; refreshLooks('nod'); flashScan(); }), 'face')));
      for (const k of ['eyeColor', 'freckles', 'scars', 'age']) add(sF, control(k));
      P.append(sF);

      const sH = section('HAIR');
      sH.append(row('Style', keyed(seg('', fields.styles.map((v) => [v, v] as [string, string]), app.hairStyle, (v) => { (app as any).hairStyle = v; refreshLooks('nod'); flashScan(); }), 'hs')));
      sH.append(row('Colour', ...swatches('hair', HAIR_COLORS, app.hair, (c) => { app.hair = c; }, 'look')));
      const fh = control('facialHair');
      if (fh) sH.append(fh);
      else sH.append(row('Facial hair', keyed(seg('', [[false, 'none'], [true, 'beard']] as [boolean, string][], !!app.beard, (v) => { app.beard = v; refreshLooks('nod'); flashScan(); }), 'beard')));
      P.append(sH);

      const rest = fields.extra.filter((f) => !used.has(f.key));
      if (rest.length) {
        const sO = section('OTHER');
        for (const f of rest) add(sO, control(f.key));
        P.append(sO);
      }
      const rb = mbtn('Someone else', () => { Object.assign(app, randomAppearance(Math.random)); rerender(); refreshLooks(); preview.react('spin'); flashScan(); }, { sub: 'randomize looks' });
      rb.dataset.k = 'rlooks';
      P.append(rb);
    };

    const skillLine = (o: Occupation) => {
      const parts = Object.entries(o.skills).map(([k, v]) => `${esc(SKILLS.find((s) => s.key === k)?.name || k)} <i>${'▮'.repeat(v as number)}</i>`);
      return parts.length ? parts.join('') : '<span>no prior skills</span>';
    };
    const occupationPage = (P: DocumentFragment) => {
      const s = section('PRIOR EMPLOYMENT', 'sets starting skills, kit and points');
      const grid = h('div', 'pf-occs');
      OCCUPATIONS.forEach((o, i) => {
        const avail = occupationAvailable(o);
        const b = h('button', 'pf-occ' + (o.key === occ ? ' on' : '') + (avail ? '' : ' locked'));
        b.type = 'button';
        b.dataset.k = 'occ' + i;
        const icon = o.items.find((k) => hasItemDef(k));
        const kit = o.items.filter((k) => hasItemDef(k)).slice(0, 5);
        const p = o.points;
        b.innerHTML = `<div class="pf-occ-h">${icon ? `<img src="${itemIcon(icon)}" alt="">` : '<span class="ico-x"></span>'}<span class="pf-occ-n">${esc(o.name)}</span><span class="pf-occ-p ${p > 0 ? 'pos' : p < 0 ? 'neg' : ''}">${p > 0 ? '+' : ''}${p}</span></div>`
          + (avail
            ? `<div class="pf-occ-d">${esc(o.desc)}</div><div class="pf-occ-s">${skillLine(o)}</div><div class="pf-occ-kit">${kit.map((k) => `<img src="${itemIcon(k)}" alt="" title="${esc(itemDef(k).name)}">`).join('')}</div>`
            : `<div class="pf-lock">${LOCK}<span>LOCKED · ${esc(o.unlock?.hint || 'Not yet available.')}</span></div>`);
        if (!avail) b.setAttribute('aria-disabled', 'true');
        hoverFocus(b);
        // hover / focus preview: try the kit on before committing
        if (avail) {
          const tryOn = () => previewOutfit(o.key);
          b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') tryOn(); });
          b.addEventListener('focus', tryOn);
          b.addEventListener('pointerleave', () => previewOutfit(occ));
          b.addEventListener('blur', () => previewOutfit(occ));
        }
        b.onclick = () => {
          if (!avail) { sfx('error'); b.classList.remove('deny'); void b.offsetWidth; b.classList.add('deny'); return; }
          if (occ === o.key) return;
          occ = o.key;
          shownOcc = '';
          sfx('confirm');
          grid.querySelectorAll('.pf-occ').forEach((x) => x.classList.toggle('on', x === b));
          refreshOutfit('look'); flashScan();
          updatePoints();
        };
        grid.append(b);
      });
      s.append(grid);
      P.append(s);
    };

    const traitsPage = (P: DocumentFragment) => {
      const s = section('PERSONAL PARTICULARS', 'assets cost points · liabilities give points');
      const budget = h('div', 'pf-budget');
      const occP = occupationByKey(occ).points;
      const spent = occP - points();
      const total = Math.max(1, occP + [...traits].reduce((a, k) => a + Math.max(0, TRAITS.find((x) => x.key === k)?.cost ?? 0), 0));
      const left = points();
      budget.innerHTML = `<span>BUDGET</span><div class="pf-budget-bar ${left < 0 ? 'bad' : ''}"><i style="width:${Math.max(0, Math.min(100, (left / total) * 100))}%"></i></div><span>${left} LEFT · ${spent >= 0 ? spent : 0} SPENT</span>`;
      s.append(budget);
      const picked = h('div', 'pf-picked');
      for (const k of traits) picked.append(h('span', '', esc(TRAITS.find((x) => x.key === k)?.name || k)));
      if (!traits.size) picked.append(h('span', '', 'none selected'));
      s.append(picked);
      const cols = h('div', 'pf-traits');
      const good = h('div', 'pf-tcol', '<h4>ASSETS</h4>'), bad = h('div', 'pf-tcol', '<h4>LIABILITIES</h4>');
      const detail = h('div', 'pf-detail', '<b>Select a line for details.</b>Assets cost points; liabilities give points back. Finish at 0 or above.');
      const describe = (tr: Trait, why = '') => {
        detail.innerHTML = `<b>${esc(tr.name)} · ${tr.cost < 0 ? tr.cost : '+' + tr.cost}</b>${esc(tr.desc)}${why ? `<br><span class="warn">${esc(why)}</span>` : ''}`;
      };
      TRAITS.forEach((tr, i) => {
        const on = traits.has(tr.key);
        const avail = traitAvailable(tr);
        const conflict = !on ? TRAITS.find((x) => traits.has(x.key) && ((tr.excl || []).includes(x.key) || (x.excl || []).includes(tr.key))) : undefined;
        const b = h('button', 'pf-trait' + (on ? ' on' : '') + (conflict ? ' blocked' : '') + (!avail ? ' locked' : ''),
          `<span class="bx">${!avail ? LOCK : ''}</span><span class="nm">${esc(tr.name)}</span><span class="co">${tr.cost < 0 ? tr.cost : '+' + tr.cost}</span>`);
        b.type = 'button';
        b.dataset.k = 'tr' + i;
        const why = !avail ? 'LOCKED · ' + (tr.unlock?.hint || 'Not yet available.') : conflict ? `Conflicts with ${conflict.name}.` : '';
        hoverFocus(b);
        b.addEventListener('focus', () => describe(tr, why));
        b.addEventListener('pointerenter', () => describe(tr, why));
        b.onclick = () => {
          if (!avail || conflict) { describe(tr, why); sfx('error'); b.classList.remove('deny'); void b.offsetWidth; b.classList.add('deny'); return; }
          if (on) { traits.delete(tr.key); sfx('back'); } else { traits.add(tr.key); sfx('confirm'); preview.react(tr.cost < 0 ? 'nod' : 'shrug'); }
          rerender();
          const nb = page.querySelector(`[data-k="tr${i}"]`) as HTMLElement | null;
          nb?.focus({ preventScroll: true });
          describe(tr);
        };
        (tr.cost < 0 ? good : bad).append(b);
      });
      cols.append(good, bad);
      s.append(cols, detail);
      P.append(s);
    };

    const simulationPage = (P: DocumentFragment) => {
      const s = section('SIMULATION PARAMETERS', 'world rules for this run');
      const grid = h('div', 'pf-presets');
      const all = [...Object.entries(PRESETS).map(([k, p]) => [k, p.label, p.note] as const), ['custom', 'Custom', 'Every dial, your call.'] as const];
      all.forEach(([k, label, note], i) => {
        const b = h('button', 'pf-preset' + (preset === k ? ' on' : ''), `<b>${esc(label)}</b><small>${esc(note)}</small>`);
        b.type = 'button';
        b.dataset.k = 'pre' + i;
        hoverFocus(b);
        b.onclick = () => { preset = k; if (k !== 'custom') Object.assign(sb, PRESETS[k].s); sfx('confirm'); rerender(); };
        grid.append(b);
      });
      s.append(grid);
      const custom = h('div', 'pf-custom');
      const opt = (label: string, key: string, vals: [number, string][], tip?: (v: number) => string) => {
        custom.append(keyed(seg<number>(label, vals, sb[key], (v) => { sb[key] = v; if (preset !== 'custom') { preset = 'custom'; rerender(); } else updatePoints(); }, { tip }), 'sb' + key));
      };
      opt('Day length', 'dayLength', [[30, '30 min'], [60, '1 hour'], [90, '90 min'], [120, '2 hours']]);
      opt('Entities', 'creatures', [[0, 'none'], [0.35, 'few'], [1, 'normal'], [1.6, 'many'], [2.5, 'swarming']]);
      opt('Supplies', 'loot', [[0.4, 'scarce'], [0.7, 'low'], [1, 'normal'], [1.6, 'plenty']]);
      opt('Collapse', 'collapseSpeed', [[0.4, 'slow'], [1, 'normal'], [1.6, 'fast']]);
      opt('Wake at', 'startHour', [[7, '07:00'], [8.5, '08:30'], [14, '14:00'], [21, '21:00'], [2, '02:00']]);
      opt('Water fails', 'waterShutoffDays', [[0, 'never'], [3, 'day 3'], [7, 'day 7'], [14, 'day 14']]);
      opt('Power fails', 'powerShutoffDays', [[0, 'never'], [7, 'day 7'], [14, 'day 14'], [30, 'day 30']]);
      opt('Gore', 'gore', [[0, 'off'], [1, 'normal'], [2, 'heavy']], (v) => ['No blood or wounds shown', 'Blood and wounds', 'Dismemberment, gibs, arterial spray'][v]);
      s.append(custom);
      const dir = toggle('Directives', directives, (v) => { directives = v; updatePoints(); }, directives ? 'story mode: restore power, follow the signal, find the way out' : 'free survival: no mission chain');
      dir.dataset.k = 'dir';
      dir.addEventListener('click', () => { const sm = dir.querySelector('small'); if (sm) sm.textContent = directives ? 'story mode: restore power, follow the signal, find the way out' : 'free survival: no mission chain'; });
      s.append(dir);
      const sr = h('div', 'pf-seedrow');
      const si = h('input', 't-field') as HTMLInputElement; si.value = String(seed); si.inputMode = 'numeric'; si.dataset.k = 'seed'; si.setAttribute('aria-label', 'World seed');
      si.oninput = () => { seed = Math.abs(Math.floor(Number(si.value) || 0)); updatePoints(); };
      const rs = kbtn(IC.dice, () => { seed = Math.floor(Math.random() * 99999); si.value = String(seed); updatePoints(); }, { tip: 'Random seed' });
      rs.dataset.k = 'seedr';
      sr.append(h('span', 't-lbl', 'World seed'), si, rs);
      s.append(sr);
      P.append(s);
    };

    // ---------------- actions
    const randomizeAll = () => {
      Object.assign(app, randomAppearance(Math.random));
      name = randomName();
      const jobs = OCCUPATIONS.filter(occupationAvailable);
      occ = pickR(jobs).key;
      traits.clear();
      // a couple of affordable traits
      const pool = TRAITS.filter(traitAvailable).sort(() => Math.random() - 0.5);
      for (const tr of pool) {
        if (traits.size >= 3) break;
        const conflict = [...traits].some((k) => (tr.excl || []).includes(k) || (TRAITS.find((x) => x.key === k)?.excl || []).includes(tr.key));
        if (conflict) continue;
        traits.add(tr.key);
        if (points() < 0) traits.delete(tr.key);
      }
      sfx('confirm');
      refreshLooks();
      refreshOutfit();
      preview.react('spin');
      setTimeout(() => preview.emote('shrug'), 700);
      flashScan();
      rerender();
    };

    let closing = false;
    const submit = () => {
      if (closing) return;
      if (points() < 0) {
        sfx('error');
        approve.classList.remove('shake'); void approve.offsetWidth; approve.classList.add('shake');
        pts.classList.remove('bad'); void pts.offsetWidth; pts.classList.add('bad');
        if (pageNames[pageIdx] !== 'TRAITS') t.select(pageNames.indexOf('TRAITS'));
        return;
      }
      if (!name.trim()) {
        sfx('error');
        if (pageIdx !== 0) t.select(0);
        setTimeout(() => (page.querySelector('[data-k="name"]') as HTMLElement | null)?.focus(), 50);
        return;
      }
      closing = true;
      sfx('stamp');
      stamp.classList.add('on');
      preview.emote('salute');
      setTimeout(() => close({ name: name.trim().slice(0, 24), app, occupation: occ, traits: [...traits], sandbox: { ...sb }, seed, directives }), 1100);
    };

    let nav: FocusNav;
    const close = (r: IntakeResult | null) => {
      nav.destroy();
      preview.dispose();
      clearTimeout(rebuildT);
      wrap.remove();
      if (G?.input) G.input.textFocus = false;
      resolve(r);
    };

    // ---------------- go
    document.body.append(wrap);
    preview.setAppearance(app);
    refreshOutfit();
    renderPage(0);
    nav = new FocusNav(f.el, { onBack: () => close(null), onTab: (d) => t.select(t.index + d), autofocus: false });
    if (!matchMedia('(pointer: coarse)').matches) requestAnimationFrame(() => t.buttons[0]?.focus({ preventScroll: true }));
    sfx('open');
    if (import.meta.env.DEV) (window as any).__intake = { preview, randomizeAll, tabs: t, submit };
  });
}
