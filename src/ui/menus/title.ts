// Title screen. Behind the menu the real engine runs Level 0 with a lone
// wanderer drifting through the halls (attract mode), fluorescent hum and all.
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
import { h, esc, mbtn, optionsPanel, controlsPanel, applyGfx } from './common';
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
  document.getElementById('boot')?.classList.add('gone');
  new TitleMenu();
  (window as any).__game = g;
}

class TitleMenu {
  root = h('div', 'k-title');
  panel = h('div', 'k-title-panel');
  side = h('div', 'k-title-side');
  saves: SaveMeta[] = [];
  constructor() {
    this.root.append(this.panel, this.side);
    document.body.append(this.root);
    listSaves().then((s) => { this.saves = s; this.main(); });
    this.main();
  }
  private logo() {
    return h('div', 'k-logo', '<div class="k-logo-t" data-t="NOCLIP">NOCLIP</div><div class="k-logo-s">a survival simulation · Meridian Institute, 1987</div>');
  }
  private setSide(el: HTMLElement | null) { this.side.innerHTML = ''; if (el) { this.side.append(el); this.side.classList.add('on'); } else this.side.classList.remove('on'); }

  main() {
    const P = this.panel;
    P.innerHTML = '';
    P.append(this.logo());
    const list = h('div', 'k-title-menu');
    const last = this.saves[0];
    if (last) list.append(mbtn('Continue', () => setLaunch({ mode: 'load', id: last.id }), { sub: `${last.character} — day ${Math.floor(last.hours / 24) + 1}` }));
    list.append(mbtn('New simulation', () => this.newGame(true), { sub: 'wake up in Level 0 and find a way out' }));
    list.append(mbtn('Free survival', () => this.newGame(false), { sub: 'no directives, just the endless rooms' }));
    list.append(mbtn('Co-op', () => this.coop(), { sub: 'host or join friends' }));
    if (this.saves.length) list.append(mbtn('Load', () => this.loads()));
    list.append(mbtn('Options', () => this.setSide(this.card('OPTIONS', optionsPanel()))));
    list.append(mbtn('Controls', () => this.setSide(this.card('CONTROLS', controlsPanel()))));
    list.append(mbtn('About', () => this.setSide(this.card('ABOUT', about()))));
    P.append(list);
    P.append(h('div', 'k-title-foot', 'Hold V to talk in co-op · headphones recommended'));
    this.setSide(null);
  }

  private card(title: string, content: HTMLElement) {
    const c = h('div', 'k-card');
    c.append(h('div', 'k-card-h', esc(title)), content, mbtn('Close', () => this.setSide(null)));
    return c;
  }

  private async newGame(directives: boolean) {
    this.root.style.display = 'none';
    const r = await intakeForm({ directives });
    this.root.style.display = '';
    if (!r) return;
    setLaunch({ mode: 'new', ...r });
  }

  private loads() {
    const box = h('div', 'k-saves');
    const draw = () => {
      box.innerHTML = '';
      if (!this.saves.length) box.append(h('div', 'k-sheet-sub', 'No tapes.'));
      for (const s of this.saves) {
        const row = h('div', 'k-save');
        const d = new Date(s.savedAt);
        row.append(h('div', 'k-save-t', `<b>${esc(s.character)}</b><small>day ${Math.floor(s.hours / 24) + 1} · ${esc(s.zone)} · ${d.toLocaleDateString()} ${d.toLocaleTimeString().slice(0, 5)}</small>`));
        row.append(mbtn('Load', () => setLaunch({ mode: 'load', id: s.id })));
        row.append(mbtn('Erase', async () => { if (!confirm(`Erase ${s.character}'s tape?`)) return; await deleteSave(s.id); this.saves = this.saves.filter((q) => q !== s); draw(); }, { danger: true }));
        box.append(row);
      }
    };
    draw();
    this.setSide(this.card('TAPES', box));
  }

