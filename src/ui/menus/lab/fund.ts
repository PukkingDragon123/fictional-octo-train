// FUNDING A STATION (round 19, ./stations.ts): a small tag floats at the station (or its key): the station's name,
// its price as a number after a pixel dollar coin, and a pixel key cap to hold. Hold it (the gauge under the cap
// fills) and the dollars go, the station is built: the caller plays the build moment, then the install cinematic
// runs. When it cannot be built yet the tag says what is missing in a few words and Dr. Calder says why.
// No box: floating type in the game's ink outline, drawn pixel parts.
import { sfx } from '../sfx';
import { capEl } from '../guide/tourArt';
import { playInstall } from '../../bandos/install';
import { buildStation, can, station, type StationKey } from './stations';

const COIN = (() => {
  const rows = ['..kkkk..', '.kyyyyk.', 'kyYWyyok', 'kyYyyyok', 'kyyyyyok', 'kyyyyook', '.kooook.', '..kkkk..'];
  const pal: Record<string, string> = { k: '#2a1a06', y: '#e8b030', Y: '#ffe090', W: '#ffffff', o: '#a8701a' };
  const cv = document.createElement('canvas'); cv.width = 8; cv.height = 8;
  const g = cv.getContext('2d')!;
  rows.forEach((r, y) => [...r].forEach((ch, x) => { const c = pal[ch]; if (c) { g.fillStyle = c; g.fillRect(x, y, 1, 1); } }));
  return cv.toDataURL();
})();
let cur: { el: HTMLElement; done: () => void } | null = null;
const CALDER: Record<string, string> = {
  money: 'Not enough dollars for that yet. A good run fixes that.',
  need: 'Not yet. Get something out of the backrooms first and I can justify it.',
};

/**
 * the tag for station k at a screen point (read every frame); onBuild plays the moment once it is paid for.
 * say(text) is Dr. Calder's line (the lab guide's subtitle).
 */
export function fundTag(k: StationKey, at: () => { x: number; y: number } | null, onBuild: () => void, say?: (t: string) => void) {
  cur?.done();
  const s = station(k);
  const el = document.createElement('div');
  el.className = 'lfund';
  const why = can(k);
  const name = document.createElement('b'); name.textContent = s.name;
  const price = document.createElement('span'); price.className = 'lfund-p';
  price.innerHTML = `<img src="${COIN}" alt="">${s.cost}`;
  el.append(name, price);
  let hold: HTMLButtonElement | null = null, gauge: HTMLElement | null = null;
  if (why === '') {
    hold = document.createElement('button'); hold.type = 'button'; hold.className = 'lfund-h'; hold.setAttribute('aria-label', `Hold to build the ${s.name} for ${s.cost} dollars`);
    hold.append(capEl('ok', 3));
    gauge = document.createElement('i'); gauge.className = 'lfund-g'; gauge.innerHTML = '<i></i>';
    el.append(hold, gauge);
  } else {
    // round 21: short of dollars shows as the price itself going red and shaking (Dr. Calder says why); other needs keep their few words
    if (why.startsWith('$')) { price.classList.add('short'); el.setAttribute('aria-label', 'not enough dollars'); }
    else { const n = document.createElement('em'); n.textContent = why; el.append(n); }
    say?.(why.startsWith('$') ? CALDER.money : CALDER.need);
    sfx('error', 0.4);
  }
  document.body.append(el);
  if (!document.getElementById('lfund-css')) {
    const st = document.createElement('style'); st.id = 'lfund-css';
    st.textContent = `.lfund { position: fixed; z-index: 85; transform: translate(-50%, -100%); display: flex; flex-direction: column; align-items: center; gap: 4px; pointer-events: auto;
  font-family: var(--font-new); color: #f4ead0; text-shadow: 2px 2px 0 #0b0a07, -1px -1px 0 #0b0a07, 1px -1px 0 #0b0a07, -1px 1px 0 #0b0a07; animation: lfund-in .2s steps(4) both; }
@keyframes lfund-in { from { opacity: 0; transform: translate(-50%, -90%); } }
.lfund b { font-weight: 400; font-size: 20px; letter-spacing: .04em; white-space: nowrap; }
.lfund-p { display: inline-flex; align-items: center; gap: 5px; font-size: 22px; color: #ffd870; }
.lfund-p img { width: 16px; height: 16px; image-rendering: pixelated; filter: drop-shadow(1px 1px 0 #0b0a07); }
.lfund-p.short { color: #ff7a5a; animation: lfund-no .36s steps(6) 2; }
@keyframes lfund-no { 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
.lfund em { font-style: normal; font-size: 16px; color: #ffb090; white-space: nowrap; }
.lfund-h { padding: 0; border: 0; background: none; cursor: pointer; line-height: 0; outline: none; }
.lfund-h .tcap { background-position: 0 0; filter: drop-shadow(0 3px 0 rgba(11,10,7,.7)); }
.lfund-h:is(:hover, :focus-visible) .tcap { background-position: 0 calc(var(--ch) * -1); }
.lfund-h.down .tcap { background-position: 0 calc(var(--ch) * -2); }
.lfund-g { display: block; width: 60px; height: 6px; background: #2a2010; box-shadow: 0 0 0 2px #0b0a07; }
.lfund-g i { display: block; height: 100%; width: 0; background: linear-gradient(#ffe090, #e8a020); }`;
    document.head.append(st);
  }
  let raf = 0, t0 = 0, gone = false;
  const done = () => { if (gone) return; gone = true; cancelAnimationFrame(raf); el.remove(); window.removeEventListener('pointerdown', outside, true); if (cur?.el === el) cur = null; };
  const outside = (e: PointerEvent) => { if (!el.contains(e.target as Node)) done(); };
  setTimeout(() => window.addEventListener('pointerdown', outside, true), 0);
  const place = () => { const p = at(); if (p) { el.style.left = Math.round(p.x) + 'px'; el.style.top = Math.round(p.y) + 'px'; } };
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    // built some other way meanwhile (another tag, a save loaded): nothing left to fund
    if (!t0 && can(k) === 'built') { done(); return; }
    place();
    if (t0 && gauge) {
      const k2 = Math.min(1, (now - t0) / 650);
      (gauge.firstElementChild as HTMLElement).style.width = Math.round(k2 * 100) + '%';
      if (k2 >= 1) {
        t0 = 0;
        if (buildStation(k)) {
          sfx('press', 0.7);
          done();
          onBuild();
          setTimeout(() => playInstall({ title: s.name, icon: s.icon, gives: s.gives, key: 'lab:' + k }), 1100);
        } else { sfx('error', 0.5); done(); }
      }
    }
  };
  raf = requestAnimationFrame(frame);
  place();
  if (hold) {
    hold.addEventListener('pointerdown', (e) => { e.preventDefault(); t0 = performance.now(); hold!.classList.add('down'); sfx('rocker', 0.5); });
    const up = () => { if (t0) { t0 = 0; (gauge!.firstElementChild as HTMLElement).style.width = '0%'; } hold!.classList.remove('down'); };
    hold.addEventListener('pointerup', up); hold.addEventListener('pointerleave', up);
    hold.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!t0) { t0 = performance.now() - 650; } } });
    requestAnimationFrame(() => hold!.focus({ preventScroll: true }));
  }
  cur = { el, done };
  if (!hold) setTimeout(done, 3200);
}
