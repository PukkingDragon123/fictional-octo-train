// THE LOADER, OFF THE MAIN THREAD: the Expanse (expanse.ts) drawn in a worker on an
// OffscreenCanvas, so the loading screen keeps moving at full speed while the page builds
// rooms, paints textures and compiles shaders. src/ui/loading.ts drives it with messages
// and falls back to drawing on the main thread where this cannot run.
//   in:  init { canvas, aspect, w, h } · show { fresh, w, h } · resume · finish · resize { w, h } · stop
//   out: ready · done (played on to the word) · fail
import { Expanse } from './expanse';

type In =
  | { t: 'init'; canvas: OffscreenCanvas; aspect: number; w: number; h: number }
  | { t: 'show'; fresh: boolean; w: number; h: number }
  | { t: 'resume' } | { t: 'finish' } | { t: 'stop' }
  | { t: 'resize'; w: number; h: number };

const post = (m: { t: 'ready' | 'done' | 'fail'; err?: string }) => (self as unknown as Worker).postMessage(m);
const wraf: ((cb: (t: number) => void) => number) | undefined = (self as unknown as { requestAnimationFrame?: (cb: (t: number) => void) => number }).requestAnimationFrame?.bind(self);
const nextFrame = (cb: (t: number) => void) => { if (wraf) wraf(cb); else setTimeout(() => cb(performance.now()), 16); };

let ex: Expanse | null = null;
let state: 'off' | 'on' | 'finishing' = 'off';
let running = false, last = 0, fadeIn = 0, toldDone = false;

// about 30 frames a second: the motion blur hides it, and the GPU is left free for the load itself
const MIN_MS = 31;
function loop(now: number) {
  if (state === 'off' || !ex) { running = false; return; }
  nextFrame(loop);
  if (last && now - last < MIN_MS) return;
  const dt = Math.min(state === 'finishing' ? 0.3 : 0.1, (now - (last || now)) / 1000); last = now;
  fadeIn = Math.min(1, fadeIn + dt / 0.55);
  try { ex.frame(dt, fadeIn * fadeIn); } catch (e) { state = 'off'; ex = null; post({ t: 'fail', err: String(e) }); return; }
  if (state === 'finishing' && ex.done && !toldDone) { toldDone = true; post({ t: 'done' }); }
}
function run() { if (!running) { running = true; last = 0; nextFrame(loop); } }

self.onmessage = (e: MessageEvent<In>) => {
  const m = e.data;
  try {
    if (m.t === 'init') { ex = new Expanse(m.aspect, m.canvas); ex.resize(m.w, m.h); post({ t: 'ready' }); return; }
    if (!ex) return;
    if (m.t === 'show') {
      ex.resize(m.w, m.h);
      if (m.fresh) { ex.restart(); fadeIn = 0; } else ex.resume();
      state = 'on'; toldDone = false; run();
    } else if (m.t === 'resume') { ex.resume(); state = 'on'; toldDone = false; run(); }
    else if (m.t === 'finish') { if (state !== 'off') { state = 'finishing'; ex.finish(); } }
    else if (m.t === 'resize') ex.resize(m.w, m.h);
    else if (m.t === 'stop') state = 'off';
  } catch (err) { state = 'off'; ex = null; post({ t: 'fail', err: String(err) }); }
};
