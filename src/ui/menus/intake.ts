// Character creation as a Meridian Institute intake form: name, ID photo,
// prior employment (occupation), personal particulars (traits with a point
// budget) and the simulation parameters (sandbox settings).
import { h, esc, mbtn } from './common';
import { OCCUPATIONS, TRAITS } from '../../survival/traits';
import { Appearance, SKIN_TONES, HAIR_COLORS, randomAppearance } from '../../entities/humanRig';

export interface IntakeResult {
  name: string; app: Appearance; occupation: string; traits: string[];
  sandbox: Record<string, number>; seed: number; directives: boolean;
}

const FIRST = ['Robin', 'Sam', 'Alex', 'Jordan', 'Casey', 'Morgan', 'Riley', 'Quinn', 'Avery', 'Jamie', 'Dana', 'Lee', 'Noor', 'Emil', 'Ines', 'Tomas', 'Aiko', 'Ola', 'Mara', 'Felix', 'Rosa', 'Ivan', 'June', 'Theo'];
const LAST = ['Okonkwo', 'Varga', 'Lindqvist', 'Moreau', 'Halloran', 'Petrov', 'Nakamura', 'Silva', 'Brennan', 'Kowalski', 'Adeyemi', 'Haugen', 'Duarte', 'Novak', 'Reyes', 'Ferreira', 'Lund', 'Castell'];
const rname = () => `${FIRST[Math.floor(Math.random() * FIRST.length)]} ${LAST[Math.floor(Math.random() * LAST.length)]}`;

const PRESETS: Record<string, { label: string; note: string; s: Record<string, number> }> = {
  standard: { label: 'Standard', note: 'The simulation as designed.', s: { dayLength: 60, creatures: 1, loot: 1, collapseSpeed: 1, startHour: 8.5, waterShutoffDays: 7, powerShutoffDays: 0 } },
  quiet: { label: 'Quiet Halls', note: 'Few entities, plenty of supplies. For builders and wanderers.', s: { dayLength: 90, creatures: 0.35, loot: 1.6, collapseSpeed: 0.6, startHour: 9, waterShutoffDays: 0, powerShutoffDays: 0 } },
  lost: { label: 'Lost and Alone', note: 'More of them, less of everything else. Water fails on day 3, power on day 14.', s: { dayLength: 60, creatures: 1.6, loot: 0.6, collapseSpeed: 1.3, startHour: 21, waterShutoffDays: 3, powerShutoffDays: 14 } },
};

