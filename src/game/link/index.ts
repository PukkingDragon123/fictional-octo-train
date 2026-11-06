// The operator-unit link. You are not in the backrooms: you are strapped into
// a rig at the Meridian Institute and your consciousness drives the unit's
// body. The link carries your fear as well as your hands: low sanity stresses
// it, and it degrades in escalating ways:
//   lag       the unit answers late (movement replayed from a moment ago)
//   drift     the controls slide round (the stick's direction wanders)
//   invert    the controls flip
//   stumble   the unit staggers on its own
//   flail     the unit strikes itself (a bruise, a flinch)
//   wander    the unit walks off by itself for a few seconds
//   desync    the controls keep drifting until you resync the carrier
//             (the waveform repair, ./repair.ts: L, or tap the status line)
//   lost      a full disconnect: the picture drops to static, the unit is out
//             of control (walks off, stumbles, hits itself) until you restore
//             the rig (the breaker repair, which opens by itself)
// Rare when sane (an odd latency blip every twenty minutes or so at full
// sanity), dramatic when sanity is low. Dr. Calder comments on each.
// Quiet during cutscenes, the intro and the staged tutorial; dormant on ?quick
// dev starts unless ?link is given (the walkthrough runs on ?quick).
//
//   installLink(g)            once per session (src/game/session.ts)
//   G.link.force(kind)        trigger one now (dev, the tutorial's lesson)
//   G.link.sanity / stress / state
import { G } from '../G';
import type { Game, GameSystem } from '../game';
import type { MoveAxis, Action } from '../../core/input';
import type { BodyPart } from '../../items/item';
import { bus } from '../../core/events';
import { TUT } from '../tutorial/state';
import { Repair } from './repair';
import './link.css';

export type Glitch = 'lag' | 'drift' | 'invert' | 'stumble' | 'flail' | 'wander' | 'desync' | 'lost';
export type LinkState = 'ok' | 'desync' | 'lost';

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** what Dr. Calder says about it */
const SAY: Record<Glitch | 'back' | 'resync' | 'warn', string[]> = {
  lag: ['The link is lagging. That is your fear, not the hardware.', 'Latency. Breathe. The unit is a beat behind you.', 'You are a little late in there. Slow down.'],
  drift: ['The controls are sliding. Hold your course and correct.', 'Drift on the link. Steer against it.'],
  invert: ['Inverted. I know. Think backwards for a moment.', 'The link flipped your hands. It will pass.'],
  stumble: ['The unit stumbled. That was not you, was it.', 'It tripped on its own. Your panic leaks down the wire.'],
  flail: ['It hit itself. Calm down, unit. Calm down, operator.', 'The body is fighting the link. Get your sanity up.', 'That bruise is yours as much as its. Steady.'],
  wander: ['It is walking without you. Hold on.', 'The unit has a mind of its own today. Literally.'],
  desync: ['Desync. The carrier has slipped. Resync it when you are safe: L on the console.', 'You are out of phase with the unit. Resync before it gets worse.'],
  lost: ['Lost carrier! The rig tripped. Throw the breakers, quickly, it is alone in there.', 'Disconnect. The unit is on its own. Restore the rig, now.'],
  back: ['There you are. Do not do that to me.', 'Carrier restored. Check the unit for damage.', 'Back in. That was close.'],
  resync: ['Locked. Good hands.', 'In phase. Better.', 'Resynced. Keep your head.'],
  warn: ['Your sanity is low. The link will not hold like this. Rest, eat, find light.', 'I am reading a lot of fear on the line. The link is going to start slipping.'],
};

interface Active { kind: Glitch; t: number; dur: number }

export class LinkSystem implements GameSystem {
  name = 'link';
  /** sanity as the body HUD's brain shows it (0..100) */
  sanity = 100;
  /** 0 calm .. 1 a link at breaking point */
  stress = 0;
  state: LinkState = 'ok';
  /** dev / tests: never by itself (still answers force()) */
  dormant = false;
  private cur: Active | null = null;
  private cool = 30;
  private t = 0;
  private hist: { t: number; x: number; y: number }[] = [];
  private autoAng = 0; private autoMag = 0; private autoT = 0;
  private harmT = 0;
  private noiseA = 0; private blackA = 0; private glitchK = 0;
  private root: HTMLDivElement; private noise: HTMLCanvasElement; private nctx: CanvasRenderingContext2D; private black: HTMLDivElement; private status: HTMLDivElement;
  private statusKey = '';
  private repair: Repair;
  private blockOff: (() => void) | null = null;
  private warned = false;
  private lostT = 0;
  private noiseT = 0;

