// ACTION CLOSE-UPS (round 24): short camera cuts on the things the hands do that had none (eating, drinking,
// looting, cooking, the press, the watch's installs, the revive, the level reveals and the death have their own).
//
//   medical    bandaging, a tourniquet, disinfecting, stitching, a splint, glass or a bullet out, cauterizing:
//              the camera leans in and down over the wound, a warm work light on the hands
//   lock       picking a lock (a slow push to the hands and the keyhole, a click when it gives); kicking or prying
//              a door (the push holds, the camera takes the kick as a punch and a shake)
//   barricade  boarding a door or a window: every hammer stroke lands as a little punch of the camera
//   repair     a repair at a bench or on an engine: a push and a turn, sparks of white light off the work
//   read       opening a paper or a book (once a kind a session): the camera settles in under a reading light
//
// Each one is a second or three of camera over the action that is really running: nothing waits for it and
// nothing is locked (no input lag). Any key or click ends the cut at once (the action goes on); walking off ends
// both. Only when it makes sense: never in a fight (an inhabitant close, panic), never over another close-up,
// a transition or a cinematic, not twice in a row for the same work. Options > INTERFACE > CUTSCENES: full,
// short or off for each.
//
// playUnlink(): the unit's last moment before the link drops (Back to the lab, the pause menu).
import { G } from '../G';
import { bus } from '../../core/events';
import type { Game } from '../game';
import type { Player } from '../../entities/player';
import type { TimedAction } from '../../actions/action';
import { BandageAction, DisinfectAction, StitchAction, SplintAction, RemoveForeignAction, CauterizeAction } from '../../actions/medical';
import { PickLockAction, DoorAction, BarricadeAction, UnbarricadeAction, UseObjectAction, inhabitantNear } from '../../actions/world';
import { ReadAction } from '../../actions/basic';
import { CraftAction } from '../../interact/crafting';
import { fpOwner } from '../../fp/fp';
import { cineRunning, cineEnabled, playCine, lerp, ease } from './engine';
import { cutMode, cutLen } from '../cuts';

interface Shot {
  kind: string;
  /** zoom in (0.3 = 30% closer), pitch tilt (deg), a turn round the unit over the shot (rad) */
  push: number; pitch: number; yaw: number;
  /** seconds (full mode) */
  dur: number;
  /** a warm (or cold) light on the hands */
  light?: number;
  /** progress points (0..1 of the action) that land as a camera punch */
  hits?: number[];
  /** sparks off the work (repair) */
  sparks?: boolean;
  /** the shot holds to the end of the action, up to dur */
  hold?: boolean;
}

function shotFor(a: TimedAction): Shot | null {
  if (a instanceof BandageAction || a instanceof DisinfectAction || a instanceof StitchAction || a instanceof SplintAction || a instanceof RemoveForeignAction || a instanceof CauterizeAction) {
    return { kind: 'medical', push: 0.55, pitch: -13, yaw: 0.28, dur: 2.6, light: 0xffe2b8, hold: true };
  }
  if (a instanceof PickLockAction) return { kind: 'lock', push: 0.58, pitch: -7, yaw: -0.24, dur: 2.4, light: 0xfff0d0, hold: true };
  if (a instanceof DoorAction && (a.mode === 'kick' || a.mode === 'pry')) return { kind: 'lock', push: 0.4, pitch: -4, yaw: 0.2, dur: a.mode === 'kick' ? 1.5 : 2.6, hits: a.mode === 'kick' ? [0.56] : [0.35, 0.7, 0.95] };
  if (a instanceof BarricadeAction || a instanceof UnbarricadeAction) return { kind: 'barricade', push: 0.44, pitch: -5, yaw: -0.3, dur: 3, light: 0xffe6c0, hits: [0.12, 0.27, 0.42, 0.57, 0.72, 0.87] };
  const rep = a instanceof CraftAction ? /^repair_/.test(a.r.key) : a instanceof UseObjectAction && /^repair/i.test(a.name);
  if (rep) return { kind: 'repair', push: 0.5, pitch: -10, yaw: 0.32, dur: 2.8, light: 0xffeed8, sparks: true, hold: true };
  if (a instanceof ReadAction) return { kind: 'read', push: 0.4, pitch: -9, yaw: 0.2, dur: 2.2, light: 0xffe0a8 };
  return null;
}