/** show the form; resolves with the filled form or null if cancelled */
export function intakeForm(opts: { title?: string; sandbox?: boolean; directives?: boolean; submit?: string } = {}): Promise<IntakeResult | null> {
  return new Promise((resolve) => {
    const app = randomAppearance(Math.random);
    let name = rname();
    let occ = 'unemployed';
    const traits = new Set<string>();
    let preset = 'standard';
    const sb: Record<string, number> = { ...PRESETS.standard.s };
    let seed = Math.floor(Math.random() * 99999);
    let directives = opts.directives ?? true;

    const wrap = h('div', 'k-intake-wrap');
    const form = h('div', 'k-intake');
    wrap.append(form);
    const close = (r: IntakeResult | null) => { wrap.remove(); resolve(r); };

    const render = () => {
      form.innerHTML = '';
      form.append(h('div', 'k-form-head', `<div><b>MERIDIAN INSTITUTE</b><br>${esc(opts.title || 'FIELD PERSONNEL INTAKE')}</div><div class="k-form-no">FORM 4-B<br><small>"Thank you for your continuity."</small></div>`));

      // 1. name + photo
      const s1 = h('section', 'k-sec');
      s1.append(h('h4', '', '1. NAME OF PERSONNEL'));
      const row = h('div', 'k-row');
      const ni = h('input', 'k-field') as HTMLInputElement;
      ni.value = name; ni.maxLength = 24;
      ni.addEventListener('input', () => { name = ni.value; });
      row.append(ni, mbtn('Another name', () => { name = rname(); render(); }));
      s1.append(row);
      form.append(s1);

      const s2 = h('section', 'k-sec k-two');
      const photo = h('canvas', 'k-photo') as HTMLCanvasElement;
      photo.width = 48; photo.height = 60;
      drawPhoto(photo, app);
      const looks = h('div', 'k-looks');
      looks.append(h('h4', '', '2. IDENTIFYING FEATURES'));
      const sw = (label: string, list: number[], cur: number, set: (c: number) => void) => {
        const r = h('div', 'k-swrow', `<span>${label}</span>`);
        for (const c of list) { const b = h('button', 'k-sw' + (c === cur ? ' on' : '')); b.style.background = '#' + c.toString(16).padStart(6, '0'); b.onclick = () => { set(c); render(); }; r.append(b); }
        return r;
      };
      looks.append(sw('Skin', SKIN_TONES, app.skin, (c) => { app.skin = c; }));
      looks.append(sw('Hair', HAIR_COLORS, app.hair, (c) => { app.hair = c; }));
      const pick = <T extends string>(label: string, vals: T[], cur: T, set: (v: T) => void) => {
        const r = h('div', 'k-chips', `<span>${label}</span>`);
        for (const v of vals) { const b = h('button', 'k-chip' + (v === cur ? ' on' : ''), v); b.onclick = () => { set(v); render(); }; r.append(b); }
        return r;
      };
      looks.append(pick('Hair style', ['short', 'long', 'buzz', 'bald', 'ponytail', 'curly', 'bob'] as Appearance['hairStyle'][], app.hairStyle, (v) => { app.hairStyle = v; }));
      looks.append(pick('Build', ['slim', 'average', 'broad'] as Appearance['build'][], app.build, (v) => { app.build = v; }));
      looks.append(pick('Facial hair', ['no', 'yes'], app.beard ? 'yes' : 'no', (v) => { app.beard = v === 'yes'; }));
      const hrow = h('div', 'k-chips', '<span>Height</span>');
      const hs = h('input') as HTMLInputElement; hs.type = 'range'; hs.min = '0.94'; hs.max = '1.06'; hs.step = '0.01'; hs.value = String(app.height);
      hs.oninput = () => { app.height = Number(hs.value); };
      hrow.append(hs);
      looks.append(hrow);
      looks.append(mbtn('Someone else', () => { Object.assign(app, randomAppearance(Math.random)); render(); }));
      s2.append(h('div', 'k-photo-box', ''), looks);
      (s2.firstChild as HTMLElement).append(photo, h('div', 'k-photo-cap', esc(name.toUpperCase() || 'UNNAMED')));
      form.append(s2);

      // 3. occupation
      const s3 = h('section', 'k-sec');
      s3.append(h('h4', '', '3. PRIOR EMPLOYMENT'));
      const occs = h('div', 'k-occs');
      for (const o of OCCUPATIONS) {
        const b = h('button', 'k-occ' + (o.key === occ ? ' on' : ''), `<b>${esc(o.name)}</b><small>${esc(o.desc)}</small><i>${o.points > 0 ? '+' : ''}${o.points}</i>`);
        b.onclick = () => { occ = o.key; render(); };
        occs.append(b);
      }
      s3.append(occs);
      form.append(s3);

      // 4. traits with point budget (positive traits cost points, negative ones give points)
      const occP = OCCUPATIONS.find((o) => o.key === occ)!.points;
      let pts = occP;
      for (const k of traits) pts -= TRAITS.find((t) => t.key === k)?.cost ?? 0;
      const s4 = h('section', 'k-sec');
      s4.append(h('h4', '', `4. PERSONAL PARTICULARS <span class="k-pts ${pts < 0 ? 'bad' : ''}">POINTS ${pts}</span>`));
      const cols = h('div', 'k-traits');
      const good = h('div', 'k-tcol', '<h5>ASSETS</h5>'), bad = h('div', 'k-tcol', '<h5>LIABILITIES</h5>');
      for (const t of TRAITS) {
        const on = traits.has(t.key);
        const blocked = !on && (t.excl || []).some((x) => traits.has(x));
        const b = h('button', 'k-trait' + (on ? ' on' : '') + (blocked ? ' blocked' : ''), `<span>${esc(t.name)}</span><i>${t.cost < 0 ? t.cost : '+' + t.cost}</i>`);
        b.title = t.desc;
        b.onclick = () => { if (blocked) return; if (on) traits.delete(t.key); else traits.add(t.key); render(); };
        (t.cost < 0 ? good : bad).append(b);
      }
      cols.append(good, bad);
      s4.append(cols);
      const tip = h('div', 'k-tdesc', 'Hover a line for details. Assets cost points; liabilities give points. Stay at 0 or above.');
      cols.addEventListener('mouseover', (e) => { const t = (e.target as HTMLElement).closest('.k-trait') as HTMLElement | null; if (t) tip.textContent = t.title; });
      s4.append(tip);
      form.append(s4);

      // 5. simulation parameters
      if (opts.sandbox !== false) {
        const s5 = h('section', 'k-sec');
        s5.append(h('h4', '', '5. SIMULATION PARAMETERS'));
        const pr = h('div', 'k-chips');
        for (const [k, p] of Object.entries(PRESETS)) { const b = h('button', 'k-chip' + (preset === k ? ' on' : ''), p.label); b.onclick = () => { preset = k; Object.assign(sb, p.s); render(); }; pr.append(b); }
        const cb = h('button', 'k-chip' + (preset === 'custom' ? ' on' : ''), 'Custom'); cb.onclick = () => { preset = 'custom'; render(); }; pr.append(cb);
        s5.append(pr);
        s5.append(h('div', 'k-tdesc', esc(preset === 'custom' ? 'Every dial, your call.' : PRESETS[preset].note)));
        if (preset === 'custom') {
          const grid = h('div', 'k-sbgrid');
          const opt = (label: string, key: string, vals: [number, string][]) => {
            const r = h('div', 'k-chips', `<span>${label}</span>`);
            for (const [v, l] of vals) { const b = h('button', 'k-chip' + (sb[key] === v ? ' on' : ''), l); b.onclick = () => { sb[key] = v; render(); }; r.append(b); }
            grid.append(r);
          };
          opt('Day length', 'dayLength', [[30, '30 min'], [60, '1 hour'], [90, '90 min'], [120, '2 hours']]);
          opt('Entities', 'creatures', [[0, 'none'], [0.35, 'few'], [1, 'normal'], [1.6, 'many'], [2.5, 'swarming']]);
          opt('Supplies', 'loot', [[0.4, 'scarce'], [0.7, 'low'], [1, 'normal'], [1.6, 'plenty']]);
          opt('Collapse', 'collapseSpeed', [[0.4, 'slow'], [1, 'normal'], [1.6, 'fast']]);
          opt('Wake at', 'startHour', [[7, '07:00'], [8.5, '08:30'], [14, '14:00'], [21, '21:00'], [2, '02:00']]);
          opt('Water fails', 'waterShutoffDays', [[0, 'never'], [3, 'day 3'], [7, 'day 7'], [14, 'day 14']]);
          opt('Power fails', 'powerShutoffDays', [[0, 'never'], [7, 'day 7'], [14, 'day 14'], [30, 'day 30']]);
          s5.append(grid);
        }
        const srow = h('div', 'k-row');
        const si = h('input', 'k-field k-seed') as HTMLInputElement; si.value = String(seed);
        si.oninput = () => { seed = Math.abs(Math.floor(Number(si.value) || 0)); };
        srow.append(h('span', 'k-lbl', 'World seed'), si, mbtn('Directives: ' + (directives ? 'ON' : 'OFF'), () => { directives = !directives; render(); }, { sub: directives ? 'story mode' : 'free survival' }));
        s5.append(srow);
        form.append(s5);
      }

      // stamp
      const foot = h('div', 'k-form-foot');
      const approve = h('button', 'k-stamp' + (pts < 0 || !name.trim() ? ' off' : ''), opts.submit || 'APPROVED');
      approve.onclick = () => {
        if (pts < 0) { approve.classList.add('shake'); setTimeout(() => approve.classList.remove('shake'), 400); return; }
        if (!name.trim()) { ni.focus(); return; }
        approve.classList.add('stamped');
        setTimeout(() => close({ name: name.trim().slice(0, 24), app, occupation: occ, traits: [...traits], sandbox: { ...sb }, seed, directives }), 450);
      };
      foot.append(mbtn('Back', () => close(null)), approve);
      form.append(foot);
    };
    render();
    document.body.append(wrap);
  });
}

