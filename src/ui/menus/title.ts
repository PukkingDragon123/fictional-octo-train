// Title screen: a security desk at night. The live engine runs a prisoner in a
// yellow jumpsuit wandering the halls (attract mode), seen through the glass
// of a Meridian CCTV monitor with a tape label stuck to it. There is no menu:
// the things on the desk are the options. The case-file folder starts an
// intake, the blue folder an unsupervised release, the VHS deck plays your
// last tape, the filing cabinet holds every saved case, the phone calls
// another cell (co-op), the clipboard is the settings form, the laminated
// card the procedures, the sticky note says who made this.
import { Game } from '../../game/game';
import { Player } from '../../entities/player';
import { randomAppearance } from '../../entities/humanRig';
import { randomLooks } from '../../entities/humanLooks';
import { AudioEngine } from '../../audio/audio';
import { createItem } from '../../items/factory';
import { hasItemDef } from '../../items/item';
import { findPath } from '../../world/path';
import { moveCircle } from '../../world/collision';
import { Rng } from '../../core/rng';
import { listSaves, deleteSave, SaveMeta } from '../../game/save';
import { setLaunch } from '../../game/launch';
import { defaultServerUrl } from '../../net/net';
import { intakeForm } from './intake';
import { h, esc, optionsPanel, controlsPanel, applyGfx, confirmDialog, FocusNav, sfx, hoverFocus } from './common';
import { runBoot } from './boot';
import { logoCanvas } from '../pixelart';
import { toUrl, PkTheme } from '../pixelkit';
import { DESK_SPRITES } from './art';
import { bus } from '../../core/events';
import '../../world/zones';
import '../../game/worldOps';
import './diegetic.css';
import './desk.css';

export function showTitle() {
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const g = new Game(canvas);
  g.worldSeed = 1000 + Math.floor(Math.random() * 9000);
  applyGfx();
  const audio = new AudioEngine();
  g.audio = audio;
  g.addSystem({ name: 'audio', update: (dt) => audio.update(dt) });
  const p = new Player('attract', 'Somebody', { ...randomAppearance(Math.random), ...randomLooks(Math.random) }, true);
  const kit = hasItemDef('prison_jumpsuit') ? ['prison_jumpsuit', 'socks', 'sneakers'] : ['shirt_office', 'tshirt', 'jeans', 'sneakers'];
  for (const k of kit) if (hasItemDef(k)) { const it = createItem(k); p.inv.add(it); p.wear(it); }
  g.local = p;
  g.addPlayer(p);
  const z = g.getZone('lobby');
  const sp = (z.meta.spawn as [number, number]) || [80, 80];
  g.placePlayer(p, 'lobby', sp[0], sp[1], 0);
  g.pr.setZoomLevel?.(4);
  const rng = new Rng(g.worldSeed);
  let path: [number, number][] | null = null, idx = 0, pause = 2;
  g.attract = (dt) => {
    p.actions.update?.(dt);
    if (pause > 0) { pause -= dt; p.speed = 0; return; }
    if (!path || idx >= path.length) {
      const t = z.randomFloor(rng, (x, y) => Math.hypot(x - p.x, y - p.z) > 10 && Math.hypot(x - p.x, y - p.z) < 30 && z.solid[z.idx(x, y)] === 0);
      path = t ? findPath(z, p.tileX(), p.tileY(), t[0], t[1], { doors: true, maxNodes: 4000 }) : null;
      idx = 0; pause = 1 + rng.next() * 4; p.speed = 0;
      return;
    }
    const [tx, ty] = path[idx];
    // open doors on the way
    const cx = p.tileX(), cy = p.tileY();
    if (tx !== cx || ty !== cy) {
      const e = tx !== cx ? z.edge(Math.max(tx, cx), cy, 1) : z.edge(cx, Math.max(ty, cy), 0);
      if (e && e.kind === 'door' && !e.open) { e.open = true; z.edgeChanged(Math.max(tx, cx), Math.max(ty, cy), tx !== cx ? 1 : 0); audio.at('door_open', tx + 0.5, ty + 0.5); }
    }
    const dx = tx + 0.5 - p.x, dz = ty + 0.5 - p.z, d = Math.hypot(dx, dz);
    if (d < 0.2) { idx++; return; }
    const speed = 1.15;
    p.targetFacing = Math.atan2(dz, dx);
    p.turn(dt, 6);
    moveCircle(z, p, (dx / d) * speed * dt, (dz / d) * speed * dt);
    p.speed = speed;
    if (rng.next() < dt * 0.02) pause = 2 + rng.next() * 3; // stops to listen
  };
  // the feed stops drawing while the intake rooms cover it (phones thank us)
  const realStep = g.step.bind(g);
  let held = false;
  g.step = (dt: number) => { if (!held) realStep(dt); };
  (g as any).holdFeed = (on: boolean) => { held = on; };
  g.start();
  (window as any).__game = g;
  runBoot().then(() => new TitleDesk(g));
  // the boot screen covers the engine warming up
  setTimeout(() => document.getElementById('boot')?.classList.add('gone'), 60);
}