  private coop() {
    const box = h('div', 'k-coop');
    const srv = h('input', 'k-field') as HTMLInputElement;
    let saved = ''; try { saved = localStorage.getItem('noclip.server') || ''; } catch { /* storage blocked */ }
    srv.value = saved || defaultServerUrl();
    const remember = () => { try { localStorage.setItem('noclip.server', srv.value.trim()); } catch { /* ignore */ } };
    box.append(h('div', 'k-lbl', 'Relay server'), srv);
    box.append(h('div', 'k-sheet-sub', 'Co-op runs through a NOCLIP relay (<code>npm start</code> in the project folder serves the game and the relay on port 8787). Everyone uses the same address.'));
    if (import.meta.env.VITE_SANDBOXED) box.append(h('div', 'k-sheet-sub k-warn', 'This copy runs in a sandboxed page that cannot open network connections, so co-op is unavailable here. Run the project with <code>npm start</code> to play together.'));
    // host
    const hostBox = h('div', 'k-coop-col');
    hostBox.append(h('h4', '', 'HOST'));
    const rn = h('input', 'k-field') as HTMLInputElement; rn.placeholder = 'room name (optional)';
    const pw = h('input', 'k-field') as HTMLInputElement; pw.placeholder = 'password (optional)';
    hostBox.append(rn, pw);
    hostBox.append(mbtn('Host a new world', async () => {
      remember();
      this.root.style.display = 'none';
      const r = await intakeForm({ title: 'FIELD TEAM INTAKE (HOST)' });
      this.root.style.display = '';
      if (!r) return;
      setLaunch({ mode: 'host', server: srv.value.trim(), roomName: rn.value.trim() || r.name, public: !pw.value, pass: pw.value, ...r });
    }));
    if (this.saves.length) hostBox.append(mbtn('Host a saved world', () => {
      remember();
      const s = this.saves[0];
      setLaunch({ mode: 'host', server: srv.value.trim(), roomName: rn.value.trim() || s.character, public: !pw.value, pass: pw.value, saveId: s.id, name: s.character, app: null as any, occupation: '', traits: [], sandbox: {}, seed: 0, directives: true });
    }, { sub: this.saves[0].character }));
    // join
    const joinBox = h('div', 'k-coop-col');
    joinBox.append(h('h4', '', 'JOIN'));
    const code = h('input', 'k-field k-code') as HTMLInputElement; code.placeholder = 'ROOM CODE'; code.maxLength = 5;
    const jpw = h('input', 'k-field') as HTMLInputElement; jpw.placeholder = 'password (if any)';
    joinBox.append(code, jpw);
    const rooms = h('div', 'k-rooms');
    joinBox.append(mbtn('Join', async () => {
      if (code.value.trim().length < 4) { code.focus(); return; }
      remember();
      this.root.style.display = 'none';
      const r = await intakeForm({ title: 'FIELD TEAM INTAKE (JOIN)', sandbox: false, submit: 'JOIN TEAM' });
      this.root.style.display = '';
      if (!r) return;
      setLaunch({ mode: 'join', server: srv.value.trim(), room: code.value.trim(), pass: jpw.value, name: r.name, app: r.app, occupation: r.occupation, traits: r.traits });
    }));
    joinBox.append(mbtn('List open rooms', async () => {
      rooms.innerHTML = '…';
      try {
        const u = new URL(srv.value.trim().replace(/^ws/, 'http'));
        u.pathname = '/rooms';
        const list: any[] = await (await fetch(u.toString())).json();
        rooms.innerHTML = list.length ? '' : 'No open rooms.';
        for (const r of list) { const b = h('button', 'k-chip', `${esc(r.room)} · ${esc(r.name)} · ${r.players}/${r.max}${r.locked ? ' 🔒' : ''}`); b.onclick = () => { code.value = r.room; }; rooms.append(b); }
      } catch { rooms.textContent = 'Could not reach the relay.'; }
    }));
    joinBox.append(rooms);
    const cols = h('div', 'k-coop-cols'); cols.append(hostBox, joinBox);
    box.append(cols);
    this.setSide(this.card('CO-OP', box));
  }
}

function about(): HTMLElement {
  return h('div', 'k-about', `
<p><b>NOCLIP</b> is a survival sandbox about being lost inside CONTINUITY, a simulation that never stopped building rooms.</p>
<p>Scavenge, craft, cook, farm, barricade and survive injuries, hunger, cold and fear. Study what lives in the halls. Restore the power, follow the signals, shut the render nodes down — or just live there.</p>
<p class="k-small">Inspired by the systemic survival of <i>Project Zomboid</i>, the original 2019 “noclip into the backrooms” creepypasta, liminal-space photography and dreamcore. All names, places, creatures and story here are original. Built with three.js. Fonts: VT323, Silkscreen, Pixelify Sans, DotGothic16, Jacquard 12, Handjet (SIL Open Font License). Every texture, model and sound is generated in code.</p>`);
}
