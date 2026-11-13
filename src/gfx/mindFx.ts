// Feeds the mind's eye (src/gfx/motionFx.ts MINDFX) from the local unit every frame: the panic
// (src/game/panic.ts and the body's panic), the heartbeat, the MIND reading on the body console (sanity),
// the hallucination flickers at the edge of sight and a duller world in the ears.
// Dev: window.__mindfx = { panic, mind, hal } pins any of them (screenshots, tuning).
import { G } from '../game/G';
import { isPanicked } from '../game/panic';
import { calm } from '../ui/menus/settings';
import { gfxSettings } from '../ui/menus/common';
import { MINDFX } from './motionFx';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

class MindDriver {
  private panic = 0;
  private mind = 0;
  private phase = 0;
  private halNext = 8;
  private halFrames = 0;
  private t = 0;
  private setT = 0;

  frame(dt: number) {
    const g: any = G;
    const p = g?.local;
    dt = Math.min(0.1, Math.max(0, dt));
    this.t += dt;
    // settings are read now and then (they live in storage)
    if ((this.setT -= dt) <= 0) {
      this.setT = 1;
      try { const s: any = gfxSettings(); MINDFX.comfort = !!s.comfort; MINDFX.shake = s.shake === false ? 0 : (s.shakeAmt ?? 1); } catch { /* defaults */ }
      try { MINDFX.calm = calm(); } catch { MINDFX.calm = false; }
    }
    let wantP = 0, wantM = 0, bpm = 70;
    if (p?.body && !p.body.dead) {
      const b = p.body;
      let panicked = false;
      try { panicked = isPanicked(p); } catch { /* none */ }
      wantP = Math.max(clamp01((b.panic - 30) / 70) * 0.8, panicked ? 0.5 + 0.5 * clamp01((b.panic - 50) / 50) : 0);
      let san = b.lucidity ?? 100;
      try { const s = g.hudBody?.sanity?.(p); if (typeof s === 'number') san = s; } catch { /* lucidity */ }
      wantM = clamp01((68 - san) / 58);
      bpm = (g.survival?.mind?.bpm ?? 70 + b.panic * 0.6) || 70;
    }
    const pin = (window as any).__mindfx;
    if (pin && typeof pin.panic === 'number') wantP = pin.panic;
    if (pin && typeof pin.mind === 'number') wantM = pin.mind;
    // panic arrives fast and leaves slowly; the mind drifts
    this.panic += (wantP - this.panic) * Math.min(1, dt * (wantP > this.panic ? 3 : 0.7));
    this.mind += (wantM - this.mind) * Math.min(1, dt * 0.8);
    if (pin) { if (typeof pin.panic === 'number') this.panic = wantP; if (typeof pin.mind === 'number') this.mind = wantM; }
    MINDFX.panic = this.panic < 0.003 ? 0 : this.panic;
    MINDFX.mind = this.mind < 0.003 ? 0 : this.mind;
    // the heartbeat: lub-dub
    this.phase = (this.phase + dt * bpm / 60) % 1;
    const lub = Math.exp(-Math.pow((this.phase - 0.08) / 0.05, 2)), dub = Math.exp(-Math.pow((this.phase - 0.28) / 0.06, 2)) * 0.6;
    MINDFX.beat = Math.min(1, lub + dub);
    // something at the edge of sight, for a frame or two
    MINDFX.hal = 0;
    if (this.halFrames > 0) { this.halFrames--; MINDFX.hal = 0.55 + 0.4 * this.mind; }
    else if (!MINDFX.calm && (this.mind > 0.25 || (pin && pin.hal))) {
      this.halNext -= dt;
      if (this.halNext <= 0 || (pin && pin.hal && this.t > 0.2)) {
        const sev = Math.max(this.mind, 0.3);
        this.halNext = (4 + Math.random() * 10) / sev;
        this.halFrames = Math.random() < 0.5 ? 0 : 1;
        const left = Math.random() < 0.5;
        MINDFX.halX = left ? 0.05 + Math.random() * 0.12 : 0.83 + Math.random() * 0.12;
        MINDFX.halY = 0.3 + Math.random() * 0.45;
        MINDFX.halK = Math.random();
        MINDFX.hal = 0.55 + 0.4 * this.mind;
        if (pin && pin.hal) pin.hal = false;
      }
    }
    // the ears go dull with it
    const au = g?.audio;
    if (au && 'dull' in au) au.dull = clamp01(this.mind * 0.55 + this.panic * 0.25);
  }
}

/** start feeding the mind's eye for this game (once per renderer) */
export function installMindFx(g: any) {
  if (!g?.pr || g.mindFx) return;
  const d = new MindDriver();
  g.mindFx = d;
  g.pr.beforeRender.push((dt: number) => { try { d.frame(dt); } catch (e) { console.warn('mind fx', e); } });
}
