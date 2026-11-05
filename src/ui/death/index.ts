// The death of the local survivor, told as a cinematic:
//
//   1. hold   the world slows, the camera stays on the body, the picture turns
//             into a camera feed (REC, CAM 07, scanlines, letterbox)
//   2. cut    hard cut to the Meridian observation room: the tape of the death
//             plays on the big tube, the camera pulls back over the staff
//   3. talk   the staff react (lines picked for the cause of death, text only,
//             floating Alagard words over their heads), the sign is reset,
//             Ortiz types the report
//   4. case   push into the big tube: the incident report (time survived, debt,
//             valuables pressed, rooms, kills, distance, cause) with the research
//             points the run earned (granted at once), then the keys
//
// Esc / Enter / Space / tap / gamepad A skip to the report; a second press
// finishes the tally. installDeath() is called once per session (src/game/session.ts).
import './death.css';
import * as THREE from 'three';
import { bus } from '../../core/events';
import type { Game } from '../../game/game';
import type { Player } from '../../entities/player';
import { G } from '../../game/G';
import { slowmo } from '../../gfx/juice';
import { grantResearch, researchPoints } from '../../game/research';
import { flushStats } from '../../game/profile';
import { sfx } from '../menus/sfx';
import { letterTimes } from '../../social/chipVoice';
import { RunTracker, type RunReport } from './stats';
import { Tape } from './recorder';
import { sceneFor, STAFF, type Line, type Who, type Scene } from './lines';
import type { ObsRoom } from './room';

const HOLD_MS = 2700;

export interface DeathHooks { tracker: RunTracker; tape: Tape | null }

/** start the run tracker and the tape, and take over the local survivor's death */
export function installDeath(g: Game, p: Player): DeathHooks {
  const tracker = new RunTracker(g, p);
  g.addSystem({ name: 'deathStats', update: () => tracker.update() });
  let tape: Tape | null = null;
  try { tape = new Tape(g.pr, { fps: 10, seconds: 6, w: 256 }); } catch (e) { console.warn('death tape', e); }
  let running: DeathCinematic | null = null;
  bus.on('death', (pl: Player) => {
    if (pl !== p || running) return;
    running = new DeathCinematic(g, p, tracker, tape);
    running.start();
  });
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    (window as any).__death = {
      tracker, tape,
      report: () => tracker.report(),
      /** kill the survivor: by a creature key ('drywall_man'), 'press', 'band', 'thirst', 'bleed' ... */
      kill(how = 'drywall_man') {
        const b: any = p.body;
        if (b.dead) return;
        if (how === 'thirst') b.thirst = 100; else if (how === 'hunger') b.hunger = 100; else if (how === 'cold') b.temp = 32; else if (how === 'bleed') b.blood = 10;
        else if (how === 'band') bus.emit('bandDetonate', { id: p.id });
        else bus.emit('playerHit', p, 'torso_u', 'bite', { dmg: 40, from: [p.x + 1, p.z], knock: 0, by: how === 'press' ? 'the Remittance Press' : how });
        b.health = 0; b.dead = true;
        bus.emit('death', p);
      },
      get running() { return running; },
    };
  }
  return { tracker, tape };
}

// ------------------------------------------------------------------ sounds (recorded samples via the engine's keys; see notes/sounds-wanted.md)
/** a staffer's reaction noise for a gesture (no speech: the lines are words on screen) */
function react(g: string) {
  const k = g === 'mock' || g === 'clap' ? 'obs_laugh' : g === 'facepalm' || g === 'head' ? 'obs_groan' : g === 'sip' ? 'obs_sip' : g === 'point' || g === 'shrug' ? 'obs_scoff' : '';
  if (k) G.audio?.ui?.(k, 0.6);
}

