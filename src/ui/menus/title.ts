// Title screen. Behind the menu the real engine runs Level 0 with a lone
// wanderer drifting through the halls (attract mode), fluorescent hum and all,
// seen through the glass of a Meridian continuity terminal.
import { Game } from '../../game/game';
import { Player } from '../../entities/player';
import { randomAppearance } from '../../entities/humanRig';
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
import { h, esc, mbtn, optionsPanel, controlsPanel, applyGfx, frame, confirmDialog, printIn, FocusNav, sfx } from './common';
import { runBoot } from './boot';
import '../../world/zones';
import '../../game/worldOps';

export function showTitle() {
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const g = new Game(canvas);
  g.worldSeed = 1000 + Math.floor(Math.random() * 9000);
  applyGfx();
  const audio = new AudioEngine();
  g.audio = audio;
  g.addSystem({ name: 'audio', update: (dt) => audio.update(dt) });
  const p = new Player('attract', 'Somebody', randomAppearance(Math.random), true);
  for (const k of ['shirt_office', 'tshirt', 'jeans', 'sneakers']) if (hasItemDef(k)) { const it = createItem(k); p.inv.add(it); p.wear(it); }
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
    const speed = 1.25;
    p.targetFacing = Math.atan2(dz, dx);
    p.turn(dt, 6);
    moveCircle(z, p, (dx / d) * speed * dt, (dz / d) * speed * dt);
    p.speed = speed;
    if (rng.next() < dt * 0.02) pause = 2 + rng.next() * 3; // stops to listen
  };
  g.start();
  (window as any).__game = g;
  runBoot().then(() => new TitleMenu());
  // the boot screen covers the engine warming up
  setTimeout(() => document.getElementById('boot')?.classList.add('gone'), 60);
}

const BULLETINS = [
  'MERIDIAN BULLETIN: REMAIN CALM. THE ROOMS ARE TEMPORARY.',
  'REMINDER: DO NOT FOLLOW THE HUMMING.',
  'FIELD OFFICE: ALMOND WATER RATIONS RESUME AT 08:30.',
  'IF YOU CAN READ THIS YOU HAVE ALREADY NOCLIPPED. PLEASE STAY WHERE YOU ARE.',
  'CONTINUITY IS A SHARED RESPONSIBILITY.',
  'LOST PERSONNEL: CHECK THE STAIRWELLS. THEN CHECK THEM AGAIN.',
  'THE EXIT IS NOT A RUMOUR. THE EXIT IS NOT A RUMOUR.',
];

class TitleMenu {
  root = h('div', 't-title');
  panel: HTMLElement;
  menu = h('div', 't-title-menu');
  side = h('div', 't-title-side');
  saves: SaveMeta[] = [];
  nav: FocusNav;
  sideNav: FocusNav | null = null;
  private lastBtn: HTMLElement | null = null;
  private clockT = 0;

  constructor() {
    const f = frame('Meridian continuity terminal', 't-title-panel crt-host', 'T-07');
    this.panel = f.el;
    f.screen.classList.add('crt-on');
    f.body.append(this.logo(), this.sysline(), this.menu, this.ticker(), this.foot());
    this.root.append(h('div', 't-title-scr'), this.panel, this.side);
    document.body.append(this.root);
    this.nav = new FocusNav(this.panel, { onBack: () => this.setSide(null) });
    listSaves().then((s) => { this.saves = s; this.main(); }).catch(() => this.main());
    this.main(true);
    (window as any).__title = this;
  }
  private logo() {
    return h('div', 't-logo', '<div class="t-logo-t" data-t="NOCLIP">NOCLIP</div><div class="t-logo-s">continuity survival simulation · <b>meridian institute</b> 1987</div>');
  }
  private sysline() {
    const el = h('div', 't-sysline', '<span>SIM LINK: <b>UNSTABLE</b></span><span class="clk"></span>');
    const clk = el.querySelector('.clk') as HTMLElement;
    const tick = () => {
      if (!el.isConnected && this.clockT) return;
      const d = new Date();
      clk.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
      this.clockT = window.setTimeout(tick, 1000);
    };
    tick();
    return el;
  }
  private ticker() {
    const el = h('div', 't-ticker');
    const sp = h('span', '', esc(BULLETINS.slice().sort(() => Math.random() - 0.5).join('   ///   ')));
    el.append(sp);
    return el;
  }
  private foot() {
    return h('div', 't-title-foot', '<span>↑↓ select · enter open · esc back</span><span class="blk">ready</span>');
  }
  private setSide(el: HTMLElement | null, focusFirst = true) {
    this.sideNav?.destroy(); this.sideNav = null;
    this.side.innerHTML = '';
    if (el) {
      this.side.append(el);
      this.side.classList.add('on');
      this.root.classList.add('side-open');
      this.sideNav = new FocusNav(el, { onBack: () => this.setSide(null), autofocus: focusFirst, onTab: (d) => (el as any)._tab?.(d) });
    } else {
      const was = this.side.classList.contains('on');
      this.side.classList.remove('on');
      this.root.classList.remove('side-open');
      if (was) { sfx('back'); (this.lastBtn || this.menu.querySelector('button'))?.focus({ preventScroll: true }); }
    }
  }

