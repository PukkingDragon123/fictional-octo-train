// KESTREL WM-7: the wrist monitor every survivor wakes up wearing, drawn as a
// HUD widget in the top-left corner. A chunky gunmetal case on a rubber strap
// with an amber segmented LCD (pixel font from the scanner), four pushers and
// a BREATHE prompt that appears when it is needed.
//
// Modes (tap the display or MODE): TIME (clock, day, zone, heading, alerts),
// VITAL (heart rate + trace, body temperature, breathing), MIND (mood glyph,
// stress, the most pressing condition, the breathing guide), ALARM (set with
// SET then MODE to step the digits; ALM toggles it). LIGHT is the backlight.
// It only works while the 'wrist_monitor' item is worn on the wrist; it gets
// wet when you swim (fogs up, fails if soaked for long) and cracks when your
// left forearm takes hits. Everything here is local presentation.
import './watch.css';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { Screen } from '../font5x7';
import { clamp, clamp01 } from '../../core/math';
import type { Player } from '../../entities/player';
import type { Item } from '../../items/item';
import { ensureMind, breathState, breathRate, moodGlyph, MoodGlyph, conditions, medsLines } from '../../survival/mind';
import { startBreathing } from '../../survival/mindSystem';

type Mode = 'time' | 'vital' | 'mind' | 'alarm';
const MODES: Mode[] = ['time', 'vital', 'mind', 'alarm'];
const W = 104, H = 40;

interface Pal { bg: number; ghost: number; lit: number; dim: number; hot: number }
const AMBER: Pal = { bg: 0x140b02, ghost: 0x2a1906, lit: 0xffb238, dim: 0x9a5e16, hot: 0xff6a3a };
const BACK: Pal = { bg: 0x2c3a0e, ghost: 0x3d4c19, lit: 0xeaffb4, dim: 0xa2bc5c, hot: 0xfff07a };

// 7-segment digits: a top, b top-right, c bottom-right, d bottom, e bottom-left, f top-left, g middle
const SEG: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
  '-': 'g', ' ': '', 'E': 'adefg', 'r': 'eg', 'H': 'bcefg', 'L': 'def', 'P': 'abefg', 'A': 'abcefg', 'o': 'cdeg', 'F': 'aefg', 'n': 'ceg',
};
const HEART = ['.#.#.', '#####', '#####', '.###.', '..#..'];
const BELL = ['..#..', '.###.', '.###.', '#####', '..#..'];
const RING = ['..#####..', '.#.....#.', '#.......#', '#.......#', '#.......#', '#.......#', '#.......#', '.#.....#.', '..#####..'];

export class Watch {
  el: HTMLDivElement;
  private lcd: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private scr = new Screen(W, H);
  private breatheBtn: HTMLButtonElement;
  private fog: HTMLDivElement;
  private mode: Mode = 'time';
  /** 0 not editing, 1 hours, 2 minutes */
  private edit = 0;
  private light = 0;
  private ring = 0;
  private ringBeep = 0;
  private lastMin = -1;
  private drawT = 0;
  private ecg = new Float32Array(W);
  private ecgPhase = 0;
  private ecgAcc = 0;
  private beatFlash = 0;
  private lastBeatPhase = 0;
  private scroll = 0;
  private wornItem: Item | null = null;
  private wasBroken = false;
  private pal: Pal = AMBER;
  private shown = false;

