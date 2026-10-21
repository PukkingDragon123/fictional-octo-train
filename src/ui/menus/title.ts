// Title screen: the subject room in the dark (room3d.ts). A figure is strapped
// in an electric chair you can barely see; the menu floats in front of him
// as neon signs and objects. The signs start a run (CREATE NEW SUBJECT, the
// contract) or a free one (RELEASE), the handset calls another cell (co-op),
// the tape holds the case files (saves), the gear is the settings, the keycap
// the controls, the card says who made this. Every object has an invisible
// button laid over it, so the keyboard, a gamepad and touch all work, and the
// 3D object lights up with the focus. CREATE NEW SUBJECT turns the lights on
// and the room becomes the creator (intake.ts).
import { Game } from '../../game/game';
import { randomAppearance } from '../../entities/humanRig';
import { randomLooks } from '../../entities/humanLooks';
import { AudioEngine } from '../../audio/audio';
import { listSaves, deleteSave, SaveMeta } from '../../game/save';
import { setLaunch } from '../../game/launch';
import { defaultServerUrl } from '../../net/net';
import { researchPoints } from '../../game/research';
import { intakeForm, prisonerOutfitFor } from './intake';
import { h, esc, optionsPanel, controlsPanel, applyGfx, confirmDialog, FocusNav, sfx, hoverFocus } from './common';
import { runBoot } from './boot';
import { SubjectRoom, type MenuItem } from './room3d';
import { installRetroKit, nixieHtml } from './retroKit';
import { ambience } from './sfx';
import '../../world/zones';
import '../../game/worldOps';
import './diegetic.css';
import './desk.css';
import './noir.css';

export function showTitle() {
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const g = new Game(canvas);
  g.worldSeed = 1000 + Math.floor(Math.random() * 9000);
  applyGfx();
  installRetroKit();
  const audio = new AudioEngine();
  g.audio = audio;
  // the world itself never draws behind the title: the room is its own small scene
  (g as any).holdFeed = () => {};
  (window as any).__game = g;
  const t = new TitleRoom(g);
  runBoot().then(() => t.show());
  setTimeout(() => document.getElementById('boot')?.classList.add('gone'), 60);
}

class TitleRoom {
  root = h('div', 'nx nx-title');
  stage = h('div', 'nx-stage');
  hits = h('div', 'nx-hits');
  cap = h('div', 'nx-cap');
  over = h('div', 'nx-over');
  foot = h('div', 'nx-foot', '<span class="rk-tape">ARROWS · ENTER · ESC</span><span class="rp"></span><span class="rk-tape">MERIDIAN INSTITUTE · ROOM 4</span>');
  room: SubjectRoom;
  saves: SaveMeta[] = [];
  nav: FocusNav | null = null;
  overNav: FocusNav | null = null;
  private btns = new Map<string, HTMLButtonElement>();
  private items: (MenuItem & { act: () => void })[] = [];
  private lastKey = 'new';
  private raf = 0;
  private live = false;
  private app = { ...randomAppearance(Math.random), ...randomLooks(Math.random, Math.random() < 0.5) };
  private g: Game;

  constructor(g: Game) {
    this.g = g;
    this.root.append(this.stage, this.hits, this.cap, this.foot, this.over);
    document.body.append(this.root);
    this.room = new SubjectRoom(this.stage);
    this.room.setAppearance(this.app);
    this.room.setOutfit(prisonerOutfitFor(this.app));
    listSaves().then((s) => { this.saves = s; this.build(); }).catch(() => this.build());
    this.build();
    if (import.meta.env.DEV) (window as any).__title = this;
  }

  show() {
    this.live = true;
    this.root.classList.add('on');
    this.nav = new FocusNav(this.root, { onBack: () => this.closeOver() });
    this.focusKey(this.lastKey);
    ambience('room');
    this.loop();
  }