  constructor(private g: Game) {
    const q = new URLSearchParams(location.search);
    this.dormant = q.has('quick') && !q.has('link');
    const el = (cls: string, tag = 'div') => { const e = document.createElement(tag); e.className = cls; return e; };
    this.root = el('lk-root') as HTMLDivElement;
    this.noise = el('lk-noise', 'canvas') as HTMLCanvasElement;
    this.nctx = this.noise.getContext('2d')!;
    this.black = el('lk-black') as HTMLDivElement;
    this.status = el('lk-status') as HTMLDivElement;
    this.root.append(this.black, this.noise, this.status);
    document.body.appendChild(this.root);
    this.repair = new Repair(this.root);
    this.status.addEventListener('pointerdown', (e) => { if (this.state === 'desync' && !this.repair.active) { e.preventDefault(); e.stopPropagation(); this.openResync(); } });
    this.hookInput();
    (g as unknown as { link: LinkSystem }).link = this;
    if (import.meta.env.DEV) (window as unknown as { __link: LinkSystem }).__link = this;
  }

  // ================================================================ input
  private hookInput() {
    const inp = this.g.input as unknown as { moveAxis: () => MoveAxis };
    const orig = inp.moveAxis.bind(inp);
    inp.moveAxis = () => this.move(orig());
  }
  /** the stick / keys, as the unit receives them */
  private move(a: MoveAxis): MoveAxis {
    const now = this.g.time;
    let x = a.x * a.mag, y = a.y * a.mag;
    const h = this.hist;
    if (!h.length || h[h.length - 1].t !== now) h.push({ t: now, x, y });
    while (h.length > 2 && now - h[0].t > 2) h.shift();
    const k = this.cur?.kind;
    const desync = this.state === 'desync';
    // latency: what you did a moment ago
    const lag = k === 'lag' ? 0.22 + this.stress * 0.45 : desync ? 0.12 + this.stress * 0.2 : 0;
    if (lag > 0) { for (let i = h.length - 1; i >= 0; i--) if (now - h[i].t >= lag) { x = h[i].x; y = h[i].y; break; } }
    // drift: the direction slides round
    const dr = k === 'drift' ? Math.sin(this.t * 1.3) * (0.7 + this.stress * 0.6) : desync ? Math.sin(this.t * 0.9) * (0.35 + this.stress * 0.4) : 0;
    if (dr) { const c = Math.cos(dr), s = Math.sin(dr); [x, y] = [x * c - y * s, x * s + y * c]; }
    if (k === 'invert') { x = -x; y = -y; }
    // the unit acting alone
    if (k === 'wander' || this.state === 'lost' || this.repair.active) {
      if (this.state === 'lost' || k === 'wander') { x = Math.cos(this.autoAng) * this.autoMag; y = Math.sin(this.autoAng) * this.autoMag; }
      else { x = 0; y = 0; }
    }
    const m = Math.hypot(x, y);
    if (m < 1e-3) return { x: 0, y: 0, mag: 0, analog: false };
    return { x: x / m, y: y / m, mag: Math.min(1, m), analog: a.analog || m < 0.99 };
  }
  /** no actions from the operator while the rig is down or the console is up (Esc still pauses) */
  private block(on: boolean) {
    if (on === !!this.blockOff) return;
    if (!on) { const f = this.blockOff; this.blockOff = null; f?.(); return; }
    const inp = this.g.input as unknown as { hit: (a: Action) => boolean; down: (a: Action) => boolean };
    const ownHit = Object.prototype.hasOwnProperty.call(inp, 'hit') ? inp.hit : undefined;
    const ownDown = Object.prototype.hasOwnProperty.call(inp, 'down') ? inp.down : undefined;
    const hit0 = inp.hit.bind(inp), down0 = inp.down.bind(inp);
    const hit = (a: Action) => (a === 'pause' ? hit0(a) : false);
    const down = (a: Action) => (a === 'pause' ? down0(a) : false);
    inp.hit = hit; inp.down = down;
    const mouse = this.g.input as unknown as { mouseDown: boolean[] };
    this.blockOff = () => {
      if (inp.hit === hit) { if (ownHit) inp.hit = ownHit; else delete (inp as { hit?: unknown }).hit; }
      if (inp.down === down) { if (ownDown) inp.down = ownDown; else delete (inp as { down?: unknown }).down; }
      mouse.mouseDown = [false, false, false];
    };
  }