const NOTICES = [
  'REMAIN CALM. THE ROOMS ARE TEMPORARY.',
  'DEBTORS WILL FACE THE CAMERA.',
  'DO NOT FOLLOW THE HUMMING.',
  'THE HOPPER WEIGHS EVERYTHING. EVERYTHING.',
  'CONTINUITY IS A SHARED RESPONSIBILITY.',
  'IF THE BAND BEEPS, WALK BACK.',
  'THE EXIT IS NOT A RUMOUR. THE EXIT IS NOT A RUMOUR.',
];
/** a marker-on-masking-tape palette for the VHS label logo */
const MARKER: PkTheme = { ph: 0x1e1c22, hi: 0x3a3844, mid: 0x14121a, dim: 0x0a090e, dark: 0xd8d0b8, scr: 0xe8e0c8, scr2: 0xe0d8c0, warn: 0xb8261e, danger: 0xb8261e, good: 0x1e1c22 };

interface DeskThing { key: string; sprite: string; label: string; sub?: string; act: () => void; cls?: string }

class TitleDesk {
  root = h('div', 'tt');
  mon = h('div', 'tt-mon');
  screen = h('div', 'tt-screen');
  desk = h('div', 'tt-desk');
  over = h('div', 'tt-over');
  saves: SaveMeta[] = [];
  nav: FocusNav;
  overNav: FocusNav | null = null;
  private lastBtn: HTMLElement | null = null;
  private clockT = 0;
  private g: Game;

  constructor(g: Game) {
    this.g = g;
    this.screen.innerHTML = `<div class="tt-osd tl">CAM 03 · PROCESSING WING<br><span>MERIDIAN INSTITUTE · ANNEX B</span></div><div class="tt-osd tr"><i></i>REC <span class="clk"></span></div><div class="tt-osd bl">SP ▶ TAPE 07</div><div class="tt-osd br">CH 3</div><div class="tt-track"></div><div class="tt-glass"></div>`;
    const knobs = h('div', 'tt-knobs', '<span class="tt-brand">MERIDIAN · SURVEILLANCE · M-14</span><i></i><i></i><b></b>');
    this.mon.append(this.screen, knobs);
    const label = this.label();
    const notice = h('div', 'tt-notice', `<b>NOTICE</b><span>${esc(NOTICES[Math.floor(Math.random() * NOTICES.length)])}</span>`);
    this.root.append(this.mon, label, notice, this.desk, this.over);
    document.body.append(this.root);
    this.nav = new FocusNav(this.root, { onBack: () => this.closeOver() });
    this.tickClock();
    listSaves().then((s) => { this.saves = s; this.render(); }).catch(() => this.render());
    this.render(true);
    bus.on('uiSettings', () => { if (this.root.isConnected) { label.replaceWith(this.label()); } });
    if (import.meta.env.DEV) (window as any).__title = this;
  }