  /** the menu objects (rebuilt when the saves are known) */
  private build() {
    const last = this.saves[0];
    const items: (MenuItem & { act: () => void })[] = [];
    if (last) items.push({ key: 'continue', kind: 'sign', label: 'RESUME SUBJECT', sub: `${last.character} · day ${Math.floor(last.hours / 24) + 1}`, act: () => this.play(last) });
    items.push({ key: 'new', kind: 'sign', label: 'CREATE NEW SUBJECT', sub: 'the contract · pay the debt · buy a way out', primary: true, act: () => this.newGame(true) });
    items.push({ key: 'free', kind: 'sign', label: 'RELEASE', sub: 'free survival · no contract · no band', act: () => this.newGame(false) });
    items.push({ key: 'coop', kind: 'phone', label: 'CO-OP', sub: 'call another cell', act: () => this.coop() });
    if (this.saves.length) items.push({ key: 'load', kind: 'tape', label: 'CASE FILES', sub: `${this.saves.length} on file`, act: () => this.loads() });
    items.push({ key: 'options', kind: 'gear', label: 'SETTINGS', sub: 'sound · picture · ui', act: () => this.options() });
    items.push({ key: 'controls', kind: 'key', label: 'CONTROLS', sub: 'keys · touch · pad', act: () => this.controls() });
    items.push({ key: 'about', kind: 'card', label: 'ABOUT', sub: 'who made this', act: () => this.about() });
    this.items = items;
    this.room.setMenu(items);
    this.hits.innerHTML = '';
    this.btns.clear();
    for (const it of items) {
      const b = h('button', 'nx-hit' + (it.primary ? ' primary' : ''), `<span>${esc(it.label)}</span>`);
      b.type = 'button';
      b.dataset.k = it.key;
      b.setAttribute('aria-label', it.label + (it.sub ? ' — ' + it.sub : ''));
      hoverFocus(b, '');
      b.addEventListener('focus', () => { this.lastKey = it.key; this.room.hoverItem(it.key); this.caption(it); });
      b.addEventListener('blur', () => { if (!this.root.contains(document.activeElement)) this.room.hoverItem(null); });
      b.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'mouse') this.room.hoverItem(it.key); });
      b.onclick = () => this.activate(it);
      this.hits.append(b);
      this.btns.set(it.key, b);
    }
    const rp = this.foot.querySelector('.rp') as HTMLElement;
    rp.innerHTML = `<span class="rk-tape red">RESEARCH</span>${nixieHtml(researchPoints())}`;
    if (this.live) this.focusKey(this.btns.has(this.lastKey) ? this.lastKey : 'new');
  }
  private focusKey(k: string) { requestAnimationFrame(() => this.btns.get(k)?.focus({ preventScroll: true })); }
  private caption(it: MenuItem) {
    this.cap.innerHTML = `<b>${esc(it.label)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}`;
    this.cap.classList.remove('in'); void this.cap.offsetWidth; this.cap.classList.add('in');
  }
  private busy = false;
  private async activate(it: MenuItem & { act: () => void }) {
    if (this.busy || this.room.busy) return;
    this.busy = true;
    sfx(it.primary ? 'confirm' : 'click');
    await this.room.pressItem(it.key);
    this.busy = false;
    it.act();
  }

  /** keep each invisible button over its floating object */
  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.live || this.root.classList.contains('lit')) return;
    for (const it of this.items) {
      const b = this.btns.get(it.key);
      const r = this.room.itemRect(it.key);
      if (!b || !r) continue;
      const w = Math.max(56, r.r * 2), hh = it.kind === 'sign' ? Math.max(40, r.r * 0.55) : Math.max(56, r.r * 1.7);
      const L = Math.round(r.x - w / 2), T = Math.round(r.y - hh / 2);
      if (b.dataset.l !== String(L) || b.dataset.t !== String(T)) {
        b.dataset.l = String(L); b.dataset.t = String(T);
        b.style.left = L + 'px'; b.style.top = T + 'px'; b.style.width = Math.round(w) + 'px'; b.style.height = Math.round(hh) + 'px';
      }
    }
    const a = document.activeElement as HTMLElement | null;
    const k = a?.dataset?.k;
    if (k && this.btns.get(k) === a) {
      const r = this.room.itemRect(k);
      if (r) { this.cap.style.transform = `translate(${Math.round(r.x)}px, ${Math.round(r.y + r.r * 0.6)}px)`; }
    }
  };

  // ---------------------------------------------------------------- panels
  private openOver(el: HTMLElement, title: string, sub: string, onTab?: (d: -1 | 1) => void) {
    this.overNav?.destroy();
    this.over.innerHTML = '';
    this.over.className = 'nx-over on';
    const panel = h('div', 'nx-panel');
    panel.append(h('div', 'nx-panel-h', `<b>${esc(title)}</b><small>${esc(sub)}</small>`));
    const body = h('div', 'nx-panel-b');
    body.append(el);
    const close = h('button', 'nx-close', 'BACK <kbd>ESC</kbd>');
    close.type = 'button';
    hoverFocus(close);
    close.onclick = () => this.closeOver();
    panel.append(body, close);
    this.over.append(panel);
    this.over.onpointerdown = (e) => { if (e.target === this.over) this.closeOver(); };
    this.root.classList.add('paneled');
    sfx('open', 0.7);
    this.overNav = new FocusNav(this.over, { onBack: () => this.closeOver(), autofocus: true, onTab });
  }
  private closeOver() {
    if (!this.over.classList.contains('on')) return;
    this.overNav?.destroy(); this.overNav = null;
    this.over.className = 'nx-over';
    this.over.innerHTML = '';
    this.root.classList.remove('paneled');
    this.room.pushTo(null);
    sfx('back');
    this.focusKey(this.lastKey);
  }

  options() {
    let tabFn: ((d: -1 | 1) => void) | null = null;
    const panel = optionsPanel({ onTab: (fn) => { tabFn = fn; } });
    this.openOver(panel, 'SETTINGS', 'the gear turns · Q / E change page', (d) => tabFn?.(d));
  }
  controls() { this.openOver(controlsPanel(), 'CONTROLS', 'keys · touch · menus'); }
  about() {
    const note = h('div', 'nx-about', `
<p><b>NOCLIP</b> is a survival sandbox. You are a debtor in a yellow jumpsuit, processed by the Meridian Institute and pushed through a wall that turns to liquid, into rooms that never end.</p>
<p>A band on your wrist counts what you owe. A projected sergeant tells you what to break and what to feed to the presses. Pay the debt, buy a way out. Or don't.</p>
<p>Missions, scans and quests pay <b>research points</b>: spend them on the watch's research tree and on things to wear. They stay with you across runs.</p>
<p class="small">Inspired by the systemic survival of <i>Project Zomboid</i>, the 2019 "noclip" creepypasta, liminal-space photography and VHS-era found footage. All names, places, creatures and story here are original. Built with three.js. Fonts: Micro 5, Tiny5 and Silkscreen (SIL Open Font License). Every texture, model, sound and pixel is generated in code.</p>`);
    this.openOver(note, 'ABOUT', 'the card in the dark');
  }

  private play(s: SaveMeta) {
    sfx('confirm');
    this.root.classList.add('playing');
    setTimeout(() => setLaunch({ mode: 'load', id: s.id }), 650);
  }

  /** lights on: the room becomes the creator */
  private async runIntake(opts: Parameters<typeof intakeForm>[0]) {
    this.root.classList.add('lit');
    this.room.hoverItem(null);
    this.nav?.destroy(); this.nav = null;
    const r = await intakeForm({ ...opts, room: this.room, app: this.app });
    this.root.classList.remove('lit');
    this.nav = new FocusNav(this.root, { onBack: () => this.closeOver() });
    this.build();
    if (!r) this.focusKey(this.lastKey);
    return r;
  }
  private async newGame(directives: boolean) {
    const r = await this.runIntake({ directives });
    if (r) setLaunch({ mode: 'new', ...r });
  }

  /** the case files: one per save */
  loads() {
    const list = h('div', 'nx-cases');
    const draw = () => {
      list.innerHTML = '';
      if (!this.saves.length) list.append(h('div', 'nx-empty', 'No subjects on file.'));
      this.saves.forEach((s, i) => {
        const d = new Date(s.savedAt);
        const f = h('div', 'nx-case', `<div class="nx-case-n">${String(i + 1).padStart(3, '0')}</div>
          <div class="nx-case-t"><b>${esc(s.character)}</b><small>day ${Math.floor(s.hours / 24) + 1} · ${esc(s.zone)} · ${d.toLocaleDateString()} ${d.toLocaleTimeString().slice(0, 5)}</small></div>`);
        const open = h('button', 'nx-btn ok', 'RESUME');
        open.type = 'button';
        hoverFocus(open);
        open.onclick = () => { sfx('confirm'); f.classList.add('go'); setTimeout(() => setLaunch({ mode: 'load', id: s.id }), 450); };
        const shred = h('button', 'nx-btn no', 'DELETE');
        shred.type = 'button';
        hoverFocus(shred);
        shred.onclick = async () => {
          const ok = await confirmDialog({ title: 'DELETE CASE FILE', body: `Delete ${s.character}'s file? This world and everything in it will be gone for good.`, ok: 'Delete', cancel: 'Keep', danger: true });
          if (!ok) return;
          await deleteSave(s.id);
          this.saves = this.saves.filter((q) => q !== s);
          f.classList.add('gone');
          setTimeout(() => { draw(); this.build(); (list.querySelector('button') as HTMLElement | null)?.focus(); }, 380);
        };
        const btns = h('div', 'nx-case-b'); btns.append(open, shred);
        f.append(btns);
        list.append(f);
      });
    };
    draw();
    this.openOver(list, 'CASE FILES', `${this.saves.length} subject${this.saves.length === 1 ? '' : 's'} on file`);
  }

  /** the handset: host a room or dial into one */
  coop() {
    const box = h('div', 'nx-coop');
    const srv = h('input', 'nx-field') as HTMLInputElement;
    let saved = ''; try { saved = localStorage.getItem('noclip.server') || ''; } catch { /* storage blocked */ }
    srv.value = saved || defaultServerUrl();
    srv.spellcheck = false; srv.setAttribute('aria-label', 'Relay server');
    const remember = () => { try { localStorage.setItem('noclip.server', srv.value.trim()); } catch { /* ignore */ } };
    const lbl = (t: string) => h('div', 'nx-lbl', esc(t));
    box.append(lbl('Exchange (relay server)'), srv);
    box.append(h('p', 'nx-small', 'Co-op runs through a NOCLIP relay (<code>npm start</code> in the project folder serves the game and the relay on port 8787). Everyone dials the same exchange. Up to 8 subjects.'));
    if (import.meta.env.VITE_SANDBOXED) box.append(h('p', 'nx-small nx-warn', 'This copy runs in a sandboxed page that cannot open network connections, so co-op is unavailable here. Run the project with <code>npm start</code> to play together.'));
    const cols = h('div', 'nx-cols');
    const hostBox = h('div', 'nx-col', '<h4>OPEN A LINE · HOST</h4>');
    const rn = h('input', 'nx-field') as HTMLInputElement; rn.placeholder = 'room name (optional)';
    const pw = h('input', 'nx-field') as HTMLInputElement; pw.placeholder = 'password (optional)';
    hostBox.append(rn, pw);
    const btn = (label: string, cls: string, fn: () => void) => { const b = h('button', 'nx-btn ' + cls, label); b.type = 'button'; hoverFocus(b); b.onclick = fn; return b; };
    hostBox.append(btn('HOST A NEW WORLD', 'ok', async () => {
      remember();
      const server = srv.value.trim(), roomName = rn.value.trim(), pass = pw.value;
      this.closeOver();
      const r = await this.runIntake({ title: 'SUBJECT INTAKE · HOST' });
      if (!r) return;
      setLaunch({ mode: 'host', server, roomName: roomName || r.name, public: !pass, pass, ...r });
    }));
    if (this.saves.length) hostBox.append(btn('HOST A SAVED WORLD · ' + this.saves[0].character, '', () => {
      remember();
      const s = this.saves[0];
      setLaunch({ mode: 'host', server: srv.value.trim(), roomName: rn.value.trim() || s.character, public: !pw.value, pass: pw.value, saveId: s.id, name: s.character, app: null as any, occupation: '', traits: [], sandbox: {}, seed: 0, directives: true });
    }));
    const joinBox = h('div', 'nx-col', '<h4>DIAL IN · JOIN</h4>');
    const code = h('input', 'nx-field nx-code') as HTMLInputElement; code.placeholder = 'CODE'; code.maxLength = 5; code.spellcheck = false;
    const jpw = h('input', 'nx-field') as HTMLInputElement; jpw.placeholder = 'password (if any)';
    joinBox.append(code, jpw);
    const rooms = h('div', 'nx-rooms');
    joinBox.append(btn('JOIN', 'ok', async () => {
      if (code.value.trim().length < 4) { code.focus(); sfx('error'); return; }
      remember();
      const server = srv.value.trim(), room = code.value.trim(), pass = jpw.value;
      this.closeOver();
      const r = await this.runIntake({ title: 'SUBJECT INTAKE · JOIN', sandbox: false, submit: 'JOIN TEAM' });
      if (!r) return;
      setLaunch({ mode: 'join', server, room, pass, name: r.name, app: r.app, occupation: r.occupation, traits: r.traits });
    }));
    joinBox.append(btn('LIST OPEN LINES', '', async () => {
      rooms.textContent = 'ringing…';
      try {
        const u = new URL(srv.value.trim().replace(/^ws/, 'http'));
        u.pathname = '/rooms';
        const list: any[] = await (await fetch(u.toString())).json();
        rooms.innerHTML = list.length ? '' : 'No open lines.';
        for (const r of list) { const b = h('button', 'nx-chip', `${esc(r.room)} · ${esc(r.name)} · ${r.players}/${r.max}${r.locked ? ' [locked]' : ''}`); b.type = 'button'; b.onclick = () => { code.value = r.room; sfx('click'); }; rooms.append(b); }
      } catch { rooms.textContent = 'Nobody picked up (could not reach the relay).'; }
    }));
    joinBox.append(rooms);
    cols.append(hostBox, joinBox);
    box.append(cols);
    for (const i of [srv, rn, pw, code, jpw]) { i.addEventListener('focus', () => { if (this.g.input) this.g.input.textFocus = true; }); i.addEventListener('blur', () => { if (this.g.input) this.g.input.textFocus = false; }); }
    this.openOver(box, 'CO-OP', 'the handset · host a world or dial into one');
  }
}