/** the observation room's tone: mains hum and tube whine, looped until stopped */
function roomTone(): (() => void) | null {
  try {
    const src = (G.audio as any)?.flat?.('obs_room_hum', 'ui', 0.4) as AudioBufferSourceNode | null;
    if (!src) return null;
    src.loop = true;
    return () => { try { src.stop(); } catch { /* gone */ } };
  } catch { return null; }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c]);

// ------------------------------------------------------------------ the cinematic
type Phase = 'hold' | 'room' | 'case' | 'done';

class DeathCinematic {
  private root = document.createElement('div');
  private stage = document.createElement('div');
  private talkLayer = document.createElement('div');
  private room: ObsRoom | null = null;
  private roomP: Promise<ObsRoom | null> | null = null;
  private report!: RunReport;
  private scene!: Scene;
  private phase: Phase = 'hold';
  private deathAt = performance.now();
  private raf = 0;
  private last = 0;
  private renderWas: ((dt: number) => void) | null = null;
  private toneOff: (() => void) | null = null;
  private skipReq = false;
  private waiters: (() => void)[] = [];
  private bubbles: { el: HTMLElement; who: Who; sub: boolean }[] = [];
  private caseEl: HTMLElement | null = null;
  private keysEl: HTMLElement | null = null;
  private tallyDone = false;
  private finishTally: (() => void) | null = null;
  private keys: HTMLElement[] = [];
  private focus = 0;
  private padPrev: boolean[] = [];
  private pausedWas = false;
  private onKey = (e: KeyboardEvent) => this.key(e);

  constructor(private g: Game, private p: Player, private tracker: RunTracker, private tape: Tape | null) {}

  start() {
    // the books first: the report and its research points are banked at once
    try {
      this.report = this.tracker.report();
      this.tracker.commit(this.report);
      grantResearch(this.report.rp, 'death report');
      flushStats();
    } catch (e) { console.warn('death report', e); this.report = this.fallbackReport(); }
    this.scene = sceneFor(this.report, (this.p.app.bodyShape ?? 0.3) > 0.6);
    // ---- 1. hold on the body: slow motion, letterbox, the picture becomes a feed
    slowmo(0.3, HOLD_MS);
    this.root.className = 'dz-root dz-hold';
    this.root.innerHTML = `<div class="dz-bar dz-top"></div><div class="dz-bar dz-bot"></div>
      <div class="dz-rec"><span class="dz-cam">CAM 07</span><span class="dz-recl"><i></i>REC</span></div><div class="dz-scan"></div><div class="dz-flash"></div>`;
    this.stage.className = 'dz-stage';
    this.talkLayer.className = 'dz-talk';
    this.root.append(this.stage, this.talkLayer);
    const hint = document.createElement('div');
    hint.className = 'dz-hint nc-ink'; hint.textContent = matchMedia('(pointer: coarse)').matches ? 'tap to skip' : 'esc · skip';
    this.root.append(hint);
    document.body.append(this.root);
    window.addEventListener('keydown', this.onKey, true);
    this.root.addEventListener('pointerup', (e) => { if (this.phase !== 'case' && !(e.target as HTMLElement).closest('.dz-key')) this.skip(); });
    if (this.g.ui) (this.g.ui as any).modal = this.root;
    requestAnimationFrame(() => this.root.classList.add('dz-in'));
    // build the room while the world is slowed (one hitch here is invisible)
    setTimeout(() => { this.roomP = this.buildRoom(); }, 120);
    setTimeout(() => this.cut(), HOLD_MS);
  }

  private fallbackReport(): RunReport {
    return { name: this.p.name, file: '4000-A', hours: 0, cause: { key: 'unknown', text: 'Undetermined' }, newCause: false, debtOn: false, owed: 0, paid: 0, remaining: 0, cleared: false, valuables: 0, scrip: 0, rooms: 0, kills: 0, metres: 0, lines: [], rp: 0, deaths: 0, zone: '' };
  }

