// Drives the 3D found-object controls (props.ts) from the DOM hit areas that
// touch.ts owns, and makes them go wrong with the survivor: the valve drips
// blood while you bleed, rust creeps over everything while you are sick, the
// controls twitch and slip out of place when something is close or the mind
// is slipping, the lights stutter with panic, the bottle cap misreads, and
// the BAILIFF band's shocks jump through them. Everything here is local and
// purely visual (each peer sees its own survivor's controls).
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { clamp } from '../../core/math';
import { halluPressure } from '../../survival/mind';
import { Stage, SHARED } from './stage3d';
import {
  Thing, Valve, Steer, Arcade, Toggle, BottleCap, CrashBar, Slipper, PullChain, Whistle, Mic,
  PianoKey, Camera, FoldMap, MiniSeer, Rucksack, Handset, Pedal, Horn, PullKnob, Ignition, DoorHandle, bindParticles,
} from './props';
import { sfx, haptic } from './sfx';

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const WEIRD_WORDS = ['OBEY', 'PAY', 'STAY', 'WAKE', 'HELP', 'OWED', 'DEBT', 'NO', 'MINE', 'EAT', 'LOOK', 'HUSH', 'RUN', 'YOU', 'BEHIND', 'SORRY', 'HOME', 'DOWN', 'WHO', 'KEEP', 'SMILE', 'OPEN', 'ALONE'];

/** what the survivor's state is doing to the controls (0..1 each) */
export interface Weird { bleed: number; sick: number; twitch: number; panic: number; hallu: number; lucid: number }

export class Touch3D {
  readonly stage: Stage;
  readonly ok: boolean;
  readonly props: Record<string, Thing> = {};
  private els: Record<string, HTMLElement> = {};
  private alpha: Record<string, number> = {};
  private rectT = 0;
  readonly weird: Weird = { bleed: 0, sick: 0, twitch: 0, panic: 0, hallu: 0, lucid: 0 };
  private rust = 0; private blood = 0;
  private dripT = 1; private twitchT = 2; private wordT = 6; private wordHold = 0; private flickT = 0; private dipT = 0; private dipLvl = 1;
  private nearT = 0; private near = 0;
  private shockT = 0; private shockAmt = 0; private warn = 0; private warnT = 0;
  private chromaT = 0;
  private useWord = 'USE';
  private boomed = false;
  private ambientT = 0;
  private wasVisible = false;

  constructor(host: HTMLElement) {
    this.stage = new Stage(host);
    this.ok = this.stage.ok;
    if (!this.ok) return;
    bindParticles(this.stage.parts);
    const add = (p: Thing) => { this.props[p.key] = p; this.stage.add(p); };
    add(new Valve()); add(new Steer());
    add(new Arcade()); add(new BottleCap()); add(new CrashBar()); add(new Slipper()); add(new PullChain()); add(new Whistle()); add(new Mic());
    add(new Toggle());
    add(new PianoKey('menu', 'pause')); add(new PianoKey('fs', 'full')); add(new Camera()); add(new Handset()); add(new FoldMap()); add(new MiniSeer()); add(new Rucksack());
    add(new Pedal('gas', false)); add(new Pedal('brake', true)); add(new Horn()); add(new PullKnob()); add(new Ignition()); add(new DoorHandle('dexit')); add(new DoorHandle('rexit'));
    host.classList.add('nc-3d');
    bus.on('bandShock', (e: any) => { if (e?.id && e.id === G.local?.id) this.shock(clamp01(e.strength ?? 0.6)); });
    bus.on('bandWarning', (e: any) => { if (e?.id && e.id === G.local?.id) { this.warn = clamp01(e.level ?? 0.5); this.warnT = 2.5; } });
    bus.on('bandDetonate', (e: any) => { if (e?.id && e.id === G.local?.id) this.detonate(); });
    bus.on('playerHit', (p: any) => { if (p === G.local) this.knock(5); });
  }

  /** is there a 3D prop for this DOM button? (the button then only serves as the hit area) */
  has(key: string) { return this.ok && !!this.props[key]; }
  bind(key: string, el: HTMLElement) { if (!this.has(key)) return; this.els[key] = el; el.classList.add('nc-3dbtn'); this.rectT = 0; }
  press(key: string, down: boolean, cancelled = false) { const p = this.props[key]; if (!p) return; if (down) p.down(); else p.up(cancelled); this.stage.dirty = true; }
  setOn(key: string, v: boolean, quiet = false) { const p = this.props[key]; if (p) { const was = p.on; p.setOn(v, quiet); if (was !== v) this.stage.dirty = true; } }
  /** the label a button would show (USE target, START/STOP) */
  label(key: string, text: string) {
    if (key === 'use') { this.useWord = text; if (this.wordHold <= 0) (this.props.use as BottleCap)?.setWord(text); }
    else if (key === 'ign') (this.props.ign as Ignition)?.setText(text);
  }
  invalidate() { this.rectT = 0; this.stage.dirty = true; }

