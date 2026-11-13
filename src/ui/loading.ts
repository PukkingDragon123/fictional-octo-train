// THE LOADING SCREEN OF EVERYTHING (round 15): boot, level travel, a run
// starting, the lab coming up. One full-screen overlay with nothing on it but
// the Expanse (src/ui/loader/expanse.ts): the backrooms unfolding in 3D until
// the walls spell LIMBO / PHOBIA from above, with motion blur. No bar, no
// text, no tips. It loops seamlessly while the load runs long, and when told
// to go it plays on to the word (faster), holds a beat and fades away.
//
//   showLoading(kind)       put it up (idempotent: a second call just keeps it up)
//   hideLoading({ now })    play on to the word, then fade out; { now: true } fades at once.
//                           Resolves when it is gone.
//   isLoading()             whether it is up (or fading)
// Wired already: boot (main.ts → bootLoader; it goes when #boot gets .gone),
// level travel (travelStart / travelEnd on the bus, src/ui/travelPlate.ts).
// The sim is held (hitstop) while the screen plays on to the word after the
// load is done, so nothing happens to the unit behind it.
//   bootLoader(), loaderStage(), loaderText()  the old boot API, kept for its callers
//                           (loaderStage is a no-op now; loaderText only for launch errors).
import { Expanse } from './loader/expanse';
import { hitstop } from '../gfx/juice';
// the industrial UI kit (CSS nine-slices, the tactile press-and-clunk hook) for every page, from boot on
import './pxKit';

export type LoadKind = 'boot' | 'travel' | 'run' | 'lab';

let root: HTMLElement | null = null;
let ex: Expanse | null = null;
// the Expanse drawn in a worker (src/ui/loader/worker.ts) so it never stalls while the page works;
// ex (drawn on the page) is the fallback where a worker cannot draw
let wk: Worker | null = null, wkCanvas: HTMLCanvasElement | null = null, wkDone = false;
let failed = false;
let raf = 0, last = 0, fadeIn = 0;
let kindNow: LoadKind = 'boot';
let state: 'off' | 'on' | 'finishing' | 'fading' = 'off';
let waiters: (() => void)[] = [];
let hideAt = 0;
/** the most the screen plays on after the load is done (real time, whatever the frame rate) */
const FINISH_CAP_MS = 2600;
let bootObs: MutationObserver | null = null;
let resizeBound = false;

function ensure(): HTMLElement {
  if (root && root.isConnected) return root;
  root = document.createElement('div');
  root.className = 'lp-load';
  root.setAttribute('aria-hidden', 'true');
  document.body.appendChild(root);
  if (wkCanvas) root.appendChild(wkCanvas);
  else if (!ex && !failed && !startWorker(root)) onPage(root);
  else if (ex) root.appendChild(ex.canvas as HTMLCanvasElement);
  if (!resizeBound) {
    resizeBound = true;
    window.addEventListener('resize', () => {
      if (state === 'off') return;
      ex?.resize(window.innerWidth, window.innerHeight);
      wk?.postMessage({ t: 'resize', w: window.innerWidth, h: window.innerHeight });
    });
  }
  return root;
}

/** the Expanse on the main thread (no worker, or the worker failed) */
function onPage(el: HTMLElement) {
  try { ex = new Expanse((window.innerWidth || 16) / (window.innerHeight || 9)); } catch (e) { failed = true; ex = null; console.warn('loader 3d', e); return; }
  el.prepend(ex.canvas as HTMLCanvasElement);
  ex.resize(window.innerWidth, window.innerHeight);
}

/** the Expanse in a worker on an OffscreenCanvas: false where that cannot run */
function startWorker(el: HTMLElement): boolean {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || !('transferControlToOffscreen' in HTMLCanvasElement.prototype)) return false;
  if (/[?&]loader-main\b/.test(location.search)) return false;
  try {
    const cv = document.createElement('canvas');
    cv.className = 'lp-gl';
    const off = cv.transferControlToOffscreen();
    const w = new Worker(new URL('./loader/worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<{ t: string; err?: string }>) => {
      if (e.data.t === 'done') wkDone = true;
      else if (e.data.t === 'fail') workerFailed(e.data.err);
    };
    w.onerror = (e) => { e.preventDefault(); workerFailed(e.message); };
    w.postMessage({ t: 'init', canvas: off, aspect: (window.innerWidth || 16) / (window.innerHeight || 9), w: window.innerWidth, h: window.innerHeight }, [off]);
    el.appendChild(cv);
    wk = w; wkCanvas = cv;
    return true;
  } catch (e) { console.warn('loader worker', e); return false; }
}
function workerFailed(err?: string) {
  if (!wk) return;
  console.warn('loader worker failed, drawing on the page', err);
  wk.terminate(); wk = null; wkCanvas?.remove(); wkCanvas = null;
  if (!root || failed) return;
  onPage(root);
  if (ex && state !== 'off') { ex.restart(); if (state === 'finishing') ex.finish(); }
}

