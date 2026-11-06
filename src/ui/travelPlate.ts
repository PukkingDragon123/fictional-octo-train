// The level-transition loader (round 13): while the screen is black between two
// levels a small riveted plate sits at the bottom with the proper bar and where
// the unit is going (the same hi-res kit as the timed-action plate and the boot
// loading screen). It only shows when the crossing takes a moment.
import { bus } from '../core/events';
import { G } from '../game/G';
import { bevel, rivet, hazard, drawBar, GUN, GRN, AMB, rect, crispCanvas } from './hiPixel';

const W = 300, H = 44;
export function installTravelPlate(root: HTMLElement) {
  const el = document.createElement('div');
  el.className = 'tr-plate';
  const { cv, c } = crispCanvas(W, H);
  const lab = document.createElement('b');
  el.append(cv, lab);
  root.appendChild(el);
  let raf = 0, t0 = 0, k = 0, done = -1, last = 0, t = 0;
  const draw = () => {
    c.clearRect(0, 0, W, H);
    rect(c, 3, H - 3, W - 4, 3, 0x000000, 0.4);
    bevel(c, 1, 1, W - 3, H - 5, GUN.slice(2, 9), { chamfer: 3 });
    rect(c, 10, 19, W - 20, 1, GUN[1]); rect(c, 10, 20, W - 20, 1, GUN[7], 0.6);
    hazard(c, 5, 24, 4, 10, 0xe8b52a, 0x17150f, 4); hazard(c, W - 11, 24, 4, 10, 0xe8b52a, 0x17150f, 4, 2);
    rivet(c, 6, 6, 2, true); rivet(c, W - 8, 6, 2, true);
    drawBar(c, 13, 24, W - 28, 10, k, { t, cell: 5, gap: 1, ramp: k >= 1 ? GRN : AMB });
  };
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now; t += dt;
    if (done < 0) k = Math.min(0.9, k + dt * (0.9 - k) * 2.2);
    else k = 1;
    draw();
    if (done >= 0 && now - done > 380) { el.classList.remove('on'); raf = 0; return; }
    raf = requestAnimationFrame(loop);
  };
  bus.on('travelStart', (p: any, key: string) => {
    if (p && !p.isLocal) return;
    const z = (G as any).zones?.get?.(key);
    lab.textContent = 'Crossing to ' + (z?.name || String(key || 'the next level').replace(/[_-]+/g, ' '));
    k = 0; done = -1; t0 = performance.now(); last = 0;
    el.classList.add('on');
    if (!raf) raf = requestAnimationFrame(loop);
  });
  bus.on('travelEnd', (p: any) => {
    if (p && !p.isLocal) return;
    done = performance.now();
    // a quick hop never shows the plate at all
    if (done - t0 < 260) { el.classList.remove('on'); }
  });
}
