// THE CREDIT (round 21): the Institute's credit is a digital coin, and wherever a credit amount shows it is this little
// 3D coin (src/ui/machine/decor.ts 'credit': thick green-gold, a milled edge, the meridian glyph, a faint lit circuit
// trace, a glint) spinning on its own, all the way round, on cached turntable frames (one sheet per size, shared).
// When the amount changes it flashes and spins faster for a moment.
//   creditIcon(size = 18)        -> the coin (an inline element); el.flash() for a change
//   creditAmount(n, size?)       -> the coin and the number; el.set(n) updates it (a change flashes the coin)
import { mxIconSpin, mxIconSpinWarm } from './machine/decor';
import { mxOk } from './machine/core';

export interface CreditIconEl extends HTMLSpanElement { flash(): void }
export interface CreditAmountEl extends HTMLSpanElement { set(n: number): void; readonly coin: CreditIconEl }

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const st = document.createElement('style');
  st.textContent = `
.cr21 { position: relative; display: inline-flex; align-items: center; justify-content: center; vertical-align: middle; line-height: 0; flex: none; }
.cr21 > canvas { display: block; image-rendering: pixelated; filter: drop-shadow(0 1px 0 rgba(10, 8, 2, .7)) drop-shadow(0 0 3px rgba(150, 255, 190, .25)); }
.cr21.fl > canvas { animation: cr21-fl .7s cubic-bezier(.2, .9, .3, 1.4) both; }
.cr21.fl::after { content: ''; position: absolute; inset: -20%; pointer-events: none; animation: cr21-ring .6s ease-out both;
  background: radial-gradient(circle, rgba(200, 255, 220, .85) 0 18%, rgba(110, 255, 170, .35) 38%, rgba(110, 255, 170, 0) 66%); }
@keyframes cr21-fl { 0% { transform: scale(1); filter: brightness(2.4) drop-shadow(0 0 8px #9affc8); } 30% { transform: translateY(-3px) scale(1.3); } 100% { transform: none; } }
@keyframes cr21-ring { from { opacity: 1; transform: scale(.4); } to { opacity: 0; transform: scale(1.5); } }
.cr21-fb { display: block; image-rendering: pixelated; animation: cr21-flip 1.6s steps(8) infinite; }
@keyframes cr21-flip { 0%, 100% { transform: scaleX(1); } 50% { transform: scaleX(.12); } }
.cra21 { display: inline-flex; align-items: center; gap: 2px; white-space: nowrap; vertical-align: middle; }
.cra21 > b { font-weight: inherit; }
.cra21.neg > b { color: #ff8a6a; }
.cra21.up > b { animation: cra21-up .6s steps(4) both; }
@keyframes cra21-up { 0% { color: #c8ffd8; text-shadow: 0 0 8px rgba(120, 255, 170, .8); } 100% { } }
`;
  document.head.append(st);
}

/** a pixel coin for a page without WebGL (it flips by CSS) */
function fallbackCoin(size: number): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = cv.height = 9; cv.className = 'cr21-fb';
  cv.style.width = cv.style.height = size + 'px';
  const c = cv.getContext('2d')!;
  const rows = ['..kkkkk..', '.kyyyyyk.', 'kyYggyyyk', 'kyg..gyok', 'kygggggok', 'kyg..gyok', 'kyyggyook', '.kooooook', '..kkkkk..'];
  const pal: Record<string, string> = { k: '#1a1404', y: '#d8c050', Y: '#fff4b0', o: '#8a7a24', g: '#6affb0' };
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { c.fillStyle = pal[ch]; c.fillRect(x, y, 1, 1); } }));
  return cv;
}