  // ================================================================ per frame
  update(dt: number) {
    const g = this.g, p = g.local;
    if (!p) return;
    this.t += dt;
    // sanity, as the brain on the HUD reads it
    const hud = (g as unknown as { hudBody?: { sanity?: (p: unknown) => number } }).hudBody;
    let san = 100;
    try { san = hud?.sanity ? hud.sanity(p) : sanityOf(p); } catch { san = sanityOf(p); }
    this.sanity += (san - this.sanity) * Math.min(1, dt * 2);
    this.stress = clamp01((72 - this.sanity) / 62);
    const quiet = this.quiet();
    // the warning, once, when it starts to matter
    if (!quiet && this.stress > 0.3 && !this.warned) { this.warned = true; this.say('warn', true); }
    if (this.stress < 0.1) this.warned = false;
    // ---- a running glitch
    const c = this.cur;
    if (c) {
      c.t += dt;
      if (c.kind === 'wander') this.steerAuto(dt, 0.75);
      if (c.t >= c.dur) this.cur = null;
    }
    // ---- schedule the next one
    this.cool -= dt;
    if (!quiet && !this.dormant && !c && this.state !== 'lost' && this.cool <= 0) {
      const s = this.stress;
      const rate = 1 / 1500 + Math.pow(s, 1.6) / 12;
      if (Math.random() < rate * dt) this.trigger(this.choose(), false);
    }
    // ---- the states
    if (this.state === 'desync') {
      if (!this.repair.active && !p.body.dead && !g.paused && g.input.keyHit('KeyL')) this.openResync();
      // a desynced link keeps slipping
      if (!this.cur && Math.random() < dt * (0.02 + this.stress * 0.08) && !quiet) this.trigger(pick<Glitch>(['lag', 'drift', 'stumble']), true);
    }
    if (this.state === 'lost') this.updateLost(dt);
    this.block(this.state === 'lost' || this.repair.active);
    this.repair.update(dt);
    this.paint(dt);
  }

  /** cutscenes, menus, death: the link holds */
  private quiet(): boolean {
    const g = this.g, p = g.local;
    if (!p || p.body.dead || p.sleeping || g.transitioning || p.inVehicle || g.paused) return true;
    if (g.attract && this.state !== 'lost') return true;
    const intro = g.systems.find((s) => s.name === 'intro') as { phase?: string } | undefined;
    if (intro && intro.phase !== 'done') return true;
    if (TUT.running) return true;
    return false;
  }

  /** which one, by how frightened the link is */
  private choose(): Glitch {
    const s = this.stress;
    const w: [Glitch, number][] = [
      ['lag', 1],
      ['drift', s > 0.15 ? 1 : 0],
      ['invert', s > 0.3 ? 0.7 : 0],
      ['stumble', s > 0.25 ? 0.9 : 0],
      ['flail', s > 0.45 ? 0.8 : 0],
      ['wander', s > 0.4 ? 0.7 : 0],
      ['desync', s > 0.35 && this.state === 'ok' ? 0.4 + s : 0],
      ['lost', s > 0.6 ? (s - 0.6) * 2.4 : 0],
    ];
    let tot = 0; for (const [, v] of w) tot += v;
    let r = Math.random() * tot;
    for (const [k, v] of w) { r -= v; if (r <= 0) return k; }
    return 'lag';
  }

  /** start one now (force: dev, the tutorial's lesson) */
  force(kind: Glitch) { this.trigger(kind, true); }
  private trigger(kind: Glitch, forced: boolean) {
    const p = this.g.local; if (!p) return;
    const s = this.stress;
    this.cool = forced ? 6 : 90 + (10 - 90) * s;
    // a hit on the feed every time
    this.glitchK = Math.max(this.glitchK, kind === 'lost' ? 1 : 0.45);
    this.noiseA = Math.max(this.noiseA, kind === 'lost' ? 1 : 0.35);
    G.audio?.flat?.('static_burst', 'sfx', kind === 'lost' ? 0.6 : 0.3);
    switch (kind) {
      case 'lag': this.cur = { kind, t: 0, dur: 2 + s * 3 }; break;
      case 'drift': this.cur = { kind, t: 0, dur: 3 + s * 4 }; break;
      case 'invert': this.cur = { kind, t: 0, dur: 2.5 + s * 3 }; break;
      case 'stumble': this.cur = { kind, t: 0, dur: 1 }; this.stumble(); break;
      case 'flail': this.cur = { kind, t: 0, dur: 1.2 }; this.harm(); break;
      case 'wander': this.cur = { kind, t: 0, dur: 2.5 + s * 2.5 }; this.autoAng = Math.random() * Math.PI * 2; this.autoMag = 0.7; break;
      case 'desync': this.state = 'desync'; this.cur = null; G.audio?.flat?.('watchDeny', 'ui', 0.5); break;
      case 'lost': this.goLost(); break;
    }
    this.say(kind, forced || kind === 'desync' || kind === 'lost');
    bus.emit('linkGlitch', { kind, stress: s });
  }