/** tiny pixel portrait for the ID photo */
function drawPhoto(c: HTMLCanvasElement, a: Appearance) {
  const g = c.getContext('2d')!;
  const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
  const shade = (n: number, f: number) => { const r = Math.min(255, ((n >> 16) & 255) * f), gg = Math.min(255, ((n >> 8) & 255) * f), b = Math.min(255, (n & 255) * f); return `rgb(${r | 0},${gg | 0},${b | 0})`; };
  g.fillStyle = '#b8c4c8'; g.fillRect(0, 0, 48, 60);
  g.fillStyle = '#a4b0b6'; for (let y = 0; y < 60; y += 4) g.fillRect(0, y, 48, 1);
  const w = a.build === 'slim' ? 26 : a.build === 'broad' ? 36 : 31;
  g.fillStyle = '#4a5a6a'; g.fillRect(24 - w / 2, 46, w, 14); // shirt
  g.fillStyle = '#e8e2d6'; g.fillRect(21, 46, 6, 3); // collar
  g.fillStyle = hex(a.skin); g.fillRect(21, 40, 6, 7); // neck
  g.fillRect(15, 18, 18, 23); // face
  g.fillStyle = shade(a.skin, 0.82); g.fillRect(15, 36, 18, 5); g.fillRect(31, 18, 2, 23);
  g.fillStyle = '#1a1612'; g.fillRect(19, 28, 3, 2); g.fillRect(26, 28, 3, 2); // eyes
  g.fillStyle = shade(a.skin, 0.7); g.fillRect(23, 31, 2, 3); g.fillRect(21, 36, 6, 1);
  g.fillStyle = hex(a.hair);
  switch (a.hairStyle) {
    case 'bald': break;
    case 'buzz': g.fillRect(15, 17, 18, 4); break;
    case 'long': g.fillRect(13, 14, 22, 8); g.fillRect(13, 14, 4, 30); g.fillRect(31, 14, 4, 30); break;
    case 'ponytail': g.fillRect(14, 14, 20, 7); g.fillRect(33, 20, 4, 12); break;
    case 'curly': for (let i = 0; i < 9; i++) g.fillRect(13 + i * 2.5, 12 + (i % 2) * 2, 4, 9); break;
    case 'bob': g.fillRect(13, 14, 22, 7); g.fillRect(13, 14, 4, 22); g.fillRect(31, 14, 4, 22); break;
    default: g.fillRect(14, 14, 20, 7); g.fillRect(14, 14, 3, 10);
  }
  if (a.beard) { g.fillStyle = shade(a.hair, 1); g.fillRect(16, 34, 16, 6); g.fillStyle = hex(a.skin); g.fillRect(21, 36, 6, 1); }
  // a little film grain
  for (let i = 0; i < 90; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'; g.fillRect(Math.random() * 48 | 0, Math.random() * 60 | 0, 1, 1); }
}