function loop(now: number) {
  if (state === 'off') { raf = 0; return; }
  raf = requestAnimationFrame(loop);
  // real time while it plays on to the word (a slow machine skips ahead instead of dragging on)
  const dt = Math.min(state === 'finishing' ? 0.3 : 0.1, (now - (last || now)) / 1000); last = now;
  fadeIn = Math.min(1, fadeIn + dt / 0.55);
  // once the load is done, keep the world still while the screen plays on to the word
  // (never before: a level crossing's own fade runs on game time)
  if (state === 'finishing' && kindNow !== 'lab') hitstop(110);
  if (ex) {
    try { ex.frame(dt, fadeIn * fadeIn); } catch (e) { console.warn('loader frame', e); failed = true; ex = null; }
  }
  const done = wk ? wkDone : !ex || ex.done;
  if (state === 'finishing' && (done || performance.now() - hideAt > FINISH_CAP_MS)) fadeOut();
}

function fadeOut() {
  if (!root || state === 'fading' || state === 'off') return;
  state = 'fading';
  root.classList.add('out');
  setTimeout(() => {
    if (state !== 'fading') return; // shown again meanwhile
    state = 'off';
    wk?.postMessage({ t: 'stop' });
    root?.classList.remove('on', 'out');
    const w = waiters; waiters = [];
    w.forEach((f) => f());
  }, 620);
}

/** put the loading screen up (idempotent) */
export function showLoading(kind: LoadKind = 'boot') {
  const el = ensure();
  kindNow = kind;
  if (state === 'on' || state === 'finishing') { state = 'on'; ex?.resume(); wkDone = false; wk?.postMessage({ t: 'resume' }); el.classList.add('on'); return; }
  const wasFading = state === 'fading';
  state = 'on';
  el.classList.remove('out');
  el.classList.add('on');
  ex?.resize(window.innerWidth, window.innerHeight);
  if (!wasFading) { ex?.restart(); fadeIn = 0; } else ex?.resume();
  wkDone = false;
  wk?.postMessage({ t: 'show', fresh: !wasFading, w: window.innerWidth, h: window.innerHeight });
  if (!raf) { last = 0; raf = requestAnimationFrame(loop); }
}

/** play on to the word, hold a beat, fade (or { now: true }: fade at once). Resolves when it is gone. */
export function hideLoading(o: { now?: boolean } = {}): Promise<void> {
  if (state === 'off') return Promise.resolve();
  const p = new Promise<void>((res) => waiters.push(res));
  if (o.now || (!ex && !wk)) fadeOut();
  else if (state === 'on') { state = 'finishing'; hideAt = performance.now(); ex?.finish(); wk?.postMessage({ t: 'finish' }); }
  return p;
}

export function isLoading() { return state !== 'off'; }
export function loadingKind() { return kindNow; }

// ------------------------------------------------------------------ the old boot API
/** the loading screen over #boot; it goes when #boot is hidden (.gone) */
export function bootLoader(_msg?: string) {
  const b = document.getElementById('boot');
  if (!b || b.classList.contains('gone')) return;
  b.innerHTML = '';
  showLoading('boot');
  if (!bootObs) {
    bootObs = new MutationObserver(() => {
      if (b.classList.contains('gone') && state !== 'off' && kindNow === 'boot') void hideLoading();
    });
    bootObs.observe(b, { attributes: true, attributeFilter: ['class'] });
  }
}

/** kept for its callers: the loading screen shows no steps any more */
export function loaderStage(_k: number, _msg?: string) { /* no bar, no text */ }

/** a launch error (html may hold a button): the one time words go over the loader */
export function loaderText(html: string) {
  const b = document.getElementById('boot');
  if (b) b.classList.remove('gone');
  showLoading('boot');
  const el = ensure();
  let m = el.querySelector('.lp-note') as HTMLElement | null;
  if (!m) { m = document.createElement('div'); m.className = 'lp-note'; el.appendChild(m); }
  // the plain progress messages of a launch say nothing now; only real errors (with a way back) show
  if (/<button/i.test(html) || !/boot-text/.test(html)) { m.innerHTML = html; m.classList.add('on'); }
  return true;
}

// dev staging (screenshots): window.__loader.seek(t) freezes the timeline at t seconds
if (import.meta.env.DEV) (window as any).__loader = { showLoading, hideLoading, seek(t: number, frames = 12) { showLoading('boot'); fadeIn = 1; if (!ex) return; ex.seek(Math.max(0, t - frames / 60)); for (let i = 0; i < frames; i++) ex.frame(1 / 60, 1); } };