  /** the stick (valve while walking, steering wheel while driving) */
  stick(sx: number, sy: number, R: number, kx: number, ky: number, live: boolean, running: boolean, drive: boolean) {
    if (!this.ok) return;
    const v = this.props.stick as Valve, s = this.props.steer as Steer;
    const size = R * 2.1;
    const px = this.stage.px;
    v.place(sx, sy, size, size, px); s.place(sx, sy, size, size, px);
    if (drive) { s.setStick(kx, ky, R, live); v.setStick(0, 0, R, false, false); }
    else { v.setStick(kx, ky, R, live, running); s.setStick(0, 0, R, false); }
    this.stage.dirty = true;
  }
  attackAim(dx: number, dy: number, lock: boolean) {
    const a = this.props.attack as Arcade; if (!a) return;
    const l = Math.hypot(dx, dy);
    a.aimX = l > 16 ? clamp(dx / 60, -1, 1) : 0; a.aimY = l > 16 ? clamp(dy / 60, -1, 1) : 0;
    if (a.lock !== lock) { a.lock = lock; if (lock) sfx('tc_tick', 0.35, 1.2); }
  }

  /**
   * per frame: which controls are showing (vis), which groups are faded,
   * whether the whole layer is on screen, and the stick's state
   */
  update(dt: number, on: boolean, vis: (key: string) => boolean, faded: (key: string) => number, stickShown: 'valve' | 'steer' | null) {
    if (!this.ok) return;
    const st = this.stage;
    if (!on) { if (this.wasVisible) { st.blank(); this.wasVisible = false; } return; }
    if (!this.wasVisible) { this.wasVisible = true; st.dirty = true; this.rectT = 0; }
    const pr = G.pr;
    const px = pr ? Math.max(1, pr.scale / pr.dpr) : 1;
    st.resize(px);
    // hit-area rects (layout can move them: orientation, safe areas, the scanner strip)
    this.rectT -= dt;
    const relayout = this.rectT <= 0;
    if (relayout) this.rectT = 0.5;
    for (const key in this.props) {
      const p = this.props[key];
      let show: boolean;
      if (key === 'stick') show = stickShown === 'valve';
      else if (key === 'steer') show = stickShown === 'steer';
      else { const el = this.els[key]; show = !!el && vis(key); if (show && (relayout || !p.shown)) { const r = el.getBoundingClientRect(); if (r.width > 0) p.place(r.left + r.width / 2, r.top + r.height / 2, r.width, r.height, st.px); else show = false; } }
      if (p.boom && p.boom.t > 2.5) show = false;
      if (show !== p.shown) { p.shown = show; p.root.visible = show; st.dirty = true; if (!show) { p.held = false; } }
      if (!show) continue;
      const a = key === 'stick' || key === 'steer' ? 1 : faded(key);
      if (Math.abs((this.alpha[key] ?? 1) - a) > 1e-3) { this.alpha[key] = a; p.setAlpha(a); st.dirty = true; }
      // stiff springs: integrate in small steps however long the frame was
      const h = Math.min(dt, 0.1), n = Math.max(1, Math.min(10, Math.ceil(h / 0.008)));
      let moving = false;
      for (let i = 0; i < n; i++) moving = p.step(h / n, st.px) || moving;
      if (moving || p.busy) st.dirty = true;
    }
    this.effects(dt);
    // particles
    if (st.parts.alive) { st.parts.update(dt, st.px); st.dirty = true; }
    else if (st.parts.mesh.count) { st.parts.update(dt, st.px); st.dirty = true; }
    // ambient life (lamp flutter, the scanner's blink, rust and blood spreading) at a low rate
    this.ambientT -= dt;
    if (this.ambientT <= 0) { this.ambientT = 0.1; st.dirty = true; }
    SHARED.uTime.value += dt;
    const quality = (G as any).pr?.quality;
    st.render(performance.now(), quality === 'low' ? 30 : 60);
  }