  private stumble() {
    const p = this.g.local!;
    p.playAnim?.('stagger', 0.9);
    const a = Math.random() * Math.PI * 2;
    p.vx += Math.cos(a) * 2.2; p.vz += Math.sin(a) * 2.2;
    G.audio?.flat?.('debtor_grunt', 'voice', 0.5);
  }
  /** the unit strikes itself */
  private harm() {
    const p = this.g.local!;
    const parts: BodyPart[] = ['head', 'farm_l', 'farm_r', 'uarm_l', 'torso_u', 'hand_r' as BodyPart];
    try { p.body.addInjury(pick(parts), 'bruise', 0.12 + this.stress * 0.18); } catch { /* no such part on this body */ }
    p.playAnim?.(Math.random() < 0.5 ? 'flinch' : 'shocked', 0.8);
    G.audio?.flat?.('hit_blunt', 'sfx', 0.7);
    G.audio?.flat?.('hurt_player', 'voice', 0.5);
    this.g.camera?.shake?.(0.35, 0.3);
    this.g.pr.fx.hurt = Math.max(this.g.pr.fx.hurt, 0.5);
  }

  // ---------------------------------------------------------------- lost
  private goLost() {
    this.state = 'lost'; this.cur = null; this.lostT = 0; this.harmT = 2 + Math.random() * 2;
    this.autoAng = Math.random() * Math.PI * 2; this.autoMag = 0.8; this.autoT = 1.5;
    G.audio?.flat?.('band_shock', 'sfx', 0.6);
    G.audio?.flat?.('power_off', 'sfx', 0.6);
    const p = this.g.local!;
    G.audio?.positionalLoop?.('link_static', 'static', p.x, p.z, 0.5, 1, 60);
    setTimeout(() => { if (this.state === 'lost' && !this.repair.active) this.repair.open('breakers', this.stress, (ok) => { if (ok) this.restore(); }); }, 900);
  }
  private updateLost(dt: number) {
    const p = this.g.local!;
    this.lostT += dt;
    G.audio?.positionalLoop?.('link_static', 'static', p.x, p.z, 0.5, 1, 60);
    this.steerAuto(dt, 0.85);
    this.harmT -= dt;
    if (this.harmT <= 0) {
      this.harmT = 2.5 + Math.random() * 3;
      if (Math.random() < 0.55) this.harm(); else this.stumble();
    }
    // the console never stays shut while the rig is down
    if (!this.repair.active && this.lostT > 1.2) this.repair.open('breakers', this.stress, (ok) => { if (ok) this.restore(); });
  }
  /** the unit picks its own way: a heading that wanders, now and then a stop */
  private steerAuto(dt: number, mag: number) {
    this.autoT -= dt;
    if (this.autoT <= 0) { this.autoT = 0.8 + Math.random() * 2; this.autoMag = Math.random() < 0.25 ? 0 : mag; }
    this.autoAng += (Math.random() - 0.5) * dt * 3;
    const p = this.g.local!;
    // walked into something: turn away
    if (this.autoMag > 0 && p.speed < 0.2) this.autoAng += dt * 4;
  }
  private restore() {
    this.state = 'ok'; this.cur = null; this.cool = 25;
    G.audio?.positionalLoop?.('link_static', null);
    G.audio?.flat?.('power_on', 'sfx', 0.5);
    this.noiseA = 0.6; this.glitchK = 0.4;
    this.g.missions?.set?.('link:resync');
    this.say('back', true);
  }
  private openResync() {
    if (this.repair.active) return;
    this.repair.open('resync', this.stress, (ok) => {
      if (!ok) return;
      this.state = 'ok'; this.cur = null; this.cool = 20;
      this.g.missions?.set?.('link:resync');
      this.say('resync', true);
      bus.emit('linkResync', {});
    });
  }