  main(first = false) {
    const M = this.menu;
    const focusedIdx = [...M.children].indexOf(document.activeElement as HTMLElement);
    M.innerHTML = '';
    const last = this.saves[0];
    const add = (b: HTMLElement) => { b.addEventListener('focus', () => { this.lastBtn = b; }); M.append(b); };
    if (last) add(mbtn('Continue', () => setLaunch({ mode: 'load', id: last.id }), { sub: `${last.character} — day ${Math.floor(last.hours / 24) + 1}`, primary: true }));
    add(mbtn('New simulation', () => this.newGame(true), { sub: 'wake up in Level 0 and find a way out', primary: !last }));
    add(mbtn('Free survival', () => this.newGame(false), { sub: 'no directives, just the endless rooms' }));
    add(mbtn('Co-op', () => this.coop(), { sub: 'host or join friends' }));
    if (this.saves.length) add(mbtn('Load tape', () => this.loads(), { sub: `${this.saves.length} on file` }));
    add(mbtn('Options', () => this.options()));
    add(mbtn('Controls', () => this.setSide(this.win('CONTROLS', controlsPanel()))));
    add(mbtn('About', () => this.setSide(this.win('ABOUT', about()))));
    printIn([...M.children] as HTMLElement[], first ? 60 : 0);
    const fb = (M.children[Math.max(0, focusedIdx)] || M.children[0]) as HTMLElement;
    if (!this.side.classList.contains('on') && this.root.isConnected && this.root.style.display !== 'none') requestAnimationFrame(() => fb?.focus({ preventScroll: true }));
  }

  private win(title: string, content: HTMLElement, foot?: HTMLElement[]) {
    const f = frame(title, 't-win', 'MERIDIAN');
    f.screen.classList.add('crt-on');
    const body = h('div', 't-win-body');
    body.append(content);
    const ft = h('div', 't-win-foot');
    for (const b of foot || []) ft.append(b);
    ft.append(mbtn('Close', () => this.setSide(null), { key: 'ESC' }));
    f.body.append(body, ft);
    sfx('open', 0.7);
    return f.el;
  }

  private options() {
    let tabFn: ((d: -1 | 1) => void) | null = null;
    const w = this.win('OPTIONS', optionsPanel({ onTab: (fn) => { tabFn = fn; } }));
    (w as any)._tab = (d: -1 | 1) => tabFn?.(d);
    this.setSide(w);
  }

  private async newGame(directives: boolean) {
    this.root.style.display = 'none';
    const r = await intakeForm({ directives });
    this.root.style.display = '';
    if (!r) { (this.lastBtn || this.menu.querySelector('button'))?.focus({ preventScroll: true }); return; }
    setLaunch({ mode: 'new', ...r });
  }

  private loads() {
    const box = h('div', 't-saves');
    const draw = () => {
      box.innerHTML = '';
      if (!this.saves.length) box.append(h('div', 't-note', 'No tapes on file.'));
      this.saves.forEach((s, i) => {
        const row = h('div', 't-save');
        const d = new Date(s.savedAt);
        row.append(h('div', 't-save-ico', `T${String(i + 1).padStart(2, '0')}`));
        row.append(h('div', 't-save-t', `<b>${esc(s.character)}</b><small>day ${Math.floor(s.hours / 24) + 1} · ${esc(s.zone)} · ${d.toLocaleDateString()} ${d.toLocaleTimeString().slice(0, 5)}</small>`));
        row.append(mbtn('Load', () => setLaunch({ mode: 'load', id: s.id }), { primary: true }));
        row.append(mbtn('Erase', async () => {
          const ok = await confirmDialog({ title: 'ERASE TAPE', body: `Erase ${s.character}'s tape? This world and everything in it will be gone for good.`, ok: 'Erase', cancel: 'Keep', danger: true });
          if (!ok) return;
          await deleteSave(s.id);
          this.saves = this.saves.filter((q) => q !== s);
          draw();
          this.main();
          (box.querySelector('button') as HTMLElement | null)?.focus();
        }, { danger: true }));
        box.append(row);
      });
    };
    draw();
    this.setSide(this.win('TAPES', box));
  }