  // ================================================================ weird
  private readState(dt: number) {
    const w = this.weird, p = G.local;
    if (!p || p.body.dead) { w.bleed = w.sick = w.twitch = w.panic = w.hallu = 0; w.lucid = 1; return; }
    const b = p.body;
    const br = typeof b.bleedRate === 'function' ? b.bleedRate() : 0;
    w.bleed = br > 0.02 ? clamp01(0.3 + br / 1.5) : 0;
    const fever = typeof (b as any).fever === 'function' ? (b as any).fever() : 0;
    w.sick = clamp01(Math.max((b.sickness ?? 0) / 85, fever * 1.1, ((b.corruption ?? 0) - 20) / 80));
    let hp = 0;
    try { hp = halluPressure(b); } catch { hp = 0; }
    const m = b.mind;
    w.hallu = clamp01(Math.max(hp, (m?.flash ?? 0) * 0.8, m?.dissoc > 0 ? 0.6 : 0));
    w.panic = clamp01(Math.max(((b.panic ?? 0) - 35) / 60, m?.attack > 0 ? 1 : 0));
    w.lucid = clamp01((b.lucidity ?? 100) / 100);
    // monsters close by (seen or not: the controls know first)
    this.nearT -= dt;
    if (this.nearT <= 0) {
      this.nearT = 0.3;
      let best = 0;
      for (const c of G.creatures?.list?.() || []) {
        if (!c || c.dead || c.tamedBy || c.zoneKey !== p.zoneKey) continue;
        const T = c.sp?.temperament;
        const hostile = T === 'hostile' || T === 'stalker' || T === 'ambush' || T === 'territorial' || c.state === 'chase' || c.state === 'attack' || c.sp?.key === 'still_life';
        if (!hostile) continue;
        const d = Math.hypot(c.x - p.x, c.z - p.z);
        if (d < 12) best = Math.max(best, (1 - d / 12) * (c.state === 'chase' || c.state === 'attack' ? 1 : 0.7));
      }
      this.near = best;
    }
    w.twitch = clamp01(Math.max(this.near, (G.survival?.threat ?? 0) * 0.9, w.hallu * 0.9));
  }

  private effects(dt: number) {
    this.readState(dt);
    const w = this.weird, st = this.stage, P = st.parts;
    const calm = document.documentElement.classList.contains('reduce-flash');
    // rust spreads slowly while sick and recedes slower still; blood builds while bleeding and dries off
    const rustGoal = w.sick * 0.85;
    this.rust += (rustGoal - this.rust) * Math.min(1, dt * (rustGoal > this.rust ? 0.05 : 0.012));
    this.blood = w.bleed > 0 ? Math.min(0.2 + w.bleed * 0.6, this.blood + dt * (0.03 + w.bleed * 0.08)) : Math.max(0, this.blood - dt * 0.006);
    if (Math.abs(SHARED.uRust.value - this.rust) > 0.002) SHARED.uRust.value = this.rust;
    if (Math.abs(SHARED.uBlood.value - this.blood) > 0.002) SHARED.uBlood.value = this.blood;
    // drips: blood runs off the valve's rim (or the button when the valve is hidden)
    if (w.bleed > 0) {
      this.dripT -= dt;
      if (this.dripT <= 0) {
        this.dripT = (0.35 + Math.random() * 1.1) / (0.4 + w.bleed);
        const v = this.props.stick as Valve, a = this.props.attack as Arcade;
        const src = v.shown ? v : a.shown ? a : null;
        const pt = src?.dripPoint();
        if (pt) {
          const dark = Math.random() < 0.5;
          P.spawn(pt[0] + (Math.random() - 0.5) * 10, pt[1], 0, 0, 2.2, 2, 2, dark ? 0x5c0806 : 0x86100c, { grav: 900, hang: 0.25 + Math.random() * 0.5, stretch: true });
        }
      }
    }
    // twitching: knocks, slips and the valve turning by itself
    if (w.twitch > 0.05) {
      this.twitchT -= dt * (0.4 + w.twitch * 2.2);
      if (this.twitchT <= 0) {
        this.twitchT = 0.6 + Math.random() * 1.6;
        const shown = Object.values(this.props).filter((p) => p.shown && !p.held);
        const p = shown[Math.floor(Math.random() * shown.length)];
        if (p) {
          const k = 3 + w.twitch * 8;
          if (p instanceof Valve && Math.random() < 0.6) { p.ghost = 0.6 + w.twitch; sfx('tc_ratchet', 0.12, 0.7); }
          else if (w.twitch > 0.45 && Math.random() < 0.45) {
            // slips out of place and stays there a moment
            p.hx = (Math.random() - 0.5) * 2 * k * 1.4; p.hy = (Math.random() - 0.5) * 2 * k; p.hold = 0.5 + Math.random() * 1.4;
            p.busy = true;
          } else p.jolt((Math.random() - 0.5) * 2 * k * 20, (Math.random() - 0.5) * 2 * k * 16, (Math.random() - 0.5) * 0.35 * w.twitch * 20);
          if (Math.random() < 0.3) sfx('tc_tick', 0.15 + w.twitch * 0.15, 0.6 + Math.random() * 0.5);
        }
      }
    }
    // the lights stutter with panic (gently in reduced-flash mode)
    let light = 1;
    if (w.panic > 0.05) {
      this.flickT -= dt;
      if (this.flickT <= 0) {
        this.flickT = (0.1 + Math.random() * 0.9) / (0.3 + w.panic);
        this.dipT = 0.04 + Math.random() * 0.12;
        this.dipLvl = calm ? 0.8 : 0.18 + Math.random() * 0.45;
      }
      if (this.dipT > 0) { this.dipT -= dt; light = this.dipLvl; }
    }
    if (this.shockT > 0) { this.shockT -= dt; light = calm ? 1.1 : (Math.random() < 0.5 ? 1.7 : 0.4); }
    SHARED.uLight.value = light;
    // the band's warning tints everything red, pulsing
    this.warnT -= dt;
    const tint = SHARED.uTint.value;
    if (this.warnT > 0) { const k = this.warn * (0.5 + 0.5 * Math.sin(performance.now() * 0.012)) * 0.6; tint.set(1 + k * 0.4, 1 - k, 1 - k); }
    else if (tint.x !== 1 || tint.y !== 1) tint.set(1, 1, 1);
    // chromatic split while hallucinating, static during a panic attack or a shock
    this.chromaT -= dt;
    if (this.chromaT <= 0) { this.chromaT = 0.15 + Math.random() * 0.6; st.chroma = w.hallu > 0.3 && Math.random() < w.hallu ? Math.round(1 + Math.random() * 2) : 0; }
    st.stat = Math.max(this.shockT > 0 ? 0.9 : 0, w.panic > 0.9 && !calm ? 0.25 : 0);
    // the cap says something else
    this.wordT -= dt;
    if (this.wordHold > 0) { this.wordHold -= dt; if (this.wordHold <= 0) (this.props.use as BottleCap)?.setWord(this.useWord); }
    else if (this.wordT <= 0) {
      const odd = Math.max(w.hallu, (1 - w.lucid) * 0.8, w.twitch * 0.4, 0.02);
      this.wordT = 3 + Math.random() * 10 / (0.2 + odd);
      if (Math.random() < odd + 0.05) {
        (this.props.use as BottleCap)?.setWord(WEIRD_WORDS[Math.floor(Math.random() * WEIRD_WORDS.length)], true);
        this.wordHold = 0.25 + Math.random() * (0.4 + odd * 1.4);
      }
    }
    // after a detonation, the controls come back with the next life
    if (this.boomed && G.local && !G.local.body.dead) this.reassemble();
  }