  // ================================================================ the picture
  private paint(dt: number) {
    const lost = this.state === 'lost';
    // the feed: static over the picture, tearing through the renderer's own glitch
    const nGoal = lost ? 0.85 : this.cur ? 0.1 + this.stress * 0.15 : this.state === 'desync' ? 0.06 : 0;
    this.noiseA += (Math.max(nGoal, 0) - this.noiseA) * Math.min(1, dt * (this.noiseA > nGoal ? 2.5 : 8));
    this.blackA += ((lost ? 0.55 : 0) - this.blackA) * Math.min(1, dt * 4);
    this.glitchK = Math.max(0, this.glitchK - dt * 1.4);
    const fx = this.g.pr.fx;
    const gl = Math.max(this.glitchK, lost ? 0.7 : this.cur ? 0.08 + this.stress * 0.12 : this.state === 'desync' ? 0.05 : 0);
    if (gl > 0.001) fx.glitch = Math.max(fx.glitch, gl);
    this.noise.style.opacity = this.noiseA.toFixed(3);
    this.black.style.opacity = this.blackA.toFixed(3);
    if (this.noiseA > 0.01) {
      this.noiseT -= dt;
      if (this.noiseT <= 0) { this.noiseT = 1 / 24; this.drawNoise(); }
    }
    // the status line
    const touch = document.documentElement.classList.contains('nc-touch');
    let key = '', html = '', flick = false, tap = false;
    const k = this.cur?.kind;
    if (lost) { key = 'lost'; html = '<b class="dead">CARRIER LOST</b><i>the unit is on its own</i>'; flick = true; }
    else if (this.repair.active) { key = ''; }
    else if (this.state === 'desync') { key = 'desync'; html = `<b class="bad">LINK DESYNC</b><i>${touch ? 'tap here' : 'press L'} to resync</i>`; tap = true; flick = !!k; }
    else if (k === 'lag') { key = 'lag'; html = `<b>LINK LATENCY ${Math.round(220 + this.stress * 450)} MS</b>`; flick = true; }
    else if (k === 'drift') { key = 'drift'; html = '<b class="bad">LINK DRIFT</b>'; flick = true; }
    else if (k === 'invert') { key = 'invert'; html = '<b class="bad">LINK INVERTED</b>'; flick = true; }
    else if (k === 'wander') { key = 'wander'; html = '<b class="dead">UNIT UNRESPONSIVE</b>'; flick = true; }
    else if (k === 'flail' || k === 'stumble') { key = 'motor'; html = '<b class="bad">MOTOR FEEDBACK</b>'; flick = true; }
    if (key !== this.statusKey) { this.statusKey = key; if (html) this.status.innerHTML = html; }
    this.status.classList.toggle('on', !!key);
    this.status.classList.toggle('flick', flick);
    this.status.classList.toggle('tap', tap);
  }
  private drawNoise() {
    const c = this.noise, x = this.nctx;
    const W = Math.max(64, Math.ceil(innerWidth / 4)), H = Math.max(36, Math.ceil(innerHeight / 4));
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const img = x.createImageData(W, H), d = img.data;
    // rolling bands where the signal is worst
    const band = (this.t * 37) % H;
    for (let y = 0; y < H; y++) {
      const by = Math.abs(y - band) < 3 ? 1.6 : 1;
      for (let i = 0; i < W; i++) {
        const o = (y * W + i) * 4, v = Math.random() * 200 * by;
        d[o] = v; d[o + 1] = v; d[o + 2] = Math.min(255, v + 18); d[o + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
  }

  private sayT = -99;
  private say(kind: keyof typeof SAY, must = false) {
    if (!must && this.t - this.sayT < 18) return;
    this.sayT = this.t;
    const h = G.handler as unknown as { say?: (t: string, o?: object) => void } | null;
    h?.say?.(pick(SAY[kind]), { pri: 2, key: 'link:' + kind, cd: must ? 3 : 25 });
  }

  dispose() {
    this.block(false);
    this.repair.destroy();
    this.root.remove();
    G.audio?.positionalLoop?.('link_static', null);
  }
}

/** sanity without the HUD (headless, the HUD not built): the brain's own formula */
function sanityOf(p: unknown): number {
  const b = (p as { body: { lucidity?: number; corruption?: number; panic?: number; mind?: Record<string, number> } }).body;
  const m = b.mind || {};
  return Math.max(0, Math.min(100, (b.lucidity ?? 100) - (m.anxiety ?? 0) * 18 - (m.depression ?? 0) * 14 - (m.trauma ?? 0) * 12 - (b.corruption ?? 0) * 0.25 - Math.max(0, (b.panic ?? 0) - 50) * 0.3 - ((m.attack ?? 0) > 0 ? 12 : 0)));
}

export function installLink(g: Game): LinkSystem {
  const l = new LinkSystem(g);
  g.addSystem(l);
  return l;
}
