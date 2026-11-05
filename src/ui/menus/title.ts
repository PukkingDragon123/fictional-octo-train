// Title screen: THE MONITOR ROOM (monitor/monitorRoom.ts), a dim Meridian
// observation booth whose bank of CRTs shows three live feeds: the monster
// containment (rooms/containment.ts), the experiment lab (rooms/lab.ts) and
// subject room 4 (the SubjectRoom of room3d.ts, rooms/subject.ts). The menu is
// plain floating words in the game's font (Alagard, ink outline) over the dark
// side of the booth; the three feed tubes are hot, and so are the switches,
// the microphone, the mug, the lamp, the phone, the chair and the window.
// Click a feed (or its DOM twin, or press 1-3) and the camera dives into the
// tube; a CRT cut drops you into that room, where you can look around and
// poke things; Q / E (or the arrows in the HUD) change channel, Esc goes back
// to the monitors. NEW SUBJECT goes to the subject room and the lights come on
// for the creator (intake.ts). SETTINGS sits beside a real 3D steel gear
// (gears3d.ts); CONTROLS, ABOUT, CO-OP and the CASE FILES open on a green
// phosphor terminal (terminal.ts).
import { Game } from '../../game/game';
import { randomAppearance } from '../../entities/humanRig';
import { randomLooks } from '../../entities/humanLooks';
import { AudioEngine } from '../../audio/audio';
import { listSaves, deleteSave, SaveMeta } from '../../game/save';
import { setLaunch } from '../../game/launch';
import { defaultServerUrl } from '../../net/net';
import { intakeForm, prisonerOutfitFor } from './intake';
import { h, esc, optionsPanel, controlsPanel, applyGfx, confirmDialog, FocusNav, sfx, type OptionsApi } from './common';
import { SubjectRoom } from './room3d';
import { installRetroKit } from './retroKit';
import { ambience } from './sfx';
import { plateBtn } from './btnKit';
import { terminal, crtAct, type Terminal } from './terminal';
import './float.css';
import { gearButton, gearCluster, type GearButton, type GearCluster } from './gears3d';
import '../../world/zones';
import '../../game/worldOps';
import './noir.css';
import { facetMats } from './scene/pixtex';
import { bitReady } from '../../gfx/bitfont';
import { MenuStage, type Hot } from './monitor/stage';
import { MonitorRoom, FEEDS, type FeedKey } from './monitor/monitorRoom';
import { CrtFx } from './monitor/crtfx';
import { setRoomAudio } from './monitor/props';
import { ContainmentRoom } from './rooms/containment';
import { LabRoom } from './rooms/lab';
import { SubjectView } from './rooms/subject';
import { registerMenuRoom, setActiveMenuRoom, type MenuRoomId } from './menuRooms';
import * as THREE from 'three';

export function showTitle() {
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const g = new Game(canvas);
  g.worldSeed = 1000 + Math.floor(Math.random() * 9000);
  applyGfx();
  installRetroKit();
  const audio = new AudioEngine();
  g.audio = audio;
  // the world itself never draws behind the title: the rooms are their own small scenes
  (g as any).holdFeed = () => {};
  (window as any).__game = g;
  setRoomAudio(audio);
  const t = new TitleRoom(g);
  t.show();
  document.getElementById('boot')?.classList.add('gone');
}

interface Item { key: string; label: string; sub: string; act: () => void; size?: 'lg' | 'md' | 'sm' }
type View = 'monitor' | FeedKey;
type Acting = { actions: { key: string; label: string; run: () => void }[]; pointer(nx: number, ny: number): void };

/** the room's camera hooks */
type RoomCam = { shot?: (k: string, ms?: number) => void; setFraming?: (dx: number | null, dy?: number | null) => void };
const ORDER: FeedKey[] = ['containment', 'lab', 'subject'];

