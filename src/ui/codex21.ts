// THE CODEX, IN PICTURES (round 21): the codex page (src/ui/menus/research/panel.ts openCodex) without words. The
// title is the dossier model (its name on hover), the counts sit by little models (seen: the eye, sampled: the jar,
// researched: the blueprint, complete: the key), every entry is its own model (a specimen's canister, an anomaly's jar
// with its eye) standing on a shelf lip with a state lamp and a research bar, swaying and lifting under the pointer,
// its name floating over it. Entries nobody has met are black silhouettes.
import { mxIcon, mxIconAnim, type IconKind } from './machine/decor';
import { pixSprite } from './floatIcon';
import { nameTag } from './iconChip';
import { sfx } from './menus/sfx';

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const st = document.createElement('style');
  st.textContent = `
.cx21h { display: inline-flex; align-items: center; margin: -6px 0 -8px -4px; }
.cx21h canvas { display: block; filter: drop-shadow(0 2px 0 #0a0b10); transition: transform .14s cubic-bezier(.2,.9,.3,1.5); }
.cx21h:hover canvas { transform: translateY(-3px) rotate(-6deg) scale(1.08); }
.cx21s { display: flex !important; gap: 22px; align-items: center; justify-content: flex-start; padding: 2px 4px 8px; }
.cx21s > span { position: relative; display: inline-flex; align-items: center; gap: 4px; font-size: 22px; color: #fff; text-shadow: var(--text-ink-2); }
.cx21s > span canvas { display: block; transition: transform .14s cubic-bezier(.2,.9,.3,1.5); }
.cx21s > span:hover canvas { transform: translateY(-3px) rotate(-8deg) scale(1.12); }
.mx-bar.cx-big > span:first-child canvas, .mx-rp > span:first-child canvas { display: block; }
.cx-grid.cx21g { grid-template-columns: repeat(auto-fill, minmax(70px, 1fr)); gap: 14px 6px; padding-top: 18px; }
.cx-card.cx21 { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 2px 4px 4px; background: none; box-shadow: none; overflow: visible; }
.cx-card.cx21 > canvas { display: block; transition: transform .16s cubic-bezier(.2,.9,.3,1.6), filter .12s; filter: drop-shadow(0 3px 0 rgba(10, 11, 16, .7)); }
.cx-card.cx21::before { content: ''; position: absolute; left: 8%; right: 8%; top: 46px; height: 5px; background: linear-gradient(180deg, #5a6a62, #2a3430); box-shadow: 0 2px 0 #0a0b10; }
.cx-card.cx21:hover > canvas, .cx-card.cx21:focus-visible > canvas { transform: translateY(-6px) scale(1.14); filter: brightness(1.2) drop-shadow(0 0 8px rgba(120, 255, 180, .45)) drop-shadow(0 6px 0 rgba(10, 11, 16, .5)); }
.cx-card.cx21:active > canvas { transform: translateY(1px) scale(.94); }
.cx-card.cx21 .cx-st { position: absolute; right: 8px; top: 2px; width: 8px; height: 8px; }
.cx-card.cx21 .cx-pb { width: 80%; height: 5px; margin-top: 2px; }
.cx-card.cx21.unknown { background: none; }
.cx-card.cx21.unknown > canvas { filter: brightness(0) drop-shadow(0 0 1px rgba(150, 190, 170, .45)); opacity: .7; }
.cx-card.cx21.complete { background: none; box-shadow: none; }
.cx-card.cx21.complete > canvas { filter: drop-shadow(0 0 6px rgba(255, 210, 60, .55)) drop-shadow(0 3px 0 rgba(10, 11, 16, .7)); }
.cx-card.cx21 .ic21-n { font-size: 16px; }
`;
  document.head.append(st);
}

/** the panel's title: the dossier model, "Codex" on hover */
export function codexHead(body: HTMLElement) {
  style();
  const b = body.closest('.mx-pan')?.querySelector('.mx-head > b') as HTMLElement | null;
  const ic = mxIcon('dossier', 34);
  if (!b || !ic) return;
  b.replaceChildren(ic);
  b.classList.add('cx21h');
  nameTag(b, 'Codex', true);
}

/** the counts by their models */
export function codexStatIcons(st: { discovered: number; total: number; sampled: number; researched: number; complete: number }): HTMLElement {
  style();
  const row = document.createElement('div');
  row.className = 'mx-nums cx-stats cx21s';
  const cell = (k: IconKind, name: string, v: string) => {
    const c = document.createElement('span');
    const ic = mxIcon(k, 22);
    if (ic) c.append(ic); else c.append(name.slice(0, 1));
    const n = document.createElement('b'); n.style.fontWeight = '400'; n.textContent = v;
    c.append(n);
    nameTag(c, name);
    row.append(c);
  };
  cell('eye', 'Discovered', `${st.discovered}/${st.total}`);
  cell('jar', 'Sampled', String(st.sampled));
  cell('blueprint', 'Researched', String(st.researched));
  cell('key', 'Complete', String(st.complete));
  return row;
}

/** an entry: its model on the shelf (swaying under the pointer), the lamp and bar already in the button, the name on hover */
export function codexCard(b: HTMLButtonElement, kind: IconKind, name: string) {
  style();
  b.classList.add('cx21');
  b.setAttribute('aria-label', name);
  const ic = pixSprite(kind, 36);
  if (ic) { b.prepend(ic.cv); b.addEventListener('pointerenter', () => ic.hot(true)); b.addEventListener('pointerleave', () => ic.hot(false)); b.addEventListener('focus', () => ic.hot(true)); b.addEventListener('blur', () => ic.hot(false)); }
  nameTag(b, name);
  b.addEventListener('pointerdown', () => sfx('click', 0.3));
}

/** the research points line: the blueprint model by the number */
export function codexRp(line: HTMLElement): HTMLElement {
  const sp = line.querySelector('span');
  const ic = mxIcon('blueprint', 20);
  if (sp && ic) { sp.replaceChildren(ic); nameTag(sp as HTMLElement, 'Research points'); (sp as HTMLElement).style.position = 'relative'; }
  // and the big bar's label: the dossier
  queueMicrotask(() => {
    const bar = line.parentElement?.querySelector('.mx-bar.cx-big > span:first-child');
    const bi = mxIcon('dossier', 18);
    if (bar && bi) bar.replaceChildren(bi);
  });
  return line;
}
