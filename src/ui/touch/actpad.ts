// THE TOUCH PAD (round 14). On a phone the world labels (src/ui/worldPrompt.ts) are tapped
// to act on things; what has no thing to point at gets a small chamfered plate here, bottom
// right: STRIKE (hold to aim, release to swing: the attack button's own aim-and-swing),
// LAMP (the suit's helmet lamp, F on a keyboard) and SWIM (held, only in water). No round
// buttons, no labels that change under the thumb. Every plate feeds the same input as the keys.
import './actpad.css';
import { G } from '../../game/G';
import type { CtxAction } from '../hotbar/context';
import { ctxIconUrl } from '../hotbar/icons';

interface Plate { el: HTMLDivElement; id: string; pid: number }

export class ActPad {
  readonly el: HTMLDivElement;
  private plates: Record<string, Plate> = {};
  private on = false;

  constructor() {
    const el = this.el = document.createElement('div');
    el.id = 'wpad';
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    document.body.appendChild(el);
    this.plate('strike', 'Strike', 'strike', 3, {
      down: (e) => (G as any).touch?.strikeDown?.(e),
      move: (e) => (G as any).touch?.strikeMove?.(e),
      up: (c) => (G as any).touch?.strikeUp?.(c),
    });
    this.plate('light', 'Lamp', 'light', 2, { down: () => G.input.tap('flashlight') });
    this.plate('swim', 'Swim', 'swim', 2, {
      down: () => { G.input.press('run'); G.input.press('power'); },
      up: () => { G.input.release('run'); G.input.release('power'); },
    });
    // round 17: the build kit in hand turns the pad into the build controls (src/build/build.ts)
    const bld = () => (G as any).build;
    this.plate('b_rot', 'Turn', 'turn', 2, { down: () => bld()?.rotateGhost?.() });
    this.plate('b_next', 'Piece', 'place', 2, { down: () => bld()?.nextPiece?.(1) });
    this.plate('b_shelf', 'Shelf', 'pack', 2, { down: () => bld()?.nextCat?.() });
    this.plate('b_down', 'Remove', 'drop', 2, { down: () => bld()?.toggleDemolish?.() });
    this.plate('b_away', 'Stow', 'letgo', 2, { down: () => { const p = G.local; if (p) bld()?.putAway?.(p); } });
    (G as any).actPad = this;
  }

  private plate(id: string, label: string, icon: string, scale: number, h: { down: (e: PointerEvent) => void; move?: (e: PointerEvent) => void; up?: (cancelled: boolean) => void }) {
    const el = document.createElement('div');
    el.className = 'wpad-btn wpad-' + id;
    el.innerHTML = `<div class="wpad-face"><i style="background-image:url(${ctxIconUrl(icon, scale)})"></i><span>${label}</span></div>`;
    const pl: Plate = { el, id, pid: -1 };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (pl.pid >= 0) return;
      pl.pid = e.pointerId;
      try { el.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
      el.classList.add('down');
      try { (G as any).input.pointerOverUI = false; } catch { /* no input */ }
      try { (navigator as any).vibrate?.(12); } catch { /* not allowed */ }
      h.down(e);
    });
    el.addEventListener('pointermove', (e) => { if (e.pointerId === pl.pid) { e.preventDefault(); h.move?.(e); } });
    const end = (e: { pointerId: number }, cancelled: boolean) => {
      if (e.pointerId !== pl.pid) return;
      pl.pid = -1;
      el.classList.remove('down');
      h.up?.(cancelled);
    };
    el.addEventListener('pointerup', (e) => end(e, false));
    el.addEventListener('pointercancel', (e) => end(e, true));
    el.addEventListener('lostpointercapture', (e) => end(e, true));
    (el as any)._release = () => { if (pl.pid >= 0) end({ pointerId: pl.pid }, true); };
    this.el.appendChild(el);
    this.plates[id] = pl;
  }

  private release() { for (const p of Object.values(this.plates)) (p.el as any)._release?.(); }

  /** shown on touch while the unit is on foot and nothing covers the screen */
  update(list: CtxAction[], allowed: boolean, touch: boolean) {
    const g: any = G, p = G.local;
    const tc = document.getElementById('nc-touch');
    // (build mode holds the first-person clipboard, which hides the labels: the pad stays, with the build plates)
    const on = touch && (allowed || !!g.build?.active) && !!p && !p.inVehicle && !p.body.dead && g.touch?.adaptive !== false
      && !tc?.classList.contains('nc-suppressed') && !G.ui?.inventory?.open && !g.pack?.open;
    if (on !== this.on) { this.on = on; this.el.classList.toggle('on', on); if (!on) this.release(); }
    if (!on || !p) return;
    this.plates.light.el.classList.toggle('lit', !!p.flashlightOn);
    const b = (G as any).build;
    const building = !!b?.active;
    if (this.el.classList.contains('building') !== building) { this.el.classList.toggle('building', building); if (building) (this.plates.strike.el as any)._release?.(); }
    if (building) this.plates.b_down.el.classList.toggle('lit', !!b.demolish);
    const swim = list.some((a) => a.id === 'swim');
    const sw = this.plates.swim.el;
    if (sw.classList.contains('show') !== swim) { sw.classList.toggle('show', swim); if (!swim) (sw as any)._release?.(); }
  }
}
