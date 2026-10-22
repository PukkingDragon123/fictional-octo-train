// Title screen: the subject room in the dark (room3d.ts). A figure is strapped
// in an electric chair you can barely see. The menu is a column of riveted
// pixel-art plates (btnKit.ts) over the dark side of the room: left on a
// landscape screen, along the bottom in portrait. What a plate does floats
// beside it as free text. SETTINGS, CONTROLS, ABOUT, CO-OP and the CASE FILES
// open on a green phosphor terminal (terminal.ts). CREATE NEW SUBJECT turns
// the lights on and the room becomes the creator (intake.ts).
import { Game } from '../../game/game';
import { randomAppearance } from '../../entities/humanRig';
import { randomLooks } from '../../entities/humanLooks';
import { AudioEngine } from '../../audio/audio';
import { listSaves, deleteSave, SaveMeta } from '../../game/save';
import { setLaunch } from '../../game/launch';
import { defaultServerUrl } from '../../net/net';
import { intakeForm, prisonerOutfitFor } from './intake';
import { h, esc, optionsPanel, controlsPanel, applyGfx, confirmDialog, FocusNav, sfx } from './common';
import { runBoot } from './boot';
import { SubjectRoom } from './room3d';
import { installRetroKit } from './retroKit';
import { ambience } from './sfx';
import { plateBtn, type PlateButton, type Finish, type Size } from './btnKit';
import { terminal, crtAct, type Terminal } from './terminal';
import '../../world/zones';
import '../../game/worldOps';
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

interface Item { key: string; label: string; sub: string; act: () => void; finish?: Finish; size?: Size; gap?: boolean }

/** the room's camera hooks (the scene worker adds them; older rooms simply lack them) */
type RoomCam = { shot?: (k: string, ms?: number) => void; setFraming?: (dx: number) => void };

class TitleRoom {
  root = h('div', 'nx nx-title');
  stage = h('div', 'nx-stage');
  menu = h('nav', 'tt3-menu');
  cap = h('div', 'tt3-cap kf');
  foot = h('div', 'tt3-foot kf', '<span>arrows · enter · esc</span><span>Subject Room 4 · Meridian Institute</span>');
  over = h('div', 'nx-over');
  room: SubjectRoom;
  saves: SaveMeta[] = [];
  nav: FocusNav | null = null;
  overNav: FocusNav | null = null;
  private btns = new Map<string, PlateButton>();
  private lastKey = 'new';
  private live = false;
  private app = { ...randomAppearance(Math.random), ...randomLooks(Math.random, Math.random() < 0.5) };
  private g: Game;
  private term: Terminal | null = null;

  constructor(g: Game) {
    this.g = g;
    this.root.append(this.stage, this.menu, this.cap, this.foot, this.over);
    document.body.append(this.root);
    this.room = new SubjectRoom(this.stage);
    this.room.setAppearance(this.app);
    this.room.setOutfit(prisonerOutfitFor(this.app));
    listSaves().then((s) => { this.saves = s; this.build(); }).catch(() => this.build());
    this.build();
    this.frame(0);
    window.addEventListener('resize', () => { if (!this.root.classList.contains('lit')) this.frame(400); });
    if (import.meta.env.DEV) (window as any).__title = this;
  }

  private get cam() { return this.room as unknown as RoomCam; }
  private portrait() { return window.innerHeight > window.innerWidth * 1.05; }
  /** keep the subject on the lit side, away from the buttons */
  private frame(ms: number) {
    this.cam.setFraming?.(this.portrait() ? 0 : 0.38);
    this.cam.shot?.('title', ms);
  }

  show() {
    this.live = true;
    this.root.classList.add('on');
    this.nav = new FocusNav(this.root, { onBack: () => this.closeOver() });
    this.frame(0);
    this.focusKey(this.lastKey);
    ambience('room');
    // the plates come up one after the other
    [...this.menu.children].forEach((b, i) => { (b as HTMLElement).style.animationDelay = 120 + i * 70 + 'ms'; });
    this.menu.classList.add('in');
  }

