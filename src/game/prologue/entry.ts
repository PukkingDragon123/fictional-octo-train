// The way back into the prologue from the title: a small line of Alagard type
// in the corner of the monitor room ("PROLOGUE · meet Dr. Calder again"),
// shown while the title's own menu is up. The lab's menu can call
// replayPrologue() itself instead (src/game/prologue/index.ts).
import { replayPrologue } from './prologue';

const CSS = `
.pl-entry { position: fixed; left: calc(16px + env(safe-area-inset-left)); bottom: calc(16px + env(safe-area-inset-bottom)); z-index: 40; font-family: var(--font-new);
  background: none; border: 0; padding: 0; cursor: pointer; text-align: left; opacity: .72; transition: opacity .2s; }
.pl-entry:hover, .pl-entry:focus-visible { opacity: 1; outline: none; }
.pl-entry b { display: block; font-weight: 400; font-size: 16px; line-height: 16px; letter-spacing: 2px; color: #8fd8ff; text-shadow: var(--text-ink); }
.pl-entry i { display: block; font-style: normal; font-size: 16px; line-height: 16px; margin-top: 4px; color: #c8c2b2; text-shadow: var(--text-ink); }
.pl-entry:hover b { color: #ffe7a8; }
`;

/** put the replay entry on the page; it follows the title menu's visibility (selector of the menu to follow) */
export function prologueEntry(follow = '.tt3-menu'): HTMLButtonElement {
  if (!document.getElementById('pl-entry-css')) { const s = document.createElement('style'); s.id = 'pl-entry-css'; s.textContent = CSS; document.head.appendChild(s); }
  const b = document.createElement('button');
  b.className = 'pl-entry';
  b.type = 'button';
  b.innerHTML = '<b>&#8634; PROLOGUE</b><i>meet Dr. Calder again</i>';
  b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); replayPrologue(); });
  document.body.appendChild(b);
  // only while the title's menu is on screen (not inside a feed, the creator or a terminal)
  const tick = () => {
    if (!b.isConnected) return;
    const m = document.querySelector<HTMLElement>(follow);
    const cs = m ? getComputedStyle(m) : null, r = m?.getBoundingClientRect();
    const on = !!m && !!cs && !!r && r.width > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05;
    b.style.display = on ? '' : 'none';
    setTimeout(tick, 400);
  };
  tick();
  return b;
}