  /** a hit or a fall rattles everything */
  knock(k: number) {
    for (const p of Object.values(this.props)) if (p.shown) p.jolt((Math.random() - 0.5) * k * 40, (Math.random() - 0.5) * k * 30, (Math.random() - 0.5) * k * 0.15);
    this.stage.dirty = true;
  }
  /** the BAILIFF band's shock jumps through the controls */
  shock(strength: number) {
    this.shockT = 0.25 + strength * 0.5;
    this.knock(6 + strength * 10);
    sfx('tc_zap', 0.4 + strength * 0.3, 1, 0.2);
    haptic([40, 30, 80]);
    const P = this.stage.parts;
    for (const p of Object.values(this.props)) {
      if (!p.shown) continue;
      for (let i = 0; i < 4; i++) P.spawn(p.cx + (Math.random() - 0.5) * p.w, p.cy + (Math.random() - 0.5) * p.h, (Math.random() - 0.5) * 300, (Math.random() - 0.5) * 300, 0.15 + Math.random() * 0.2, 2, 2, Math.random() < 0.5 ? 0xbfe8ff : 0xffffff, { drag: 4 });
    }
  }
  /** the band went off: everything blows apart */
  detonate() {
    this.boomed = true;
    this.shock(1);
    for (const p of Object.values(this.props)) {
      if (!p.shown) continue;
      const dx = p.cx - innerWidth / 2, dy = p.cy - innerHeight / 2, l = Math.hypot(dx, dy) || 1;
      p.boom = { vx: dx / l * (300 + Math.random() * 400), vy: -200 - Math.random() * 500, vr: (Math.random() - 0.5) * 12, t: 0 };
    }
  }
  private reassemble() {
    this.boomed = false;
    for (const p of Object.values(this.props)) { p.boom = null; p.busy = true; }
    this.rectT = 0;
  }
  reset() {
    for (const p of Object.values(this.props)) { p.held = false; p.hold = 0; p.hx = p.hy = 0; }
    this.stage.parts.clear();
    this.stage.dirty = true;
  }
}