// ---------------------------------------------------------------- the bars (thinner than a story cinematic's)
let barsEl: HTMLDivElement | null = null;
function paintBars(k: number) {
  if (typeof document === 'undefined') return;
  if (!barsEl) {
    barsEl = document.createElement('div');
    barsEl.className = 'act-bars';
    barsEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:6'; // under the HUD: the tracker and the hotbar sit on the bars, never cut by them
    barsEl.innerHTML = '<i style="position:absolute;left:0;right:0;top:0;height:0;background:#000"></i><i style="position:absolute;left:0;right:0;bottom:0;height:0;background:#000"></i>'
      + '<i style="position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse 78% 72% at 50% 52%,transparent 60%,rgba(10,7,3,.38) 85%,rgba(6,4,2,.62) 100%)"></i>';
    document.body.appendChild(barsEl);
  }
  const h = (6.5 * k).toFixed(2) + 'vh';
  (barsEl.children[0] as HTMLElement).style.height = h;
  (barsEl.children[1] as HTMLElement).style.height = h;
  (barsEl.children[2] as HTMLElement).style.opacity = k.toFixed(3);
  barsEl.style.display = k > 0.001 ? 'block' : 'none';
}

class ActionCine {
  readonly name = 'actcine';
  private cur: { s: Shot; a: TimedAction; t: number; len: number; hit: number; yawDone: number; spark: number } | null = null;
  private out = 0;
  private bar = 0;
  private last = new Map<string, number>();
  private readKinds = new Set<string>();
  private yawLeft = 0;

  constructor(readonly g: Game) {
    bus.on('actionStart', (p: Player, a: TimedAction) => { if (p?.isLocal) this.consider(p, a); });
    const skip = (e: Event) => {
      if (!this.cur) return;
      if (e instanceof KeyboardEvent && (e.repeat || e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt')) return;
      this.stop();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', skip, true);
      window.addEventListener('pointerdown', skip, true);
      window.addEventListener('wheel', skip, { capture: true, passive: true });
    }
    bus.on('death', () => this.stop(true));
    bus.on('cineStart', () => this.stop(true));
    bus.on('fpChange', (n: string | null) => { if (n) this.stop(); });
    if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __actcine: unknown }).__actcine = this;
    // a note or a file: the sheet comes up into the hands (tilted, then flat) while the camera leans in over the unit
    const ui = G.ui as unknown as { read?: (title: string, text: string, style?: 'paper' | 'terminal') => void; readerEl?: HTMLElement | null } | null;
    if (ui?.read) {
      const orig = ui.read.bind(ui);
      ui.read = (title, text, style = 'paper') => { orig(title, text, style); try { this.paperIn(ui.readerEl ?? null, style); } catch (e) { console.warn('read cut', e); } };
    }
  }