  private async buildRoom(): Promise<ObsRoom | null> {
    try {
      const { ObsRoom } = await import('./room');
      const { bitReady } = await import('../../gfx/bitfont');
      await bitReady().catch(() => {});
      const frames = this.tape ? this.tape.frames() : [];
      const g = this.g, z = g.zone, px = this.p.tileX(), py = this.p.tileY();
      const still = frames.length > 12 ? frames[2].cv : null;
      const low = (g.pr as any).quality === 'low';
      const room = new ObsRoom(this.stage, frames, this.deathAt, {
        low, cam: 'CAM 07', zone: this.report.zone || 'SECTOR ?', file: this.report.file,
        clock: () => { const s = Math.floor(performance.now() / 1000) % 60; return `D${g.clock.day} ${g.clock.timeString()}:${String(s).padStart(2, '0')}`; },
        daysWithout: 3 + Math.floor(Math.random() * 37),
        still,
        map: (c, W, H, t) => {
          if (!z) return;
          const img = c.getImageData(0, 0, W, H), D = img.data;
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const tx = px + x - (W >> 1), ty = py + y - (H >> 1);
            if (!z.inb(tx, ty)) continue;
            const k = z.idx(tx, ty);
            if (!z.floor[k]) continue;
            const v = z.explored[k] ? ((tx + ty) % 2 ? 90 : 70) : 18;
            const o = (y * W + x) * 4; D[o] = D[o + 1] = D[o + 2] = v; D[o + 3] = 255;
          }
          c.putImageData(img, 0, 0);
          if (Math.floor(t * 3) % 2) { c.fillStyle = '#fff'; const cx = W >> 1, cy = H >> 1; for (let i = -3; i <= 3; i++) { c.fillRect(cx + i, cy + i, 1, 1); c.fillRect(cx + i, cy - i, 1, 1); } }
        },
      });
      room.feed.onKey = () => sfx('key', 0.5);
      return room;
    } catch (e) { console.warn('observation room', e); return null; }
  }

  // ---------------------------------------------------------------- 2. the cut
  private async cut() {
    if (this.phase !== 'hold') return;
    if (this.tape) this.tape.recording = false;
    if (!this.roomP) this.roomP = this.buildRoom();
    this.room = await this.roomP;
    this.phase = 'room';
    this.root.classList.remove('dz-hold');
    this.root.classList.add('dz-live');
    // the world stops drawing (nothing of it is on screen any more) and goes quiet
    const pr: any = this.g.pr;
    this.renderWas = pr.render;
    pr.render = () => {};
    try { (G.audio as any)?.duck?.(0.0, 0.6); } catch { /* audio optional */ }
    if (this.g.role === 'solo') { this.pausedWas = this.g.paused; this.g.paused = true; }
    this.toneOff = roomTone();
    sfx('boot', 0.9);
    G.audio?.ui?.('crt_cut', 0.8);
    this.last = performance.now();
    this.loop();
    if (!this.room) { this.showCase(); return; }
    this.room.shot('feed');
    this.room.feed.snow = 1;
    this.room.hand = 0.4;
    if (this.skipReq) { this.skipReq = false; this.toCase(); return; }
    this.script().catch((e) => { if (e !== 'skip') console.warn('death script', e); });
  }

  private loop = () => {
    if (this.phase === 'done') return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    // slow devices take big steps rather than slowing the whole scene (moves and the report keep their timing)
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    if (document.hidden) return;
    this.room?.frame(dt);
    this.placeBubbles();
    this.placeCase();
    this.pollPad();
  };

  /** wait (resolves early on a skip) */
  private wait(s: number): Promise<void> {
    return new Promise((res, rej) => {
      if (this.phase !== 'room') { rej('skip'); return; }
      const id = setTimeout(() => { this.waiters = this.waiters.filter((f) => f !== done); res(); }, s * 1000);
      const done = () => { clearTimeout(id); rej('skip'); };
      this.waiters.push(done);
    });
  }

  private async script() {
    const R = this.room!, L = this.scene.lines;
    // the tape plays: the last seconds of the run, the death, the body
    await this.wait(2.6);
    // pull back: it was a monitor all along
    R.hand = 1;
    R.shot('room', 2.4);
    sfx('relay', 0.5);
    await this.wait(1.0);
    await this.line(L[0]);
    await this.line(L[1]);
    // the reverse: their faces in the green light
    R.shot('reverse');
    R.feed.snow = Math.max(R.feed.snow, 0.15);
    await this.wait(0.35);
    await this.line(L[2]);
    if (/sign|zero/i.test(L[3].text)) R.resetSign(() => sfx('tick', 0.7));
    await this.line(L[3]);
    if (!/sign|zero/i.test(L[3].text)) R.resetSign(() => sfx('tick', 0.5));
    // Ortiz types the report: the big tube prints it
    R.shot('type');
    R.setTyping(1, true);
    R.lookAt(null);
    const r = this.report;
    R.feed.typeFile([`INCIDENT ${r.file}`, `SUBJECT ${r.name.toUpperCase().slice(0, 16)}`, `CAUSE: ${r.cause.text.toUpperCase().slice(0, 22)}`, 'STATUS: DELETED', 'FILING...']);
    await this.wait(0.4);
    await this.line(this.scene.type);
    await this.wait(0.5);
    this.toCase();
  }

  /** a staffer says a line: gesture, everyone turns to look, the words type out over their head */
  private async line(l: Line) {
    const R = this.room!;
    R.gesture(l.who, l.g);
    R.lookAt(R.head(l.who, new THREE.Vector3()), l.who);
    R.talking(l.who, true);
    if (R.shotNow === 'reverse' && this.root.clientHeight > this.root.clientWidth) R.single(l.who);
    if (l.shout) R.bump(0.3);
    const el = this.bubble(l);
    react(l.g);
    const { t, dur } = letterTimes(l.text);
    const txt = el.querySelector('.dz-txt') as HTMLElement;
    const spans: HTMLElement[] = [];
    for (const ch of l.text) { const s = document.createElement('span'); s.textContent = ch; s.className = 'dz-ch'; txt.append(s); spans.push(s); }
    const t0 = performance.now();
    const reveal = () => {
      const e = (performance.now() - t0) / 1000;
      for (let i = 0; i < spans.length; i++) if (t[i] <= e) spans[i].classList.add('on');
      if (e < dur && el.isConnected) requestAnimationFrame(reveal);
    };
    reveal();
    try { await this.wait(dur + Math.max(0.9, Math.min(2.2, l.text.length * 0.03))); }
    finally { R.talking(l.who, false); spans.forEach((s) => s.classList.add('on')); this.dropBubble(el); }
  }

  private bubble(l: Line): HTMLElement {
    const el = document.createElement('div');
    el.className = 'dz-say';
    el.style.setProperty('--c', STAFF[l.who].color);
    el.innerHTML = `<div class="dz-who">${esc(STAFF[l.who].name)}</div><div class="dz-txt"></div><i class="dz-tail"></i>`;
    this.talkLayer.append(el);
    this.bubbles.push({ el, who: l.who, sub: false });
    requestAnimationFrame(() => el.classList.add('on'));
    this.placeBubbles();
    return el;
  }
  private dropBubble(el: HTMLElement) {
    this.bubbles = this.bubbles.filter((b) => b.el !== el);
    el.classList.remove('on'); el.classList.add('off');
    setTimeout(() => el.remove(), 260);
  }

  /** bubbles ride above their speaker's head; off screen they become a subtitle */
  private placeBubbles() {
    const R = this.room; if (!R || !this.bubbles.length) return;
    const W = this.root.clientWidth, H = this.root.clientHeight;
    const v = new THREE.Vector3();
    for (const b of this.bubbles) {
      R.head(b.who, v); v.y += 0.24;
      const s = R.toCss(v);
      const bw = b.el.offsetWidth, bh = b.el.offsetHeight;
      const off = s.behind || s.x < 24 || s.x > W - 24 || s.y < bh * 0.4 || s.y > H - 60;
      b.el.classList.toggle('sub', off);
      if (off) { b.el.style.left = Math.round(W / 2 - bw / 2) + 'px'; b.el.style.top = Math.round(H - bh - 12) + 'px'; continue; }
      const bar = this.root.classList.contains('dz-case-on') ? 0 : (H > W ? 0.07 : 0.1) * H;
      const x = Math.round(Math.max(16, Math.min(W - 16 - bw, s.x - bw / 2)));
      const y = Math.round(Math.max(bar + 8, s.y - bh));
      b.el.style.left = x + 'px'; b.el.style.top = y + 'px';
      // the tail points at the head even when the words are pushed aside
      (b.el.querySelector('.dz-tail') as HTMLElement).style.left = Math.round(Math.max(8, Math.min(bw - 16, s.x - x - 4))) + 'px';
    }
  }

  /** dev: stop the script, frame a shot and (optionally) hold one of the lines on screen */
  dev(shot: string, line = -1) {
    if (this.phase === 'hold' || !this.room) return;
    for (const f of this.waiters.splice(0)) f();
    for (const b of this.bubbles.splice(0)) b.el.remove();
    if (shot === 'case') { this.toCase(); return; }
    const R = this.room;
    R.shot(shot as any);
    if (shot === 'type') R.setTyping(1, true);
    const all = [...this.scene.lines, this.scene.type];
    if (line >= 0 && all[line]) {
      const l = all[line];
      R.gesture(l.who, l.g); R.lookAt(R.head(l.who, new THREE.Vector3()), l.who); R.talking(l.who, true);
      const el = this.bubble(l);
      (el.querySelector('.dz-txt') as HTMLElement).innerHTML = esc(l.text);
    }
  }

  // ---------------------------------------------------------------- skipping
  private skip() {
    if (this.phase === 'hold') { this.skipReq = true; this.cut(); return; }
    if (this.phase === 'room') { this.toCase(); return; }
    if (this.phase === 'case' && !this.tallyDone) this.finishTally?.();
  }

  private toCase() {
    if (this.phase === 'case' || this.phase === 'done') return;
    this.phase = 'case';
    for (const f of this.waiters.splice(0)) f();
    for (const b of this.bubbles.splice(0)) b.el.remove();
    const R = this.room;
    if (R) {
      R.setTyping(1, false);
      R.lookAt(null);
      R.hand = 0;
      // from the typing insert: back over the shoulder, then push into the tube
      if (R.shotNow === 'type') { R.shot('room'); R.shot('case', 1.5); } else R.shot('case');
      R.feed.blank();
      R.feed.snow = 0.5;
      R.grade({ exposure: 1.15, vig: 0.6 });
    }
    this.root.classList.add('dz-case-on');
    // the report comes up once the camera has arrived on the glass
    const t0 = performance.now();
    const go = () => { if (this.phase !== 'case') return; if (!R || R.settled || performance.now() - t0 > 4000) this.showCase(); else setTimeout(go, 100); };
    setTimeout(go, 200);
  }

  // ---------------------------------------------------------------- 4. the report
  private showCase() {
    if (this.caseEl) return;
    this.phase = 'case';
    this.root.classList.add('dz-case-on');
    const r = this.report;
    const el = document.createElement('div');
    el.className = 'dz-case';
    const rows = r.lines.map((l) => `<div class="dz-row" data-k="${l.key}"><span class="dz-l"><b class="lg">${l.label}</b><b class="sh">${l.short}</b></span><span class="dz-v">${l.key === 'novel' ? '' : '0'}</span><span class="dz-p">${l.rp ? '+' + l.rp : ''}</span></div>`).join('');
    el.innerHTML = `<div class="dz-in">
      <div class="dz-h"><span>MERIDIAN INSTITUTE</span><span>INCIDENT ${esc(r.file)}</span></div>
      <div class="dz-sub">SUBJECT <b>${esc(r.name.toUpperCase())}</b> · DELETED</div>
      <div class="dz-cause"><span>CAUSE</span> ${esc(r.cause.text)}</div>
      <div class="dz-rows">${rows}</div>
      <div class="dz-tot"><span class="dz-l">RESEARCH POINTS</span><span class="dz-big">+0</span></div>
      <div class="dz-lab">LAB TOTAL <b>${researchPoints() - r.rp}</b></div>
    </div>`;
    this.root.append(el);
    this.caseEl = el;
    this.placeCase();
    requestAnimationFrame(() => el.classList.add('on'));
    this.tally();
  }

  /** rows count up one after another, then the research points */
  private tally() {
    const r = this.report, el = this.caseEl!;
    const rows = [...el.querySelectorAll<HTMLElement>('.dz-row')];
    const big = el.querySelector('.dz-big') as HTMLElement, lab = el.querySelector('.dz-lab b') as HTMLElement;
    const val = (k: string, f: number): string => {
      const l = r.lines.find((x) => x.key === k)!;
      if (f >= 1) return l.value;
      if (k === 'days') { const h = r.hours * f, d = Math.floor(h / 24), hh = Math.floor(h % 24), mm = Math.floor((h % 1) * 60); return d ? `${d}d ${String(hh).padStart(2, '0')}h` : `${hh}h ${String(mm).padStart(2, '0')}m`; }
      if (k === 'debt') return `${Math.round(r.paid * f).toLocaleString('en-US')} / ${Math.round(r.owed).toLocaleString('en-US')}`;
      if (k === 'dist') { const m = r.metres * f; return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`; }
      if (k === 'novel') return f > 0.5 ? 'logged' : '';
      return String(Math.round(l.num * f));
    };
    let i = 0, f = 0, rpShown = 0, stage: 'rows' | 'rp' | 'end' = 'rows';
    let lastTick = 0, lastT = performance.now();
    const startLab = researchPoints() - r.rp;
    const end = () => {
      if (stage === 'end') return;
      stage = 'end';
      rows.forEach((row, k) => { row.classList.add('on', 'paid'); (row.querySelector('.dz-v') as HTMLElement).textContent = val(r.lines[k].key, 1); });
      big.textContent = '+' + r.rp; lab.textContent = String(researchPoints());
      el.classList.add('done');
      this.tallyDone = true;
      sfx('unlock', 0.8);
      this.room?.bump(0.25);
      setTimeout(() => this.dataLine(), 500);
      setTimeout(() => this.showKeys(), 900);
    };
    this.finishTally = end;
    const step = () => {
      if (stage === 'end' || this.phase !== 'case') return;
      const now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000);
      lastT = now;
      if (stage === 'rows') {
        if (i >= rows.length) { stage = 'rp'; f = 0; }
        else {
          const row = rows[i];
          row.classList.add('on');
          f = Math.min(1, f + dt / 0.42);
          (row.querySelector('.dz-v') as HTMLElement).textContent = val(r.lines[i].key, f);
          if (now - lastTick > 45) { sfx('tick', 0.6); lastTick = now; }
          if (f >= 1) { row.classList.add('paid'); if (r.lines[i].rp) sfx('click', 0.5); i++; f = 0; }
        }
      } else if (stage === 'rp') {
        f = Math.min(1, f + dt / 0.7);
        const n = Math.round(r.rp * f);
        if (n !== rpShown) { rpShown = n; big.textContent = '+' + n; lab.textContent = String(startLab + n); if (now - lastTick > 40) { sfx('tick', 0.9); lastTick = now; } }
        if (f >= 1) { end(); return; }
      }
      requestAnimationFrame(step);
    };
    setTimeout(step, 450);
  }

  /** a last word from the room over the tally (a subtitle: nobody is in the picture) */
  private dataLine() {
    if (this.phase !== 'case' || !this.room) return;
    const l = this.scene.data;
    const el = document.createElement('div');
    el.className = 'dz-say sub on dz-vo';
    el.style.setProperty('--c', STAFF[l.who].color);
    el.innerHTML = `<div class="dz-who">${esc(STAFF[l.who].name)}</div><div class="dz-txt">${esc(l.text)}</div>`;
    this.talkLayer.append(el);
    react(l.g);
    this.placeVo(el);
    setTimeout(() => { el.classList.remove('on'); el.classList.add('off'); setTimeout(() => el.remove(), 300); }, 3200 + l.text.length * 30);
  }
  private placeVo(el: HTMLElement) { (el as any).__vo = true; }

  private showKeys() {
    if (this.keysEl || this.phase !== 'case') return;
    const k = document.createElement('div');
    k.className = 'dz-keys';
    const coop = this.g.role !== 'solo' && this.g.players.size > 1;
    const mk = (label: string, hint: string, act: () => void) => {
      const b = document.createElement('button');
      b.className = 'dz-key nc-ink-2';
      b.type = 'button';
      b.innerHTML = `<span class="dz-arrow">›</span>${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}`;
      b.addEventListener('pointerenter', () => this.setFocus(this.keys.indexOf(b), true));
      b.addEventListener('focus', () => this.setFocus(this.keys.indexOf(b), false));
      b.addEventListener('click', (e) => { e.stopPropagation(); sfx('confirm'); act(); });
      k.append(b); this.keys.push(b);
    };
    if (coop) mk('Continue', 'watch the crew', () => this.close());
    else mk('Continue', 'a new subject, same file', () => this.nextSubject());
    mk('Back to the title', '', () => this.toTitle());
    this.root.append(k);
    this.keysEl = k;
    this.placeCase();
    requestAnimationFrame(() => k.classList.add('on'));
    this.setFocus(0, false);
    setTimeout(() => this.keys[0]?.focus({ preventScroll: true }), 60);
  }
  private setFocus(i: number, hover: boolean) {
    if (i < 0) return;
    if (i !== this.focus && hover) sfx('hover', 0.6);
    this.focus = i;
    this.keys.forEach((b, j) => b.classList.toggle('sel', j === i));
  }

  /** the report lies on the big tube's glass; the keys float under the set */
  private placeCase() {
    const el = this.caseEl, R = this.room;
    const W = this.root.clientWidth, H = this.root.clientHeight;
    let rect = R ? R.screenRect() : null;
    if (!rect || rect.w < 40) rect = { x: W * 0.1, y: H * 0.1, w: W * 0.8, h: H * 0.62 };
    if (el) {
      // the glass is curved: keep the words inside its flat middle
      const padX = Math.round(rect.w * 0.07), padY = Math.round(rect.h * 0.07);
      const iw = rect.w - padX * 2, ih = rect.h - padY * 2;
      const k = iw >= 760 && ih >= 520 ? 2 : 1;
      el.style.left = Math.round(rect.x + padX) + 'px'; el.style.top = Math.round(rect.y + padY) + 'px';
      el.style.width = Math.round(iw) + 'px'; el.style.height = Math.round(ih) + 'px';
      const inner = el.firstElementChild as HTMLElement;
      inner.style.transform = k > 1 ? `scale(${k})` : '';
      inner.style.width = Math.floor(iw / k) + 'px'; inner.style.height = Math.floor(ih / k) + 'px';
      el.classList.toggle('narrow', iw / k < 430);
      el.classList.toggle('short', ih / k < 250);
    }
    if (this.keysEl) {
      const below = rect.y + rect.h * 1.32;
      const top = Math.min(H - this.keysEl.offsetHeight - 16, Math.max(below, H * 0.5));
      this.keysEl.style.top = Math.round(top) + 'px';
    }
    for (const b of this.talkLayer.querySelectorAll<HTMLElement>('.dz-vo')) {
      // above the set when there is room (phones), else between the glass and the keys
      const vh = b.offsetHeight, keysTop = this.keysEl ? this.keysEl.offsetTop : H - 16;
      const top = rect.y - vh - 24 > 16 ? rect.y - vh - 24 : Math.max(rect.y + rect.h + 8, keysTop - vh - 8);
      b.style.left = Math.round(W / 2 - b.offsetWidth / 2) + 'px'; b.style.top = Math.round(top) + 'px';
    }
  }

  // ---------------------------------------------------------------- input
  private key(e: KeyboardEvent) {
    if (this.phase === 'done') return;
    const k = e.key;
    const nav = this.phase === 'case' && this.keys.length;
    // swallow everything while the cinematic is up (no pause menu, no world keys)
    e.stopImmediatePropagation();
    if (nav && (k === 'ArrowDown' || k === 'ArrowRight' || (k === 'Tab' && !e.shiftKey))) { e.preventDefault(); this.setFocus((this.focus + 1) % this.keys.length, true); this.keys[this.focus].focus({ preventScroll: true }); return; }
    if (nav && (k === 'ArrowUp' || k === 'ArrowLeft' || (k === 'Tab' && e.shiftKey))) { e.preventDefault(); this.setFocus((this.focus + this.keys.length - 1) % this.keys.length, true); this.keys[this.focus].focus({ preventScroll: true }); return; }
    if (nav && (k === 'Enter' || k === ' ')) { e.preventDefault(); this.keys[this.focus]?.click(); return; }
    if (k === 'Escape' || k === 'Enter' || k === ' ') { e.preventDefault(); this.skip(); }
  }
  private pollPad() {
    const pads = navigator.getGamepads?.() || [];
    const gp = [...pads].find((x) => x && x.connected);
    if (!gp) return;
    const b = (i: number) => !!gp.buttons[i]?.pressed;
    const now = [b(0), b(1), b(9), b(12), b(13), b(14), b(15)];
    const hit = (i: number) => now[i] && !this.padPrev[i];
    if (this.phase === 'case' && this.keys.length) {
      if (hit(3) || hit(5)) this.setFocus((this.focus + this.keys.length - 1) % this.keys.length, true);
      if (hit(4) || hit(6)) this.setFocus((this.focus + 1) % this.keys.length, true);
      if (hit(0)) this.keys[this.focus]?.click();
    } else if (hit(0) || hit(1) || hit(2)) this.skip();
    this.padPrev = now;
  }

  // ---------------------------------------------------------------- leaving
  private nextSubject() {
    const p = this.p, g = this.g;
    const cfg = {
      mode: 'new' as const, name: p.name, app: p.app, occupation: p.occupation, traits: [...(p.body as any).traits ?? []],
      sandbox: { ...(g.sandbox as any) }, seed: Math.floor(Math.random() * 1e9), directives: !!g.missions?.enabled,
    };
    this.fadeOut(() => import('../../game/launch').then((m) => m.setLaunch(cfg)).catch(() => location.reload()));
  }
  private toTitle() { this.fadeOut(() => location.reload()); }
  private fadeOut(then: () => void) {
    this.root.classList.add('dz-out');
    this.toneOff?.(); this.toneOff = null;
    setTimeout(then, 420);
  }

  /** co-op: back to watching the world (the survivor stays dead) */
  private close() {
    this.phase = 'done';
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey, true);
    if (this.renderWas) (this.g.pr as any).render = this.renderWas;
    if (this.g.role === 'solo') this.g.paused = this.pausedWas;
    try { (G.audio as any)?.duck?.(1, 1); } catch { /* audio optional */ }
    this.toneOff?.();
    this.room?.dispose(); this.room = null;
    if (this.g.ui && (this.g.ui as any).modal === this.root) (this.g.ui as any).modal = null;
    this.root.classList.add('dz-out');
    setTimeout(() => this.root.remove(), 400);
  }
}
