// SENTENCING TERMS: the world rules as a clipboard form on the processing
// desk. Every choice is a box you stamp. Fields the debt contract adds to the
// sandbox ('contract', 'debt', 'installmentDays', 'bandLethal' or anything
// else) get rows of their own, so nothing new is ever unreachable.
import { h, esc, sfx, hoverFocus } from './common';
import { toUrl } from '../pixelkit';
import { stampWord } from './art';

export const PRESETS: Record<string, { label: string; note: string; s: Record<string, number> }> = {
  standard: { label: 'Standard', note: 'The programme as designed.', s: { dayLength: 60, creatures: 1, loot: 1, collapseSpeed: 1, startHour: 8.5, waterShutoffDays: 7, powerShutoffDays: 0, gore: 2 } },
  quiet: { label: 'Quiet Halls', note: 'Few entities, plenty to sell. For builders and wanderers.', s: { dayLength: 90, creatures: 0.35, loot: 1.6, collapseSpeed: 0.6, startHour: 9, waterShutoffDays: 0, powerShutoffDays: 0, gore: 1 } },
  lost: { label: 'Lost and Alone', note: 'More of them, less of everything. Water fails on day 3, power on day 14.', s: { dayLength: 60, creatures: 1.6, loot: 0.6, collapseSpeed: 1.3, startHour: 21, waterShutoffDays: 3, powerShutoffDays: 14, gore: 2 } },
};

export interface TermsCtx {
  sb: Record<string, number>;
  preset: string;
  seed: number;
  directives: boolean;
  readonly name: string;
}

type Row = { key: string; label: string; vals: [number, string][]; tip?: (v: number) => string };
const ROWS: Row[] = [
  { key: 'dayLength', label: 'Length of a day', vals: [[30, '30 min'], [60, '1 hour'], [90, '90 min'], [120, '2 hours']] },
  { key: 'creatures', label: 'Entities', vals: [[0, 'none'], [0.35, 'few'], [1, 'normal'], [1.6, 'many'], [2.5, 'swarming']] },
  { key: 'loot', label: 'Valuables', vals: [[0.4, 'scarce'], [0.7, 'low'], [1, 'normal'], [1.6, 'plenty']] },
  { key: 'collapseSpeed', label: 'Collapse', vals: [[0.4, 'slow'], [1, 'normal'], [1.6, 'fast']] },
  { key: 'startHour', label: 'Arrive at', vals: [[7, '07:00'], [8.5, '08:30'], [14, '14:00'], [21, '21:00'], [2, '02:00']] },
  { key: 'waterShutoffDays', label: 'Water fails', vals: [[0, 'never'], [3, 'day 3'], [7, 'day 7'], [14, 'day 14']] },
  { key: 'powerShutoffDays', label: 'Power fails', vals: [[0, 'never'], [7, 'day 7'], [14, 'day 14'], [30, 'day 30']] },
  { key: 'gore', label: 'Gore', vals: [[0, 'off'], [1, 'normal'], [2, 'heavy']], tip: (v) => ['No blood or wounds shown', 'Blood and wounds', 'Dismemberment, gibs, arterial spray'][v] || '' },
];
/** the debt contract's sandbox fields: known ones get sensible choices, others a generic stepper */
const CONTRACT_ROWS: Record<string, { label: string; vals?: (d: number) => [number, string][]; bool?: [string, string] }> = {
  contract: { label: 'Contract', bool: ['none', 'signed'] },
  debt: { label: 'Debt owed', vals: (d) => [0.5, 1, 2, 4].map((k) => [Math.round((d || 1000) * k), Math.round((d || 1000) * k).toLocaleString('en') + ' scrip'] as [number, string]) },
  installmentDays: { label: 'Installment every', vals: () => [[1, '1 day'], [2, '2 days'], [3, '3 days'], [5, '5 days'], [7, '7 days']] },
  debtDays: { label: 'Installment every', vals: () => [[0.5, '12 hours'], [1, '1 day'], [2, '2 days'], [3, '3 days'], [5, '5 days']] },
  bandLethal: { label: 'Band detonation', bool: ['takes the hand', 'kills'] },
  finalLethal: { label: 'Final deadline', bool: ['forgiving', 'lethal'] },
};
const KNOWN = new Set([...ROWS.map((r) => r.key), 'limbLoss', 'directives']);
const humanize = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