  private coop() {
    const box = h('div', 't-coop');
    const srv = h('input', 't-field') as HTMLInputElement;
    let saved = ''; try { saved = localStorage.getItem('noclip.server') || ''; } catch { /* storage blocked */ }
    srv.value = saved || defaultServerUrl();
    srv.spellcheck = false;
    const remember = () => { try { localStorage.setItem('noclip.server', srv.value.trim()); } catch { /* ignore */ } };
    box.append(h('div', 't-lbl', 'Relay server'), srv);
    box.append(h('div', 't-note', 'Co-op runs through a NOCLIP relay (<code>npm start</code> in the project folder serves the game and the relay on port 8787). Everyone uses the same address.'));
    if (import.meta.env.VITE_SANDBOXED) box.append(h('div', 't-note t-warn', 'This copy runs in a sandboxed page that cannot open network connections, so co-op is unavailable here. Run the project with <code>npm start</code> to play together.'));
    // host
    const hostBox = h('div', 't-coop-col');
    hostBox.append(h('h4', '', 'HOST'));
    const rn = h('input', 't-field') as HTMLInputElement; rn.placeholder = 'room name (optional)';
    const pw = h('input', 't-field') as HTMLInputElement; pw.placeholder = 'password (optional)';
    hostBox.append(rn, pw);
    hostBox.append(mbtn('Host a new world', async () => {
      remember();
      this.root.style.display = 'none';
      const r = await intakeForm({ title: 'FIELD TEAM INTAKE — HOST' });
      this.root.style.display = '';
      if (!r) return;
      setLaunch({ mode: 'host', server: srv.value.trim(), roomName: rn.value.trim() || r.name, public: !pw.value, pass: pw.value, ...r });
    }, { primary: true }));
    if (this.saves.length) hostBox.append(mbtn('Host a saved world', () => {
      remember();
      const s = this.saves[0];
      setLaunch({ mode: 'host', server: srv.value.trim(), roomName: rn.value.trim() || s.character, public: !pw.value, pass: pw.value, saveId: s.id, name: s.character, app: null as any, occupation: '', traits: [], sandbox: {}, seed: 0, directives: true });
    }, { sub: this.saves[0].character }));
    // join
    const joinBox = h('div', 't-coop-col');
    joinBox.append(h('h4', '', 'JOIN'));
    const code = h('input', 't-field t-code') as HTMLInputElement; code.placeholder = 'CODE'; code.maxLength = 5; code.spellcheck = false;
    const jpw = h('input', 't-field') as HTMLInputElement; jpw.placeholder = 'password (if any)';
    joinBox.append(code, jpw);
    const rooms = h('div', 't-rooms');
    joinBox.append(mbtn('Join', async () => {
      if (code.value.trim().length < 4) { code.focus(); sfx('error'); return; }
      remember();
      this.root.style.display = 'none';
      const r = await intakeForm({ title: 'FIELD TEAM INTAKE — JOIN', sandbox: false, submit: 'JOIN TEAM' });
      this.root.style.display = '';
      if (!r) return;
      setLaunch({ mode: 'join', server: srv.value.trim(), room: code.value.trim(), pass: jpw.value, name: r.name, app: r.app, occupation: r.occupation, traits: r.traits });
    }, { primary: true }));
    joinBox.append(mbtn('List open rooms', async () => {
      rooms.textContent = 'scanning…';
      try {
        const u = new URL(srv.value.trim().replace(/^ws/, 'http'));
        u.pathname = '/rooms';
        const list: any[] = await (await fetch(u.toString())).json();
        rooms.innerHTML = list.length ? '' : 'No open rooms.';
        for (const r of list) { const b = h('button', 't-chip', `${esc(r.room)} · ${esc(r.name)} · ${r.players}/${r.max}${r.locked ? ' [locked]' : ''}`); b.onclick = () => { code.value = r.room; sfx('click'); }; rooms.append(b); }
      } catch { rooms.textContent = 'Could not reach the relay.'; }
    }));
    joinBox.append(rooms);
    const cols = h('div', 't-coop-cols'); cols.append(hostBox, joinBox);
    box.append(cols);
    this.setSide(this.win('CO-OP', box));
  }
}

function about(): HTMLElement {
  return h('div', 't-about', `
<p><b>NOCLIP</b> is a survival sandbox about being lost inside CONTINUITY, a simulation that never stopped building rooms.</p>
<p>Scavenge, craft, cook, farm, barricade and survive injuries, hunger, cold and fear. Study what lives in the halls. Restore the power, follow the signals, shut the render nodes down — or just live there.</p>
<p class="t-small">Inspired by the systemic survival of <i>Project Zomboid</i>, the original 2019 “noclip into the backrooms” creepypasta, liminal-space photography and dreamcore. All names, places, creatures and story here are original. Built with three.js. Fonts: Workbench, Sixtyfour, Share Tech Mono, VT323, Big Shoulders Stencil (SIL Open Font License). Every texture, model and sound is generated in code.</p>`);
}