  private reading = false;
  private paperIn(el: HTMLElement | null, style: string) {
    const mode = cutMode('read');
    if (!el || mode === 'off' || typeof el.animate !== 'function') return;
    const len = cutLen(mode);
    const paper = style !== 'terminal';
    el.animate(paper ? [
      { transform: 'translate(-50%, -50%) perspective(900px) translateY(42%) rotateX(62deg) rotateZ(-4deg) scale(.86)', opacity: 0, offset: 0 },
      { transform: 'translate(-50%, -50%) perspective(900px) translateY(6%) rotateX(18deg) rotateZ(-1.5deg) scale(.97)', opacity: 1, offset: 0.55 },
      { transform: 'translate(-50%, -50%) perspective(900px) rotateX(0deg) rotateZ(0deg) scale(1)', opacity: 1, offset: 1 },
    ] : [
      { transform: 'translate(-50%, -50%) perspective(900px) scaleY(.02)', opacity: 0, filter: 'brightness(3)' },
      { transform: 'translate(-50%, -50%) perspective(900px) scaleY(1)', opacity: 1, filter: 'brightness(1)' },
    ], { duration: (paper ? 460 : 260) * Math.max(0.5, len), easing: 'cubic-bezier(.2,.8,.2,1)' });
    G.audio?.flat?.(paper ? 'paper' : 'crt', 'sfx', 0.35);
    const p = G.local;
    if (p && !this.cur && this.fits(p)) {
      this.reading = true;
      G.camera?.pushIn?.(0.3 * (mode === 'short' ? 0.7 : 1), 0.4, -7);
    }
  }

  /** it makes sense to cut in now */
  private fits(p: Player): boolean {
    if (!cineEnabled() || cineRunning() || fpOwner() || this.g.transitioning || this.g.paused) return false;
    if (p.sleeping || p.body.downed || p.body.dead || p.inVehicle || p.carriedBy) return false;
    if (p.body.panic > 45 || inhabitantNear(p, 10)) return false;
    const h = G.handler as unknown as { cine?: boolean } | null;
    if (h?.cine) return false;
    return true;
  }

  consider(p: Player, a: TimedAction) {
    const s = shotFor(a);
    if (!s) return;
    const mode = cutMode(s.kind);
    if (mode === 'off' || this.cur || !this.fits(p)) return;
    // not again straight away for the same work (the second board of a barricade, the next page)
    const cool = s.kind === 'read' ? 1e9 : s.kind === 'barricade' ? 40 : 25;
    if (G.time - (this.last.get(s.kind) ?? -1e9) < cool && s.kind !== 'read') return;
    if (s.kind === 'read') {
      const k = (a as ReadAction).it?.key || '';
      if (this.readKinds.has(k)) return;
      this.readKinds.add(k);
    }
    this.last.set(s.kind, G.time);
    const len = cutLen(mode);
    this.cur = { s, a, t: 0, len, hit: 0, yawDone: 0, spark: 0 };
    G.camera?.pushIn?.(s.push * (mode === 'short' ? 0.85 : 1), 0.55 * Math.max(0.6, len), s.pitch);
  }

  private stop(now = false) {
    const c = this.cur;
    if (!c) return;
    this.cur = null;
    G.camera?.pushIn?.(0, now ? 0.2 : 0.45);
    // the turn goes back the way it came (ended in place: no snap)
    this.yawLeft = -c.yawDone;
    if (now) { G.camera?.orbitBy?.(this.yawLeft); this.yawLeft = 0; G.camera?.endOrbit?.(); }
    this.out = now ? 0 : 0.35;
  }