export function creditIcon(size = 18): CreditIconEl {
  style();
  const box = document.createElement('span') as CreditIconEl;
  box.className = 'cr21';
  box.setAttribute('aria-label', 'credits');
  // a steady spin (about two and a half seconds a turn), a quick one after a change
  const sp = mxOk() ? mxIconSpin('credit', size, [10, 40]) : null;
  if (sp) { sp.cv.style.width = sp.cv.style.height = size + 8 + 'px'; box.style.margin = '-4px -3px'; box.append(sp.cv); }
  else box.append(fallbackCoin(size));
  let t = 0;
  box.flash = () => {
    box.classList.remove('fl'); void box.offsetWidth; box.classList.add('fl');
    sp?.hot(true);
    clearTimeout(t);
    t = window.setTimeout(() => { sp?.hot(false); box.classList.remove('fl'); }, 900);
  };
  return box;
}

export function creditAmount(n: number, size = 18): CreditAmountEl {
  style();
  const el = document.createElement('span') as CreditAmountEl;
  el.className = 'cra21';
  const coin = creditIcon(size);
  const b = document.createElement('b');
  el.append(coin, b);
  let cur: number | null = null;
  el.set = (v: number) => {
    v = Math.round(v);
    if (v === cur) return;
    const first = cur === null;
    cur = v;
    b.textContent = v.toLocaleString('en-GB');
    el.classList.toggle('neg', v < 0);
    if (!first) { coin.flash(); el.classList.remove('up'); void el.offsetWidth; el.classList.add('up'); }
  };
  Object.defineProperty(el, 'coin', { value: coin });
  el.set(n);
  return el;
}

/** a line of text with every "<n> credits" / "<n> cr" in it shown as the coin and the number (the rest kept as text) */
export function creditText(text: string, size = 16): DocumentFragment {
  const f = document.createDocumentFragment();
  const rx = /([+-]?)([\d][\d,]*)\s*(?:credits|cr)\b/gi;
  let at = 0, m: RegExpExecArray | null;
  while ((m = rx.exec(text))) {
    if (m.index > at) f.append(text.slice(at, m.index));
    if (m[1]) f.append(m[1]);
    f.append(creditAmount(Number(m[2].replace(/,/g, '')), size));
    at = m.index + m[0].length;
  }
  if (at < text.length) f.append(text.slice(at));
  return f;
}

// the coin's turntable frames bake in idle slices: start the common sizes early so a coin turns as soon as it shows
setTimeout(() => {
  const ric = (window as unknown as { requestIdleCallback?: (f: () => void, o?: object) => void }).requestIdleCallback;
  const warm = () => { if (mxOk()) for (const s of [12, 14, 18]) mxIconSpinWarm('credit', s); };
  if (ric) ric(warm, { timeout: 5000 }); else warm();
}, 4000);

/**
 * for markup built as a string (tooltips): a slot that turns into the spinning coin and the number as soon as it
 * lands in the page (one shared observer fills every slot)
 */
export function creditSlot(n: number, size = 14): string {
  watchSlots();
  return `<span class="cr21-slot" data-cr="${Math.round(n)}" data-cs="${size}">${Math.round(n).toLocaleString('en-GB')}</span>`;
}
let watching = false;
function fillSlots(root: ParentNode) {
  root.querySelectorAll?.('.cr21-slot').forEach((s) => {
    const e = s as HTMLElement;
    e.replaceWith(creditAmount(Number(e.dataset.cr) || 0, Number(e.dataset.cs) || 14));
  });
}
function watchSlots() {
  if (watching || typeof MutationObserver === 'undefined') return;
  watching = true;
  const go = () => {
    new MutationObserver((ms) => {
      for (const m of ms) for (const nd of m.addedNodes) {
        if (nd.nodeType !== 1) continue;
        const e = nd as HTMLElement;
        if (e.classList.contains('cr21-slot')) fillSlots(e.parentElement ?? document); else if (e.querySelector('.cr21-slot')) fillSlots(e);
      }
    }).observe(document.body, { childList: true, subtree: true });
    fillSlots(document);
  };
  if (document.body) go(); else addEventListener('DOMContentLoaded', go, { once: true });
}