export function termsStation(ctx: TermsCtx) {
  const el = h('div', 'tm-wrap');
  const board = h('div', 'tm-board');
  const clip = h('div', 'tm-clip');
  const paper = h('div', 'tm-paper dg-paper');
  board.append(clip, paper);
  el.append(board);
  const defaults: Record<string, number> = { ...ctx.sb };

  const render = () => {
    const scroll = paper.scrollTop;
    const focusKey = (document.activeElement as HTMLElement | null)?.dataset?.k;
    paper.innerHTML = '';
    paper.append(h('div', 'tm-head', `<b>SENTENCING TERMS</b><small>MERIDIAN INSTITUTE · FORM R-7 · REMITTANCE PROGRAMME</small><span>DEBTOR: <u>${esc((ctx.name || '________').toUpperCase())}</u></span>`));
    // terms of confinement
    const pre = h('div', 'tm-presets');
    for (const [k, p] of [...Object.entries(PRESETS), ['custom', { label: 'Custom', note: 'Every dial, your call.', s: {} }] as const]) {
      const b = h('button', 'tm-preset' + (ctx.preset === k ? ' on' : ''), `<i></i><b>${esc(p.label)}</b><small>${esc(p.note)}</small>`);
      b.type = 'button'; b.dataset.k = 'pre:' + k;
      hoverFocus(b);
      b.onclick = () => { ctx.preset = k; if (k !== 'custom') Object.assign(ctx.sb, PRESETS[k].s); sfx('stamp', 0.6); render(); };
      pre.append(b);
    }
    paper.append(h('h4', '', '§1 TERMS OF CONFINEMENT'), pre);
    paper.append(h('h4', '', '§2 CONDITIONS'));
    const row = (label: string, key: string, vals: [number, string][], cur: number, set: (v: number) => void, tip?: (v: number) => string) => {
      const r = h('div', 'tm-row', `<span class="tm-l">${esc(label)}</span>`);
      const o = h('div', 'tm-o');
      for (const [v, l] of vals) {
        const b = h('button', 'tm-box' + (v === cur ? ' on' : ''), `<i></i>${esc(l)}`);
        b.type = 'button'; b.dataset.k = key + ':' + v;
        b.setAttribute('aria-pressed', String(v === cur));
        if (tip) b.dataset.tip = tip(v);
        hoverFocus(b);
        b.onclick = () => { set(v); sfx('stamp', 0.45); o.querySelectorAll('.tm-box').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); }); };
        o.append(b);
      }
      r.append(o);
      paper.append(r);
    };
    const custom = (k: string, v: number) => { ctx.sb[k] = v; if (ctx.preset !== 'custom') { ctx.preset = 'custom'; render(); } };
    for (const R of ROWS) row(R.label, R.key, R.vals, ctx.sb[R.key], (v) => custom(R.key, v), R.tip);
    row('Limb loss', 'limbLoss', [[1, 'yes'], [0, 'no']], (ctx.sb.limbLoss ?? 1) !== 0 ? 1 : 0, (v) => { ctx.sb.limbLoss = v; });
    row('Directives', 'directives', [[1, 'the contract (story)'], [0, 'free survival']], ctx.directives ? 1 : 0, (v) => { ctx.directives = v === 1; });
    // §3: the debt contract's own fields, whatever they are
    const extra = Object.keys(ctx.sb).filter((k) => !KNOWN.has(k) && typeof ctx.sb[k] === 'number');
    if (extra.length) {
      paper.append(h('h4', '', '§3 THE CONTRACT'));
      for (const k of extra) {
        const spec = CONTRACT_ROWS[k];
        const cur = ctx.sb[k];
        if (spec?.bool) { row(spec.label, k, [[0, spec.bool[0]], [1, spec.bool[1]]], cur ? 1 : 0, (v) => custom(k, v)); continue; }
        if (spec?.vals) {
          const vals = spec.vals(defaults[k]);
          if (!vals.some(([v]) => v === cur)) vals.push([cur, String(cur)]);
          vals.sort((a, b) => a[0] - b[0]);
          row(spec.label, k, vals, cur, (v) => custom(k, v));
          continue;
        }
        // generic: 0/1 as yes/no, else a stepper around the default
        if ((cur === 0 || cur === 1) && (defaults[k] === 0 || defaults[k] === 1)) { row(humanize(k), k, [[0, 'no'], [1, 'yes']], cur, (v) => custom(k, v)); continue; }
        const d = defaults[k] || 1;
        const vals: [number, string][] = [0.5, 1, 1.5, 2].map((m) => { const v = Math.round(d * m * 100) / 100; return [v, String(v)]; });
        if (!vals.some(([v]) => v === cur)) vals.push([cur, String(cur)]);
        row(humanize(k), k, vals.sort((a, b) => a[0] - b[0]), cur, (v) => custom(k, v));
      }
    }
    // seed + signature
    const sr = h('div', 'tm-row tm-seed', '<span class="tm-l">Case seed</span>');
    const si = h('input', 'tm-field') as HTMLInputElement;
    si.value = String(ctx.seed); si.inputMode = 'numeric'; si.dataset.k = 'seed'; si.setAttribute('aria-label', 'World seed');
    si.oninput = () => { ctx.seed = Math.abs(Math.floor(Number(si.value) || 0)); };
    const dice = h('button', 'tm-dice', '⚄');
    dice.type = 'button'; dice.dataset.k = 'dice'; dice.setAttribute('aria-label', 'Random seed');
    hoverFocus(dice);
    dice.onclick = () => { ctx.seed = Math.floor(Math.random() * 99999); si.value = String(ctx.seed); sfx('click'); };
    sr.append(si, dice);
    paper.append(sr);
    const sig = h('div', 'tm-sig', `<span>SIGNED</span><em>${esc(ctx.name || '')}</em><span class="x">X</span>`);
    const st = new Image(); st.src = toUrl(stampWord('RECEIVED', 0x2a3a8a, 2)); st.alt = ''; st.className = 'tm-recv';
    sig.append(st);
    paper.append(sig);
    paper.scrollTop = scroll;
    if (focusKey) (paper.querySelector(`[data-k="${CSS.escape(focusKey)}"]`) as HTMLElement | null)?.focus({ preventScroll: true });
  };
  return {
    el,
    enter() { render(); },
    destroy() { /* nothing to stop */ },
  };
}
