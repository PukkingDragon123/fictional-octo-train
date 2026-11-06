// Your side of the conversation with Dr. Calder: two or three replies as
// square, chamfered plates low in the picture (gunmetal faces, a cyan
// projection edge, a keycap with the number), picked with 1-3, a click or a
// tap. While they are up the number keys answer her instead of reaching the
// hotbar, and the subtitle strip steps up to make room. Silence counts too:
// after a while the question resolves with -1 and she makes something of it.
//
//   const i = await askCalder(['Where am I?', 'Who are you?', 'Get me out.'], { secs: 25 })   // 0..n-1, or -1
//   cancelAsk()   take the plates down (a skip)
import { G } from '../../game/G';

const CSS = `
.cr-ask { position: fixed; left: 50%; bottom: calc(11vh + env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 66; display: flex; gap: 12px; pointer-events: none;
  font-family: var(--font-new); opacity: 0; transition: opacity .25s; max-width: calc(100vw - 24px); }
.cr-ask.on { opacity: 1; }
.cr-opt { position: relative; pointer-events: auto; cursor: pointer; border: 0; padding: 2px; background: #5fc8f0; color: #f4f1e8; font: inherit; text-align: left;
  clip-path: polygon(10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 10px), 0 10px);
  filter: drop-shadow(0 3px 0 rgba(0, 0, 0, .5)); transform: translateY(6px); opacity: 0; transition: transform .2s, opacity .2s, background .12s; }
.cr-ask.on .cr-opt { transform: none; opacity: 1; }
.cr-ask.on .cr-opt:nth-child(2) { transition-delay: .06s; } .cr-ask.on .cr-opt:nth-child(3) { transition-delay: .12s; }
.cr-opt > span { display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 6px 16px 6px 8px;
  clip-path: polygon(9px 0, calc(100% - 9px) 0, 100% 9px, 100% calc(100% - 9px), calc(100% - 9px) 100%, 9px 100%, 0 calc(100% - 9px), 0 9px);
  background: linear-gradient(180deg, #3a4448 0%, #262d30 46%, #1c2224 54%, #23292c 100%);
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, .12), inset 0 -2px 0 rgba(0, 0, 0, .45); }
.cr-opt b { flex: none; display: grid; place-items: center; width: 28px; height: 28px; font-weight: 400; font-size: 16px; line-height: 16px; color: #10161a;
  background: linear-gradient(180deg, #e8eef0, #b8c4c8); box-shadow: inset 0 -3px 0 #7f8c90, 0 0 0 2px #0c1012; }
.cr-opt i { font-style: normal; font-size: 16px; line-height: 16px; color: #f4f1e8; text-shadow: 2px 2px 0 #000; white-space: nowrap; }
.cr-opt:hover, .cr-opt:focus-visible { background: #ffe7a8; outline: none; }
.cr-opt:hover > span, .cr-opt:focus-visible > span { background: linear-gradient(180deg, #4a5458 0%, #30383b 46%, #262d30 54%, #2d3437 100%); }
.cr-opt:hover i { color: #ffe7a8; }
.cr-opt.pick { background: #ffffff; animation: cr-pick .35s steps(3); }
.cr-opt.pick > span { background: #3d6a7c; }
@keyframes cr-pick { 50% { transform: translateY(2px); } }
.cr-ask.done .cr-opt:not(.pick) { opacity: 0; }
body.cr-asking .ft-subs { bottom: calc(11vh + var(--cr-h, 56px) + 12px); }
@media (max-width: 760px) { .cr-ask { flex-direction: column; align-items: stretch; width: min(92vw, 420px); } .cr-opt i { white-space: normal; } }
`;

let cur: { el: HTMLDivElement; done: (i: number) => void } | null = null;

export function askCalder(opts: string[], o: { secs?: number } = {}): Promise<number> {
  cancelAsk();
  if (!document.getElementById('cr-css')) { const s = document.createElement('style'); s.id = 'cr-css'; s.textContent = CSS; document.head.appendChild(s); }
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'cr-ask';
    el.setAttribute('role', 'group');
    const btns = opts.slice(0, 3).map((text, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'cr-opt';
      b.innerHTML = `<span><b>${i + 1}</b><i></i></span>`;
      (b.querySelector('i') as HTMLElement).textContent = text;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); pick(i); });
      b.addEventListener('mouseenter', () => { if (G.input) G.input.pointerOverUI = true; G.audio?.ui?.('watchTick', 0.15); });
      b.addEventListener('mouseleave', () => { if (G.input) G.input.pointerOverUI = false; });
      el.appendChild(b);
      return b;
    });
    document.body.appendChild(el);
    const fit = () => document.documentElement.style.setProperty('--cr-h', Math.round(el.getBoundingClientRect().height) + 'px');
    requestAnimationFrame(() => { el.classList.add('on'); fit(); });
    document.body.classList.add('cr-asking');
    G.audio?.ui?.('watchUp', 0.25);
    // the number keys answer her (and do not reach the hotbar)
    const key = (e: KeyboardEvent) => {
      const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      if (!m) return;
      const i = Number(m[1]) - 1;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      if (i < btns.length && e.type === 'keydown' && !e.repeat) pick(i);
    };
    window.addEventListener('keydown', key, true); window.addEventListener('keyup', key, true);
    let timer = 0;
    let over = false;
    const close = () => {
      window.removeEventListener('keydown', key, true); window.removeEventListener('keyup', key, true);
      clearTimeout(timer);
      document.body.classList.remove('cr-asking');
      if (G.input) G.input.pointerOverUI = false;
      el.classList.add('done');
      setTimeout(() => { el.classList.remove('on'); setTimeout(() => el.remove(), 300); }, 320);
    };
    const pick = (i: number) => {
      if (over) return;
      over = true;
      if (i >= 0) { btns[i]?.classList.add('pick'); G.audio?.ui?.('click', 0.4); }
      close();
      if (cur?.el === el) cur = null;
      resolve(i);
    };
    if (o.secs) timer = window.setTimeout(() => pick(-1), o.secs * 1000);
    cur = { el, done: pick };
  });
}

/** take the plates down now (resolves the open question with -1) */
export function cancelAsk() { const c = cur; cur = null; c?.done(-1); }
export function asking(): boolean { return !!cur; }
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __askCalder: typeof askCalder }).__askCalder = askCalder;