  private label() {
    const el = h('div', 'tt-label');
    const pc = logoCanvas('NOCLIP', MARKER);
    const img = new Image(); img.src = toUrl(pc); img.alt = 'NOCLIP'; img.className = 'tt-logo';
    el.append(img, h('div', 'tt-label-s', 'REMITTANCE PROGRAMME · <b>TAPE 07 · DO NOT ERASE</b>'));
    return el;
  }
  private tickClock() {
    const clk = this.screen.querySelector('.clk') as HTMLElement;
    const tick = () => {
      if (!this.root.isConnected) return;
      const d = new Date();
      clk.textContent = `14.10.87 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
      this.clockT = window.setTimeout(tick, 1000);
    };
    tick();
  }

  render(first = false) {
    const D = this.desk;
    const focusKey = (document.activeElement as HTMLElement | null)?.dataset?.k;
    D.innerHTML = '';
    const last = this.saves[0];
    const things: DeskThing[] = [];
    if (last) things.push({ key: 'continue', sprite: 'vhs', label: 'PLAY ▶', sub: `${last.character} · day ${Math.floor(last.hours / 24) + 1}`, act: () => this.play(last), cls: 'vhs' });
    things.push({ key: 'new', sprite: 'folder', label: 'NEW INTAKE', sub: 'the contract: pay off the debt, buy a way out', act: () => this.newGame(true), cls: 'primary' });
    things.push({ key: 'free', sprite: 'release', label: 'RELEASE', sub: 'free survival, no contract', act: () => this.newGame(false) });
    things.push({ key: 'coop', sprite: 'phone', label: 'CALL A CELL', sub: 'co-op: host or join', act: () => this.coop() });
    if (this.saves.length) things.push({ key: 'load', sprite: 'cabinet', label: 'CASE FILES', sub: `${this.saves.length} on file`, act: () => this.loads() });
    things.push({ key: 'options', sprite: 'clipboard', label: 'SETTINGS', sub: 'sound · picture · interface', act: () => this.options() });
    things.push({ key: 'controls', sprite: 'card', label: 'PROCEDURES', sub: 'controls', act: () => this.controls() });
    things.push({ key: 'about', sprite: 'note', label: 'ABOUT', act: () => this.about() });
    const row = h('div', 'tt-things');
    const wl = h('div', 'tt-wing l'), wr = h('div', 'tt-wing r');
    row.append(wl, wr);
    const half = Math.ceil(things.length / 2);
    things.forEach((t, i) => {
      const b = h('button', 'tt-thing ' + (t.cls || '') + ' s-' + t.sprite, `<img src="${toUrl(DESK_SPRITES[t.sprite]())}" alt=""><span class="tt-tape"><b>${esc(t.label)}</b>${t.sub ? `<small>${esc(t.sub)}</small>` : ''}</span>`);
      b.type = 'button';
      b.dataset.k = t.key;
      if (!first) b.style.animationDelay = '0ms'; else b.style.animationDelay = (i * 70) + 'ms';
      hoverFocus(b);
      b.addEventListener('focus', () => { this.lastBtn = b; });
      b.onclick = () => { sfx(t.cls === 'primary' ? 'confirm' : 'click'); t.act(); };
      (i < half ? wl : wr).append(b);
    });
    const decor = h('div', 'tt-decor');
    for (const k of ['mug', 'ashtray']) { const im = new Image(); im.src = toUrl(DESK_SPRITES[k]()); im.alt = ''; im.className = 'tt-dec ' + k; decor.append(im); }
    D.append(decor, row, h('div', 'tt-foot', '<span>↑↓←→ · enter · esc</span><span class="blk">REMITTANCE OFFICE</span>'));
    const fb = (focusKey && D.querySelector(`[data-k="${focusKey}"]`)) || D.querySelector('.tt-thing.primary') || D.querySelector('.tt-thing');
    if (!this.over.classList.contains('on') && this.root.isConnected && this.root.style.display !== 'none') requestAnimationFrame(() => (fb as HTMLElement | null)?.focus({ preventScroll: true }));
  }

  // ---------------------------------------------------------------- the things on the desk open as things
  private openOver(el: HTMLElement, kind: string, onTab?: (d: -1 | 1) => void) {
    this.overNav?.destroy();
    this.over.innerHTML = '';
    this.over.className = 'tt-over on ' + kind;
    const put = h('button', 'tt-putback', 'PUT IT BACK <kbd>ESC</kbd>');
    (put as HTMLButtonElement).type = 'button';
    hoverFocus(put);
    put.onclick = () => this.closeOver();
    el.append(put);
    this.over.append(el);
    this.over.onpointerdown = (e) => { if (e.target === this.over) this.closeOver(); };
    sfx('open', 0.7);
    this.overNav = new FocusNav(this.over, { onBack: () => this.closeOver(), autofocus: true, onTab });
  }
  private closeOver() {
    if (!this.over.classList.contains('on')) return;
    this.overNav?.destroy(); this.overNav = null;
    this.over.className = 'tt-over';
    this.over.innerHTML = '';
    sfx('back');
    (this.lastBtn || this.desk.querySelector('button'))?.focus({ preventScroll: true });
  }
  /** a sheet of paper on a clipboard (settings) */
  private clipboard(title: string, sub: string, content: HTMLElement) {
    const board = h('div', 'dg-clip');
    board.append(h('div', 'dg-clip-c'), h('div', 'dg-clip-h', `<b>${esc(title)}</b><small>${esc(sub)}</small>`));
    const paper = h('div', 'dg-paper');
    paper.append(content);
    board.append(paper);
    return board;
  }

  options() {
    let tabFn: ((d: -1 | 1) => void) | null = null;
    const panel = optionsPanel({ onTab: (fn) => { tabFn = fn; } });
    const el = this.clipboard('SETTINGS · FORM S-1', 'tick what you can live with', panel);
    this.openOver(el, 'k-clip', (d) => tabFn?.(d));
  }
  controls() {
    const card = h('div', 'dg-card');
    card.append(h('div', 'dg-card-h', '<b>PROCEDURES</b><small>laminated · keep on your person</small>'), controlsPanel());
    this.openOver(card, 'k-card');
  }
  about() {
    const note = h('div', 'dg-note', `
<p><b>NOCLIP</b> is a survival sandbox. You are a debtor in a yellow jumpsuit, pushed through a black seam in a wall into rooms that never end.</p>
<p>A band on your wrist counts what you owe. A projected sergeant tells you what to break. Smash the furniture, find what is worth something, feed it to the Hopper, pay the debt, buy a way out. Or don't.</p>
<p class="small">Inspired by the systemic survival of <i>Project Zomboid</i>, the 2019 "noclip" creepypasta, liminal-space photography and VHS-era found footage. All names, places, creatures and story here are original. Built with three.js. Fonts: Micro 5, Tiny5 and Silkscreen (SIL Open Font License). Every texture, model, sound and pixel is generated in code.</p>`);
    this.openOver(note, 'k-note');
  }

  private play(s: SaveMeta) {
    sfx('confirm');
    this.root.classList.add('playing');
    setTimeout(() => setLaunch({ mode: 'load', id: s.id }), 650);
  }

  private async newGame(directives: boolean) {
    this.root.style.display = 'none';
    (this.g as any).holdFeed?.(true);
    const r = await intakeForm({ directives });
    (this.g as any).holdFeed?.(false);
    this.root.style.display = '';
    if (!r) { (this.lastBtn || this.desk.querySelector('button'))?.focus({ preventScroll: true }); return; }
    setLaunch({ mode: 'new', ...r });
  }

  /** the filing cabinet: one case file per save */
  loads() {
    const cab = h('div', 'dg-cab');
    cab.append(h('div', 'dg-cab-h', `<b>CASE FILES</b><small>drawer 1 · ${this.saves.length} on file</small>`));
    const drawer = h('div', 'dg-cab-drawer');
    const draw = () => {
      drawer.innerHTML = '';
      if (!this.saves.length) drawer.append(h('div', 'dg-empty', 'The drawer is empty.'));
      this.saves.forEach((s, i) => {
        const d = new Date(s.savedAt);
        const f = h('div', 'dg-case', `<div class="dg-case-tab">CASE ${String(i + 1).padStart(3, '0')}</div>
          <div class="dg-case-t"><b>${esc(s.character)}</b><small>day ${Math.floor(s.hours / 24) + 1} · ${esc(s.zone)} · filed ${d.toLocaleDateString()} ${d.toLocaleTimeString().slice(0, 5)}</small></div>`);
        const open = h('button', 'dg-btn ok', 'REOPEN');
        (open as HTMLButtonElement).type = 'button';
        hoverFocus(open);
        open.onclick = () => { sfx('stamp'); f.classList.add('stamped'); setTimeout(() => setLaunch({ mode: 'load', id: s.id }), 450); };
        const shred = h('button', 'dg-btn no', 'SHRED');
        (shred as HTMLButtonElement).type = 'button';
        hoverFocus(shred);
        shred.onclick = async () => {
          const ok = await confirmDialog({ title: 'SHRED CASE FILE', body: `Shred ${s.character}'s file? This world and everything in it will be gone for good.`, ok: 'Shred', cancel: 'Keep', danger: true });
          if (!ok) return;
          await deleteSave(s.id);
          this.saves = this.saves.filter((q) => q !== s);
          f.classList.add('shredded');
          setTimeout(() => { draw(); this.render(); (drawer.querySelector('button') as HTMLElement | null)?.focus(); }, 380);
        };
        const btns = h('div', 'dg-case-b'); btns.append(open, shred);
        f.append(btns);
        drawer.append(f);
      });
    };
    draw();
    cab.append(drawer);
    this.openOver(cab, 'k-cab');
  }

  /** the phone: host a room or dial into one */
  coop() {
    const box = h('div', 'dg-paper dg-coop');
    box.append(h('div', 'dg-paper-h', '<b>CALL ANOTHER CELL</b><small>co-op through a NOCLIP relay · up to 8 debtors</small>'));
    const srv = h('input', 'dg-field') as HTMLInputElement;
    let saved = ''; try { saved = localStorage.getItem('noclip.server') || ''; } catch { /* storage blocked */ }
    srv.value = saved || defaultServerUrl();
    srv.spellcheck = false; srv.setAttribute('aria-label', 'Relay server');
    const remember = () => { try { localStorage.setItem('noclip.server', srv.value.trim()); } catch { /* ignore */ } };
    const lbl = (t: string) => h('div', 'dg-lbl', esc(t));
    box.append(lbl('Exchange (relay server)'), srv);
    box.append(h('p', 'dg-small', 'Co-op runs through a NOCLIP relay (<code>npm start</code> in the project folder serves the game and the relay on port 8787). Everyone dials the same exchange.'));
    if (import.meta.env.VITE_SANDBOXED) box.append(h('p', 'dg-small dg-warn', 'This copy runs in a sandboxed page that cannot open network connections, so co-op is unavailable here. Run the project with <code>npm start</code> to play together.'));
    const cols = h('div', 'dg-cols');
    const hostBox = h('div', 'dg-col', '<h4>OPEN A LINE (HOST)</h4>');
    const rn = h('input', 'dg-field') as HTMLInputElement; rn.placeholder = 'room name (optional)';
    const pw = h('input', 'dg-field') as HTMLInputElement; pw.placeholder = 'password (optional)';
    hostBox.append(rn, pw);
    const btn = (label: string, cls: string, fn: () => void) => { const b = h('button', 'dg-btn ' + cls, label); b.type = 'button'; hoverFocus(b); b.onclick = fn; return b; };
    hostBox.append(btn('HOST A NEW WORLD', 'ok', async () => {
      remember();
      this.closeOver();
      this.root.style.display = 'none';
      (this.g as any).holdFeed?.(true);
      const r = await intakeForm({ title: 'INTAKE PROCESSING · HOST' });
      (this.g as any).holdFeed?.(false);
      this.root.style.display = '';
      if (!r) return;
      setLaunch({ mode: 'host', server: srv.value.trim(), roomName: rn.value.trim() || r.name, public: !pw.value, pass: pw.value, ...r });
    }));
    if (this.saves.length) hostBox.append(btn('HOST A SAVED WORLD · ' + this.saves[0].character, '', () => {
      remember();
      const s = this.saves[0];
      setLaunch({ mode: 'host', server: srv.value.trim(), roomName: rn.value.trim() || s.character, public: !pw.value, pass: pw.value, saveId: s.id, name: s.character, app: null as any, occupation: '', traits: [], sandbox: {}, seed: 0, directives: true });
    }));
    const joinBox = h('div', 'dg-col', '<h4>DIAL IN (JOIN)</h4>');
    const code = h('input', 'dg-field dg-code') as HTMLInputElement; code.placeholder = 'CODE'; code.maxLength = 5; code.spellcheck = false;
    const jpw = h('input', 'dg-field') as HTMLInputElement; jpw.placeholder = 'password (if any)';
    joinBox.append(code, jpw);
    const rooms = h('div', 'dg-rooms');
    joinBox.append(btn('JOIN', 'ok', async () => {
      if (code.value.trim().length < 4) { code.focus(); sfx('error'); return; }
      remember();
      this.closeOver();
      this.root.style.display = 'none';
      (this.g as any).holdFeed?.(true);
      const r = await intakeForm({ title: 'INTAKE PROCESSING · JOIN', sandbox: false, submit: 'JOIN TEAM' });
      (this.g as any).holdFeed?.(false);
      this.root.style.display = '';
      if (!r) return;
      setLaunch({ mode: 'join', server: srv.value.trim(), room: code.value.trim(), pass: jpw.value, name: r.name, app: r.app, occupation: r.occupation, traits: r.traits });
    }));
    joinBox.append(btn('LIST OPEN LINES', '', async () => {
      rooms.textContent = 'ringing…';
      try {
        const u = new URL(srv.value.trim().replace(/^ws/, 'http'));
        u.pathname = '/rooms';
        const list: any[] = await (await fetch(u.toString())).json();
        rooms.innerHTML = list.length ? '' : 'No open lines.';
        for (const r of list) { const b = h('button', 'dg-chip', `${esc(r.room)} · ${esc(r.name)} · ${r.players}/${r.max}${r.locked ? ' [locked]' : ''}`); b.onclick = () => { code.value = r.room; sfx('click'); }; rooms.append(b); }
      } catch { rooms.textContent = 'Nobody picked up (could not reach the relay).'; }
    }));
    joinBox.append(rooms);
    cols.append(hostBox, joinBox);
    box.append(cols);
    for (const i of [srv, rn, pw, code, jpw]) { i.addEventListener('focus', () => { if (this.g.input) this.g.input.textFocus = true; }); i.addEventListener('blur', () => { if (this.g.input) this.g.input.textFocus = false; }); }
    this.openOver(box, 'k-phone');
  }
}