  /** the menu plates (rebuilt when the saves are known) */
  private build() {
    const last = this.saves[0];
    const items: Item[] = [];
    if (last) items.push({ key: 'continue', label: 'Resume subject', sub: `${last.character} · day ${Math.floor(last.hours / 24) + 1}`, act: () => this.play(last), finish: 'olive' });
    items.push({ key: 'new', label: 'Create new subject', sub: 'the contract · pay the debt · buy a way out', act: () => this.newGame(true), finish: 'oxblood', size: 'lg' });
    items.push({ key: 'free', label: 'Release', sub: 'free survival · no contract · no band', act: () => this.newGame(false) });
    items.push({ key: 'coop', label: 'Co-op', sub: 'call another cell · host or dial in', act: () => this.coop(), gap: true, size: 'md' });
    if (this.saves.length) items.push({ key: 'load', label: 'Case files', sub: `${this.saves.length} subject${this.saves.length === 1 ? '' : 's'} on file`, act: () => this.loads(), size: 'md' });
    items.push({ key: 'options', label: 'Settings', sub: 'sound · picture · interface', act: () => this.options(), size: 'md' });
    items.push({ key: 'controls', label: 'Controls', sub: 'keys · touch · gamepad', act: () => this.controls(), size: 'md' });
    items.push({ key: 'about', label: 'About', sub: 'what this place is', act: () => this.about(), size: 'md' });
    this.menu.innerHTML = '';
    this.menu.append(this.cap);
    this.btns.clear();
    for (const it of items) {
      const b = plateBtn(it.label, () => this.activate(it), { finish: it.finish ?? 'steel', size: it.size ?? 'lg', full: true, pointer: true, sound: '', aria: `${it.label} — ${it.sub}` });
      b.dataset.k = it.key;
      if (it.gap) b.classList.add('tt3-gap');
      b.addEventListener('focus', () => { this.lastKey = it.key; this.caption(it, b); });
      this.menu.append(b);
      this.btns.set(it.key, b);
    }
    if (this.live) { this.menu.classList.add('in'); this.focusKey(this.btns.has(this.lastKey) ? this.lastKey : 'new'); }
  }
  private focusKey(k: string) { requestAnimationFrame(() => this.btns.get(k)?.focus({ preventScroll: true })); }
  private caption(it: Item, b: HTMLElement) {
    // the caption lives in the column, placed by layout offsets (immune to the plates' entrance animation)
    if (this.cap.parentElement !== this.menu) this.menu.append(this.cap);
    this.cap.innerHTML = `<small>${esc(it.sub)}</small>`;
    this.cap.style.transform = '';
    this.cap.style.top = this.portrait() ? '' : Math.round(b.offsetTop + b.offsetHeight / 2) + 'px';
    this.cap.classList.remove('in'); void this.cap.offsetWidth; this.cap.classList.add('in');
  }
  private busy = false;
  private activate(it: Item) {
    if (this.busy || this.room.busy) return;
    this.busy = true;
    sfx(it.key === 'new' || it.key === 'continue' ? 'confirm' : 'plate');
    setTimeout(() => { this.busy = false; it.act(); }, 140);
  }

  // ---------------------------------------------------------------- panels: the terminal
  private openOver(el: HTMLElement, title: string, sub: string, onTab?: (d: -1 | 1) => void) {
    this.overNav?.destroy();
    this.over.innerHTML = '';
    this.over.className = 'nx-over on';
    const t = terminal({ title, sub, cls: 'tt3-term' });
    t.body.append(el);
    const back = plateBtn('Back', () => this.closeOver(), { finish: 'cream', size: 'md', shape: 'arrowL', lamp: false, sound: 'back', aria: 'Back (Esc)' });
    t.keys.append(back);
    this.over.append(t.el);
    this.term = t;
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
    this.term = null;
    this.root.classList.remove('paneled');
    sfx('back');
    this.focusKey(this.lastKey);
  }

