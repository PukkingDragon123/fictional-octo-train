// SENTENCING TERMS: the world rules, typed on the records terminal (the
// intake opens it in a terminal.ts housing). Every rule is a row of phosphor
// choices. Fields the debt contract adds to the sandbox ('contract', 'debt',
// 'installmentDays', 'bandLethal' or anything else) get rows of their own,
// so nothing new is ever unreachable.
import { h, esc, sfx, seg } from './common';
import { crtAct } from './terminal';

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
const KNOWN = new Set([...ROWS.map((r) => r.key), 'limbLoss', 'directives', 'friendlyFire']);
const humanize = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

export function termsStation(ctx: TermsCtx) {
  const el = h('div', 'tm3');
  const defaults: Record<string, number> = { ...ctx.sb };

  const render = () => {
    const scroller = el.closest('.ct-body') as HTMLElement | null;
    const scroll = scroller?.scrollTop ?? 0;
    const focusKey = (document.activeElement as HTMLElement | null)?.closest?.('[data-k]')?.getAttribute('data-k');
    const focusIdx = focusKey ? [...(el.querySelector(`[data-k="${CSS.escape(focusKey)}"]`)?.querySelectorAll('button') || [])].indexOf(document.activeElement as HTMLButtonElement) : -1;
    el.innerHTML = '';
    el.append(h('p', 'tm3-who', `Debtor <b>${esc((ctx.name || '________').toUpperCase())}</b> · Meridian Institute · Remittance Programme`));
    // §1 terms of confinement
    el.append(h('div', 't-ctl-h', '§1 Terms of confinement'));
    const pre = seg<string>('Preset', [...Object.entries(PRESETS).map(([k, p]) => [k, p.label] as [string, string]), ['custom', 'Custom']], ctx.preset, (k) => {
      ctx.preset = k; if (k !== 'custom') Object.assign(ctx.sb, PRESETS[k].s); sfx('key'); render();
    });
    pre.dataset.k = 'preset';
    el.append(pre, h('p', 't-note', esc(ctx.preset === 'custom' ? 'Every dial, your call.' : PRESETS[ctx.preset]?.note || '')));
    el.append(h('div', 't-ctl-h', '§2 Conditions'));
    const row = (label: string, key: string, vals: [number, string][], cur: number, set: (v: number) => void, tip?: (v: number) => string) => {
      const r = seg<number>(label, vals, cur, (v) => { set(v); sfx('key', 0.7); }, tip ? { tip } : {});
      r.dataset.k = key;
      el.append(r);
    };
    const custom = (k: string, v: number) => { ctx.sb[k] = v; if (ctx.preset !== 'custom') { ctx.preset = 'custom'; render(); } };
    for (const R of ROWS) row(R.label, R.key, R.vals, ctx.sb[R.key], (v) => custom(R.key, v), R.tip);
    row('Limb loss', 'limbLoss', [[1, 'yes'], [0, 'no']], (ctx.sb.limbLoss ?? 1) !== 0 ? 1 : 0, (v) => { ctx.sb.limbLoss = v; });
    row('Friendly fire', 'friendlyFire', [[0, 'no'], [1, 'yes']], ctx.sb.friendlyFire ? 1 : 0, (v) => { ctx.sb.friendlyFire = v; }, (v) => v ? 'In co-op, your blows hurt each other' : 'Your blows pass your crew by');
    row('Directives', 'directives', [[1, 'the contract'], [0, 'free survival']], ctx.directives ? 1 : 0, (v) => { ctx.directives = v === 1; });
    // §3: the debt contract's own fields, whatever they are
    const extra = Object.keys(ctx.sb).filter((k) => !KNOWN.has(k) && typeof ctx.sb[k] === 'number');
    if (extra.length) {
      el.append(h('div', 't-ctl-h', '§3 The contract'));
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
        if ((cur === 0 || cur === 1) && (defaults[k] === 0 || defaults[k] === 1)) { row(humanize(k), k, [[0, 'no'], [1, 'yes']], cur, (v) => custom(k, v)); continue; }
        const d = defaults[k] || 1;
        const vals: [number, string][] = [0.5, 1, 1.5, 2].map((m) => { const v = Math.round(d * m * 100) / 100; return [v, String(v)]; });
        if (!vals.some(([v]) => v === cur)) vals.push([cur, String(cur)]);
        row(humanize(k), k, vals.sort((a, b) => a[0] - b[0]), cur, (v) => custom(k, v));
      }
    }
    // the case seed and the signature
    el.append(h('div', 't-ctl-h', '§4 Case seed'));
    const sr = h('div', 'tm3-seed');
    sr.dataset.k = 'seed';
    const si = h('input', '') as HTMLInputElement;
    si.value = String(ctx.seed); si.inputMode = 'numeric'; si.setAttribute('aria-label', 'World seed');
    si.oninput = () => { ctx.seed = Math.abs(Math.floor(Number(si.value) || 0)); };
    sr.append(si, crtAct('Another', () => { ctx.seed = Math.floor(Math.random() * 99999); si.value = String(ctx.seed); }));
    el.append(sr);
    el.append(h('p', 'tm3-sig', `Signed <i>${esc(ctx.name || '')}</i> · received <b>${new Date().toLocaleDateString()}</b>`));
    if (scroller) scroller.scrollTop = scroll;
    if (focusKey) {
      const host = el.querySelector(`[data-k="${CSS.escape(focusKey)}"]`);
      const bs = host ? [...host.querySelectorAll<HTMLElement>('button, input')] : [];
      (bs[Math.max(0, focusIdx)] || bs[0])?.focus({ preventScroll: true });
    }
  };
  return {
    el,
    enter() { render(); },
    destroy() { /* nothing to stop */ },
  };
}