class TitleRoom {
  root = h('div', 'nx nx-title mr');
  stageHost = h('div', 'nx-stage mr-stage');
  subjHost = h('div', 'nx-stage mr-subj feed');
  menu = h('nav', 'tt3-menu');
  cap = h('div', 'tt3-cap kf');
  hotcap = h('div', 'mr-hotcap');
  feedNav = h('div', 'mr-feeds');
  hud = h('div', 'mr-hud');
  foot = h('div', 'tt3-foot kf', '<span>arrows · enter · esc · 1 2 3 feeds</span><span>Observation · Meridian Institute</span>');
  over = h('div', 'nx-over');
  room: SubjectRoom;
  stage: MenuStage;
  fx: CrtFx;
  monitor: MonitorRoom | null = null;
  containment: ContainmentRoom | null = null;
  lab: LabRoom | null = null;
  subject: SubjectView;
  view: View = 'monitor';
  saves: SaveMeta[] = [];
  nav: FocusNav | null = null;
  overNav: FocusNav | null = null;
  private btns = new Map<string, HTMLButtonElement | GearButton>();
  private feedBtns = new Map<FeedKey, HTMLButtonElement>();
  private gear: GearButton | null = null;
  private cluster: GearCluster | null = null;
  private lastKey = 'new';
  private live = false;
  private moving = false;
  private app = { ...randomAppearance(Math.random), ...randomLooks(Math.random, Math.random() < 0.5) };
  private g: Game;
  private term: Terminal | null = null;
  private hotT = 0;
  private hudCam: HTMLElement | null = null;
  private tcT = 0;

  constructor(g: Game) {
    this.g = g;
    this.root.append(this.stageHost, this.subjHost, this.menu, this.feedNav, this.hud, this.hotcap, this.foot, this.over);
    document.body.append(this.root);
    this.fx = new CrtFx(this.root);
    // the subject room first (its frame runs before the stage's each animation frame: the feed copy relies on it)
    this.room = new SubjectRoom(this.subjHost);
    this.room.setAppearance(this.app);
    this.room.setOutfit(prisonerOutfitFor(this.app));
    this.subject = new SubjectView(this.room, this.subjHost);
    this.subjHost.addEventListener('pointerup', (e) => this.subjectTap(e));
    this.stage = new MenuStage(this.stageHost);
    this.stage.onTick = (dt) => this.tick(dt);
    this.stage.onHot = (hh, x, y) => this.hotCaption(hh, x, y);
    this.stage.onPointer = (x, y) => this.pointer(x, y);
    this.root.dataset.view = 'monitor';
    listSaves().then((s) => { this.saves = s; this.build(); }).catch(() => this.build());
    this.build();
    window.addEventListener('keydown', this.onKey, true);
    bitReady().then(() => this.buildRooms()).catch(() => this.buildRooms());
    if (import.meta.env.DEV) (window as any).__title = this;
  }