  options() {
    let tabFn: ((d: -1 | 1) => void) | null = null;
    const panel = optionsPanel({ onTab: (fn) => { tabFn = fn; } });
    this.openOver(panel, 'Settings', 'Q / E change page', (d) => tabFn?.(d));
  }
  controls() { this.openOver(controlsPanel(), 'Controls', 'keys · touch · menus'); }
  about() {
    const note = h('div', 'tt3-about', `
<p>A survival sandbox. You are a debtor in a yellow jumpsuit, processed by the Meridian Institute and pushed through a wall that turns to liquid, into rooms that never end.</p>
<p>A band on your wrist counts what you owe. A projected sergeant tells you what to break and what to feed to the presses. Pay the debt, buy a way out. Or don't.</p>
<p>Missions, scans and quests pay research points for the watch's research tree. What you wear in here costs nothing: the Institute issues it.</p>
<p class="ct-dim">Inspired by the systemic survival of <i>Project Zomboid</i>, the 2019 "noclip" creepypasta, liminal-space photography and VHS-era found footage. All names, places, creatures and story here are original. Built with three.js. Type: EB Garamond (SIL Open Font License). Every texture, model, sound and pixel is generated in code.</p>`);
    this.openOver(note, 'About', 'the file in the drawer');
  }

  private play(s: SaveMeta) {
    sfx('confirm');
    this.root.classList.add('playing');
    setTimeout(() => setLaunch({ mode: 'load', id: s.id }), 650);
  }

  /** lights on: the room becomes the creator */
  private async runIntake(opts: Parameters<typeof intakeForm>[0]) {
    this.root.classList.add('lit');
    this.nav?.destroy(); this.nav = null;
    const r = await intakeForm({ ...opts, room: this.room, app: this.app });
    this.root.classList.remove('lit');
    this.nav = new FocusNav(this.root, { onBack: () => this.closeOver() });
    this.build();
    if (!r) { this.frame(900); this.focusKey(this.lastKey); }
    return r;
  }
  private async newGame(directives: boolean) {
    const r = await this.runIntake({ directives });
    if (r) setLaunch({ mode: 'new', ...r });
  }

  /** the case files: one per save */
  loads() {
    const list = h('div', 'tt3-cases');
    const draw = () => {
      list.innerHTML = '';
      if (!this.saves.length) list.append(h('p', 'ct-dim', 'No subjects on file.'));
      this.saves.forEach((s, i) => {
        const d = new Date(s.savedAt);
        const f = h('div', 'tt3-case', `<span class="n">${String(i + 1).padStart(3, '0')}</span><span class="t"><b>${esc(s.character)}</b><small>day ${Math.floor(s.hours / 24) + 1} · ${esc(s.zone)} · ${d.toLocaleDateString()} ${d.toLocaleTimeString().slice(0, 5)}</small></span>`);
        const acts = h('span', 'a');
        acts.append(crtAct('Resume', () => { sfx('confirm'); f.classList.add('go'); setTimeout(() => setLaunch({ mode: 'load', id: s.id }), 450); }));
        acts.append(crtAct('Delete', async () => {
          const ok = await confirmDialog({ title: 'Delete case file', body: `Delete ${s.character}'s file? This world and everything in it will be gone for good.`, ok: 'Delete', cancel: 'Keep', danger: true });
          if (!ok) return;
          await deleteSave(s.id);
          this.saves = this.saves.filter((q) => q !== s);
          f.classList.add('gone');
          setTimeout(() => { draw(); this.build(); (list.querySelector('button') as HTMLElement | null)?.focus(); }, 380);
        }, { danger: true }));
        f.append(acts);
        list.append(f);
      });
    };
    draw();
    this.openOver(list, 'Case files', `${this.saves.length} subject${this.saves.length === 1 ? '' : 's'} on file`);
  }