  update(dt: number) {
    const c = this.cur;
    if (this.reading && !(G.ui as unknown as { readerEl?: unknown } | null)?.readerEl) { this.reading = false; if (!c) G.camera?.pushIn?.(0, 0.35); }
    // easing the turn back after a shot
    if (!c && this.yawLeft) {
      const step = Math.sign(this.yawLeft) * Math.min(Math.abs(this.yawLeft), dt * 1.6);
      G.camera?.orbitBy?.(step); this.yawLeft -= step;
      if (Math.abs(this.yawLeft) < 1e-4) { this.yawLeft = 0; G.camera?.endOrbit?.(); }
    }
    const want = c ? 1 : 0;
    this.bar += (want - this.bar) * (1 - Math.exp(-(want ? 7 : 6) * dt));
    if (Math.abs(this.bar - want) < 0.003) this.bar = want;
    paintBars(this.bar);
    if (this.out > 0) this.out -= dt;
    if (!c) return;
    const p = G.local;
    if (!p) { this.stop(true); return; }
    c.t += dt;
    const a = c.a;
    const running = p.actions.current === a && !a.done && !a.cancelled;
    const dur = c.s.dur * c.len;
    if (!running || c.t >= dur || (!c.s.hold && c.t >= dur) || !this.fits2(p)) { this.stop(!running); return; }
    // the slow turn round the unit
    if (!G.camera?.comfort && c.s.yaw) {
      const goal = c.s.yaw * ease(Math.min(1, c.t / dur));
      const d = goal - c.yawDone;
      if (d) { G.camera?.orbitBy?.(d); c.yawDone = goal; }
    }
    // the work light on the hands (bright: the close-up is never murky)
    if (c.s.light) {
      const f = p.facing, k = Math.min(1, c.t / 0.4);
      G.pointLight(p.x + Math.cos(f) * 0.7 - Math.sin(f) * 0.5, (p.y ?? 0) + 1.9, p.z + Math.sin(f) * 0.7 + Math.cos(f) * 0.5, c.s.light, 1.25 * k, 5);
    }
    // the blows land
    const prog = a.progress;
    const hits = c.s.hits;
    if (hits) while (c.hit < hits.length && prog >= hits[c.hit]) {
      c.hit++;
      G.camera?.punch?.(0.05, 0.16);
      G.camera?.shake?.(c.s.kind === 'lock' ? 0.45 : 0.18, 0.18);
    }
    // sparks off a repair
    if (c.s.sparks) {
      c.spark -= dt;
      if (c.spark <= 0) {
        c.spark = 0.35 + Math.random() * 0.6;
        const f = p.facing;
        G.audio?.at?.('dmg_spark', p.x + Math.cos(f) * 0.6, p.z + Math.sin(f) * 0.6, 0.3);
        this.flashT = 0.09;
      }
      if (this.flashT > 0) {
        this.flashT -= dt;
        const f = p.facing;
        G.pointLight(p.x + Math.cos(f) * 0.6, (p.y ?? 0) + 1.0, p.z + Math.sin(f) * 0.6, 0xcfe8ff, 2.4, 3.5);
      }
    }
  }
  private flashT = 0;
  /** still sensible mid-shot (something turned up) */
  private fits2(p: Player) { return !cineRunning() && !fpOwner() && !p.body.dead && !p.body.downed && p.body.panic < 60 && !inhabitantNear(p, 7); }
}

let inst: ActionCine | null = null;
export function installActionCine(g: Game) {
  if (inst) return inst;
  inst = new ActionCine(g);
  g.addSystem(inst);
  return inst;
}

/** the link drops: the unit looks down at the band, it bites, the picture goes to static and black (about 1.6 s).
 *  Resolves at once when cuts are off (or the cinematics are), after the shot otherwise (a skip ends it early). */
export function playUnlink(): Promise<void> {
  const mode = cutMode('unlink');
  if (mode === 'off' || !G.local || G.local.body.dead) return Promise.resolve();
  const len = cutLen(mode);
  return new Promise((resolve) => {
    let done = false;
    const fin = () => { if (!done) { done = true; resolve(); } };
    const c = playCine({ name: 'unlink', pitch: 30, onEnd: () => fin() }, (c) => (function* () {
      c.onSkip = () => { c.black = 1; };
      yield c.eyeUp();
      c.sfx('band_tick', 0.5);
      c.cam.pitch = 0;
      yield c.tw(0.45 * len, (k) => { c.cam.pitch = lerp(0, 12, ease(k)); c.cam.fov = lerp(62, 54, ease(k)); });
      c.sfx('band_shock', 0.6);
      c.cam.shake = 1.6;
      c.sfx('static_burst', 0.5);
      yield c.fade(0.85, 0.35 * len, '#0c1a12');
      c.cam.shake = 0.4;
      yield c.fade(1, 0.35 * len, '#000');
      yield c.sleep(0.15);
    })());
    if (!c) fin();
    // never hang the way out
    setTimeout(fin, 4500);
  });
}