  /** the three stage rooms (after the pixel font is ready: their labels are drawn with it) */
  private buildRooms() {
    if (this.monitor) return;
    const mats = facetMats(this.stage.low);
    const mon = this.monitor = new MonitorRoom(mats);
    const con = this.containment = new ContainmentRoom(mats);
    const lab = this.lab = new LabRoom(mats);
    this.stage.add(mon); this.stage.add(con); this.stage.add(lab);
    this.stage.show('monitor');
    mon.setFeedTexture('containment', this.stage.feed('containment', 160, 120, 10), true);
    mon.setFeedTexture('lab', this.stage.feed('lab', 160, 120, 10), true);
    mon.setFeedTexture('subject', this.subject.tex, false);
    mon.onFeed = (k) => { void this.go(k); };
    mon.onMic = () => con.fromMonitor();
    const reg = (id: MenuRoomId, r: { scene: THREE.Scene; cam: THREE.Camera; deco: THREE.Group; floor: any; surfaces: any; guideSpot: any }) =>
      registerMenuRoom({ id, scene: r.scene, camera: r.cam, deco: r.deco, floor: r.floor, surfaces: r.surfaces, guideSpot: r.guideSpot, host: this.stageHost, pick: (x, y) => this.pickFloor(x, y, r.floor.y, r.surfaces) });
    reg('monitor', mon); reg('containment', con); reg('lab', lab);
    setActiveMenuRoom('monitor');
    this.buildFeedButtons();
  }
  /** a pointer ray onto the room's floor or the highest surface it crosses */
  private pickFloor(x: number, y: number, floorY: number, surfaces: { minX: number; maxX: number; minZ: number; maxZ: number; y: number }[] = []): THREE.Vector3 | null {
    const ray = this.stage.rayAt(x, y);
    if (!ray) return null;
    let best: THREE.Vector3 | null = null, bd = Infinity;
    for (const s of surfaces) {
      const p = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -s.y), new THREE.Vector3());
      if (p && p.x >= s.minX && p.x <= s.maxX && p.z >= s.minZ && p.z <= s.maxZ) { const d = p.distanceTo(ray.origin); if (d < bd) { bd = d; best = p; } }
    }
    if (best) return best;
    return ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorY), new THREE.Vector3());
  }

  private portrait() { return window.innerHeight > window.innerWidth * 1.05; }

  show() {
    this.live = true;
    this.root.classList.add('on');
    this.nav = new FocusNav(this.root, { onBack: () => this.onBack(), onTab: (d) => this.channel(d) });
    this.focusKey(this.lastKey);
    ambience('room');
    this.menu.classList.add('in');
  }

  // ================================================================== the menu words
  private build() {
    const last = this.saves[0];
    const pt = this.portrait();
    const items: Item[] = [];
    if (last) items.push({ key: 'continue', label: 'Resume', sub: `${last.character} · day ${Math.floor(last.hours / 24) + 1}`, act: () => this.play(last), size: 'lg' });
    items.push({ key: 'new', label: 'New subject', sub: 'to subject room 4 · the contract · pay the debt', act: () => this.newGame(true), size: 'lg' });
    items.push({ key: 'free', label: 'Release', sub: 'free survival · no contract · no band', act: () => this.newGame(false), size: pt ? 'md' : 'lg' });
    items.push({ key: 'coop', label: 'Co-op', sub: 'call another cell · host or dial in', act: () => this.coop(), size: pt ? 'sm' : 'md' });
    if (this.saves.length) items.push({ key: 'load', label: 'Case files', sub: `${this.saves.length} subject${this.saves.length === 1 ? '' : 's'} on file`, act: () => this.loads(), size: pt ? 'sm' : 'md' });
    items.push({ key: 'controls', label: 'Controls', sub: 'keys · touch · gamepad', act: () => this.controls(), size: pt ? 'sm' : 'md' });
    items.push({ key: 'about', label: 'About', sub: 'what this place is', act: () => this.about(), size: pt ? 'sm' : 'md' });
    this.menu.innerHTML = '';
    this.menu.classList.add('ft-menu');
    this.menu.append(this.cap);
    this.btns.clear();
    items.forEach((it, i) => {
      const b = h('button', `ft-item ft-${it.size ?? 'md'}`, `<span class="ft-ptr" aria-hidden="true"></span><span class="ft-lab">${esc(it.label)}</span>`) as HTMLButtonElement;
      b.type = 'button';
      b.dataset.k = it.key;
      b.style.setProperty('--ft-i', String(i));
      b.setAttribute('aria-label', `${it.label} — ${it.sub}`);
      b.addEventListener('focus', () => { this.lastKey = it.key; this.caption(it, b); });
      b.addEventListener('pointerenter', () => { if (document.activeElement !== b) { b.focus({ preventScroll: true }); sfx('tick', 0.4); } });
      b.addEventListener('click', () => this.activate(it));
      this.menu.append(b);
      this.btns.set(it.key, b);
    });
    this.gear?.dispose();
    const gi: Item = { key: 'options', label: 'Settings', sub: 'sound · picture · interface', act: () => this.options() };
    const gb = gearButton('Settings', () => this.activate(gi), { aria: 'Settings — sound · picture · interface' });
    gb.dataset.k = 'options';
    gb.classList.add('tt4-gear');
    gb.addEventListener('focus', () => { this.lastKey = 'options'; this.caption(gi, gb); });
    this.menu.append(gb);
    this.btns.set('options', gb);
    this.gear = gb;
    if (this.live) { this.menu.classList.add('in'); if (this.view === 'monitor') this.focusKey(this.btns.has(this.lastKey) ? this.lastKey : 'new'); }
  }
  private focusKey(k: string) { requestAnimationFrame(() => (this.btns.get(k) ?? this.feedBtns.get(k as FeedKey))?.focus({ preventScroll: true })); }
  private caption(it: { sub: string }, b: HTMLElement) {
    if (this.cap.parentElement !== this.menu) this.menu.append(this.cap);
    this.cap.innerHTML = `<small>${esc(it.sub)}</small>`;
    const cy = b.offsetHeight / 2;
    this.cap.style.top = this.portrait() ? '' : Math.round(b.offsetTop + cy) + 'px';
    this.cap.style.left = this.portrait() ? '' : Math.round(b.offsetLeft + b.offsetWidth + 34) + 'px';
    this.cap.classList.remove('in'); void this.cap.offsetWidth; this.cap.classList.add('in');
  }
  private busy = false;
  private activate(it: Item) {
    if (this.busy || this.room.busy || this.moving) return;
    this.busy = true;
    sfx(it.key === 'new' || it.key === 'continue' ? 'confirm' : 'plate');
    setTimeout(() => { this.busy = false; it.act(); }, 260);
  }

  // ================================================================== the feeds' DOM twins
  private buildFeedButtons() {
    this.feedNav.innerHTML = '';
    FEEDS.forEach((f, i) => {
      const b = h('button', 'mr-feed', `<i></i><i></i><i></i><i></i><span class="mr-feed-n">${i + 1}</span>`) as HTMLButtonElement;
      b.type = 'button';
      b.dataset.k = f.key;
      b.setAttribute('aria-label', `${f.label} — ${f.sub} (${i + 1})`);
      b.addEventListener('focus', () => { this.lastKey = f.key; this.monitor?.leanTo(f.key); this.stage.hoverKey('feed:' + f.key); this.feedCaption(f.key); });
      b.addEventListener('blur', () => { this.monitor?.leanTo(null); this.stage.hoverKey(null); this.hotcap.classList.remove('on'); });
      b.addEventListener('pointerenter', () => { if (document.activeElement !== b) b.focus({ preventScroll: true }); });
      b.addEventListener('click', () => { void this.go(f.key); });
      this.feedNav.append(b);
      this.feedBtns.set(f.key, b);
    });
  }
  /** keep the twins over the tubes (the camera drifts) */
  private placeFeedButtons() {
    const mon = this.monitor;
    if (!mon || this.view !== 'monitor') return;
    const r = this.root.getBoundingClientRect();
    for (const f of FEEDS) {
      const b = this.feedBtns.get(f.key);
      if (!b) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const c of mon.feedCorners(f.key)) { const p = this.stage.project(c); if (!p) continue; x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
      if (!isFinite(x0)) continue;
      const w = Math.max(44, x1 - x0), hh = Math.max(44, y1 - y0);
      b.style.transform = `translate(${Math.round(x0 - r.left - (w - (x1 - x0)) / 2)}px, ${Math.round(y0 - r.top - (hh - (y1 - y0)) / 2)}px)`;
      b.style.width = Math.round(w) + 'px'; b.style.height = Math.round(hh) + 'px';
    }
  }
  private feedCaption(k: FeedKey) {
    const f = FEEDS.find((q) => q.key === k)!, b = this.feedBtns.get(k);
    if (!b) return;
    const r = b.getBoundingClientRect();
    this.showHotcap(f.label, f.sub, r.left + r.width / 2, r.bottom + 8, true);
  }
  private showHotcap(label: string, sub: string | undefined, x: number, y: number, center = false) {
    const c = this.hotcap;
    c.innerHTML = `<b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}`;
    c.classList.add('on');
    c.classList.toggle('mid', center);
    const W = window.innerWidth, H = window.innerHeight;
    const cw = c.offsetWidth || 200, ch = c.offsetHeight || 40;
    const px = center ? Math.max(8, Math.min(W - cw - 8, x - cw / 2)) : Math.max(8, Math.min(W - cw - 8, x + 18));
    const py = Math.max(8, Math.min(H - ch - 8, y + (center ? 0 : 18)));
    c.style.transform = `translate(${Math.round(px)}px, ${Math.round(py)}px)`;
  }
  private hotCaption(hh: Hot | null, x: number, y: number) {
    if (!hh) { if (!(document.activeElement as HTMLElement)?.classList?.contains('mr-feed')) this.hotcap.classList.remove('on'); return; }
    if (x < 0) return;
    this.showHotcap(hh.label, hh.sub, x, y);
    this.hotT = 2.5;
  }
  private pointer(x: number, y: number) {
    const nx = (x / window.innerWidth) * 2 - 1, ny = (y / window.innerHeight) * 2 - 1;
    const r = this.roomOf(this.view);
    if (this.view === 'monitor') this.monitor?.pointer(nx, ny);
    else (r as Acting | null)?.pointer(nx, ny);
  }
  private roomOf(v: View) { return v === 'monitor' ? this.monitor : v === 'containment' ? this.containment : v === 'lab' ? this.lab : null; }

  // ================================================================== frame hook
  private tick(dt: number) {
    this.subject.tick(dt);
    this.placeFeedButtons();
    if (this.hotT > 0) { this.hotT -= dt; if (this.hotT <= 0 && !this.stage.hovered && !(document.activeElement as HTMLElement)?.classList?.contains('mr-feed')) this.hotcap.classList.remove('on'); }
    this.tcT -= dt;
    if (this.tcT <= 0 && this.hudCam) {
      this.tcT = 0.5;
      const n = new Date();
      const tc = this.hudCam.querySelector('.tc');
      if (tc) tc.textContent = `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}:${String(n.getSeconds()).padStart(2, '0')}`;
      this.hudCam.classList.toggle('blink');
    }
  }

  // ================================================================== moving between rooms
  /** into a room: dive into its tube from the monitors, or switch channel from another room */
  async go(k: FeedKey) {
    if (this.moving || this.view === k || !this.monitor) return;
    if (this.over.classList.contains('on')) this.closeOver();
    this.moving = true;
    this.hotcap.classList.remove('on');
    const mon = this.monitor;
    try {
      if (this.view === 'monitor') {
        sfx('confirm');
        (document.activeElement as HTMLElement | null)?.blur?.();
        this.root.classList.add('diving');
        const tube = mon.tube(k);
        const t0 = performance.now();
        const snow = () => { const e = (performance.now() - t0) / 720; tube.snow = Math.max(0, Math.min(1, (e - 0.55) / 0.45)); if (e < 1.2 && this.moving) requestAnimationFrame(snow); };
        requestAnimationFrame(snow);
        await mon.dive(k);
        sfx('shutter', 0.6);
        await this.fx.play('snow', 240);
        tube.snow = 0;
      } else {
        sfx('relay', 0.8);
        const i = ORDER.indexOf(k);
        await this.fx.play('snow', 420, `CH ${i + 1}`);
      }
      this.enter(k);
      sfx('hum', 0.5);
      await this.fx.play('on', 520);
    } finally {
      this.moving = false;
      this.root.classList.remove('diving');
    }
  }
  private enter(k: View) {
    this.view = k;
    this.root.dataset.view = k;
    if (k === 'subject') {
      this.subject.setMode('full');
      this.stage.paused = true;
      this.room.setFraming(0, this.portrait() ? 0.18 : 0.02);
      this.room.shot('title', 0);
      // after a breath on the room, the camera goes in to his face
      setTimeout(() => { if (this.view === 'subject' && !this.root.classList.contains('lit')) this.subject.faceZoom(true, 2200); }, 1400);
    } else {
      this.subject.setMode('feed');
      this.stage.paused = false;
      this.stage.show(k);
    }
    setActiveMenuRoom(k);
    this.buildHud();
  }
  /** back to the monitor room: the picture collapses, the camera pulls out of the tube */
  async back() {
    if (this.moving || this.view === 'monitor' || !this.monitor) return;
    this.moving = true;
    const from = this.view as FeedKey;
    try {
      sfx('back');
      await this.fx.play('off', 420);
      this.enter('monitor');
      const p = this.monitor.back(from);
      void this.fx.play('on', 320);
      await p;
      this.focusKey(from);
    } finally { this.moving = false; }
  }
  /** Q / E in a room: the next channel */
  private channel(d: -1 | 1) {
    if (this.view === 'monitor' || this.root.classList.contains('lit')) return;
    const i = ORDER.indexOf(this.view as FeedKey);
    void this.go(ORDER[(i + d + ORDER.length) % ORDER.length]);
  }
  private onBack() {
    if (this.over.classList.contains('on')) { this.closeOver(); return; }
    if (this.view === 'subject' && this.subject.face) { this.subject.faceZoom(false); this.buildHud(); return; }
    if (this.view !== 'monitor') void this.back();
  }
  private onKey = (e: KeyboardEvent) => {
    if (!this.live || this.root.classList.contains('lit') || this.root.classList.contains('playing') || this.over.classList.contains('on')) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (e.key >= '1' && e.key <= '3') { e.preventDefault(); void this.go(ORDER[Number(e.key) - 1]); }
    else if (e.key === '0' && this.view !== 'monitor') { e.preventDefault(); void this.back(); }
  };

  // ================================================================== the room HUD
  private buildHud() {
    const hud = this.hud;
    hud.innerHTML = '';
    this.hudCam = null;
    if (this.view === 'monitor') { this.feedNav.hidden = false; return; }
    this.feedNav.hidden = true;
    const k = this.view, i = ORDER.indexOf(k), f = FEEDS[i];
    const cam = h('div', 'mr-cam', `<b>${esc(f.cam)}</b><span class="nm">${esc(f.name)}</span><span class="rec">REC</span><span class="tc"></span>`);
    hud.append(cam);
    this.hudCam = cam;
    this.tcT = 0;
    const acts = h('div', 'mr-acts');
    const bar = h('div', 'mr-bar');
    const word = (label: string, cls: string, fn: () => void, aria?: string) => {
      const b = h('button', 'mr-word ' + cls, `<span class="ft-ptr" aria-hidden="true"></span><span class="lab">${esc(label)}</span>`) as HTMLButtonElement;
      b.type = 'button'; if (aria) b.setAttribute('aria-label', aria);
      b.addEventListener('pointerenter', () => { if (document.activeElement !== b) { b.focus({ preventScroll: true }); sfx('tick', 0.4); } });
      b.addEventListener('click', () => { if (!this.moving) fn(); });
      return b;
    };
    const roomActs: { key: string; label: string; run: () => void }[] = k === 'subject'
      ? [
        { key: 'new', label: 'New subject', run: () => this.newGame(true) },
        { key: 'face', label: this.subject.face ? 'Whole room' : 'His face', run: () => { this.subject.faceZoom(!this.subject.face); sfx('servo', 0.5); this.buildHud(); } },
      ]
      : ((this.roomOf(k) as Acting | null)?.actions ?? []);
    for (const a of roomActs) acts.append(word(a.label, 'act', () => { sfx('click', 0.8); a.run(); }));
    const prev = ORDER[(i + 2) % 3], next = ORDER[(i + 1) % 3];
    const pf = FEEDS.find((q) => q.key === prev)!, nf = FEEDS.find((q) => q.key === next)!;
    bar.append(word('‹ ' + pf.label, 'prev', () => void this.go(prev), `Previous feed: ${pf.label} (Q)`));
    bar.append(word('Monitors', 'home', () => void this.back(), 'Back to the monitors (Esc)'));
    bar.append(word(nf.label + ' ›', 'next', () => void this.go(next), `Next feed: ${nf.label} (E)`));
    hud.append(acts, bar);
    const tip = h('div', 'mr-tip', k === 'subject' ? 'tap him · Q E change feed · Esc monitors' : 'tap things · Q E change feed · Esc monitors');
    hud.append(tip);
    requestAnimationFrame(() => (acts.querySelector('button') as HTMLElement | null ?? bar.querySelector('.home') as HTMLElement | null)?.focus({ preventScroll: true }));
  }
  /** a tap on the prisoner flies to his face (or back) */
  private subjectTap(e: PointerEvent) {
    if (this.view !== 'subject' || this.moving || this.root.classList.contains('lit')) return;
    if (this.room.partAt(e.clientX, e.clientY)) { this.subject.faceZoom(!this.subject.face); sfx('servo', 0.5); this.buildHud(); }
  }

  // ================================================================== panels: the terminal
  private openOver(el: HTMLElement, title: string, sub: string, onTab?: (d: -1 | 1) => void, side?: HTMLElement) {
    this.overNav?.destroy();
    this.cluster?.dispose(); this.cluster = null;
    this.over.innerHTML = '';
    this.over.className = 'nx-over on' + (side ? ' with-side' : '');
    const t = terminal({ title, sub, cls: 'tt3-term' });
    t.body.append(el);
    const back = plateBtn('Back', () => this.closeOver(), { finish: 'cream', size: 'md', shape: 'arrowL', lamp: false, sound: 'back', aria: 'Back (Esc)' });
    t.keys.append(back);
    if (side) this.over.append(side);
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
    this.cluster?.dispose(); this.cluster = null;
    this.over.className = 'nx-over';
    this.over.innerHTML = '';
    this.term = null;
    this.root.classList.remove('paneled');
    sfx('back');
    this.focusKey(this.lastKey);
  }

  /** settings: the pages hang on a gear train; turn a gear (click, Q / E) to change page */
  options() {
    let api: OptionsApi | null = null;
    const panel = optionsPanel({ hideTabs: true, onApi: (a) => { api = a; } });
    const a = api as OptionsApi | null;
    const cl = gearCluster(a ? a.pages.map((p) => p[0] + p.slice(1).toLowerCase()) : ['Sound', 'Picture', 'Interface'], (i) => { if (a && a.index !== i) a.select(i); }, a ? a.index : 0);
    a?.onChange((i) => { if (cl.index !== i) cl.select(i, true); });
    const side = document.createElement('div'); side.className = 'tt4-gears';
    side.append(cl.el);
    this.openOver(panel, 'Settings', 'turn a gear · Q / E', (d) => cl.turn(d), side);
    this.cluster = cl;
    requestAnimationFrame(() => cl.layout(this.portrait() ? 'h' : 'v'));
  }
  controls() { this.openOver(controlsPanel(), 'Controls', 'keys · touch · menus'); }
  about() {
    const note = h('div', 'tt3-about', `
<p>A survival sandbox. You are a debtor in a yellow jumpsuit, processed by the Meridian Institute and pushed through a wall that turns to liquid, into rooms that never end.</p>
<p>A band on your wrist counts what you owe. A projected sergeant tells you what to break and what to feed to the presses. Pay the debt, buy a way out. Or don't.</p>
<p>This booth watches three rooms: the containment cell, the experiment lab and subject room 4. Click a monitor, or press 1, 2 or 3, to look closer.</p>
<p class="ct-dim">Inspired by the systemic survival of <i>Project Zomboid</i>, the 2019 "noclip" creepypasta, liminal-space photography and VHS-era found footage. All names, places, creatures and story here are original. Built with three.js. Type: Alagard (SIL Open Font License). Every texture, model, sound and pixel is generated in code.</p>`);
    this.openOver(note, 'About', 'the file in the drawer');
  }

  private play(s: SaveMeta) {
    sfx('confirm');
    this.root.classList.add('playing');
    setTimeout(() => setLaunch({ mode: 'load', id: s.id }), 650);
  }

  /** lights on in subject room 4: the room becomes the creator */
  private async runIntake(opts: Parameters<typeof intakeForm>[0]) {
    if (this.view !== 'subject') await this.go('subject');
    if (this.subject.face) { this.subject.faceZoom(false, 500); await new Promise((r) => setTimeout(r, 520)); }
    this.root.classList.add('lit');
    this.nav?.destroy(); this.nav = null;
    const r = await intakeForm({ ...opts, room: this.room, app: this.app });
    this.root.classList.remove('lit');
    this.nav = new FocusNav(this.root, { onBack: () => this.onBack(), onTab: (d) => this.channel(d) });
    this.build();
    if (!r) { this.room.setFraming(0, this.portrait() ? 0.18 : 0.02); this.room.shot('title', 900); this.buildHud(); }
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
export type { RoomCam };