  constructor() {
    const el = this.el = document.createElement('div');
    el.className = 'kw kw-hidden';
    el.innerHTML = `
      <div class="kw-strap"></div>
      <div class="kw-case">
        <i class="kw-screw s1"></i><i class="kw-screw s2"></i><i class="kw-screw s3"></i><i class="kw-screw s4"></i>
        <div class="kw-label"><span>KESTREL</span><b>WM-7</b></div>
        <div class="kw-led"></div>
        <div class="kw-lcd"><canvas width="${W}" height="${H}"></canvas><div class="kw-fog"></div><div class="kw-crack"></div><div class="kw-glare"></div></div>
      </div>
      <div class="kw-keys">
        <button class="kw-key" data-k="light" title="Backlight">LIGHT</button>
        <button class="kw-key" data-k="mode" title="Next mode">MODE</button>
        <button class="kw-key" data-k="set" title="Set the alarm">SET</button>
        <button class="kw-key" data-k="alm" title="Alarm on / off">ALM</button>
      </div>
      <button class="kw-breathe" title="Breathing exercise (H)">BREATHE</button>`;
    document.body.appendChild(el);
    this.lcd = el.querySelector('.kw-lcd') as HTMLDivElement;
    this.canvas = el.querySelector('canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.fog = el.querySelector('.kw-fog') as HTMLDivElement;
    this.breatheBtn = el.querySelector('.kw-breathe') as HTMLButtonElement;
    // the world ignores pointer input over the watch
    el.addEventListener('pointerenter', () => { if (G.input) G.input.pointerOverUI = true; });
    el.addEventListener('pointerleave', () => { if (G.input) G.input.pointerOverUI = false; });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.lcd.addEventListener('click', () => this.press('lcd'));
    for (const b of el.querySelectorAll<HTMLButtonElement>('.kw-key')) b.addEventListener('click', () => this.press(b.dataset.k as string));
    this.breatheBtn.addEventListener('click', () => { const p = G.local; if (p) startBreathing(p); this.beep(0.12); });
    bus.on('playerHit', (p: Player, part: string) => { if (p?.isLocal) this.onHit(part); });
    G.addSystem({ name: 'watch', update: (dt) => this.update(dt) });
    (G as any).watch = this;
  }

  // ---------------------------------------------------------------- the item
  private item(p: Player): Item | null {
    const it = p.worn.get('wrist');
    return it && it.key === 'wrist_monitor' ? it : null;
  }
  private data(it: Item) {
    if (!it.data) it.data = {};
    const d = it.data;
    if (d.alarmH === undefined) { d.alarmH = 7; d.alarmM = 0; d.alarmOn = false; d.wet = 0; }
    return d as { alarmH: number; alarmM: number; alarmOn: boolean; wet: number };
  }
  private broken(it: Item | null) { return !it || it.cond <= 0; }

  private onHit(part: string) {
    const p = G.local; const it = p && this.item(p); if (!it || it.cond <= 0) return;
    const dmg = part === 'hand_l' || part === 'farm_l' ? 0.12 + Math.random() * 0.12 : part === 'uarm_l' ? 0.04 : 0;
    if (!dmg) return;
    it.cond = Math.max(0, it.cond - dmg);
    if (it.cond <= 0) bus.emit('think', p, 'My wrist monitor just died.');
    else if (it.cond < 0.35) bus.emit('think', p, 'The monitor screen cracked.');
  }

  // ---------------------------------------------------------------- input
  private beep(v = 0.18) { G.audio?.ui?.('beep', v); }
  press(k: string) {
    const p = G.local; if (!p) return;
    const it = this.item(p);
    if (this.broken(it)) { G.audio?.ui?.('click', 0.3); return; }
    const d = this.data(it!);
    if (this.ring > 0) { this.ring = 0; this.beep(0.1); return; }
    this.beep();
    switch (k) {
      case 'lcd': if (this.edit) { this.bump(d); break; } this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length]; break;
      case 'mode': if (this.edit) { this.bump(d); break; } this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length]; break;
      case 'light': this.light = 6; break;
      case 'set':
        if (this.mode !== 'alarm') { this.mode = 'alarm'; this.edit = 1; break; }
        this.edit = (this.edit + 1) % 3;
        if (this.edit === 0) { d.alarmOn = true; this.beep(0.25); }
        break;
      case 'alm': d.alarmOn = !d.alarmOn; this.edit = 0; if (this.mode !== 'alarm') { this.mode = 'alarm'; } break;
    }
  }
  private bump(d: { alarmH: number; alarmM: number }) {
    if (this.edit === 1) d.alarmH = (d.alarmH + 1) % 24;
    else if (this.edit === 2) d.alarmM = (d.alarmM + 5) % 60;
  }

  // ---------------------------------------------------------------- per frame
  update(dt: number) {
    const p = G.local;
    const it = p ? this.item(p) : null;
    const show = !!p && !!it && !G.attract && !(G.ui?.modal);
    if (show !== this.shown) { this.shown = show; this.el.classList.toggle('kw-hidden', !show); }
    if (!p || !it) { this.wornItem = null; return; }
    this.wornItem = it;
    const d = this.data(it);
    // water: splash-proof, not swim-proof
    const deep = p.stance === 'swim' || G.floorAtPlayer?.(p)?.water === 'deep';
    if (deep) d.wet = Math.min(1, d.wet + dt * 0.3);
    else d.wet = Math.max(0, d.wet - dt / 90);
    if (d.wet > 0.7) it.cond = Math.max(0, it.cond - dt * 0.004);
    const broken = it.cond <= 0;
    if (broken && !this.wasBroken && d.wet > 0.7) bus.emit('think', p, 'Water got into the monitor. It is dead.');
    this.wasBroken = broken;
    this.light = Math.max(0, this.light - dt);
    this.beatFlash = Math.max(0, this.beatFlash - dt);
    this.alarm(p, d, dt, broken);
    // breathing prompt
    const b = p.body, m = ensureMind(b);
    const mind = (G.survival as any)?.mind;
    const breathing = !!mind?.breathing;
    const want = !broken && !b.dead && (m.attack > 0 || b.panic > 40 || breathing || (this.mode === 'mind' && (b.stress > 30 || m.anxiety > 0.15)));
    this.breatheBtn.classList.toggle('on', want);
    this.breatheBtn.classList.toggle('urgent', m.attack > 0 && !breathing);
    if (breathing) {
      const t = mind.breathT as number;
      const ph = Math.floor(t / 4) % 4;
      this.breatheBtn.textContent = `${['IN', 'HOLD', 'OUT', 'HOLD'][ph]} ${4 - Math.floor(t % 4)}`;
    } else this.breatheBtn.textContent = 'BREATHE';
    this.el.classList.toggle('kw-ring', this.ring > 0);
    this.el.classList.toggle('kw-alert', m.attack > 0);
    this.el.classList.toggle('kw-lit', this.light > 0 && !broken);
    this.el.classList.toggle('kw-broken', broken);
    this.el.classList.toggle('kw-cracked', !broken && it.cond < 0.35);
    this.fog.style.opacity = String(clamp01(d.wet * 1.1) * 0.85);
    // ECG trace samples
    const bpm = b.dead ? 0 : (mind?.bpm ?? 70);
    this.ecgAcc += dt * 34;
    while (this.ecgAcc >= 1) {
      this.ecgAcc -= 1;
      this.ecgPhase += bpm / 60 / 34;
      const ph = this.ecgPhase % 1;
      if (ph < this.lastBeatPhase) this.beatFlash = 0.18;
      this.lastBeatPhase = ph;
      this.ecg.copyWithin(0, 1);
      this.ecg[W - 1] = b.dead ? 0 : ecgWave(ph) + (Math.random() - 0.5) * (m.attack > 0 ? 0.25 : b.panic / 600);
    }
    // draw at ~15 fps
    this.drawT -= dt;
    if (this.drawT > 0 || !this.shown) return;
    this.drawT = 1 / 15;
    this.scroll += 1;
    this.pal = this.light > 0 ? BACK : AMBER;
    this.draw(p, it, d, broken);
  }

  private alarm(p: Player, d: { alarmH: number; alarmM: number; alarmOn: boolean }, dt: number, broken: boolean) {
    const now = Math.floor(G.clock.hourOfDay * 60);
    const at = d.alarmH * 60 + d.alarmM;
    if (this.lastMin >= 0 && d.alarmOn && !broken && now !== this.lastMin) {
      const crossed = this.lastMin < now ? (at > this.lastMin && at <= now) : (at > this.lastMin || at <= now);
      if (crossed) this.startRing(p);
    }
    this.lastMin = now;
    if (this.ring > 0) {
      this.ring -= dt;
      this.ringBeep -= dt;
      if (this.ringBeep <= 0) { this.ringBeep = 0.5; G.audio?.ui?.('beep', 0.4); }
    }
  }
  private startRing(p: Player) {
    this.ring = 9; this.ringBeep = 0;
    bus.emit('noise', { x: p.x, z: p.z, radius: 7, kind: 'alarm', zone: p.zoneKey, by: p.id });
    if (p.sleeping) {
      if (p.body.has('heavy_sleeper') && Math.random() < 0.5) return; // slept right through it
      setTimeout(() => { if (p.sleeping) { p.actions.clear(); bus.emit('think', p, 'Beep beep beep... okay. Up.'); } }, 600);
    } else bus.emit('think', p, 'My alarm.');
  }

  // ---------------------------------------------------------------- drawing
  private draw(p: Player, it: Item, d: { alarmH: number; alarmM: number; alarmOn: boolean; wet: number }, broken: boolean) {
    const s = this.scr, P = this.pal;
    const C = (h: number) => Screen.c(h);
    s.clear(broken ? 0x060504 : P.bg);
    if (broken) {
      // dead glass: a few stuck pixels
      for (let i = 0; i < 6; i++) s.px((i * 37 + 11) % W, (i * 13 + 5) % H, C(0x241404));
      this.blit();
      return;
    }
    const b = p.body, m = ensureMind(b);
    const mind = (G.survival as any)?.mind;
    // damaged or soaked units drop segments
    const flaky = (1 - clamp01(it.cond / 0.35)) * 0.25 + Math.max(0, d.wet - 0.4) * 0.6;
    const glitch = mind?.watchGlitch as string | null;
    if (glitch) {
      if (Math.floor(G.time * 8) % 2 === 0) { s.text(glitch, Math.max(1, (W - s.textW(glitch)) / 2), 16, C(P.hot)); }
      this.scramble(flaky);
      this.blit();
      return;
    }
    if (b.dead) { this.drawFlatline(s); this.blit(); return; }
    switch (this.mode) {
      case 'time': this.drawTime(p, d); break;
      case 'vital': this.drawVital(p); break;
      case 'mind': this.drawMind(p); break;
      case 'alarm': this.drawAlarm(d); break;
    }
    // a panic attack takes over the bottom line in every mode
    if (m.attack > 0 && this.mode !== 'mind' && !mind?.breathing) {
      s.rect(0, 31, W, 9, C(P.bg));
      if (Math.floor(G.time * 3) % 2 === 0) s.text('BREATHE', 2, 32, C(P.hot));
      s.text(String(Math.round(mind?.bpm ?? 0)), W - 20, 32, C(P.lit));
    }
    if (this.ring > 0 && Math.floor(G.time * 4) % 2 === 0) { s.rect(0, 0, W, H, C(P.lit)); s.text('ALARM', 37, 16, C(P.bg)); }
    this.scramble(flaky);
    this.blit();
  }
  private blit() { this.ctx.putImageData(this.scr.img, 0, 0); }
  private scramble(f: number) {
    if (f <= 0.02) return;
    const s = this.scr, P = this.pal;
    const n = Math.floor(f * 60);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() * W) | 0, y = (Math.random() * H) | 0;
      s.rect(x, y, 1 + ((Math.random() * 5) | 0), 1, Screen.c(Math.random() < 0.5 ? P.bg : P.ghost));
    }
  }

  private seg7(x: number, y: number, ch: string, w: number, h: number, t: number, on: boolean, ghost = true) {
    const s = this.scr, P = this.pal;
    const mid = y + Math.floor((h - t) / 2);
    const R: Record<string, [number, number, number, number]> = {
      a: [x + t, y, w - 2 * t, t], d: [x + t, y + h - t, w - 2 * t, t], g: [x + t, mid, w - 2 * t, t],
      f: [x, y + t, t, mid - y - t], b: [x + w - t, y + t, t, mid - y - t],
      e: [x, mid + t, t, y + h - t - mid - t], c: [x + w - t, mid + t, t, y + h - t - mid - t],
    };
    const lit = SEG[ch] ?? '';
    for (const k of 'abcdefg') {
      const r = R[k];
      if (lit.includes(k) && on) s.rect(r[0], r[1], r[2], r[3], Screen.c(P.lit));
      else if (ghost) s.rect(r[0], r[1], r[2], r[3], Screen.c(P.ghost));
    }
  }
  private bigNum(x: number, y: number, str: string, blank = -1) {
    let cx = x;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === ':') { const on = Math.floor(G.time * 2) % 2 === 0; const c = Screen.c(on ? this.pal.lit : this.pal.ghost); this.scr.rect(cx, y + 4, 2, 2, c); this.scr.rect(cx, y + 11, 2, 2, c); cx += 4; continue; }
      this.seg7(cx, y, ch, 9, 17, 2, blank < 0 || (i !== blank && i !== blank + 1));
      cx += 11;
    }
    return cx;
  }
  private icon(rows: string[], x: number, y: number, c: number) { rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') this.scr.px(x + i, y + j, c); }); }

  private glyph(g: MoodGlyph, x: number, y: number, sc: number, c: number) {
    const s = this.scr;
    const dot = (i: number, j: number) => s.rect(x + i * sc, y + j * sc, sc, sc, c);
    RING.forEach((r, j) => { for (let i = 0; i < 9; i++) if (r[i] === '#') dot(i, j); });
    const eyes = () => { dot(3, 3); dot(5, 3); };
    switch (g) {
      case 'ok': eyes(); dot(2, 5); dot(3, 6); dot(4, 6); dot(5, 6); dot(6, 5); break;
      case 'meh': eyes(); dot(3, 6); dot(4, 6); dot(5, 6); break;
      case 'sad': eyes(); dot(3, 5); dot(4, 5); dot(5, 5); dot(2, 6); dot(6, 6); break;
      case 'low': dot(2, 3); dot(3, 3); dot(5, 3); dot(6, 3); dot(3, 6); dot(4, 5); dot(5, 6); dot(6, 4); break;
      case 'fear': dot(3, 2); dot(3, 3); dot(5, 2); dot(5, 3); dot(4, 5); dot(3, 6); dot(5, 6); dot(4, 7); break;
      case 'attack': if (Math.floor(G.time * 6) % 2) { dot(3, 3); dot(5, 3); } dot(3, 5); dot(4, 5); dot(5, 5); dot(3, 6); dot(5, 6); dot(4, 6); break;
      case 'dissoc': dot(2, 3); dot(3, 2); dot(3, 4); dot(5, 3); dot(6, 2); dot(6, 4); dot(3, 6); dot(4, 6); dot(5, 6); break;
      case 'sleep': dot(2, 4); dot(3, 4); dot(5, 4); dot(6, 4); dot(4, 6); break;
      case 'lonely': eyes(); dot(6, 4); dot(6, 5); dot(3, 6); dot(4, 6); break;
      case 'tense': eyes(); dot(2, 6); dot(3, 5); dot(4, 6); dot(5, 5); dot(6, 6); dot(7, 2); dot(7, 3); break;
    }
  }

  private alerts(p: Player): string[] {
    const b = p.body, m = b.mind, out: string[] = [];
    if (m.attack > 0) out.push('PANIC');
    if (b.bleedRate() > 0.02) out.push('BLEED');
    if (b.thirst >= 70) out.push('WATER');
    if (b.hunger >= 45) out.push('FOOD');
    if (b.temp < 36) out.push('COLD');
    if (b.temp > 38.2) out.push('HEAT');
    if (b.fever() > 0.1) out.push('INFECT');
    if (b.lucidity < 40) out.push('LUCID');
    if (b.fatigue > 85) out.push('SLEEP');
    if (b.corruption > 25) out.push('DESYNC');
    return out;
  }

  private drawTime(p: Player, d: { alarmOn: boolean }) {
    const s = this.scr, P = this.pal, C = Screen.c;
    const m = p.body.mind;
    const unreal = m.dissoc > 0 && Math.floor(G.time * 1.5) % 3 === 0;
    const hh = Math.floor(G.clock.hourOfDay), mm = G.clock.minute;
    const t = unreal ? '--:--' : `${String(hh).padStart(2, ' ')}:${String(mm).padStart(2, '0')}`;
    this.bigNum(2, 2, t);
    // seconds ticks under the digits (one per in-game 5 minutes)
    for (let i = 0; i < 12; i++) s.rect(2 + i * 4, 21, 3, 1, C(i <= mm / 5 ? P.dim : P.ghost));
    // right block: day, mood, pulse, alarm bell
    s.text('D' + G.clock.day, 54, 2, C(P.lit));
    this.glyph(moodGlyph(p.body), 93, 1, 1, C(P.lit));
    this.icon(HEART, 54, 12, C(this.beatFlash > 0 ? P.hot : P.dim));
    const bpm = Math.round((G.survival as any)?.mind?.bpm ?? 70);
    s.text(String(bpm), 61, 11, C(P.lit));
    this.icon(BELL, 97, 12, C(d.alarmOn ? P.lit : P.ghost));
    // zone + heading
    const z = G.zone;
    const full: string = (z as any)?.name || z?.key || '';
    const name = (full.includes('—') ? full.split('—').pop()! : full).trim().toUpperCase();   // "Level 0 — The Lobby" -> "THE LOBBY"
    const head = heading(p.facing);
    const room = 12;
    const shown = name.length > room ? (name + '   ' + name).slice(this.scrollIdx(name.length + 3), this.scrollIdx(name.length + 3) + room) : name;
    s.text(shown, 2, 23, C(P.dim), 1, 6 * room);
    s.text(head, W - 2 - s.textW(head), 23, C(P.lit));
    this.bottom(p);
  }
  private scrollIdx(n: number) { return Math.floor(this.scroll / 5) % n; }

  /** bottom line: flashing alerts, otherwise temperature and breathing */
  private bottom(p: Player) {
    const s = this.scr, P = this.pal, C = Screen.c;
    const al = this.alerts(p);
    s.hline(0, W - 1, 31, C(P.ghost), 2);
    if (al.length) {
      const i = Math.floor(G.time / 1.3) % al.length;
      if (Math.floor(G.time * 3) % 3 !== 0) s.text('!' + al[i], 2, 33, C(P.hot));
      if (al.length > 1) s.text(`${i + 1}/${al.length}`, W - 20, 33, C(P.dim));
    } else {
      const b = p.body;
      const br = breathState(b, p.running, !!(G.survival as any)?.mind?.breathing);
      s.text(`${b.temp.toFixed(1)}C`, 2, 33, C(P.dim));
      s.text(br, W - 2 - s.textW(br), 33, C(P.dim));
    }
  }

  private drawVital(p: Player) {
    const s = this.scr, P = this.pal, C = Screen.c;
    const b = p.body;
    const mind = (G.survival as any)?.mind;
    const bpm = clamp(Math.round(mind?.bpm ?? 70), 0, 199);
    this.bigNum(2, 2, String(bpm).padStart(3, ' '));
    this.icon(HEART, 37, 3, C(this.beatFlash > 0 ? P.hot : P.ghost));
    s.text('BPM', 35, 12, C(P.dim));
    const tc = b.temp < 36 || b.temp > 38 ? P.hot : P.lit;
    s.text(`${b.temp.toFixed(1)}C`, 58, 2, C(tc));
    const br = breathState(b, p.running, !!mind?.breathing);
    s.text(br, 58, 11, C(br === 'CALM' || br === 'SLOW' || br === 'DEEP' ? P.lit : P.hot));
    // trace
    const base = 26;
    for (let x = 0; x < W; x++) s.px(x, base, C(P.ghost));
    let prev = base;
    for (let x = 0; x < W; x++) {
      const y = Math.round(base - this.ecg[x] * 6);
      const y0 = Math.min(prev, y), y1 = Math.max(prev, y);
      for (let yy = y0; yy <= y1; yy++) s.px(x, yy, C(x > W - 6 ? P.lit : P.dim));
      prev = y;
    }
    s.hline(0, W - 1, 31, C(P.ghost), 2);
    const al = this.alerts(p);
    if (al.length && Math.floor(G.time * 3) % 3 !== 0) s.text('!' + al[Math.floor(G.time / 1.3) % al.length], 2, 33, C(P.hot));
    else s.text(`RESP ${breathRate(br)}/MIN`, 2, 33, C(P.dim));
  }

  private drawMind(p: Player) {
    const s = this.scr, P = this.pal, C = Screen.c;
    const b = p.body, m = b.mind;
    const mind = (G.survival as any)?.mind;
    if (mind?.breathing) { this.drawBreathing(mind.breathT as number); return; }
    const g = moodGlyph(b);
    this.glyph(g, 2, 2, 2, C(g === 'attack' || g === 'fear' ? P.hot : P.lit));
    const label = ({ ok: 'STEADY', meh: 'FLAT', sad: 'DOWN', low: 'LOW', fear: 'AFRAID', attack: 'PANIC', dissoc: 'UNREAL', sleep: 'ASLEEP', lonely: 'LONELY', tense: 'TENSE' } as Record<MoodGlyph, string>)[g];
    s.text(label, 24, 2, C(P.lit));
    // stress and panic bars
    const bar = (y: number, tag: string, v: number) => {
      s.text(tag, 24, y, C(P.dim));
      for (let i = 0; i < 10; i++) s.rect(38 + i * 6, y + 1, 5, 5, C(i < Math.round(v * 10) ? (i >= 7 ? P.hot : P.lit) : P.ghost));
    };
    bar(11, 'ST', b.stress / 100);
    bar(20, 'PN', b.panic / 100);
    s.hline(0, W - 1, 30, C(P.ghost), 2);
    const conds = conditions(b);
    const meds = medsLines(b);
    const lines = [...conds.map((c) => c.name.toUpperCase()), ...meds];
    const txt = lines.length ? lines[Math.floor(G.time / 2.5) % lines.length] : (b.stress > 30 ? 'TRY BREATHING' : 'ALL QUIET');
    s.text(txt, 2, 32, C(conds.length && conds[0].level >= 3 ? P.hot : P.dim), 1, W - 4);
    void m;
  }

  /** box breathing guide: a dot walks the square, 4 seconds a side */
  private drawBreathing(t: number) {
    const s = this.scr, P = this.pal, C = Screen.c;
    const x0 = 6, y0 = 6, L = 28;
    s.frame(x0, y0, L, L, C(P.dim));
    const ph = Math.floor(t / 4) % 4, f = (t % 4) / 4;
    const pts: [number, number][] = [[x0 + f * L, y0 + L], [x0 + L, y0 + L - f * L], [x0 + L - f * L, y0], [x0, y0 + f * L]];
    // in: along the bottom, hold: up the right, out: along the top, hold: down the left
    const [dx, dy] = pts[ph];
    s.disc(Math.round(dx), Math.round(dy), 2, C(P.lit));
    const word = ['IN', 'HOLD', 'OUT', 'HOLD'][ph];
    s.text(word, 40, 5, C(P.lit), 2);
    this.seg7(92, 4, String(4 - Math.floor(t % 4)), 9, 15, 2, true);
    s.text('BOX BREATH', 40, 26, C(P.dim));
  }

  private drawAlarm(d: { alarmH: number; alarmM: number; alarmOn: boolean }) {
    const s = this.scr, P = this.pal, C = Screen.c;
    s.text('ALARM', 2, 1, C(P.lit));
    s.text(d.alarmOn ? 'ON' : 'OFF', W - 2 - s.textW(d.alarmOn ? 'ON' : 'OFF'), 1, C(d.alarmOn ? P.lit : P.dim));
    this.icon(BELL, 36, 2, C(d.alarmOn ? P.lit : P.ghost));
    const blink = Math.floor(G.time * 3) % 2 === 0;
    const blank = this.edit === 1 && blink ? 0 : this.edit === 2 && blink ? 3 : -1;
    const str = `${String(d.alarmH).padStart(2, '0')}:${String(d.alarmM).padStart(2, '0')}`;
    // bigNum blanks two digits starting at `blank` (string index, ':' counted)
    let cx = 2;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === ':') { s.rect(cx, 14, 2, 2, C(P.lit)); s.rect(cx, 21, 2, 2, C(P.lit)); cx += 4; continue; }
      const off = (blank === 0 && i < 2) || (blank === 3 && i > 2);
      this.seg7(cx, 10, ch, 9, 17, 2, !off);
      cx += 11;
    }
    s.text(G.clock.timeString(), 58, 15, C(P.dim));
    s.hline(0, W - 1, 30, C(P.ghost), 2);
    const hint = this.edit === 1 ? 'MODE=+1H SET=MIN' : this.edit === 2 ? 'MODE=+5M SET=OK' : d.alarmOn ? 'SET=EDIT ALM=OFF' : 'SET=EDIT ALM=ON';
    s.text(hint, 2, 32, C(P.dim), 1, W - 4);
  }

  private drawFlatline(s: Screen) {
    const P = this.pal, C = Screen.c;
    s.text('---', 2, 4, C(P.dim), 2);
    s.text('BPM', 44, 10, C(P.dim));
    for (let x = 0; x < W; x++) s.px(x, 26, C(Math.floor(G.time * 2) % 2 ? P.lit : P.dim));
    s.text('NO SIGNAL', 2, 32, C(P.hot));
  }
}

/** PQRST-ish trace for one beat (phase 0..1) */
function ecgWave(ph: number): number {
  if (ph < 0.08) return 0.15 * Math.sin((ph / 0.08) * Math.PI);
  if (ph < 0.13) return 0;
  if (ph < 0.15) return -0.2;
  if (ph < 0.18) return 1;
  if (ph < 0.21) return -0.4;
  if (ph < 0.36) return 0;
  if (ph < 0.5) return 0.3 * Math.sin(((ph - 0.36) / 0.14) * Math.PI);
  return 0;
}

/** world heading from a facing angle: 0 = +x (east), north is -z */
function heading(facing: number): string {
  const deg = (((facing * 180) / Math.PI + 90) % 360 + 360) % 360;
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
}