  /** the handset: host a room or dial into one */
  coop() {
    const box = h('div', 'tt3-coop');
    const field = (ph: string, aria: string) => { const i = h('input', 'tt3-field') as HTMLInputElement; i.placeholder = ph; i.spellcheck = false; i.setAttribute('aria-label', aria); return i; };
    const srv = field('ws://host:8787', 'Relay server');
    let saved = ''; try { saved = localStorage.getItem('noclip.server') || ''; } catch { /* storage blocked */ }
    srv.value = saved || defaultServerUrl();
    const remember = () => { try { localStorage.setItem('noclip.server', srv.value.trim()); } catch { /* ignore */ } };
    const lbl = (t: string) => h('div', 'tt3-lbl', esc(t));
    box.append(lbl('Exchange (relay server)'), srv);
    box.append(h('p', 'ct-dim tt3-small', 'Co-op runs through a relay (<code>npm start</code> in the project folder serves the game and the relay on port 8787). Everyone dials the same exchange. Up to 8 subjects.'));
    if (import.meta.env.VITE_SANDBOXED) box.append(h('p', 'ct-warn tt3-small', 'This copy runs in a sandboxed page that cannot open network connections, so co-op is unavailable here. Run the project with <code>npm start</code> to play together.'));
    const cols = h('div', 'tt3-cols');
    const hostBox = h('div', 'tt3-col', '<h4>Open a line · host</h4>');
    const rn = field('room name (optional)', 'Room name');
    const pw = field('password (optional)', 'Password');
    hostBox.append(rn, pw);
    hostBox.append(crtAct('Host a new world', async () => {
      remember();
      const server = srv.value.trim(), roomName = rn.value.trim(), pass = pw.value;
      this.closeOver();
      const r = await this.runIntake({ title: 'SUBJECT INTAKE · HOST' });
      if (!r) return;
      setLaunch({ mode: 'host', server, roomName: roomName || r.name, public: !pass, pass, ...r });
    }));
    if (this.saves.length) hostBox.append(crtAct('Host a saved world', () => {
      remember();
      const s = this.saves[0];
      setLaunch({ mode: 'host', server: srv.value.trim(), roomName: rn.value.trim() || s.character, public: !pw.value, pass: pw.value, saveId: s.id, name: s.character, app: null as any, occupation: '', traits: [], sandbox: {}, seed: 0, directives: true });
    }, { sub: this.saves[0].character }));
    const joinBox = h('div', 'tt3-col', '<h4>Dial in · join</h4>');
    const code = field('CODE', 'Room code'); code.maxLength = 5; code.classList.add('tt3-code');
    const jpw = field('password (if any)', 'Password');
    joinBox.append(code, jpw);
    const rooms = h('div', 'tt3-rooms');
    joinBox.append(crtAct('Join', async () => {
      if (code.value.trim().length < 4) { code.focus(); sfx('error'); return; }
      remember();
      const server = srv.value.trim(), room = code.value.trim(), pass = jpw.value;
      this.closeOver();
      const r = await this.runIntake({ title: 'SUBJECT INTAKE · JOIN', sandbox: false, submit: 'JOIN TEAM' });
      if (!r) return;
      setLaunch({ mode: 'join', server, room, pass, name: r.name, app: r.app, occupation: r.occupation, traits: r.traits });
    }));
    joinBox.append(crtAct('List open lines', async () => {
      rooms.textContent = 'ringing…';
      try {
        const u = new URL(srv.value.trim().replace(/^ws/, 'http'));
        u.pathname = '/rooms';
        const list: any[] = await (await fetch(u.toString())).json();
        rooms.innerHTML = list.length ? '' : 'No open lines.';
        for (const r of list) rooms.append(crtAct(`${r.room} · ${r.name} · ${r.players}/${r.max}${r.locked ? ' · locked' : ''}`, () => { code.value = r.room; }));
      } catch { rooms.textContent = 'Nobody picked up (could not reach the relay).'; }
    }));
    joinBox.append(rooms);
    cols.append(hostBox, joinBox);
    box.append(cols);
    for (const i of [srv, rn, pw, code, jpw]) { i.addEventListener('focus', () => { if (this.g.input) this.g.input.textFocus = true; }); i.addEventListener('blur', () => { if (this.g.input) this.g.input.textFocus = false; }); }
    this.openOver(box, 'Co-op', 'host a world or dial into one');
  }
}
