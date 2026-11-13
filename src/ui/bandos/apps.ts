// The wrist terminal's apps (./bandos.ts). Each builds into the tube (full screen) and returns what it
// needs each frame (tick) and when it closes (dispose). They reuse the game's own pages and systems; none
// of the game's logic lives here. The research tree is not here: it is the 3D lattice on the lab's main
// computer (src/ui/menus/research/lattice.ts).
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { IconKind } from '../machine/decor';
import type { WinApi } from './bandos';
import { statusPage, crewPage } from '../menus/pause';
import { optionsPanel, controlsPanel } from '../menus/common';
import { setPanelEmbed, openCodex, openReq, closePanel, type PanelHost } from '../menus/research/panel';
import { itemIconFor, iconResCss } from '../icons';
import { itemName } from '../../items/item';
import { openItemPanel } from '../itemPanel';
import { trackQuest } from '../broadcast/notices';
import { lore } from '../../content/loreRegistry';
import type { QuestRuntime, QView } from '../../missions/questRuntime';
import { researchPoints } from '../../game/research';

export interface AppRun { dispose?: () => void; tick?: (dt: number) => void }
export interface AppDef {
  key: string; title: string; sub: string; icon: IconKind; w: number; h: number;
  /** apps sharing one host (the lab's panels) */
  group?: string;
  /** gives back what it borrowed when it closes (every app closes when the band goes down) */
  closeOnHide?: boolean;
  build(w: WinApi): AppRun | void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
const btn = (label: string, fn: () => void, cls = '') => { const b = el('button', 'bos-btn ' + cls, esc(label)) as HTMLButtonElement; b.type = 'button'; b.addEventListener('click', fn); return b; };
const Q = () => G.missions?.quests as QuestRuntime | undefined;

// ---------------------------------------------------------------- Calder's lines and the papers read, for Mail
interface Mail { t: string; text: string }
const LINES: Mail[] = [];
const DOCS: string[] = [];
const stamp = () => { const h = (G.clock as any)?.hours ?? 0; return `D${Math.floor(h / 24) + 1} ${String(Math.floor(h % 24)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`; };
let hooked = false;
/** how many of Dr. Calder's lines the band has logged (the message lamp) */
export const mailCount = () => LINES.length;
export function hookMail() {
  if (hooked) return;
  const h = G.handler as { say?: (t: string, o?: unknown) => unknown } | undefined;
  if (!h?.say) return;
  hooked = true;
  const say = h.say.bind(h);
  h.say = (t: string, o?: unknown) => { if (t && LINES[0]?.text !== t) { LINES.unshift({ t: stamp(), text: t }); if (LINES.length > 120) LINES.pop(); } return say(t, o); };
  bus.on('loreRead', (_p: unknown, id: string) => { if (id && !DOCS.includes(id)) DOCS.unshift(id); });
}

// ---------------------------------------------------------------- the apps
export const APPS: AppDef[] = [
  {
    key: 'map', title: 'Map', sub: 'the survey plotter', icon: 'map', w: 720, h: 470, closeOnHide: true,
    build(w) {
      const host = el('div', 'bos-map');
      w.body.append(host);
      const sm = (G as any).surveyMap as { embed(h: HTMLElement): void; unembed(): void; embedTick(dt: number): void } | undefined;
      if (!sm) { host.textContent = 'No plotter on this band.'; return; }
      sm.embed(host);
      return { tick: (dt) => sm.embedTick(dt), dispose: () => sm.unembed() };
    },
  },
  {
    key: 'tasks', title: 'Tasks', sub: 'offers, work in hand, filed', icon: 'clipboard', w: 640, h: 440,
    build(w) {
      const q = Q();
      if (!q) { w.body.append(el('p', 'bos-p', 'No feed from the Institute here.')); return; }
      let tab: 'active' | 'offers' | 'done' = q.list('active').length ? 'active' : 'offers';
      let sel = '', sig = '';
      const tabs = el('div', 'bos-tabs'), split = el('div', 'bos-split'), list = el('div', 'bos-list'), pane = el('div', 'bos-pane');
      split.append(list, pane);
      w.body.append(tabs, split);
      const act = (k: string, a: 'accept' | 'decline' | 'pay' | 'abandon') => { const err = q.request(k, a); if (err) w.os.toast(err); sig = ''; };
      const render = () => {
        const views = q.list(tab);
        const s = [tab, sel, ...views.map((v) => v.key + v.status + v.objectives.map((o) => Math.round(o.prog * 10)).join('') + v.affordable), q.focus()].join('|');
        if (s === sig) return;
        sig = s;
        tabs.replaceChildren(...(['active', 'offers', 'done'] as const).map((t) => { const n = q.list(t).length; const b = btn(`${t === 'active' ? 'Work' : t === 'offers' ? 'Offers' : 'Filed'} ${n || ''}`, () => { tab = t; sel = ''; sig = ''; render(); }, t === tab ? 'on' : ''); return b; }));
        if (!views.find((v) => v.key === sel)) sel = views[0]?.key ?? '';
        list.replaceChildren(...views.map((v) => {
          const b = el('button', 'bos-li' + (v.key === sel ? ' on' : '') + (v.status === 'ready' ? ' ready' : '') + (q.fresh?.has?.(v.key) ? ' fresh' : '')) as HTMLButtonElement;
          b.type = 'button';
          b.innerHTML = `<b>${esc(v.title)}</b>${v.status === 'ready' ? '<small>READY</small>' : ''}`;
          b.addEventListener('click', () => { sel = v.key; sig = ''; render(); });
          return b;
        }));
        if (!views.length) list.append(el('p', 'bos-dim', tab === 'offers' ? 'Nothing on offer.' : tab === 'active' ? 'No work taken.' : 'Nothing filed yet.'));
        const v = views.find((x) => x.key === sel);
        pane.replaceChildren(...(v ? detail(v) : []));
      };
      const detail = (v: QView): HTMLElement[] => {
        // the job in numbers and boxes: its name, who set it, the objectives, the pay (no paragraphs on the glass)
        const out: HTMLElement[] = [el('h3', 'bos-h', esc(v.title)), el('p', 'bos-dim', esc(v.giver).toUpperCase())];
        const ol = el('div', 'bos-objs');
        for (const o of v.objectives) ol.append(el('div', 'bos-obj' + (o.done ? ' done' : ''), `<i></i><span>${esc(o.text.replace(/\s*\(optional\)/i, ''))}${o.optional ? ' <em>OPT</em>' : ''}</span>${o.prog > 0 && !o.done ? `<s style="--p:${Math.round(o.prog * 100)}%"></s>` : ''}`));
        out.push(ol);
        if (v.rewardText) out.push(el('p', 'bos-rew', `+ ${esc(v.rewardText)}`));
        if (v.costText) out.push(el('p', 'bos-dim', `- ${esc(v.costText)}`));
        const keys = el('div', 'bos-keys');
        if (v.status === 'new') keys.append(btn('Accept', () => act(v.key, 'accept'), 'go'), btn('Decline', () => act(v.key, 'decline')));
        else if (v.status === 'ready') keys.append(btn('Pay and settle', () => act(v.key, 'pay'), v.affordable ? 'go' : 'off'));
        if (v.status !== 'new' && v.status !== 'done') {
          const tracked = q.focus() === v.key;
          keys.append(btn(tracked ? 'Tracking' : 'Track', () => { trackQuest(tracked ? null : v.key); sig = ''; render(); }, tracked ? 'on' : ''), btn('Abandon', () => act(v.key, 'abandon'), 'stop'));
        }
        out.push(keys);
        return out;
      };
      render();
      let t = 0;
      return { tick: (dt) => { t += dt; if (t > 0.6) { t = 0; render(); } } };
    },
  },
  {
    key: 'pack', title: 'Pack', sub: 'what the unit carries', icon: 'crate', w: 520, h: 440,
    build(w) {
      let sig = '';
      const render = () => {
        const p = G.local;
        if (!p) return;
        const cs = p.containers();
        const s = cs.map((c) => c.uid + ':' + c.items.map((i) => i.uid).join(',')).join('|');
        if (s === sig) return;
        sig = s;
        w.body.replaceChildren();
        for (const c of cs) {
          const sec = el('section', 'bos-sec');
          sec.append(el('h4', 'bos-h4', `${esc(c.name)} <small>${c.items.length}</small>`));
          const grid = el('div', 'bos-grid');
          for (const it of c.items) {
            const b = el('button', 'bos-tile') as HTMLButtonElement;
            b.type = 'button'; b.title = itemName(it);
            b.innerHTML = `<img src="${itemIconFor(it, iconResCss(36))}" alt=""><span>${esc(itemName(it))}</span>`;
            b.addEventListener('click', () => { const r = b.getBoundingClientRect(); openItemPanel(it, c, { x: r.left, y: r.top, w: r.width, h: r.height }); });
            grid.append(b);
          }
          if (!c.items.length) grid.append(el('p', 'bos-dim', 'empty'));
          sec.append(grid);
          w.body.append(sec);
        }
      };
      render();
      let t = 0;
      return { tick: (dt) => { t += dt; if (t > 0.5) { t = 0; render(); } } };
    },
  },
  {
    key: 'status', title: 'Status', sub: 'the unit, the debt, the crew', icon: 'eye', w: 600, h: 480,
    build(w) {
      const box = el('div', 'bos-crt');
      w.body.append(box);
      const paint = () => { box.replaceChildren(...statusPage(G.role === 'solo'), ...(G.net ? crewPage() : [])); };
      paint();
      let t = 0;
      return { tick: (dt) => { t += dt; if (t > 2) { t = 0; paint(); } } };
    },
  },
  {
    key: 'codex', title: 'Codex', sub: 'specimens and anomalies on file', icon: 'dossier', w: 760, h: 520, group: 'lab', closeOnHide: true,
    build(w) { return labPanel(w, openCodex); },
  },
  {
    key: 'mail', title: 'Mail', sub: 'Dr. Calder\'s lines, papers read', icon: 'radio', w: 620, h: 420,
    build(w) {
      hookMail();
      let folder: 'calder' | 'docs' = 'calder', sel = -1, sig = '';
      const tabs = el('div', 'bos-tabs'), split = el('div', 'bos-split'), list = el('div', 'bos-list'), pane = el('div', 'bos-pane');
      split.append(list, pane); w.body.append(tabs, split);
      const render = () => {
        const s = folder + sel + LINES.length + ':' + DOCS.length;
        if (s === sig) return; sig = s;
        tabs.replaceChildren(btn(`Dr. Calder ${LINES.length || ''}`, () => { folder = 'calder'; sel = -1; sig = ''; render(); }, folder === 'calder' ? 'on' : ''), btn(`Documents ${DOCS.length || ''}`, () => { folder = 'docs'; sel = -1; sig = ''; render(); }, folder === 'docs' ? 'on' : ''));
        if (folder === 'calder') {
          list.replaceChildren(...LINES.map((m, i) => { const b = el('button', 'bos-li' + (i === sel ? ' on' : '')) as HTMLButtonElement; b.type = 'button'; b.innerHTML = `<b>${esc(m.text.slice(0, 48))}${m.text.length > 48 ? '…' : ''}</b><small>${esc(m.t)}</small>`; b.addEventListener('click', () => { sel = i; sig = ''; render(); }); return b; }));
          if (!LINES.length) list.append(el('p', 'bos-dim', 'Nothing from Dr. Calder yet this shift.'));
          const m = LINES[sel] ?? LINES[0];
          pane.replaceChildren(...(m ? [el('h3', 'bos-h', 'Dr. Iris Calder'), el('p', 'bos-dim', esc(m.t)), el('p', 'bos-p', esc(m.text))] : []));
        } else {
          const docs = DOCS;
          list.replaceChildren(...docs.map((id, i) => { const L = lore(id); const b = el('button', 'bos-li' + (i === sel ? ' on' : '')) as HTMLButtonElement; b.type = 'button'; b.innerHTML = `<b>${esc(L?.title ?? id)}</b><small>${esc(L?.style ?? 'paper')}</small>`; b.addEventListener('click', () => { sel = i; sig = ''; render(); }); return b; }));
          if (!docs.length) list.append(el('p', 'bos-dim', 'Papers the unit reads are filed here.'));
          const L = lore(docs[sel] ?? docs[0]);
          pane.replaceChildren(...(L ? [el('h3', 'bos-h', esc(L.title)), el('pre', 'bos-doc', esc(L.text))] : []));
        }
      };
      render();
      let t = 0;
      return { tick: (dt) => { t += dt; if (t > 1) { t = 0; render(); } } };
    },
  },
  {
    key: 'shop', title: 'Shop', sub: 'requisition for the next run', icon: 'coin', w: 760, h: 520, group: 'lab', closeOnHide: true,
    build(w) { return labPanel(w, openReq); },
  },
  {
    key: 'settings', title: 'Settings', sub: 'sound · picture · interface · keys', icon: 'wrench', w: 720, h: 520,
    build(w) {
      const tabs = el('div', 'bos-tabs'), body = el('div', 'bos-crt bos-set');
      w.body.append(tabs, body);
      const show = (k: 'options' | 'controls') => {
        tabs.replaceChildren(btn('Options', () => show('options'), k === 'options' ? 'on' : ''), btn('Controls', () => show('controls'), k === 'controls' ? 'on' : ''));
        body.replaceChildren(k === 'options' ? optionsPanel({ inGame: true }) : controlsPanel());
      };
      show('options');
    },
  },
  {
    key: 'term', title: 'Terminal', sub: 'the band\'s radio shell', icon: 'walkie', w: 560, h: 360,
    build(w) { return terminalApp(w); },
  },
];

/** the lab's paperwork panels (codex, requisition) hosted in a window */
function labPanel(w: WinApi, open: (h: PanelHost) => void): AppRun {
  let closing = false;
  setPanelEmbed(w.body);
  const host: PanelHost = { root: w.body, onChange: () => {}, onClose: () => { if (!closing) { closing = true; w.close(); } } };
  try { open(host); } catch (e) { console.warn('lab panel', e); w.body.append(el('p', 'bos-p', 'The lab link is down.')); }
  return { dispose: () => { if (!closing) { closing = true; closePanel(true); } setPanelEmbed(null); } };
}

// ---------------------------------------------------------------- the terminal toy
function terminalApp(w: WinApi): AppRun {
  const out = el('div', 'bos-term-out');
  const row = el('label', 'bos-term-row', '<span>OP&gt;</span>');
  const inp = el('input', 'bos-term-in') as HTMLInputElement;
  inp.spellcheck = false; inp.autocomplete = 'off';
  row.append(inp);
  w.body.append(out, row);
  w.body.classList.add('bos-term');
  setTimeout(() => inp.focus({ preventScroll: true }), 420);
  const hist: string[] = []; let hi = 0;
  const print = (t: string, cls = '') => { const d = el('div', cls); d.textContent = t; out.append(d); out.scrollTop = out.scrollHeight; };
  print('MI-7 BAND SHELL. TYPE HELP.', 'dim');
  const p = () => G.local;
  const CMDS: Record<string, (a: string[]) => void> = {
    help: () => print('help · whoami · status · debt · time · where · tasks · rp · ls · cat <id> · open <app> · bishop · clear · exit'),
    whoami: () => print(`operator · unit ${p()?.name ?? '----'}`),
    status: () => { const b = p()?.body as any; print(b ? `blood ${Math.round(b.blood ?? 0)} · panic ${Math.round(b.panic ?? 0)} · hunger ${Math.round(b.hunger ?? 0)} · thirst ${Math.round(b.thirst ?? 0)}` : 'no unit'); },
    debt: () => { const d = (G as any).debt; print(d?.on ? `${Math.round(d.remaining).toLocaleString('en-GB')} owed · ${Math.round(d.due ?? 0).toLocaleString('en-GB')} due by day ${d.dueDay}` : 'no contract on file'); },
    time: () => { const h = (G.clock as any)?.hours ?? 0; print(`day ${Math.floor(h / 24) + 1} · ${String(Math.floor(h % 24)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`); },
    where: () => print(p() ? `${(G as any).getZone?.(p()!.zoneKey)?.name ?? p()!.zoneKey} · x ${Math.round(p()!.x)} z ${Math.round(p()!.z)}` : 'nowhere'),
    tasks: () => { const q = Q(); const a = q?.list('active') ?? []; print(a.length ? a.map((v) => `- ${v.title}${v.status === 'ready' ? ' (ready)' : ''}`).join('\n') : 'no work taken'); },
    rp: () => { let n = 0; try { n = researchPoints(); } catch { /* none */ } print(`${n} research points banked`); },
    ls: () => { print(DOCS.length ? DOCS.join('\n') : '(no papers read)'); },
    cat: (a) => { const L = lore(a[0] ?? ''); print(L ? L.text : `cat: ${a[0] ?? ''}: no such paper`); },
    open: (a) => { const k = APPS.find((x) => x.key === a[0] || x.title.toLowerCase() === (a[0] ?? '').toLowerCase())?.key; if (k) (w.os as any).launch(k); else print(`open: ${a[0] ?? ''}: no such app`); },
    bishop: () => print('    _\n   (/)\n   /\\\n  (  )\n   )(\n  /__\\\n (____)\nmoves on the diagonal.'),
    clear: () => { out.replaceChildren(); },
    exit: () => w.close(),
    sudo: () => print('this incident will be reported.', 'err'),
  };
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const line = inp.value.trim(); inp.value = '';
      if (!line) return;
      hist.push(line); hi = hist.length;
      print('OP> ' + line, 'echo');
      const [c, ...a] = line.split(/\s+/);
      const f = CMDS[c.toLowerCase()];
      if (f) f(a); else print(`${c}: command not found`, 'err');
    } else if (e.key === 'ArrowUp') { hi = Math.max(0, hi - 1); inp.value = hist[hi] ?? ''; e.preventDefault(); }
    else if (e.key === 'ArrowDown') { hi = Math.min(hist.length, hi + 1); inp.value = hist[hi] ?? ''; e.preventDefault(); }
  });
  setTimeout(() => inp.focus({ preventScroll: true }), 50);
  w.body.addEventListener('pointerdown', () => setTimeout(() => inp.focus({ preventScroll: true }), 0));
  return {};
}
